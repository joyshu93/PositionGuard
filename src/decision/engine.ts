import type { DecisionContext, DecisionResult } from "../domain/types.js";

export function runDecisionEngine(context: DecisionContext): DecisionResult {
  if (!context.setup.isComplete) {
    return {
      status: "SETUP_INCOMPLETE",
      summary: "Manual setup is incomplete; waiting for user-reported inputs.",
      reasons: [
        `Missing setup items: ${context.setup.missingItems.join(", ")}.`,
        "PositionGuard only works from user-reported state.",
      ],
      actionable: false,
      symbol: context.marketSnapshot?.market ?? getFallbackMarket(context),
      generatedAt: context.generatedAt,
      alert: null,
    };
  }

  if (context.marketSnapshot === null) {
    return {
      status: "INSUFFICIENT_DATA",
      summary: "Public market context is unavailable for this cycle.",
      reasons: [
        "The decision scaffold requires a normalized market snapshot.",
        "No fallback strategy logic is enabled in the MVP.",
      ],
      actionable: false,
      symbol: getFallbackMarket(context),
      generatedAt: context.generatedAt,
      alert: null,
    };
  }

  return {
    status: "NO_ACTION",
    summary: "No action is produced in the scaffold stage.",
    reasons: [
      "The final discretionary decision engine is intentionally not implemented.",
      "The scaffold only validates readiness and preserves structured context.",
    ],
    actionable: false,
    symbol: context.marketSnapshot.market,
    generatedAt: context.generatedAt,
    alert: null,
  };
}

function getFallbackMarket(context: DecisionContext) {
  if (context.positionState?.asset === "BTC") {
    return "KRW-BTC" as const;
  }
  if (context.positionState?.asset === "ETH") {
    return "KRW-ETH" as const;
  }
  return null;
}
