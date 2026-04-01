import type {
  ActionNeededAlert,
  DecisionContext,
  DecisionResult,
} from "../domain/types.js";
import { getMessages, resolveUserLocale } from "../i18n/index.js";

export interface TemporaryAlertPolicyInput {
  context: DecisionContext;
  baseDecision: DecisionResult;
  consecutiveMarketFailures: number;
}

export function applyTemporaryAlertPolicy(
  input: TemporaryAlertPolicyInput,
): DecisionResult {
  const locale = resolveUserLocale(input.context.user.locale ?? null);
  const messages = getMessages(locale);
  const invalidStateAlert = getInvalidRecordedStateAlert(input.context);
  if (invalidStateAlert !== null) {
    return elevateToActionNeeded(
      input.baseDecision,
      input.context,
      messages.temporaryPolicy.recordedStateNeedsCorrection,
      invalidStateAlert.reasons,
      invalidStateAlert.alert,
    );
  }

  if (input.baseDecision.status === "SETUP_INCOMPLETE") {
    return elevateToActionNeeded(
      input.baseDecision,
      input.context,
      messages.temporaryPolicy.manualSetupIncomplete,
      input.baseDecision.reasons,
      {
        reason: "COMPLETE_SETUP",
        cooldownKey: `setup:${input.context.user.id}`,
        message: [
          messages.temporaryPolicy.completeSetupAlert(input.context.setup.missingItems.join(", ")),
          messages.temporaryPolicy.completeSetupNext,
        ].join("\n"),
      },
    );
  }

  if (
    input.baseDecision.status === "INSUFFICIENT_DATA" &&
    input.context.positionState !== null &&
    input.context.positionState.quantity > 0 &&
    input.consecutiveMarketFailures >= 3
  ) {
    return elevateToActionNeeded(
      input.baseDecision,
      input.context,
      messages.temporaryPolicy.marketDataUnavailableSummary(input.context.positionState.asset),
      [
        ...input.baseDecision.reasons,
        `Consecutive market snapshot failures: ${input.consecutiveMarketFailures}.`,
      ],
      {
        reason: "MARKET_DATA_UNAVAILABLE",
        cooldownKey: `market-data:${input.context.user.id}:${input.context.positionState.asset}`,
        message: [
          messages.temporaryPolicy.marketDataUnavailableAlert(input.context.positionState.asset),
          messages.temporaryPolicy.marketDataUnavailableNext,
        ].join("\n"),
      },
    );
  }

  return input.baseDecision;
}

function elevateToActionNeeded(
  baseDecision: DecisionResult,
  context: DecisionContext,
  summary: string,
  reasons: string[],
  alert: ActionNeededAlert,
): DecisionResult {
  return {
    status: "ACTION_NEEDED",
    summary,
    reasons,
    actionable: true,
    symbol: baseDecision.symbol ?? context.marketSnapshot?.market ?? null,
    generatedAt: context.generatedAt,
    alert,
    ...(baseDecision.diagnostics ? { diagnostics: baseDecision.diagnostics } : {}),
  };
}

function getInvalidRecordedStateAlert(context: DecisionContext): {
  reasons: string[];
  alert: ActionNeededAlert;
} | null {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const messages = getMessages(locale);
  const position = context.positionState;
  if (!position) {
    return null;
  }

  if (position.quantity === 0 && position.averageEntryPrice > 0) {
    return {
      reasons: [
        `${position.asset} record has zero quantity with a non-zero average entry price.`,
        "Please correct the manual position record.",
      ],
      alert: {
        reason: "INVALID_RECORDED_STATE",
        cooldownKey: `invalid:${context.user.id}:${position.asset}:zero-qty-nonzero-avg`,
        message: [
          messages.temporaryPolicy.invalidSpotRecord(position.asset),
          messages.temporaryPolicy.quantityZeroAverageNonZero,
        ].join("\n"),
      },
    };
  }

  return null;
}
