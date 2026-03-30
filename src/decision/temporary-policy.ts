import type {
  ActionNeededAlert,
  DecisionContext,
  DecisionResult,
} from "../domain/types.js";

export interface TemporaryAlertPolicyInput {
  context: DecisionContext;
  baseDecision: DecisionResult;
  consecutiveMarketFailures: number;
}

export function applyTemporaryAlertPolicy(
  input: TemporaryAlertPolicyInput,
): DecisionResult {
  const invalidStateAlert = getInvalidRecordedStateAlert(input.context);
  if (invalidStateAlert !== null) {
    return elevateToActionNeeded(
      input.baseDecision,
      input.context,
      "Recorded state needs manual correction.",
      invalidStateAlert.reasons,
      invalidStateAlert.alert,
    );
  }

  if (input.baseDecision.status === "SETUP_INCOMPLETE") {
    return elevateToActionNeeded(
      input.baseDecision,
      input.context,
      "Manual setup is incomplete.",
      input.baseDecision.reasons,
      {
        reason: "COMPLETE_SETUP",
        cooldownKey: `setup:${input.context.user.id}`,
        message: [
          `Action needed: complete manual setup for ${input.context.setup.missingItems.join(", ")}.`,
          "Use tracked assets, /setcash, and /setposition to update your record.",
          "No trade was executed.",
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
      `${input.context.positionState.asset} market data has been unavailable for repeated hourly checks.`,
      [
        ...input.baseDecision.reasons,
        `Consecutive market snapshot failures: ${input.consecutiveMarketFailures}.`,
      ],
      {
        reason: "MARKET_DATA_UNAVAILABLE",
        cooldownKey: `market-data:${input.context.user.id}:${input.context.positionState.asset}`,
        message: [
          `Action needed: ${input.context.positionState.asset} market data has been unavailable for several checks.`,
          "Review your spot record and retry later.",
          "No trade was executed.",
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
  };
}

function getInvalidRecordedStateAlert(context: DecisionContext): {
  reasons: string[];
  alert: ActionNeededAlert;
} | null {
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
          `Action needed: fix your ${position.asset} spot record.`,
          "Quantity is 0 but average entry price is not 0.",
          "No trade was executed.",
        ].join("\n"),
      },
    };
  }

  return null;
}
