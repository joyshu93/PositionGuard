import type {
  DecisionContext,
  MarketSnapshot,
  PositionState,
  SupportedAsset,
  UserStateBundle,
} from "../domain/types.js";
import { assessReadiness, isTrackedAsset } from "../readiness.js";

export interface BuildDecisionContextParams {
  userState: UserStateBundle;
  asset: SupportedAsset;
  marketSnapshot: MarketSnapshot | null;
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
    generatedAt,
  };
}
