import type { Env } from "./env.js";
import type {
  DecisionLogRecord,
  SupportedAsset,
  SupportedMarket,
  UserStateBundle,
} from "./domain/types.js";
import { buildDecisionContext, runDecisionEngine } from "./decision/index.js";
import { getMarketForAsset, getMarketSnapshotResult } from "./upbit.js";
import {
  getLatestDecisionLogSummary,
  listUsersForHourlyRun,
  recordDecisionLog,
} from "./db/repositories.js";

const SUPPORTED_ASSETS: SupportedAsset[] = ["BTC", "ETH"];
const DECISION_LOG_COOLDOWN_MS = 50 * 60 * 1000;

export async function runHourlyCycle(env: Env): Promise<void> {
  const userStates = await listUsersForHourlyRun(env.DB);

  for (const userState of userStates) {
    for (const asset of SUPPORTED_ASSETS) {
      const market = getMarketForAsset(asset);
      await processAssetCycle(env, userState, asset, market);
    }
  }
}

async function processAssetCycle(
  env: Env,
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
  const decision = runDecisionEngine(context);
  const previousDecision = await getLatestDecisionLogSummary(
    env.DB,
    userState.user.id,
    asset,
  );

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
    decision.actionable && !userState.user.sleepModeEnabled;

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
            },
        notificationEligible,
        sleepModeEnabled: userState.user.sleepModeEnabled,
      },
    }),
    notificationSent: false,
  });
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
