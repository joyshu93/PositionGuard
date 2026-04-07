import { createRuntimeConfig, type Env, type RuntimeConfig } from "./env.js";
import type {
  DecisionLogRecord,
  DecisionResult,
  MarketSnapshot,
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
  assessStateUpdateReminder,
  buildActionNeededAlertPlan,
  buildStateUpdateReminderPlan,
  isActionNeededStatus,
} from "./runtime-alerts.js";
import { buildHourlyDiagnostics } from "./hourly-diagnostics.js";
export { buildHourlyDiagnostics } from "./hourly-diagnostics.js";
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
import { parseTrackedAssets } from "./readiness.js";

const SUPPORTED_ASSETS: SupportedAsset[] = ["BTC", "ETH"];
const DECISION_LOG_COOLDOWN_MS = 50 * 60 * 1000;
const SUPPORTED_MARKETS_BY_ASSET: Record<SupportedAsset, SupportedMarket> = {
  BTC: "KRW-BTC",
  ETH: "KRW-ETH",
};

interface MarketTimingDetails {
  decisionGeneratedAt: string;
  snapshotFetchedAt: string | null;
  tickerFetchedAt: string | null;
  tickerTradeTimeUtc: string | null;
  tickerTradeTimeKst: string | null;
  tickerExchangeTimestampMs: number | null;
  latestHourlyOpenTime: string | null;
  latestHourlyCloseTime: string | null;
  latestFourHourOpenTime: string | null;
  latestFourHourCloseTime: string | null;
  latestDailyOpenTime: string | null;
  latestDailyCloseTime: string | null;
}

export async function runHourlyCycle(env: Env): Promise<void> {
  const runtime = createRuntimeConfig(env);
  const userStates = await listUsersForHourlyRun(runtime.db);
  const telegramClient = createTelegramBotClient({
    TELEGRAM_BOT_TOKEN: runtime.telegramBotToken,
    ...(runtime.telegramWebhookSecret
      ? { TELEGRAM_WEBHOOK_SECRET: runtime.telegramWebhookSecret }
      : {}),
  });

  for (const userState of userStates) {
    const trackedAssets = parseTrackedAssets(userState.user.trackedAssets);
    const marketSnapshotResults = await fetchHourlyMarketSnapshots(
      runtime.upbitBaseUrl ?? undefined,
    );
    for (const asset of SUPPORTED_ASSETS) {
      if (!trackedAssets.includes(asset)) {
        continue;
      }

      const market = SUPPORTED_MARKETS_BY_ASSET[asset];
      await processAssetCycle(
        runtime,
        telegramClient,
        userState,
        asset,
        market,
        marketSnapshotResults[asset],
      );
    }
  }
}

async function processAssetCycle(
  env: RuntimeConfig,
  telegramClient: ReturnType<typeof createTelegramBotClient>,
  userState: UserStateBundle,
  asset: SupportedAsset,
  market: SupportedMarket,
  marketResultInput?:
    | Awaited<ReturnType<typeof getMarketSnapshotResult>>
    | null,
): Promise<DecisionLogRecord | null> {
  const marketResult =
    marketResultInput ?? await getMarketSnapshotResult(env.upbitBaseUrl ?? undefined, market);
  const marketSnapshot = marketResult.ok ? marketResult.snapshot : null;
  const context = buildDecisionContext({
    userState,
    asset,
    marketSnapshot,
  });
  const marketTiming = buildMarketTimingDetails({
    decisionGeneratedAt: context.generatedAt,
    marketSnapshot,
  });
  const baseDecision = runDecisionEngine(context);
  const previousDecision = await getLatestDecisionLogSummary(
    env.db,
    userState.user.id,
    asset,
  );
  const recentDecisionLogs = await listRecentDecisionLogSummaries(
    env.db,
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
    db: env.db,
    telegramClient,
    userState,
    asset,
    market,
    decision,
    marketResult,
  });
  const reminderState = await evaluateReminderState({
    db: env.db,
    telegramClient,
    userState,
    asset,
    market,
    context,
    decision,
    recentDecisionLogs,
    primaryNotificationState: notificationState,
  });

  return recordDecisionLog(env.db, {
    userId: userState.user.id,
    asset,
    market,
    status: decision.status,
    summary: decision.summary,
    reasons: decision.reasons,
    actionable: decision.actionable,
    contextJson: JSON.stringify({
      context,
      marketTiming,
      diagnostics: buildHourlyDiagnostics({
        context,
        baseDecision,
        finalDecision: decision,
        marketResult,
        consecutiveMarketFailures,
        notificationEligible,
        notificationState,
        reminderState,
      }),
    }),
    notificationSent: notificationState.sent || reminderState.sent,
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
  cooldownUntil: string | null;
}> {
  if (!isActionNeededStatus(String(params.decision.status))) {
    return {
      sent: false,
      reasonKey: null,
      suppressedBy: null,
      cooldownUntil: null,
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
    locale: params.userState.user.locale ?? null,
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
      cooldownUntil: plan.cooldownUntil,
    };
  }

  if (!params.userState.user.telegramChatId) {
    return {
      sent: false,
      reasonKey: plan.reasonKey,
      suppressedBy: "missing_chat_id",
      cooldownUntil: plan.cooldownUntil,
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
    cooldownUntil: plan.cooldownUntil,
  };
}

async function evaluateReminderState(params: {
  db: Env["DB"];
  telegramClient: ReturnType<typeof createTelegramBotClient>;
  userState: UserStateBundle;
  asset: SupportedAsset;
  market: SupportedMarket;
  context: ReturnType<typeof buildDecisionContext>;
  decision: {
    status: string;
    summary: string;
    reasons: string[];
    alert?: DecisionResult["alert"];
  };
  recentDecisionLogs: Array<{ decisionStatus: string; context: unknown }>;
  primaryNotificationState: {
    sent: boolean;
    reasonKey: string | null;
    suppressedBy: string | null;
    cooldownUntil: string | null;
  };
}): Promise<{
  eligible: boolean;
  sent: boolean;
  reasonKey: string | null;
  suppressedBy: string | null;
  cooldownUntil: string | null;
  repeatedSignalCount: number;
  stateChangedSinceLastSignal: boolean | null;
  signalReason: string | null;
}> {
  const assessment = assessStateUpdateReminder({
    decision: params.decision,
    context: params.context,
    asset: params.asset,
    recentDecisionLogs: params.recentDecisionLogs,
  });

  const latestReminderEvent =
    assessment.reasonKey === null
      ? null
      : await getLatestNotificationEventForUserAssetReason(
          params.db,
          params.userState.user.id,
          params.asset,
          assessment.reasonKey,
        );

  const plan = buildStateUpdateReminderPlan({
    assessment,
    asset: params.asset,
    locale: params.userState.user.locale ?? null,
    nowIso: new Date().toISOString(),
    hasChatId: params.userState.user.telegramChatId !== null,
    sleepModeEnabled: params.userState.user.sleepModeEnabled,
    primaryAlertSent: params.primaryNotificationState.sent,
    latestReminderNotification: latestReminderEvent
      ? {
          createdAt: latestReminderEvent.createdAt,
          reasonKey: latestReminderEvent.reasonKey,
        }
      : null,
  });

  if (!plan.reasonKey || !plan.message) {
    return {
      eligible: plan.eligible,
      sent: false,
      reasonKey: null,
      suppressedBy: plan.suppressionReason,
      cooldownUntil: plan.cooldownUntil,
      repeatedSignalCount: plan.repeatedSignalCount,
      stateChangedSinceLastSignal: plan.stateChangedSinceLastSignal,
      signalReason: plan.signalReason,
    };
  }

  if (!plan.shouldSend) {
    if (plan.eligible && shouldRecordSuppressedNotification(latestReminderEvent, new Date().toISOString())) {
      await recordNotificationEvent(params.db, {
        userId: params.userState.user.id,
        asset: params.asset,
        reasonKey: plan.reasonKey,
        deliveryStatus: "SKIPPED",
        eventType: "STATE_UPDATE_REMINDER",
        cooldownUntil: plan.cooldownUntil,
        suppressedBy: plan.suppressionReason,
        payload: {
          signalReason: plan.signalReason,
          repeatedSignalCount: plan.repeatedSignalCount,
          stateChangedSinceLastSignal: plan.stateChangedSinceLastSignal,
          summary: params.decision.summary,
        },
      });
    }

    return {
      eligible: plan.eligible,
      sent: false,
      reasonKey: plan.reasonKey,
      suppressedBy: plan.suppressionReason,
      cooldownUntil: plan.cooldownUntil,
      repeatedSignalCount: plan.repeatedSignalCount,
      stateChangedSinceLastSignal: plan.stateChangedSinceLastSignal,
      signalReason: plan.signalReason,
    };
  }

  if (!params.userState.user.telegramChatId) {
    return {
      eligible: plan.eligible,
      sent: false,
      reasonKey: plan.reasonKey,
      suppressedBy: "missing_chat_id",
      cooldownUntil: plan.cooldownUntil,
      repeatedSignalCount: plan.repeatedSignalCount,
      stateChangedSinceLastSignal: plan.stateChangedSinceLastSignal,
      signalReason: plan.signalReason,
    };
  }

  await params.telegramClient.sendMessage(
    Number(params.userState.user.telegramChatId),
    plan.message,
  );

  await recordNotificationEvent(params.db, {
    userId: params.userState.user.id,
    asset: params.asset,
    reasonKey: plan.reasonKey,
    deliveryStatus: "SENT",
    eventType: "STATE_UPDATE_REMINDER",
    cooldownUntil: plan.cooldownUntil,
    payload: {
      signalReason: plan.signalReason,
      repeatedSignalCount: plan.repeatedSignalCount,
      stateChangedSinceLastSignal: plan.stateChangedSinceLastSignal,
      summary: params.decision.summary,
    },
    sentAt: new Date().toISOString(),
  });

  return {
    eligible: plan.eligible,
    sent: true,
    reasonKey: plan.reasonKey,
    suppressedBy: null,
    cooldownUntil: plan.cooldownUntil,
    repeatedSignalCount: plan.repeatedSignalCount,
    stateChangedSinceLastSignal: plan.stateChangedSinceLastSignal,
    signalReason: plan.signalReason,
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

function buildMarketTimingDetails(input: {
  decisionGeneratedAt: string;
  marketSnapshot: MarketSnapshot | null;
}): MarketTimingDetails {
  const latestHourly = input.marketSnapshot?.timeframes["1h"].candles.at(-1) ?? null;
  const latestFourHour = input.marketSnapshot?.timeframes["4h"].candles.at(-1) ?? null;
  const latestDaily = input.marketSnapshot?.timeframes["1d"].candles.at(-1) ?? null;

  return {
    decisionGeneratedAt: input.decisionGeneratedAt,
    snapshotFetchedAt: input.marketSnapshot?.fetchedAt ?? null,
    tickerFetchedAt: input.marketSnapshot?.ticker.fetchedAt ?? null,
    tickerTradeTimeUtc: input.marketSnapshot?.ticker.tradeTimeUtc ?? null,
    tickerTradeTimeKst: input.marketSnapshot?.ticker.tradeTimeKst ?? null,
    tickerExchangeTimestampMs: input.marketSnapshot?.ticker.exchangeTimestampMs ?? null,
    latestHourlyOpenTime: latestHourly?.openTime ?? null,
    latestHourlyCloseTime: latestHourly?.closeTime ?? null,
    latestFourHourOpenTime: latestFourHour?.openTime ?? null,
    latestFourHourCloseTime: latestFourHour?.closeTime ?? null,
    latestDailyOpenTime: latestDaily?.openTime ?? null,
    latestDailyCloseTime: latestDaily?.closeTime ?? null,
  };
}

async function fetchHourlyMarketSnapshots(
  baseUrl: string | undefined,
): Promise<Record<SupportedAsset, Awaited<ReturnType<typeof getMarketSnapshotResult>>>> {
  const entries = await Promise.all(
    SUPPORTED_ASSETS.map(async (asset) => {
      const market = getMarketForAsset(asset);
      const result = await getMarketSnapshotResult(baseUrl, market);
      return [asset, result] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    SupportedAsset,
    Awaited<ReturnType<typeof getMarketSnapshotResult>>
  >;
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
