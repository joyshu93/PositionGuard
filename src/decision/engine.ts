import type { DecisionContext, DecisionResult } from "../domain/types";

export function runDecisionEngine(context: DecisionContext): DecisionResult {
  if (!context.setup.isComplete) {
    return {
      status: "SETUP_INCOMPLETE",
      summary: "User setup is incomplete; waiting for manual state input.",
      reasons: [
        "Available cash has not been fully recorded or position state is missing.",
        "The stub engine does not infer missing state.",
      ],
      actionable: false,
      symbol: context.marketSnapshot?.market ?? null,
      generatedAt: context.generatedAt,
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
      symbol: null,
      generatedAt: context.generatedAt,
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
  };
}
