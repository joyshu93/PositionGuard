import type { DecisionContext, DecisionResult } from "../domain/types.js";
import {
  analyzePositionStructure,
  summarizeLocation,
  summarizeTrend,
} from "./market-structure.js";

export function runDecisionEngine(context: DecisionContext): DecisionResult {
  if (!context.setup.isReady) {
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

  if (!context.positionState || context.positionState.quantity <= 0) {
    return {
      status: "NO_ACTION",
      summary: `No ${context.marketSnapshot.asset} spot inventory is recorded, so no coaching action is needed right now.`,
      reasons: [
        `${context.marketSnapshot.asset} is tracked, but the recorded quantity is 0.`,
        "PositionGuard stays quiet when there is no live spot inventory to coach.",
      ],
      actionable: false,
      symbol: context.marketSnapshot.market,
      generatedAt: context.generatedAt,
      alert: null,
    };
  }

  const analysis = analyzePositionStructure(context);
  if (!analysis) {
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

  if (shouldEscalateRiskReview(analysis)) {
    return {
      status: "ACTION_NEEDED",
      summary: `${analysis.asset} structure is weakening; review invalidation and cash risk now.`,
      reasons: buildRiskReasons(analysis),
      actionable: true,
      symbol: context.marketSnapshot.market,
      generatedAt: context.generatedAt,
      alert: {
        reason: "RISK_REVIEW_REQUIRED",
        cooldownKey: `risk-review:${context.user.id}:${analysis.asset}:${getRiskBucket(analysis)}`,
        message: [
          `Action needed: ${analysis.asset} structure is weakening.`,
          "Review your invalidation level, cash buffer, and whether the recorded spot size still fits your plan.",
          "No trade was executed.",
        ].join("\n"),
      },
    };
  }

  return {
    status: "NO_ACTION",
    summary: buildNoActionSummary(analysis),
    reasons: buildNoActionReasons(analysis),
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

function shouldEscalateRiskReview(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): boolean {
  const severeDrawdown = analysis.pnlPct <= -0.08;
  const moderateDrawdown = analysis.pnlPct <= -0.04;
  const earlyDrawdown = analysis.pnlPct <= -0.05;
  const higherTimeframeWeakness =
    analysis.timeframes["4h"].trend === "DOWN" &&
    analysis.timeframes["1d"].trend === "DOWN";
  const lowerRangePressure =
    analysis.timeframes["4h"].location === "LOWER" ||
    analysis.timeframes["1d"].location === "LOWER";
  const supportBreak =
    analysis.breakdown4h || analysis.breakdown1d;

  if (severeDrawdown && analysis.bearishTrendCount >= 2 && lowerRangePressure) {
    return true;
  }

  if (supportBreak && moderateDrawdown && analysis.bearishTrendCount >= 1) {
    return true;
  }

  if (higherTimeframeWeakness && moderateDrawdown && analysis.lowerLocationCount >= 2) {
    return true;
  }

  if (earlyDrawdown && analysis.bearishTrendCount >= 1 && analysis.lowerLocationCount >= 2) {
    return true;
  }

  return false;
}

function buildRiskReasons(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): string[] {
  const reasons = [
    formatPnLReason(analysis),
    formatTrendReason(analysis),
    formatRangeReason(analysis),
  ];

  if (analysis.breakdown1d) {
    reasons.push("Current price is pressing below the recent daily support range.");
  } else if (analysis.breakdown4h) {
    reasons.push("Current price is testing below the recent 4h support range.");
  }

  reasons.push("Survival first: confirm the level that invalidates the spot position before doing anything else.");
  return reasons;
}

function buildNoActionSummary(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): string {
  if (analysis.pnlPct >= 0 && analysis.bearishTrendCount === 0) {
    return `${analysis.asset} structure is not showing a clear invalidation event; no urgent coaching action is needed.`;
  }

  if (analysis.pnlPct < 0) {
    return `${analysis.asset} is still above its immediate invalidation threshold for now; stay patient and keep risk levels explicit.`;
  }

  return `${analysis.asset} structure is mixed, so the conservative posture is to observe rather than chase.`;
}

function buildNoActionReasons(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): string[] {
  return [
    formatPnLReason(analysis),
    formatTrendReason(analysis),
    formatRangeReason(analysis),
    "Trend first and no chase buying: wait for cleaner structure instead of forcing action.",
  ];
}

function formatPnLReason(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): string {
  const pct = Math.abs(analysis.pnlPct * 100).toFixed(1);
  if (analysis.pnlPct > 0) {
    return `Current price is about ${pct}% above the recorded average entry.`;
  }

  if (analysis.pnlPct < 0) {
    return `Current price is about ${pct}% below the recorded average entry.`;
  }

  return "Current price is sitting near the recorded average entry.";
}

function formatTrendReason(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): string {
  return `Trend summary: 1h ${summarizeTrend(analysis.timeframes["1h"].trend)}, 4h ${summarizeTrend(analysis.timeframes["4h"].trend)}, 1d ${summarizeTrend(analysis.timeframes["1d"].trend)}.`;
}

function formatRangeReason(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): string {
  return `Current price is in the ${summarizeLocation(analysis.timeframes["1h"].location)} 1h range, ${summarizeLocation(analysis.timeframes["4h"].location)} 4h range, and ${summarizeLocation(analysis.timeframes["1d"].location)} daily range.`;
}

function getRiskBucket(
  analysis: NonNullable<ReturnType<typeof analyzePositionStructure>>,
): string {
  if (analysis.breakdown1d) {
    return "daily-break";
  }

  if (analysis.breakdown4h) {
    return "four-hour-break";
  }

  if (analysis.pnlPct <= -0.08) {
    return "deep-drawdown";
  }

  return "trend-weakness";
}
