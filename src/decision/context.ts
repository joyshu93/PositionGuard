import type {
  DecisionContext,
  MarketSnapshot,
  PositionState,
  SupportedAsset,
  UserStateBundle,
} from "../domain/types.js";

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
  const positionState: PositionState | null =
    params.userState.positions[params.asset] ?? null;
  const accountState = params.userState.accountState;
  const hasAccountState = accountState !== null;
  const hasBtcPosition = params.userState.positions.BTC !== undefined;
  const hasEthPosition = params.userState.positions.ETH !== undefined;
  const hasPositionState = positionState !== null;
  const missingItems: string[] = [];
  if (!hasAccountState) {
    missingItems.push("cash");
  }
  if (!hasBtcPosition) {
    missingItems.push("BTC position");
  }
  if (!hasEthPosition) {
    missingItems.push("ETH position");
  }

  return {
    user: {
      id: params.userState.user.id,
      telegramUserId: params.userState.user.telegramUserId,
      telegramChatId: params.userState.user.telegramChatId,
      username: params.userState.user.username,
      displayName: params.userState.user.displayName,
      sleepModeEnabled: params.userState.user.sleepModeEnabled,
      onboardingComplete: params.userState.user.onboardingComplete,
    },
    setup: {
      hasAccountState,
      hasPositionState,
      isComplete: hasAccountState && hasBtcPosition && hasEthPosition,
      missingItems,
    },
    accountState,
    positionState,
    marketSnapshot: params.marketSnapshot,
    generatedAt,
  };
}
