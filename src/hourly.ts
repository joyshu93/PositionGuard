import type { Env } from "./env.js";
import type {
  DecisionLogRecord,
  DecisionResult,
  SupportedAsset,
  SupportedMarket,
  UserStateBundle,
} from "./domain/types.js";
import {
  applyTemporaryAlertPolicy,
  buildDecisionContext,
  runDecisionEngine,
} from "./decision/index.js";
import {
  buildActionNeededAlertPlan,
  isActionNeededStatus,
} from "./runtime-alerts.js";
import { getMarketForAsset, getMarketSnapshotResult } from "./upbit.js";
import {
  getLatestDecisionLogSummary,
  listRecentDecisionLogSummaries,
  listUsersForHourlyRun,
  recordNotificationEvent,
  recordDecisionLog,
} from "./db/repositories.js";
import {
  getLatestNotificationEventForUserAssetReason,
} from "./db/notification-events.js";
import { createTelegramBotClient } from "./telegram/client.js";

const SUPPORTED_ASSETS: SupportedAsset[] = ["BTC", "ETH"];
const DECISION_LOG_COOLDOWN_MS = 50 * 60 * 1000;

export async function runHourlyCycle(env: Env): Promise<void> {
  const userStates = await listUsersForHourlyRun(env.DB);
  const telegramClient = createTelegramBotClient({
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    ...(env.TELEGRAM_WEBHOOK_SECRET
      ? { TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET }
      : {}),
  });

  for (const userState of userStates) {
    for (const asset of SUPPORTED_ASSETS) {
      const market = getMarketForAsset(asset);
      await processAssetCycle(env, telegramClient, userState, asset, market);
    }
  }
}

async function processAssetCycle(
  env: Env,
  telegramClient: ReturnType<typeof createTelegramBotClient>,
  userState: UserStateBundle,
  asset: SupportedAsset,
  market: SupportedMarket,
): Promise<DecisionLogRecord | null> {
  const marketResult = await getMarketSnapshotResult(env.UPBIT_BASE_URL, market);
  const marketSnapshot = marketResult.ok ? marketResult.snapshot : null;
  const context = buildDecisionContext({
    userState,
    asset,
    marketSnapshot,
  });
  const baseDecision = runDecisionEngine(context);
  const previousDecision = await getLatestDecisionLogSummary(
    env.DB,
    userState.user.id,
    asset,
  );
  const recentDecisionLogs = await listRecentDecisionLogSummaries(
    env.DB,
    userState.user.id,
    asset,
    6,
  );
  const consecutiveMarketFailures = getConsecutiveMarketFailureCount(
    marketResult,
    recentDecisionLogs,
  );
  const decision = applyTemporaryAlertPolicy({
    context,
    baseDecision,
    consecutiveMarketFailures,
  });

  if (!marketResult.ok) {
    console.warn(
      `[hourly] ${market} snapshot unavailable for user ${userState.user.id}: ${marketResult.reason} - ${marketResult.message}`,
    );
  }

  if (
    shouldSkipDecisionLog(previousDecision, decision.status, decision.summary, context.generatedAt)
  ) {
    return null;
  }

  const notificationEligible =
    isActionNeededStatus(String(decision.status)) &&
    !userState.user.sleepModeEnabled &&
    userState.user.telegramChatId !== null;

  const notificationState = await evaluateNotificationState({
    db: env.DB,
    telegramClient,
    userState,
    asset,
    market,
    decision,
    marketResult,
  });

  return recordDecisionLog(env.DB, {
    userId: userState.user.id,
    asset,
    market,
    status: decision.status,
    summary: decision.summary,
    reasons: decision.reasons,
    actionable: decision.actionable,
    contextJson: JSON.stringify({
      context,
      diagnostics: {
        marketData: marketResult.ok
          ? { ok: true }
          : {
              ok: false,
              reason: marketResult.reason,
              message: marketResult.message,
              consecutiveFailures: consecutiveMarketFailures,
            },
        baseDecisionStatus: baseDecision.status,
        notificationEligible,
        notificationState,
        sleepModeEnabled: userState.user.sleepModeEnabled,
      },
    }),
    notificationSent: notificationState.sent,
  });
}

async function evaluateNotificationState(params: {
  db: Env["DB"];
  telegramClient: ReturnType<typeof createTelegramBotClient>;
  userState: UserStateBundle;
  asset: SupportedAsset;
  market: SupportedMarket;
  decision: {
    status: string;
    summary: string;
    reasons: string[];
    alert?: DecisionResult["alert"];
  };
  marketResult:
    | { ok: true }
    | { ok: false; reason: string; message: string };
}): Promise<{
  sent: boolean;
  reasonKey: string | null;
  suppressedBy: string | null;
}> {
  if (!isActionNeededStatus(String(params.decision.status))) {
    return {
      sent: false,
      reasonKey: null,
      suppressedBy: null,
    };
  }

  const alertAsset =
    params.decision.alert?.reason === "COMPLETE_SETUP" ? null : params.asset;
  const reasonKey =
    params.decision.alert?.cooldownKey ??
    `${params.asset.toLowerCase()}-${params.market.toLowerCase()}-action-needed`;
  const latestEvent = await getLatestNotificationEventForUserAssetReason(
    params.db,
    params.userState.user.id,
    alertAsset,
    reasonKey,
  );

  const nowIso = new Date().toISOString();
  const plan = buildActionNeededAlertPlan({
    decision: params.decision,
    asset: params.asset,
    market: params.market,
    nowIso,
    hasChatId: params.userState.user.telegramChatId !== null,
    sleepModeEnabled: params.userState.user.sleepModeEnabled,
    latestNotification: latestEvent
      ? {
          createdAt: latestEvent.createdAt,
          reasonKey: latestEvent.reasonKey,
        }
      : null,
  });

  if (!plan.shouldSend) {
    if (shouldRecordSuppressedNotification(latestEvent, nowIso)) {
      await recordNotificationEvent(params.db, {
        userId: params.userState.user.id,
        asset: alertAsset,
        reasonKey: plan.reasonKey,
        deliveryStatus: "SKIPPED",
        eventType: "ACTION_NEEDED",
        cooldownUntil: plan.cooldownUntil,
        suppressedBy: plan.suppressionReason,
        payload: {
          market: params.market,
          alertReason: params.decision.alert?.reason ?? null,
          summary: params.decision.summary,
          reasons: params.decision.reasons,
          marketResult: params.marketResult,
        },
      });
    }

    console.info(
      `[hourly] suppressed alert for user ${params.userState.user.id} ${params.asset}: ${plan.suppressionReason ?? "unknown"}`,
    );

    return {
      sent: false,
      reasonKey: plan.reasonKey,
      suppressedBy: plan.suppressionReason,
    };
  }

  if (!params.userState.user.telegramChatId) {
    return {
      sent: false,
      reasonKey: plan.reasonKey,
      suppressedBy: "missing_chat_id",
    };
  }

  await params.telegramClient.sendMessage(
    Number(params.userState.user.telegramChatId),
    plan.message,
  );

  await recordNotificationEvent(params.db, {
    userId: params.userState.user.id,
    asset: alertAsset,
    reasonKey: plan.reasonKey,
    deliveryStatus: "SENT",
    eventType: "ACTION_NEEDED",
    cooldownUntil: plan.cooldownUntil,
    payload: {
      market: params.market,
      alertReason: params.decision.alert?.reason ?? null,
      summary: params.decision.summary,
      reasons: params.decision.reasons,
      marketResult: params.marketResult,
    },
    sentAt: nowIso,
  });

  console.info(
    `[hourly] sent ACTION_NEEDED alert for user ${params.userState.user.id} ${params.asset}`,
  );

  return {
    sent: true,
    reasonKey: plan.reasonKey,
    suppressedBy: null,
  };
}

export function shouldSkipDecisionLog(
  previousDecision: {
    decisionStatus: string;
    summary: string;
    createdAt: string;
  } | null,
  nextStatus: string,
  nextSummary: string,
  generatedAt: string,
): boolean {
  if (!previousDecision) {
    return false;
  }

  const previousTime = Date.parse(previousDecision.createdAt);
  const currentTime = Date.parse(generatedAt);
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) {
    return false;
  }

  return (
    previousDecision.decisionStatus === nextStatus &&
    previousDecision.summary === nextSummary &&
    currentTime - previousTime < DECISION_LOG_COOLDOWN_MS
  );
}

export function getConsecutiveMarketFailureCount(
  currentMarketResult:
    | { ok: true }
    | { ok: false; reason: string; message: string },
  recentDecisionLogs: Array<{ decisionStatus: string; context: unknown }>,
): number {
  if (currentMarketResult.ok) {
    return 0;
  }

  let failures = 1;

  for (const log of recentDecisionLogs) {
    if (!isMarketFailureDecisionLog(log)) {
      break;
    }

    failures += 1;
  }

  return failures;
}

export function shouldRecordSuppressedNotification(
  latestEvent:
    | {
        createdAt: string;
        cooldownUntil: string | null;
      }
    | null,
  nowIso: string,
): boolean {
  if (!latestEvent) {
    return true;
  }

  if (!latestEvent.cooldownUntil) {
    return true;
  }

  return !isWithinSuppressionWindow(latestEvent.cooldownUntil, nowIso);
}

function isWithinSuppressionWindow(cooldownUntilIso: string, nowIso: string): boolean {
  const cooldownUntil = Date.parse(cooldownUntilIso);
  const now = Date.parse(nowIso);

  if (!Number.isFinite(cooldownUntil) || !Number.isFinite(now)) {
    return false;
  }

  return now < cooldownUntil;
}

function isMarketFailureDecisionLog(log: {
  decisionStatus: string;
  context: unknown;
}): boolean {
  if (log.decisionStatus !== "INSUFFICIENT_DATA" && log.decisionStatus !== "ACTION_NEEDED") {
    return false;
  }

  if (!log.context || typeof log.context !== "object") {
    return false;
  }

  const diagnostics = (log.context as { diagnostics?: unknown }).diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") {
    return false;
  }

  const marketData = (diagnostics as { marketData?: unknown }).marketData;
  if (!marketData || typeof marketData !== "object") {
    return false;
  }

  return (marketData as { ok?: unknown }).ok === false;
}
