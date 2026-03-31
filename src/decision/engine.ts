import type {
  DecisionContext,
  DecisionDiagnostics,
  DecisionResult,
  DecisionRiskLevel,
  DecisionSetupState,
  MarketRegime,
} from "../domain/types.js";
import {
  analyzeMarketStructure,
  analyzePositionStructure,
  getTriggerStateFromSignals,
  summarizeLocation,
  toDecisionSnapshot,
  type MarketStructureAnalysis,
  type PositionStructureAnalysis,
} from "./market-structure.js";

type SetupKind = "ENTRY" | "ADD_BUY" | "REDUCE" | "NONE";
interface SetupEval { kind: SetupKind; state: DecisionSetupState; supports: string[]; blockers: string[]; }
interface TriggerEval { state: DecisionDiagnostics["trigger"]["state"]; confirmed: string[]; missing: string[]; }
interface RiskEval { level: DecisionRiskLevel; invalidationState: DecisionDiagnostics["risk"]["invalidationState"]; invalidationLevel: number | null; notes: string[]; }

export function runDecisionEngine(context: DecisionContext): DecisionResult {
  if (!context.setup.isReady) return baseResult(context, "SETUP_INCOMPLETE", "Manual setup is incomplete; waiting for user-reported inputs.", [`Missing setup items: ${context.setup.missingItems.join(", ")}.`, "PositionGuard only works from user-reported state."], false);
  if (!context.marketSnapshot) return baseResult(context, "INSUFFICIENT_DATA", "Public market context is unavailable for this cycle.", ["The decision scaffold requires a normalized market snapshot.", "No fallback strategy logic is enabled in the MVP."], false);

  const hasCash = (context.accountState?.availableCash ?? 0) > 0;
  const hasPosition = Boolean(context.positionState && context.positionState.quantity > 0);
  if (!hasPosition) return evaluateEntry(context, analyzeMarketStructure(context.marketSnapshot), hasCash);

  const analysis = analyzePositionStructure(context.marketSnapshot, context.positionState?.averageEntryPrice ?? 0);
  const reduce = evaluateReduce(context, analysis);
  if (reduce.status === "ACTION_NEEDED") return reduce;
  return evaluateAddBuy(context, analysis, hasCash);
}

function evaluateEntry(context: DecisionContext, analysis: MarketStructureAnalysis, hasCash: boolean): DecisionResult {
  const setup = assessEntrySetup(analysis, hasCash);
  const trigger = assessBullishTrigger(analysis, false);
  const risk = assessRisk(analysis, analysis.riskLevel);
  const diagnostics = buildDiagnostics(analysis, setup, trigger, risk);
  if (setup.state === "READY" && trigger.state === "CONFIRMED") {
    return withAlert(context, diagnostics, "ENTRY_REVIEW_REQUIRED", `entry-review:${context.user.id}:${analysis.asset}:${bucketEntry(analysis)}`, `${analysis.asset} structure supports a conservative spot entry review.`, buildEntryReasons(analysis, context, setup, trigger, risk), [
      `Action needed: ${analysis.asset} structure supports a conservative spot entry review.`,
      "Keep it staged, confirm the invalidation level first, and avoid chasing the upper end of the range.",
      "No trade was executed.",
    ].join("\n"));
  }
  return {
    ...baseResult(context, "NO_ACTION", entryNoActionSummary(analysis, hasCash, setup, trigger), entryNoActionReasons(analysis, hasCash, setup, trigger, risk), false),
    symbol: context.marketSnapshot?.market ?? null,
    diagnostics,
  };
}

function evaluateAddBuy(context: DecisionContext, analysis: PositionStructureAnalysis, hasCash: boolean): DecisionResult {
  const setup = assessAddBuySetup(analysis, hasCash);
  const trigger = assessBullishTrigger(analysis, true);
  const risk = assessRisk(analysis, analysis.riskLevel === "LOW" && analysis.pnlPct > -0.03 ? "MODERATE" : analysis.riskLevel);
  const diagnostics = buildDiagnostics(analysis, setup, trigger, risk);
  if (setup.state === "READY" && trigger.state === "CONFIRMED") {
    return withAlert(context, diagnostics, "ADD_BUY_REVIEW_REQUIRED", `add-buy-review:${context.user.id}:${analysis.asset}:${bucketAdd(analysis)}`, `${analysis.asset} pullback may justify a staged add-buy review.`, buildAddBuyReasons(analysis, context, setup, trigger, risk), [
      `Action needed: ${analysis.asset} pullback may justify a staged add-buy review.`,
      "Only consider it if the invalidation level is clear, cash remains available, and you are not averaging into breakdown.",
      "No trade was executed.",
    ].join("\n"));
  }
  return {
    ...baseResult(context, "NO_ACTION", addNoActionSummary(analysis, hasCash, setup, trigger), addNoActionReasons(analysis, hasCash, setup, trigger, risk), false),
    symbol: context.marketSnapshot?.market ?? null,
    diagnostics,
  };
}

function evaluateReduce(context: DecisionContext, analysis: PositionStructureAnalysis): DecisionResult {
  const setup = assessReduceSetup(analysis);
  const trigger = assessReduceTrigger(analysis);
  const risk = assessRisk(analysis, analysis.riskLevel === "LOW" ? "ELEVATED" : analysis.riskLevel);
  const diagnostics = buildDiagnostics(analysis, setup, trigger, risk);
  const actionable = setup.state === "READY" && (trigger.state === "BEARISH_CONFIRMATION" || risk.level === "HIGH");
  if (!actionable) {
    return {
      ...baseResult(context, "NO_ACTION", `${analysis.asset} structure is mixed, so the conservative posture is to observe and keep invalidation levels explicit.`, [formatPnL(analysis), `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk), "Survival first remains the frame, but a reduce review is not forced yet."], false),
      symbol: context.marketSnapshot?.market ?? null,
      diagnostics,
    };
  }
  const summary = analysis.breakdown1d || risk.level === "HIGH"
    ? `${analysis.asset} structure has lost higher-timeframe support; review sell-side risk management.`
    : `${analysis.asset} structure is weakening; review partial reduction or exit plan.`;
  return withAlert(context, diagnostics, "REDUCE_REVIEW_REQUIRED", `reduce-review:${context.user.id}:${analysis.asset}:${bucketReduce(analysis)}`, summary, [formatPnL(analysis), `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk), `What broke: ${setup.supports[0] ?? "higher timeframe support is weakening"}.`, `Trigger: ${trigger.confirmed[0] ?? trigger.missing[0] ?? "bearish confirmation is building"}.`, "Survival first: review reduce-side risk, sell review, or exit plan review before hoping for recovery."], [
      `Action needed: ${summary}`,
      "Review the invalidation level, cash-risk posture, and whether a reduce review or exit plan review is now required.",
      "No trade was executed.",
    ].join("\n"));
}

function assessEntrySetup(analysis: MarketStructureAnalysis, hasCash: boolean): SetupEval {
  const supports: string[] = [];
  const blockers: string[] = [];
  if (!hasCash) blockers.push("No available cash is recorded for a staged spot review."); else supports.push("Available cash is recorded for a staged spot review.");
  if (analysis.regime === "BREAKDOWN_RISK") blockers.push("Daily structure is in breakdown risk.");
  else if (analysis.regime === "WEAK_DOWNTREND") blockers.push("Higher timeframe structure is still weak enough that a new entry review is not justified.");
  else supports.push(`Regime is ${regimeText(analysis.regime)}.`);
  if (analysis.upperRangeChase) blockers.push("Current price is already too extended in the upper part of the recent range."); else supports.push("No chase condition is present.");
  if (analysis.pullbackZone || analysis.reclaimStructure) supports.push("Current location looks more like a pullback or reclaim than a late extension."); else blockers.push("Current location does not yet offer a clear pullback or reclaim structure.");
  if (analysis.invalidationState === "CLEAR") supports.push("Invalidation remains explainable from recent 4h and daily support."); else blockers.push("Invalidation is not clear enough yet.");
  if (analysis.timeframes["4h"].emaStackBullish || analysis.timeframes["1d"].emaStackBullish) supports.push("EMA20/50/200 structure remains constructive on higher timeframes."); else blockers.push("EMA recovery is still incomplete.");
  if ((analysis.timeframes["1h"].indicators.volumeRatio ?? 0) < 0.75) blockers.push("Recent rebound volume is still too weak."); else supports.push("Recent volume is not completely absent.");
  return { kind: "ENTRY", state: setupState(supports, blockers), supports, blockers };
}

function assessAddBuySetup(analysis: PositionStructureAnalysis, hasCash: boolean): SetupEval {
  const supports: string[] = [];
  const blockers: string[] = [];
  if (!hasCash) blockers.push("No available cash is recorded for a staged add-buy review."); else supports.push("Available cash remains on record for a staged add-buy review.");
  if (analysis.regime === "BREAKDOWN_RISK") blockers.push("Higher timeframe structure is already in breakdown risk."); else if (analysis.regime === "WEAK_DOWNTREND") blockers.push("Higher timeframe structure is still weak enough that averaging is not conservative."); else supports.push(`Regime is ${regimeText(analysis.regime)}.`);
  if (analysis.upperRangeChase) blockers.push("Current price is too high inside the recent range for a staged add-buy review."); else supports.push("No chase condition is present.");
  if (!analysis.pullbackZone && !analysis.reclaimStructure) blockers.push("Current location does not look like a healthy pullback or reclaim."); else supports.push("Current location still looks like a pullback or reclaim area.");
  if (analysis.pnlPct <= -0.09) blockers.push("Loss is already too deep for conservative averaging."); else supports.push("Loss depth is still inside a staged review zone.");
  if (analysis.atrShock) blockers.push("Recent move still looks too aggressive relative to ATR.");
  if ((analysis.timeframes["1h"].indicators.volumeRatio ?? 0) < 0.7) blockers.push("Recent recovery volume is too soft."); else supports.push("Volume has not fully disappeared.");
  if (analysis.timeframes["4h"].emaStackBullish || analysis.currentPrice >= (analysis.timeframes["4h"].indicators.ema50 ?? analysis.currentPrice)) supports.push("4h EMA20/EMA50 support is still explainable."); else blockers.push("4h EMA support is weakening too much.");
  return { kind: "ADD_BUY", state: setupState(supports, blockers), supports, blockers };
}

function assessReduceSetup(analysis: PositionStructureAnalysis): SetupEval {
  const supports: string[] = [];
  if (analysis.pnlPct <= -0.04) supports.push("Recorded drawdown is expanding.");
  if (analysis.breakdown4h || analysis.breakdown1d) supports.push("Recent support has already been lost.");
  if (analysis.timeframes["4h"].trend === "DOWN" || analysis.timeframes["1d"].trend === "DOWN") supports.push("Higher timeframe structure is weakening.");
  if (analysis.currentPrice < (analysis.timeframes["4h"].indicators.ema50 ?? analysis.currentPrice) || analysis.currentPrice < (analysis.timeframes["1d"].indicators.ema200 ?? analysis.currentPrice)) supports.push("EMA50/EMA200 support is not holding cleanly.");
  return { kind: "REDUCE", state: supports.length >= 2 ? "READY" : "PROMISING", supports, blockers: [] };
}

function assessBullishTrigger(analysis: MarketStructureAnalysis | PositionStructureAnalysis, isAdd: boolean): TriggerEval {
  const confirmed: string[] = [];
  const missing: string[] = [];
  if (analysis.reclaimStructure) confirmed.push("1h reclaim is visible above recent resistance."); else if (analysis.pullbackZone) confirmed.push("1h pullback location is still constructive."); else missing.push("1h reclaim or pullback confirmation is still missing.");
  if (analysis.volumeRecovery) confirmed.push("Recent volume has recovered enough to support the move."); else missing.push("Volume recovery is still weak.");
  if (analysis.macdImproving) confirmed.push("MACD histogram is improving."); else missing.push("MACD histogram improvement is still missing.");
  if (analysis.rsiRecovery) confirmed.push("RSI has moved away from washed-out extremes."); else if (analysis.timeframes["1h"].rsiOverbought && analysis.upperRangeChase) missing.push("RSI is still overheated for a conservative review."); else missing.push("RSI recovery is not clear yet.");
  if (isAdd && analysis.currentPrice > analysis.timeframes["1h"].resistance * 0.995) missing.push("Price is still too close to local resistance for a clean staged add.");
  return { state: getTriggerStateFromSignals({ bullishSignals: confirmed, missingSignals: missing }), confirmed, missing };
}

function assessReduceTrigger(analysis: PositionStructureAnalysis): TriggerEval {
  const confirmed: string[] = [];
  const missing: string[] = [];
  if (analysis.breakdown4h || analysis.breakdown1d) confirmed.push("Swing support has already broken.");
  if (analysis.bearishMomentumExpansion) confirmed.push("MACD is expanding negatively across the pullback.");
  if ((analysis.timeframes["1h"].indicators.rsi14 ?? 100) <= 42) confirmed.push("RSI is staying weak instead of rebounding.");
  if (analysis.atrShock) confirmed.push("Price damage is large relative to ATR.");
  if (confirmed.length === 0) missing.push("Lower timeframe breakdown confirmation is not decisive yet.");
  return { state: getTriggerStateFromSignals({ bullishSignals: [], missingSignals: missing, bearishConfirmation: confirmed.length > 0 }), confirmed, missing };
}

function assessRisk(analysis: MarketStructureAnalysis | PositionStructureAnalysis, level: DecisionRiskLevel): RiskEval {
  return { level, invalidationState: analysis.invalidationState, invalidationLevel: analysis.invalidationLevel, notes: [formatInvalidationLevel(analysis), ...(analysis.breakdown1d ? ["Daily support is already broken."] : analysis.breakdown4h ? ["4h support is already broken."] : [])] };
}

function buildDiagnostics(analysis: MarketStructureAnalysis | PositionStructureAnalysis, setup: SetupEval, trigger: TriggerEval, risk: RiskEval): DecisionDiagnostics {
  return {
    regime: { classification: analysis.regime, summary: analysis.regimeSummary },
    setup: { kind: setup.kind, state: setup.state, supports: setup.supports, blockers: setup.blockers },
    trigger: { state: trigger.state, confirmed: trigger.confirmed, missing: trigger.missing },
    risk: { level: risk.level, invalidationState: risk.invalidationState, invalidationLevel: risk.invalidationLevel, notes: risk.notes },
    indicators: { price: analysis.currentPrice, timeframes: { "1h": toDecisionSnapshot(analysis.timeframes["1h"]), "4h": toDecisionSnapshot(analysis.timeframes["4h"]), "1d": toDecisionSnapshot(analysis.timeframes["1d"]) } },
  };
}

function buildEntryReasons(analysis: MarketStructureAnalysis, context: DecisionContext, setup: SetupEval, trigger: TriggerEval, risk: RiskEval): string[] {
  return [`Available cash on record: ${cash(context)} KRW.`, `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk), "No chase buying: current structure is not pressing the upper part of the recent range.", `Setup: ${setup.supports[0] ?? setup.blockers[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.confirmed[0] ?? trigger.missing[0] ?? "trigger reviewed"}.`];
}
function entryNoActionSummary(analysis: MarketStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval): string {
  if (!hasCash) return `No ${analysis.asset} spot inventory is recorded, and no available cash is on record for a new review.`;
  if (analysis.regime === "BREAKDOWN_RISK") return `${analysis.asset} has daily breakdown risk, so a conservative entry review is not justified right now.`;
  if (analysis.upperRangeChase) return `${analysis.asset} is still extended inside the recent range, so a conservative entry review is not justified right now.`;
  if (setup.state === "PROMISING" && trigger.state !== "CONFIRMED") return `${analysis.asset} has a constructive picture, but the trigger is still incomplete for a conservative entry review.`;
  return `${analysis.asset} structure is not clear enough for a conservative spot entry review yet.`;
}
function entryNoActionReasons(analysis: MarketStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval, risk: RiskEval): string[] {
  const reasons = [`Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk)];
  if (!hasCash) return ["No available cash is recorded, so there is nothing to stage into a new spot position.", ...reasons];
  if (analysis.upperRangeChase) return ["Current price is already in the upper part of the recent range.", ...reasons, "No chase buying remains active."];
  return [...reasons, `Setup: ${setup.blockers[0] ?? setup.supports[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.missing[0] ?? trigger.confirmed[0] ?? "trigger reviewed"}.`];
}
function buildAddBuyReasons(analysis: PositionStructureAnalysis, context: DecisionContext, setup: SetupEval, trigger: TriggerEval, risk: RiskEval): string[] {
  return [formatPnL(analysis), `Available cash on record: ${cash(context)} KRW.`, `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk), "No chase buying still applies: this is a staged add-buy review only when pullback structure holds.", `Setup: ${setup.supports[0] ?? setup.blockers[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.confirmed[0] ?? trigger.missing[0] ?? "trigger reviewed"}.`];
}
function addNoActionSummary(analysis: PositionStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval): string {
  if (!hasCash) return `${analysis.asset} structure is mixed, and there is no recorded cash buffer for a staged add-buy review right now.`;
  if (analysis.upperRangeChase) return `${analysis.asset} is sitting too high in the recent range for a conservative add-buy review right now.`;
  if (analysis.regime === "BREAKDOWN_RISK" || analysis.regime === "WEAK_DOWNTREND") return `${analysis.asset} is weakening too aggressively for a staged add-buy review.`;
  if (setup.state === "PROMISING" && trigger.state !== "CONFIRMED") return `${analysis.asset} pullback structure is not broken, but the trigger is still incomplete for a staged add-buy review.`;
  return `${analysis.asset} structure is mixed, so the conservative posture is to observe and keep invalidation levels explicit.`;
}
function addNoActionReasons(analysis: PositionStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval, risk: RiskEval): string[] {
  const reasons = [formatPnL(analysis), `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk)];
  if (!hasCash) return [...reasons, "No available cash is recorded, so a staged add-buy review is unavailable."];
  return [...reasons, `Setup: ${setup.blockers[0] ?? setup.supports[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.missing[0] ?? trigger.confirmed[0] ?? "trigger reviewed"}.`];
}

function withAlert(
  context: DecisionContext,
  diagnostics: DecisionDiagnostics,
  reason: NonNullable<DecisionResult["alert"]>["reason"],
  cooldownKey: string,
  summary: string,
  reasons: string[],
  message: string,
): DecisionResult {
  return {
    ...baseResult(context, "ACTION_NEEDED", summary, reasons, true),
    symbol: context.marketSnapshot?.market ?? null,
    alert: { reason, cooldownKey, message },
    diagnostics,
  };
}
function baseResult(context: DecisionContext, status: DecisionResult["status"], summary: string, reasons: string[], actionable: boolean): DecisionResult {
  return { status, summary, reasons, actionable, symbol: context.marketSnapshot?.market ?? getFallbackMarket(context), generatedAt: context.generatedAt, alert: null, diagnostics: null };
}
function cash(context: DecisionContext): string { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, context.accountState?.availableCash ?? 0)); }
function formatPnL(analysis: PositionStructureAnalysis): string { const pct = Math.abs(analysis.pnlPct * 100).toFixed(1); return analysis.pnlPct > 0 ? `Current price is about ${pct}% above the recorded average entry.` : analysis.pnlPct < 0 ? `Current price is about ${pct}% below the recorded average entry.` : "Current price is sitting near the recorded average entry."; }
function rangeText(analysis: MarketStructureAnalysis | PositionStructureAnalysis): string { return `Range location: 1h ${summarizeLocation(analysis.timeframes["1h"].location)}, 4h ${summarizeLocation(analysis.timeframes["4h"].location)}, 1d ${summarizeLocation(analysis.timeframes["1d"].location)}.`; }
function regimeText(regime: MarketRegime): string { return regime.replaceAll("_", " ").toLowerCase(); }
function invalidationText(risk: RiskEval): string { if (risk.invalidationLevel === null) return "Invalidation remains unclear, so patience matters more than activity."; if (risk.invalidationState === "BROKEN") return `Invalidation is already broken below roughly ${price(risk.invalidationLevel)} KRW.`; return `Invalidation remains clear near ${price(risk.invalidationLevel)} KRW.`; }
function formatInvalidationLevel(analysis: MarketStructureAnalysis | PositionStructureAnalysis): string { return analysis.invalidationLevel === null ? "Invalidation is still unclear." : `Invalidation is near ${price(analysis.invalidationLevel)} KRW.`; }
function price(value: number): string { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, value)); }
function setupState(supports: string[], blockers: string[]): DecisionSetupState { return blockers.length === 0 ? "READY" : supports.length >= 3 && blockers.length <= 2 ? "PROMISING" : "BLOCKED"; }
function bucketEntry(analysis: MarketStructureAnalysis): string { return analysis.timeframes["4h"].location === "LOWER" ? "four-hour-pullback" : analysis.reclaimStructure ? "one-hour-reclaim" : "balanced-range"; }
function bucketAdd(analysis: PositionStructureAnalysis): string { return analysis.timeframes["4h"].location === "LOWER" ? "four-hour-pullback" : analysis.pnlPct < 0 ? "near-entry-pullback" : "staged-retest"; }
function bucketReduce(analysis: PositionStructureAnalysis): string { return analysis.breakdown1d ? "daily-break" : analysis.breakdown4h ? "four-hour-break" : analysis.pnlPct <= -0.08 ? "deep-drawdown" : "trend-weakness"; }
function getFallbackMarket(context: DecisionContext) { return context.positionState?.asset === "BTC" ? "KRW-BTC" as const : context.positionState?.asset === "ETH" ? "KRW-ETH" as const : null; }
