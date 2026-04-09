import type {
  DecisionContext,
  MarketSnapshot,
  PositionState,
  StrategyInputs,
  SupportedAsset,
  UserStateBundle,
} from "../domain/types.js";
import { assessReadiness, isTrackedAsset } from "../readiness.js";
import { buildDefaultStrategyInputs } from "./settings.js";

export interface BuildDecisionContextParams {
  userState: UserStateBundle;
  asset: SupportedAsset;
  marketSnapshot: MarketSnapshot | null;
  strategy?: StrategyInputs;
  generatedAt?: string;
}

export function buildDecisionContext(
  params: BuildDecisionContextParams,
): DecisionContext {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const readiness = assessReadiness(params.userState);
  const positionState: PositionState | null =
    isTrackedAsset(readiness.trackedAssets, params.asset)
      ? (params.userState.positions[params.asset] ?? null)
      : null;
  const accountState = params.userState.accountState;

  return {
    user: {
      id: params.userState.user.id,
      telegramUserId: params.userState.user.telegramUserId,
      telegramChatId: params.userState.user.telegramChatId,
      username: params.userState.user.username,
      displayName: params.userState.user.displayName,
      locale: params.userState.user.locale ?? null,
      trackedAssets: params.userState.user.trackedAssets,
      sleepModeEnabled: params.userState.user.sleepModeEnabled,
      onboardingComplete: params.userState.user.onboardingComplete,
    },
    setup: {
      trackedAssets: readiness.trackedAssets,
      hasAccountState: readiness.hasCashRecord,
      readyPositionAssets: readiness.readyPositionAssets,
      isReady: readiness.isReady,
      missingItems: readiness.missingItems,
    },
    accountState,
    positionState,
    marketSnapshot: params.marketSnapshot,
    strategy:
      params.strategy
      ?? buildFallbackStrategyInputs(positionState, accountState, params.marketSnapshot),
    generatedAt,
  };
}

function buildFallbackStrategyInputs(
  positionState: PositionState | null,
  accountState: UserStateBundle["accountState"],
  marketSnapshot: MarketSnapshot | null,
): StrategyInputs {
  const base = buildDefaultStrategyInputs();
  const availableCash = Math.max(0, accountState?.availableCash ?? 0);
  const assetMarketValue =
    positionState && marketSnapshot
      ? Math.max(0, positionState.quantity) * Math.max(0, marketSnapshot.ticker.tradePrice)
      : 0;
  const totalEquity = availableCash + assetMarketValue;

  return {
    ...base,
    portfolio: {
      totalEquity,
      assetMarketValue,
      totalExposureValue: assetMarketValue,
      assetExposureRatio: totalEquity > 0 ? assetMarketValue / totalEquity : 0,
      totalExposureRatio: totalEquity > 0 ? assetMarketValue / totalEquity : 0,
    },
  };
}
