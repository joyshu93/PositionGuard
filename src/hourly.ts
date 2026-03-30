import type { Env } from "./env";
import type {
  DecisionLogRecord,
  SupportedAsset,
  SupportedMarket,
  UserStateBundle,
} from "./domain/types";
import { buildDecisionContext, runDecisionEngine } from "./decision";
import { getMarketForAsset, getMarketSnapshot } from "./upbit";
import {
  listUsersForHourlyRun,
  recordDecisionLog,
} from "./db/repositories";

const SUPPORTED_ASSETS: SupportedAsset[] = ["BTC", "ETH"];

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
  const marketSnapshot = await getMarketSnapshot(env.UPBIT_BASE_URL, market);
  const context = buildDecisionContext({
    userState,
    asset,
    marketSnapshot,
  });
  const decision = runDecisionEngine(context);

  return recordDecisionLog(env.DB, {
    userId: userState.user.id,
    asset,
    market,
    status: decision.status,
    summary: decision.summary,
    reasons: decision.reasons,
    actionable: decision.actionable,
    contextJson: JSON.stringify(context),
    notificationSent: false,
  });
}
