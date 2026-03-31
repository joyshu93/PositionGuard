import {
  createRuntimeConfig,
  assertRuntimeConfig,
  DEFAULT_HEALTH_PATH,
  DEFAULT_TELEGRAM_WEBHOOK_PATH,
  getRuntimeConfigReport,
  type Env,
} from "./env.js";
import { runHourlyCycle } from "./hourly.js";
import { handleTelegramWebhook } from "./telegram.js";
import {
  getUserByTelegramUserId,
  ensureTelegramUser,
  getLatestDecisionRecordForUser,
  getTelegramStatusSnapshot,
  getUserStateBundleByUserId,
  listRecentDecisionRecordsForUser,
  listRecentNotificationEventSummaries,
  setTrackedAssetsByTelegramUserId,
  setCashByTelegramUserId,
  setPositionByTelegramUserId,
  setSleepModeByTelegramUserId,
} from "./db/repositories.js";
import { assessReadiness } from "./readiness.js";
import { renderStatusMessage } from "./status.js";
import type { TelegramActionNeededReason } from "./telegram.js";
import {
  buildHourlyHealthView,
  buildLastDecisionView,
} from "./operator-visibility.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },
  async scheduled(_controller, env, _ctx) {
    assertRuntimeConfig(env, "scheduled");
    await runHourlyCycle(env);
  },
} satisfies ExportedHandler<Env>;

async function handleFetch(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const configReport = getRuntimeConfigReport(env, "health");
  const deployReport = getRuntimeConfigReport(env, "webhook");
  const healthPath = configReport.healthPath;
  const webhookPath = configReport.webhookPath;

  if (request.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      ok: true,
      service: "position-guard",
      healthPath,
      webhookPath,
      scope: "telegram BTC/ETH spot position coach scaffold",
      configOk: deployReport.ok,
    });
  }

  if (request.method === "GET" && url.pathname === healthPath) {
    return jsonResponse({
      ok: deployReport.ok,
      status: deployReport.ok ? "healthy" : "misconfigured",
      service: "position-guard",
      mode: "scaffold",
      checks: {
        d1Binding: !deployReport.errors.some((error) => error.includes("D1 binding")),
        telegramBotToken: !deployReport.errors.some((error) =>
          error.includes("TELEGRAM_BOT_TOKEN")
        ),
        telegramWebhookSecret: !deployReport.errors.some((error) =>
          error.includes("TELEGRAM_WEBHOOK_SECRET")
        ),
        routePaths:
          !deployReport.errors.some((error) => error.includes("HEALTH_PATH")) &&
          !deployReport.errors.some((error) => error.includes("TELEGRAM_WEBHOOK_PATH")),
        upbitBaseUrl: !deployReport.errors.some((error) =>
          error.includes("UPBIT_BASE_URL")
        ),
      },
      errors: deployReport.errors,
    }, deployReport.ok ? 200 : 500);
  }

  if (url.pathname === webhookPath) {
    const webhookConfig = getRuntimeConfigReport(env, "webhook");
    if (!webhookConfig.ok) {
      return jsonResponse(
        {
          ok: false,
          error: "Webhook configuration is invalid.",
          details: webhookConfig.errors,
        },
        500,
      );
    }

    const runtime = createRuntimeConfig(env);
    const telegramEnv = {
      TELEGRAM_BOT_TOKEN: runtime.telegramBotToken,
      ...(runtime.telegramWebhookSecret
        ? { TELEGRAM_WEBHOOK_SECRET: runtime.telegramWebhookSecret }
        : {}),
    };

    return handleTelegramWebhook(request, {
      env: telegramEnv,
      deps: {
        stateStore: {
          async getUserState(telegramUserId) {
            const snapshot = await getTelegramStatusSnapshot(
              env.DB,
              String(telegramUserId),
            );
            if (!snapshot) {
              return null;
            }

            return {
              telegramUserId,
              isSleeping: snapshot.user.sleepModeEnabled,
              cash: snapshot.accountState?.availableCash ?? null,
              trackedAssets: snapshot.user.trackedAssets,
            };
          },
          async upsertUserState(input) {
            await ensureTelegramUser(env.DB, {
              telegramUserId: String(input.telegramUserId),
              telegramChatId: String(input.telegramChatId),
              username: input.username ?? null,
              displayName: input.displayName ?? null,
            });
          },
          async setCash(telegramUserId, cash) {
            await setCashByTelegramUserId(env.DB, String(telegramUserId), cash);
          },
          async setPosition(input) {
            await setPositionByTelegramUserId(env.DB, String(input.telegramUserId), {
              asset: input.asset,
              quantity: input.quantity,
              averageEntryPrice: input.averageEntryPrice,
            });
          },
          async setSleepMode(telegramUserId, isSleeping) {
            await setSleepModeByTelegramUserId(
              env.DB,
              String(telegramUserId),
              isSleeping,
            );
          },
        },
        onboardingProvider: {
          async getOnboardingSnapshot(telegramUserId) {
            const user = await getUserByTelegramUserId(env.DB, String(telegramUserId));
            if (!user) {
              return null;
            }

            const userState = await getUserStateBundleByUserId(env.DB, user.id);
            if (!userState) {
              return null;
            }

            const readiness = assessReadiness(userState);
            return {
              trackedAssets: readiness.trackedAssets,
              hasCashRecord: readiness.hasCashRecord,
              trackedPositionAssets: readiness.readyPositionAssets,
              isReady: readiness.isReady,
              missingNextSteps: readiness.missingItems,
            };
          },
          async setTrackedAssets(telegramUserId, trackedAssets) {
            const preference =
              trackedAssets.length === 2 ? "BTC,ETH" : trackedAssets[0] ?? "BTC,ETH";
            await setTrackedAssetsByTelegramUserId(
              env.DB,
              String(telegramUserId),
              preference,
            );

            const user = await getUserByTelegramUserId(env.DB, String(telegramUserId));
            if (!user) {
              return null;
            }

            const userState = await getUserStateBundleByUserId(env.DB, user.id);
            if (!userState) {
              return null;
            }

            const readiness = assessReadiness(userState);
            return {
              trackedAssets: readiness.trackedAssets,
              hasCashRecord: readiness.hasCashRecord,
              trackedPositionAssets: readiness.readyPositionAssets,
              isReady: readiness.isReady,
              missingNextSteps: readiness.missingItems,
            };
          },
        },
        inspectionProvider: {
          async getLastDecisionSnapshot(telegramUserId) {
            const user = await getUserByTelegramUserId(env.DB, String(telegramUserId));
            if (!user) {
              return null;
            }

            const userState = await getUserStateBundleByUserId(env.DB, user.id);
            if (!userState) {
              return null;
            }

            const readiness = assessReadiness(userState);
            // const latestDecision = await getLatestDecisionRecordForUser(env.DB, user.id);
            // const view = buildLastDecisionView(latestDecision);

            // return {
            //   trackedAssets: readiness.trackedAssets,
            //   lines: view
            //     ? [
            //         {
            //           asset: view.asset,
            //           status: view.status,
            //           summary: view.summary,
            //           createdAt: view.generatedAt,
            //           alertOutcome: view.alertOutcome,
            //           suppressedBy: view.suppressionReason,
            //         },
            //       ]
            //     : [],
            // };

            const recentDecisions = await listRecentDecisionRecordsForUser(env.DB, user.id, 20);

            const latestByAsset = readiness.trackedAssets
              .map((asset) => {
                const latestForAsset =
                  recentDecisions.find((decision) => decision.asset === asset) ?? null;
                return buildLastDecisionView(latestForAsset);
              })
              .filter((view): view is NonNullable<typeof view> => view !== null);

            return {
              trackedAssets: readiness.trackedAssets,
              lines: latestByAsset.map((view) => ({
                asset: view.asset,
                status: view.status,
                summary: view.summary,
                createdAt: view.generatedAt,
                alertOutcome: view.alertOutcome,
                suppressedBy: view.suppressionReason,
              })),
            };
          },
          async getHourlyHealthSnapshot(telegramUserId) {
            const user = await getUserByTelegramUserId(env.DB, String(telegramUserId));
            if (!user) {
              return null;
            }

            const userState = await getUserStateBundleByUserId(env.DB, user.id);
            if (!userState) {
              return null;
            }

            const readiness = assessReadiness(userState);
            const [recentDecisions, recentNotifications] = await Promise.all([
              listRecentDecisionRecordsForUser(env.DB, user.id, 8),
              listRecentNotificationEventSummaries(env.DB, user.id, 8),
            ]);
            const view = buildHourlyHealthView({
              decisions: recentDecisions,
              notifications: recentNotifications,
            });
            const latestNotification = recentNotifications.find(
              (event) => event.eventType === "ACTION_NEEDED",
            );

            return {
              trackedAssets: readiness.trackedAssets,
              readiness: {
                isReady: readiness.isReady,
                missingItems: readiness.missingItems,
                hasCashRecord: readiness.hasCashRecord,
                readyPositionAssets: readiness.readyPositionAssets,
              },
              lastRunAt: view.latestDecisionAt,
              lastDecisionStatus: view.latestDecisionStatus,
              marketDataStatus: inferMarketDataStatus(recentDecisions[0]?.context),
              recentMarketFailureCount: view.recentMarketFailureCount,
              recentCooldownSkipCount: view.recentCooldownSkipCount,
              recentSleepSuppressionCount: view.recentSleepSuppressionCount,
              recentSetupBlockedCount: view.recentSetupBlockedCount,
              latestMarketFailureMessage: view.latestMarketFailureMessage,
              latestNotification: latestNotification
                ? {
                    deliveryStatus: latestNotification.deliveryStatus,
                    reasonKey: latestNotification.reasonKey,
                    suppressedBy: latestNotification.suppressedBy,
                    sentAt: latestNotification.sentAt,
                  }
                : null,
            };
          },
        },
        statusProvider: {
          async getStatus(telegramUserId) {
            const statusSnapshot = await getTelegramStatusSnapshot(
              env.DB,
              String(telegramUserId),
            );
            if (!statusSnapshot) {
              return renderStatusMessage(null);
            }

            const userState = await getUserStateBundleByUserId(
              env.DB,
              statusSnapshot.user.id,
            );
            const recentNotifications = await listRecentNotificationEventSummaries(
              env.DB,
              statusSnapshot.user.id,
              3,
            );

            return renderStatusMessage(
              userState,
              recentNotifications.map((event) => ({
                deliveryStatus: event.deliveryStatus,
                reasonKey: event.reasonKey,
                eventType: event.eventType,
                createdAt: event.createdAt,
                suppressedBy: event.suppressedBy,
              })),
            );
          },
        },
        notificationProvider: {
          async getLastAlert(telegramUserId) {
            const statusSnapshot = await getTelegramStatusSnapshot(
              env.DB,
              String(telegramUserId),
            );
            if (!statusSnapshot) {
              return null;
            }

            const recentNotifications = await listRecentNotificationEventSummaries(
              env.DB,
              statusSnapshot.user.id,
              10,
            );
            const latestSentAlert = recentNotifications.find(
              (event) =>
                event.eventType === "ACTION_NEEDED" &&
                event.deliveryStatus === "SENT",
            );

            if (!latestSentAlert) {
              return null;
            }

            const payload =
              latestSentAlert.payload && typeof latestSentAlert.payload === "object"
                ? latestSentAlert.payload
                : null;
            const summary =
              payload &&
              typeof (payload as { summary?: unknown }).summary === "string"
                ? ((payload as { summary: string }).summary)
                : "ACTION_NEEDED alert sent.";
            const reason = inferTelegramAlertReason(
              payload &&
                typeof (payload as { alertReason?: unknown }).alertReason === "string"
                ? ((payload as { alertReason: string }).alertReason)
                : null,
            );

            return {
              reason,
              summary,
              asset: latestSentAlert.asset,
              sentAt: latestSentAlert.sentAt ?? latestSentAlert.createdAt,
              cooldownUntil: latestSentAlert.cooldownUntil,
            };
          },
        },
      },
    });
  }

  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function inferTelegramAlertReason(
  alertReason: string | null,
): TelegramActionNeededReason {
  if (alertReason === "MARKET_DATA_UNAVAILABLE") {
    return "MISSING_MARKET_DATA";
  }

  if (alertReason === "INVALID_RECORDED_STATE") {
    return "INVALID_STORED_STATE";
  }

  if (alertReason === "RISK_REVIEW_REQUIRED") {
    return "RISK_REVIEW_REQUIRED";
  }

  if (alertReason === "ENTRY_REVIEW_REQUIRED") {
    return "ENTRY_REVIEW_REQUIRED";
  }

  if (alertReason === "ADD_BUY_REVIEW_REQUIRED") {
    return "ADD_BUY_REVIEW_REQUIRED";
  }

  if (alertReason === "REDUCE_REVIEW_REQUIRED") {
    return "REDUCE_REVIEW_REQUIRED";
  }

  return "SETUP_INCOMPLETE";
}

function inferMarketDataStatus(
  context: unknown,
): "ok" | "no_data" | "fetch_failure" | "normalization_failure" | null {
  if (!context || typeof context !== "object") {
    return null;
  }

  const diagnostics = (context as { diagnostics?: unknown }).diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const marketData = (diagnostics as { marketData?: unknown }).marketData;
  if (!marketData || typeof marketData !== "object") {
    return null;
  }

  const ok = (marketData as { ok?: unknown }).ok;
  if (ok === true) {
    return "ok";
  }

  const reason = (marketData as { reason?: unknown }).reason;
  if (reason === "NO_DATA") {
    return "no_data";
  }
  if (reason === "FETCH_FAILURE") {
    return "fetch_failure";
  }
  if (reason === "NORMALIZATION_FAILURE") {
    return "normalization_failure";
  }

  return null;
}
