import type { DecisionContext, DecisionResult } from "../domain/types.js";
import {
  analyzeMarketStructure,
  analyzePositionStructure,
  summarizeLocation,
  summarizeTrend,
  type MarketStructureAnalysis,
  type PositionStructureAnalysis,
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

  const hasCash = (context.accountState?.availableCash ?? 0) > 0;
  const hasPosition = Boolean(context.positionState && context.positionState.quantity > 0);

  if (!hasPosition) {
    const analysis = analyzeMarketStructure(context.marketSnapshot);
    if (shouldRecommendEntryReview(analysis, hasCash)) {
      return {
        status: "ACTION_NEEDED",
        summary: `${analysis.asset} structure supports a conservative spot entry review.`,
        reasons: buildEntryReviewReasons(analysis, context),
        actionable: true,
        symbol: context.marketSnapshot.market,
        generatedAt: context.generatedAt,
        alert: {
          reason: "ENTRY_REVIEW_REQUIRED",
          cooldownKey: `entry-review:${context.user.id}:${analysis.asset}:${getEntryBucket(analysis)}`,
          message: [
            `Action needed: ${analysis.asset} structure supports a conservative spot entry review.`,
            "Keep it staged, confirm the invalidation level first, and avoid chasing the upper end of the range.",
            "No trade was executed.",
          ].join("\n"),
        },
      };
    }

    return {
      status: "NO_ACTION",
      summary: buildNoPositionSummary(analysis, hasCash),
      reasons: buildNoPositionReasons(analysis, hasCash),
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

  if (shouldEscalateReduceReview(analysis)) {
    return {
      status: "ACTION_NEEDED",
      summary: `${analysis.asset} structure is weakening; review partial reduction or exit plan.`,
      reasons: buildReduceReviewReasons(analysis),
      actionable: true,
      symbol: context.marketSnapshot.market,
      generatedAt: context.generatedAt,
      alert: {
        reason: "REDUCE_REVIEW_REQUIRED",
        cooldownKey: `reduce-review:${context.user.id}:${analysis.asset}:${getReduceBucket(analysis)}`,
        message: [
          `Action needed: ${analysis.asset} structure is weakening.`,
          "Review partial reduction or exit planning, and confirm the invalidation level before doing anything else.",
          "No trade was executed.",
        ].join("\n"),
      },
    };
  }

  if (shouldRecommendAddBuyReview(analysis, hasCash)) {
    return {
      status: "ACTION_NEEDED",
      summary: `${analysis.asset} pullback may justify a staged add-buy review.`,
      reasons: buildAddBuyReviewReasons(analysis, context),
      actionable: true,
      symbol: context.marketSnapshot.market,
      generatedAt: context.generatedAt,
      alert: {
        reason: "ADD_BUY_REVIEW_REQUIRED",
        cooldownKey: `add-buy-review:${context.user.id}:${analysis.asset}:${getAddBuyBucket(analysis)}`,
        message: [
          `Action needed: ${analysis.asset} pullback may justify a staged add-buy review.`,
          "Only consider it if the invalidation level is clear, cash remains available, and you are not averaging into breakdown.",
          "No trade was executed.",
        ].join("\n"),
      },
    };
  }

  return {
    status: "NO_ACTION",
    summary: buildPositionNoActionSummary(analysis, hasCash),
    reasons: buildPositionNoActionReasons(analysis, hasCash),
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

function shouldRecommendEntryReview(
  analysis: MarketStructureAnalysis,
  hasCash: boolean,
): boolean {
  if (!hasCash) {
    return false;
  }

  if (analysis.breakdown4h || analysis.breakdown1d) {
    return false;
  }

  if (analysis.timeframes["1h"].location === "UPPER" || analysis.timeframes["4h"].location === "UPPER") {
    return false;
  }

  if (analysis.timeframes["1d"].trend === "DOWN") {
    return false;
  }

  if (analysis.timeframes["4h"].trend === "DOWN" && analysis.timeframes["1h"].trend === "DOWN") {
    return false;
  }

  const constructiveStructure =
    analysis.timeframes["4h"].trend === "UP" ||
    analysis.timeframes["1d"].trend === "UP" ||
    (analysis.timeframes["4h"].trend === "FLAT" && analysis.timeframes["1d"].trend === "FLAT");

  return constructiveStructure;
}

function shouldRecommendAddBuyReview(
  analysis: PositionStructureAnalysis,
  hasCash: boolean,
): boolean {
  if (!hasCash) {
    return false;
  }

  if (analysis.breakdown4h || analysis.breakdown1d) {
    return false;
  }

  if (analysis.timeframes["4h"].trend === "DOWN" || analysis.timeframes["1d"].trend === "DOWN") {
    return false;
  }

  if (analysis.timeframes["1h"].location === "UPPER" || analysis.timeframes["4h"].location === "UPPER") {
    return false;
  }

  if (analysis.pnlPct <= -0.06) {
    return false;
  }

  const pullbackZone =
    analysis.timeframes["4h"].location === "LOWER" ||
    analysis.timeframes["4h"].location === "MIDDLE";
  const notExtendedAboveEntry = analysis.pnlPct <= 0.03;
  const higherTimeframeSupport =
    analysis.timeframes["4h"].trend === "UP" ||
    analysis.timeframes["1d"].trend === "UP" ||
    analysis.timeframes["4h"].trend === "FLAT";

  return pullbackZone && notExtendedAboveEntry && higherTimeframeSupport;
}

function shouldEscalateReduceReview(
  analysis: PositionStructureAnalysis,
): boolean {
  const severeDrawdown = analysis.pnlPct <= -0.08;
  const moderateDrawdown = analysis.pnlPct <= -0.04;
  const higherTimeframeWeakness =
    analysis.timeframes["4h"].trend === "DOWN" &&
    analysis.timeframes["1d"].trend === "DOWN";
  const lowerRangePressure =
    analysis.timeframes["4h"].location === "LOWER" ||
    analysis.timeframes["1d"].location === "LOWER";
  const supportBreak = analysis.breakdown4h || analysis.breakdown1d;

  if (severeDrawdown && analysis.bearishTrendCount >= 2 && lowerRangePressure) {
    return true;
  }

  if (supportBreak && moderateDrawdown && analysis.bearishTrendCount >= 1) {
    return true;
  }

  if (higherTimeframeWeakness && moderateDrawdown && analysis.lowerLocationCount >= 2) {
    return true;
  }

  return false;
}

function buildEntryReviewReasons(
  analysis: MarketStructureAnalysis,
  context: DecisionContext,
): string[] {
  return [
    `Available cash on record: ${formatCash(context.accountState?.availableCash ?? 0)} KRW.`,
    formatTrendReason(analysis),
    formatRangeReason(analysis),
    "No chase buying: current structure is not pressing the upper end of the recent range.",
    "If you review an initial spot entry, keep it staged and define the invalidation level first.",
  ];
}

function buildNoPositionSummary(
  analysis: MarketStructureAnalysis,
  hasCash: boolean,
): string {
  if (!hasCash) {
    return `No ${analysis.asset} spot inventory is recorded, and no available cash is on record for a new review.`;
  }

  if (analysis.timeframes["1h"].location === "UPPER" || analysis.timeframes["4h"].location === "UPPER") {
    return `${analysis.asset} is extended inside the recent range, so a conservative entry review is not justified right now.`;
  }

  return `${analysis.asset} structure is not clear enough for a conservative spot entry review yet.`;
}

function buildNoPositionReasons(
  analysis: MarketStructureAnalysis,
  hasCash: boolean,
): string[] {
  const reasons = [formatTrendReason(analysis), formatRangeReason(analysis)];

  if (!hasCash) {
    reasons.unshift("No available cash is recorded, so there is nothing to stage into a new spot position.");
    return reasons;
  }

  if (analysis.timeframes["1h"].location === "UPPER" || analysis.timeframes["4h"].location === "UPPER") {
    reasons.unshift("Current price is already near the upper end of the recent range.");
    reasons.push("No chase buying: wait for a cleaner pullback or a clearer invalidation level.");
    return reasons;
  }

  reasons.unshift("Available cash is recorded, but the structure is still mixed for a first spot entry review.");
  reasons.push("Scenarios over predictions: keep patience until location and invalidation are easier to define.");
  return reasons;
}

function buildAddBuyReviewReasons(
  analysis: PositionStructureAnalysis,
  context: DecisionContext,
): string[] {
  return [
    formatPnLReason(analysis),
    `Available cash on record: ${formatCash(context.accountState?.availableCash ?? 0)} KRW.`,
    formatTrendReason(analysis),
    formatRangeReason(analysis),
    "This is a pullback review, not a chase review: only consider staged adds while higher timeframe structure still holds.",
    "Invalidation first: confirm what breaks the idea before adding any spot size.",
  ];
}

function buildReduceReviewReasons(
  analysis: PositionStructureAnalysis,
): string[] {
  const reasons = [
    formatPnLReason(analysis),
    formatTrendReason(analysis),
    formatRangeReason(analysis),
  ];

  if (analysis.breakdown1d) {
    reasons.push("Current price is pressing below the recent daily support range.");
  } else if (analysis.breakdown4h) {
    reasons.push("Current price is pressing below the recent 4h support range.");
  }

  reasons.push("Survival first: review partial reduction or exit planning before hoping for recovery.");
  return reasons;
}

function buildPositionNoActionSummary(
  analysis: PositionStructureAnalysis,
  hasCash: boolean,
): string {
  if (analysis.pnlPct >= 0 && analysis.bearishTrendCount === 0) {
    return `${analysis.asset} structure is stable enough to stay patient; no urgent coaching action is needed.`;
  }

  if (!hasCash) {
    return `${analysis.asset} structure is mixed, and there is no recorded cash buffer for a staged add review right now.`;
  }

  if (analysis.timeframes["1h"].location === "UPPER" || analysis.timeframes["4h"].location === "UPPER") {
    return `${analysis.asset} is sitting too high in the recent range for a conservative add-buy review right now.`;
  }

  return `${analysis.asset} structure is mixed, so the conservative posture is to observe and keep invalidation levels explicit.`;
}

function buildPositionNoActionReasons(
  analysis: PositionStructureAnalysis,
  hasCash: boolean,
): string[] {
  const reasons = [
    formatPnLReason(analysis),
    formatTrendReason(analysis),
    formatRangeReason(analysis),
  ];

  if (!hasCash) {
    reasons.push("No available cash is recorded, so there is no staged add-buy review to make.");
    return reasons;
  }

  if (analysis.timeframes["1h"].location === "UPPER" || analysis.timeframes["4h"].location === "UPPER") {
    reasons.push("No chase buying: current price is already near the upper end of the recent range.");
    return reasons;
  }

  reasons.push("Trend first: keep observing until structure becomes clearly supportive or clearly broken.");
  return reasons;
}

function formatCash(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}

function formatPnLReason(analysis: PositionStructureAnalysis): string {
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
  analysis: MarketStructureAnalysis | PositionStructureAnalysis,
): string {
  return `Trend summary: 1h ${summarizeTrend(analysis.timeframes["1h"].trend)}, 4h ${summarizeTrend(analysis.timeframes["4h"].trend)}, 1d ${summarizeTrend(analysis.timeframes["1d"].trend)}.`;
}

function formatRangeReason(
  analysis: MarketStructureAnalysis | PositionStructureAnalysis,
): string {
  return `Current price is in the ${summarizeLocation(analysis.timeframes["1h"].location)} 1h range, ${summarizeLocation(analysis.timeframes["4h"].location)} 4h range, and ${summarizeLocation(analysis.timeframes["1d"].location)} daily range.`;
}

function getEntryBucket(analysis: MarketStructureAnalysis): string {
  if (analysis.timeframes["4h"].location === "LOWER") {
    return "four-hour-pullback";
  }

  if (analysis.timeframes["1h"].location === "LOWER") {
    return "one-hour-pullback";
  }

  return "balanced-range";
}

function getAddBuyBucket(analysis: PositionStructureAnalysis): string {
  if (analysis.timeframes["4h"].location === "LOWER") {
    return "four-hour-pullback";
  }

  if (analysis.pnlPct < 0) {
    return "near-entry-pullback";
  }

  return "staged-retest";
}

function getReduceBucket(analysis: PositionStructureAnalysis): string {
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
