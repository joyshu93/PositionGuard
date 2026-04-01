import type {
  DecisionContext,
  DecisionDiagnostics,
  DecisionResult,
  DecisionRiskLevel,
  DecisionSetupState,
  ExecutionGuide,
  MarketRegime,
} from "../domain/types.js";
import {
  analyzeMarketStructure,
  analyzePositionStructure,
  summarizeLocation,
  toDecisionSnapshot,
  type MarketStructureAnalysis,
  type PositionStructureAnalysis,
} from "./market-structure.js";
import { resolveUserLocale } from "../i18n/index.js";

type SetupKind = "ENTRY" | "ADD_BUY" | "REDUCE" | "NONE";
type BullishPath = "PULLBACK_ENTRY" | "RECLAIM_ENTRY" | "PULLBACK_ADD" | "STRENGTH_ADD" | null;
type InvalidationMode = "PULLBACK" | "RECLAIM" | "REDUCE";
type SetupBlockerCode =
  | "NO_CASH"
  | "BREAKDOWN_RISK"
  | "WEAK_DOWNTREND"
  | "UPPER_RANGE_CHASE"
  | "NO_VALID_PATH"
  | "INVALIDATION_UNCLEAR"
  | "EMA_RECOVERY_INCOMPLETE"
  | "LOSS_TOO_DEEP"
  | "ATR_SHOCK"
  | "FOUR_HOUR_SUPPORT_WEAKENING";
type SetupBlockerSeverity = "HARD" | "SOFT";

interface SetupEval { kind: SetupKind; state: DecisionSetupState; supports: string[]; blockers: string[]; }
interface TriggerEval { state: DecisionDiagnostics["trigger"]["state"]; confirmed: string[]; missing: string[]; }
interface RiskEval { level: DecisionRiskLevel; invalidationState: DecisionDiagnostics["risk"]["invalidationState"]; invalidationLevel: number | null; notes: string[]; }
interface SetupBlocker { code: SetupBlockerCode; severity: SetupBlockerSeverity; message: string; }
interface CashSizingGuide { initialPct: number | null; maxPct: number | null; caution: string | null; }

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
  const locale = resolveUserLocale(context.user.locale ?? null);
  const path = getBullishPath(analysis, false);
  const setup = assessEntrySetup(analysis, hasCash, path);
  const trigger = assessBullishTrigger(analysis, path);
  const risk = assessRisk(analysis, analysis.riskLevel, getInvalidationMode(path));
  const diagnostics = buildDiagnostics(analysis, setup, trigger, risk);
  if (setup.state === "READY" && trigger.state === "CONFIRMED") {
    const executionGuide = buildEntryExecutionGuide(context, analysis, risk, path);
    const continuation = path === "RECLAIM_ENTRY";
    const summary = continuation
      ? locale === "ko"
        ? `${analysis.asset} 리클레임 구조가 보수적인 현물 진입 검토에 적합합니다.`
        : `${analysis.asset} reclaim structure supports a conservative spot entry review.`
      : locale === "ko"
        ? `${analysis.asset} 눌림 구조가 보수적인 현물 진입 검토에 적합합니다.`
        : `${analysis.asset} pullback structure supports a conservative spot entry review.`;
    return withAlert(
      context,
      diagnostics,
      "ENTRY_REVIEW_REQUIRED",
      `entry-review:${context.user.id}:${analysis.asset}:${bucketEntry(analysis, path)}`,
      summary,
      [...buildEntryReasons(analysis, context, setup, trigger, risk, path), ...buildExecutionGuideReasons(executionGuide, locale)],
      buildExecutionGuideAlertMessage(locale, summary, executionGuide),
      executionGuide,
    );
  }
  return {
    ...baseResult(context, "NO_ACTION", entryNoActionSummary(locale, analysis, hasCash, setup, trigger, path), entryNoActionReasons(analysis, hasCash, setup, trigger, risk, path), false),
    symbol: context.marketSnapshot?.market ?? null,
    diagnostics,
  };
}

function evaluateAddBuy(context: DecisionContext, analysis: PositionStructureAnalysis, hasCash: boolean): DecisionResult {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const path = getBullishPath(analysis, true);
  const setup = assessAddBuySetup(analysis, hasCash, path);
  const trigger = assessBullishTrigger(analysis, path);
  const risk = assessRisk(analysis, analysis.riskLevel === "LOW" && analysis.pnlPct > -0.03 ? "MODERATE" : analysis.riskLevel, getInvalidationMode(path));
  const diagnostics = buildDiagnostics(analysis, setup, trigger, risk);
  if (setup.state === "READY" && trigger.state === "CONFIRMED") {
    const executionGuide = buildAddBuyExecutionGuide(context, analysis, risk, path);
    const strengthAdd = path === "STRENGTH_ADD";
    const summary = strengthAdd
      ? locale === "ko"
        ? `${analysis.asset} 유효한 리클레임 강세가 분할 추가매수 검토를 정당화할 수 있습니다.`
        : `${analysis.asset} valid reclaim strength may justify a staged add-buy review.`
      : locale === "ko"
        ? `${analysis.asset} 눌림 구조가 분할 추가매수 검토를 정당화할 수 있습니다.`
        : `${analysis.asset} pullback may justify a staged add-buy review.`;
    return withAlert(
      context,
      diagnostics,
      "ADD_BUY_REVIEW_REQUIRED",
      `add-buy-review:${context.user.id}:${analysis.asset}:${bucketAdd(analysis, path)}`,
      summary,
      [...buildAddBuyReasons(analysis, context, setup, trigger, risk, path), ...buildExecutionGuideReasons(executionGuide, locale)],
      buildExecutionGuideAlertMessage(locale, summary, executionGuide),
      executionGuide,
    );
  }
  return {
    ...baseResult(context, "NO_ACTION", addNoActionSummary(locale, analysis, hasCash, setup, trigger, path), addNoActionReasons(analysis, hasCash, setup, trigger, risk, path), false),
    symbol: context.marketSnapshot?.market ?? null,
    diagnostics,
  };
}

function evaluateReduce(context: DecisionContext, analysis: PositionStructureAnalysis): DecisionResult {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const setup = assessReduceSetup(analysis);
  const trigger = assessReduceTrigger(analysis);
  const risk = assessRisk(analysis, analysis.riskLevel === "LOW" ? "ELEVATED" : analysis.riskLevel, "REDUCE");
  const diagnostics = buildDiagnostics(analysis, setup, trigger, risk);
  const actionable = setup.state === "READY" && (trigger.state === "BEARISH_CONFIRMATION" || risk.level === "HIGH");
  if (!actionable) {
    return {
      ...baseResult(context, "NO_ACTION", locale === "ko" ? `${analysis.asset} 구조가 혼재돼 있어, 보수적으로는 관찰을 유지하고 무효화 기준을 분명히 두는 편이 낫습니다.` : `${analysis.asset} structure is mixed, so the conservative posture is to observe and keep invalidation levels explicit.`, [formatPnL(analysis), `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk), "Survival first remains the frame, but a reduce review is not forced yet."], false),
      symbol: context.marketSnapshot?.market ?? null,
      diagnostics,
    };
  }
  const executionGuide = buildReduceExecutionGuide(context, analysis, risk);
  const summary = analysis.breakdown1d || risk.level === "HIGH"
    ? locale === "ko"
      ? `${analysis.asset} 구조가 상위 시간대 지지를 잃었습니다. 매도 측 리스크 관리를 검토하세요.`
      : `${analysis.asset} structure has lost higher-timeframe support; review sell-side risk management.`
    : locale === "ko"
      ? `${analysis.asset} 구조가 약해지고 있습니다. 부분 축소 또는 이탈 계획을 검토하세요.`
      : `${analysis.asset} structure is weakening; review partial reduction or exit plan.`;
  return withAlert(
    context,
    diagnostics,
    "REDUCE_REVIEW_REQUIRED",
    `reduce-review:${context.user.id}:${analysis.asset}:${bucketReduce(analysis)}`,
    summary,
    [
      formatPnL(analysis),
      `Regime: ${regimeText(analysis.regime)}.`,
      rangeText(analysis),
      invalidationText(risk),
      `What broke: ${setup.supports[0] ?? "higher timeframe support is weakening"}.`,
      `Trigger: ${trigger.confirmed[0] ?? trigger.missing[0] ?? "bearish confirmation is building"}.`,
      "Survival first: review reduce-side risk, sell review, or exit plan review before hoping for recovery.",
      ...buildExecutionGuideReasons(executionGuide, locale),
    ],
    buildExecutionGuideAlertMessage(locale, summary, executionGuide),
    executionGuide,
  );
}

function assessEntrySetup(analysis: MarketStructureAnalysis, hasCash: boolean, path: BullishPath): SetupEval {
  const supports: string[] = [];
  const blockers: SetupBlocker[] = [];
  if (!hasCash) blockers.push(hardBlocker("NO_CASH", "No available cash is recorded for a staged spot review.")); else supports.push("Available cash is recorded for a staged spot review.");
  if (analysis.regime === "BREAKDOWN_RISK") blockers.push(hardBlocker("BREAKDOWN_RISK", "Daily structure is in breakdown risk."));
  else if (analysis.regime === "WEAK_DOWNTREND") blockers.push(hardBlocker("WEAK_DOWNTREND", "Higher timeframe structure is still weak enough that a new entry review is not justified."));
  else supports.push(`Regime is ${regimeText(analysis.regime)}.`);
  if (analysis.upperRangeChase) {
    blockers.push(softBlocker("UPPER_RANGE_CHASE", "Current price is already too extended in the upper part of the recent range."));
    if (path === "RECLAIM_ENTRY") supports.push("Continuation structure is good enough that late-extension risk is treated as a soft caution, not an automatic disqualification.");
  } else supports.push(path === "RECLAIM_ENTRY" ? "Continuation structure is good enough that the no-chase filter is not automatically disqualifying it." : "No chase condition is present.");
  if (path === "PULLBACK_ENTRY") supports.push("Current location offers a pullback-style entry path.");
  else if (path === "RECLAIM_ENTRY") supports.push("Current location offers a reclaim or breakout-hold entry path.");
  else blockers.push(hardBlocker("NO_VALID_PATH", "Current location does not yet offer a clear pullback or reclaim structure."));
  if (getModeInvalidationState(analysis, getInvalidationMode(path)) === "CLEAR") supports.push(path === "RECLAIM_ENTRY" ? "Invalidation is clear from the reclaimed level holding." : "Invalidation remains explainable from recent 4h and daily support."); else blockers.push(hardBlocker("INVALIDATION_UNCLEAR", "Invalidation is not clear enough yet."));
  if (analysis.timeframes["4h"].emaStackBullish || analysis.timeframes["1d"].emaStackBullish || analysis.regime === "EARLY_RECOVERY" || analysis.regime === "RECLAIM_ATTEMPT") supports.push("Higher timeframe structure is constructive enough for a conservative review."); else blockers.push(softBlocker("EMA_RECOVERY_INCOMPLETE", "EMA recovery is still incomplete."));
  if ((analysis.timeframes["1h"].indicators.volumeRatio ?? 0) >= 0.75) supports.push("Recent volume is not completely absent.");
  return { kind: "ENTRY", state: setupState(supports, blockers, path, analysis), supports, blockers: blockers.map((blocker) => blocker.message) };
}

function assessAddBuySetup(analysis: PositionStructureAnalysis, hasCash: boolean, path: BullishPath): SetupEval {
  const supports: string[] = [];
  const blockers: SetupBlocker[] = [];
  if (!hasCash) blockers.push(hardBlocker("NO_CASH", "No available cash is recorded for a staged add-buy review.")); else supports.push("Available cash remains on record for a staged add-buy review.");
  if (analysis.regime === "BREAKDOWN_RISK") blockers.push(hardBlocker("BREAKDOWN_RISK", "Higher timeframe structure is already in breakdown risk."));
  else if (analysis.regime === "WEAK_DOWNTREND" && path !== "STRENGTH_ADD") blockers.push(hardBlocker("WEAK_DOWNTREND", "Higher timeframe structure is still weak enough that averaging is not conservative."));
  else supports.push(`Regime is ${regimeText(analysis.regime)}.`);
  if (analysis.upperRangeChase) {
    blockers.push(softBlocker("UPPER_RANGE_CHASE", "Current price is too high inside the recent range for a staged add-buy review."));
    if (path === "STRENGTH_ADD") supports.push("Reclaim strength is good enough that late-extension risk is treated as a soft caution here, not an automatic disqualification.");
  } else supports.push(path === "STRENGTH_ADD" ? "Reclaim strength is good enough that the no-chase filter is narrower here." : "No chase condition is present.");
  if (path === "PULLBACK_ADD") supports.push("Current location still looks like a pullback area.");
  else if (path === "STRENGTH_ADD") supports.push("Current location supports a strength add only after a valid reclaim.");
  else blockers.push(hardBlocker("NO_VALID_PATH", "Current location does not look like a healthy pullback or reclaim."));
  if (analysis.pnlPct <= -0.09) blockers.push(hardBlocker("LOSS_TOO_DEEP", "Loss is already too deep for conservative averaging.")); else supports.push("Loss depth is still inside a staged review zone.");
  if (analysis.atrShock) blockers.push(hardBlocker("ATR_SHOCK", "Recent move still looks too aggressive relative to ATR."));
  if ((analysis.timeframes["1h"].indicators.volumeRatio ?? 0) >= 0.7) supports.push("Volume has not fully disappeared.");
  if (analysis.timeframes["4h"].emaStackBullish || analysis.currentPrice >= (analysis.timeframes["4h"].indicators.ema50 ?? analysis.currentPrice)) supports.push("4h EMA20/EMA50 support is still explainable."); else blockers.push(hardBlocker("FOUR_HOUR_SUPPORT_WEAKENING", "4h EMA support is weakening too much."));
  if (getModeInvalidationState(analysis, getInvalidationMode(path)) === "CLEAR") supports.push(path === "STRENGTH_ADD" ? "Strength-add invalidation is clear from the reclaimed level." : "Add-buy invalidation remains explainable.");
  else blockers.push(hardBlocker("INVALIDATION_UNCLEAR", "Invalidation is not clear enough for a staged add-buy review."));
  return { kind: "ADD_BUY", state: setupState(supports, blockers, path, analysis), supports, blockers: blockers.map((blocker) => blocker.message) };
}

function assessReduceSetup(analysis: PositionStructureAnalysis): SetupEval {
  const supports: string[] = [];
  const structureDamage: string[] = [];
  const weaknessSignals: string[] = [];
  if (analysis.breakdown4h || analysis.breakdown1d) structureDamage.push("Recent support has already been lost.");
  if (analysis.failedReclaim) structureDamage.push("Recent reclaim attempts have already failed.");
  if (analysis.timeframes["4h"].trend === "DOWN" || analysis.timeframes["1d"].trend === "DOWN") weaknessSignals.push("Higher timeframe structure is weakening.");
  if (analysis.pnlPct <= -0.06) weaknessSignals.push("Recorded drawdown is expanding.");
  if (analysis.currentPrice < (analysis.timeframes["4h"].indicators.ema50 ?? analysis.currentPrice) && analysis.currentPrice < (analysis.timeframes["1d"].indicators.ema200 ?? analysis.currentPrice)) weaknessSignals.push("EMA50/EMA200 support is not holding cleanly.");
  supports.push(...structureDamage, ...weaknessSignals);
  const state = structureDamage.length >= 1 && weaknessSignals.length >= 1 ? "READY" : supports.length > 0 ? "PROMISING" : "NOT_APPLICABLE";
  return { kind: "REDUCE", state, supports, blockers: [] };
}

function assessBullishTrigger(analysis: MarketStructureAnalysis | PositionStructureAnalysis, path: BullishPath): TriggerEval {
  const confirmed: string[] = [];
  const missing: string[] = [];
  if (path === "RECLAIM_ENTRY" || path === "STRENGTH_ADD") {
    if (analysis.reclaimStructure) confirmed.push("Recent reclaim is visible above prior resistance.");
    else missing.push("Reclaim above prior resistance is still missing.");
    if (analysis.breakoutHoldStructure) confirmed.push("The breakout-hold is still being maintained.");
    else missing.push("The breakout-hold still needs to prove it can hold.");
    if (analysis.macdImproving) confirmed.push("Momentum is still improving through the reclaim.");
    else if (!hasStrongReclaimActionQuality(analysis)) missing.push("Momentum through the reclaim is still incomplete.");
    if (analysis.volumeRecovery) confirmed.push("Recent volume has recovered enough to support continuation.");
    else if (hasStrongReclaimActionQuality(analysis)) confirmed.push("Structure quality is strong enough that exceptional continuation volume is not mandatory.");
    else missing.push("Continuation volume is still weak.");
  } else if (path === "PULLBACK_ENTRY" || path === "PULLBACK_ADD") {
    if (analysis.pullbackZone) confirmed.push("Pullback location is still constructive.");
    else missing.push("Pullback location is still missing.");
    if (analysis.macdImproving) confirmed.push("MACD histogram is improving into the retest.");
    else missing.push("MACD histogram improvement is still missing.");
    if (analysis.rsiRecovery) confirmed.push("RSI has moved away from washed-out extremes.");
    else missing.push("RSI recovery is not clear yet.");
  } else {
    missing.push("A valid pullback or reclaim path is still missing.");
  }
  if (analysis.timeframes["1h"].rsiOverbought && analysis.upperRangeChase && path !== "RECLAIM_ENTRY" && path !== "STRENGTH_ADD") missing.push("RSI is still overheated for a conservative review.");
  return { state: isBullishTriggerConfirmed(analysis, path, confirmed) ? "CONFIRMED" : "PENDING", confirmed, missing };
}

function assessReduceTrigger(analysis: PositionStructureAnalysis): TriggerEval {
  const confirmed: string[] = [];
  const missing: string[] = [];
  const structureDamageConfirmed = analysis.breakdown4h || analysis.breakdown1d || analysis.failedReclaim;
  const weaknessConfirmed: string[] = [];
  if (analysis.breakdown4h || analysis.breakdown1d) confirmed.push("Swing support has already broken.");
  if (analysis.failedReclaim) confirmed.push("Recent reclaim attempts have already failed.");
  if (analysis.bearishMomentumExpansion) weaknessConfirmed.push("MACD is expanding negatively across the pullback.");
  if ((analysis.timeframes["1h"].indicators.rsi14 ?? 100) <= 38 && analysis.timeframes["4h"].trend === "DOWN") weaknessConfirmed.push("RSI is staying weak instead of rebounding.");
  if (analysis.atrShock) weaknessConfirmed.push("Price damage is large relative to ATR.");
  confirmed.push(...weaknessConfirmed);
  if (!structureDamageConfirmed) missing.push("Structure damage is not confirmed yet.");
  if (weaknessConfirmed.length === 0) missing.push("Secondary weakness confirmation is still too thin.");
  return { state: structureDamageConfirmed && weaknessConfirmed.length >= 1 ? "BEARISH_CONFIRMATION" : "PENDING", confirmed, missing };
}

function assessRisk(
  analysis: MarketStructureAnalysis | PositionStructureAnalysis,
  level: DecisionRiskLevel,
  mode: InvalidationMode,
): RiskEval {
  const invalidationLevel = getModeInvalidationLevel(analysis, mode);
  const invalidationState = getModeInvalidationState(analysis, mode);
  return {
    level,
    invalidationState,
    invalidationLevel,
    notes: [
      formatInvalidationLevelFromMode(invalidationLevel, invalidationState),
      ...(analysis.breakdown1d ? ["Daily support is already broken."] : analysis.breakdown4h ? ["4h support is already broken."] : analysis.failedReclaim ? ["Recent reclaim attempts have failed."] : []),
    ],
  };
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

function buildEntryReasons(analysis: MarketStructureAnalysis, context: DecisionContext, setup: SetupEval, trigger: TriggerEval, risk: RiskEval, path: BullishPath): string[] {
  return [`Available cash on record: ${cash(context)} KRW.`, `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk), path === "RECLAIM_ENTRY" ? "No chase buying still applies, but a valid reclaim is not treated the same as a late pullback miss." : "No chase buying: current structure is not pressing the upper part of the recent range.", `Setup: ${setup.supports[0] ?? setup.blockers[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.confirmed[0] ?? trigger.missing[0] ?? "trigger reviewed"}.`];
}

function entryNoActionSummary(locale: "ko" | "en", analysis: MarketStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval, path: BullishPath): string {
  if (locale === "ko") {
    if (!hasCash) return `${analysis.asset} 현물 기록이 없고 새 검토에 쓸 현금 기록도 없습니다.`;
    if (analysis.regime === "BREAKDOWN_RISK") return `${analysis.asset} 일봉 붕괴 리스크가 있어 지금은 보수적인 진입 검토가 적절하지 않습니다.`;
    if (analysis.upperRangeChase && path !== "RECLAIM_ENTRY") return `${analysis.asset} 가격이 최근 범위 상단으로 많이 올라 있어 지금은 보수적인 진입 검토가 적절하지 않습니다.`;
    if (setup.state === "PROMISING" && trigger.state !== "CONFIRMED") return `${analysis.asset} 구조는 나쁘지 않지만 보수적인 진입 검토를 하기에는 트리거가 아직 덜 갖춰졌습니다.`;
    return `${analysis.asset} 구조가 아직 보수적인 현물 진입 검토를 하기엔 충분히 선명하지 않습니다.`;
  }
  if (!hasCash) return `No ${analysis.asset} spot inventory is recorded, and no available cash is on record for a new review.`;
  if (analysis.regime === "BREAKDOWN_RISK") return `${analysis.asset} has daily breakdown risk, so a conservative entry review is not justified right now.`;
  if (analysis.upperRangeChase && path !== "RECLAIM_ENTRY") return `${analysis.asset} is still extended inside the recent range, so a conservative entry review is not justified right now.`;
  if (setup.state === "PROMISING" && trigger.state !== "CONFIRMED") return `${analysis.asset} has a constructive picture, but the trigger is still incomplete for a conservative entry review.`;
  return `${analysis.asset} structure is not clear enough for a conservative spot entry review yet.`;
}

function entryNoActionReasons(analysis: MarketStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval, risk: RiskEval, path: BullishPath): string[] {
  const reasons = [`Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk)];
  if (!hasCash) return ["No available cash is recorded, so there is nothing to stage into a new spot position.", ...reasons];
  if (analysis.upperRangeChase && path !== "RECLAIM_ENTRY") return ["Current price is already in the upper part of the recent range.", ...reasons, "No chase buying remains active."];
  return [...reasons, `Setup: ${setup.blockers[0] ?? setup.supports[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.missing[0] ?? trigger.confirmed[0] ?? "trigger reviewed"}.`];
}

function buildAddBuyReasons(analysis: PositionStructureAnalysis, context: DecisionContext, setup: SetupEval, trigger: TriggerEval, risk: RiskEval, path: BullishPath): string[] {
  return [formatPnL(analysis), `Available cash on record: ${cash(context)} KRW.`, `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk), path === "STRENGTH_ADD" ? "No chase buying still applies: strength adds are only reviewed after a valid reclaim keeps holding." : "No chase buying still applies: this is a staged add-buy review only when pullback structure holds.", `Setup: ${setup.supports[0] ?? setup.blockers[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.confirmed[0] ?? trigger.missing[0] ?? "trigger reviewed"}.`];
}

function addNoActionSummary(locale: "ko" | "en", analysis: PositionStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval, path: BullishPath): string {
  if (locale === "ko") {
    if (!hasCash) return `${analysis.asset} 구조가 혼재돼 있고 지금은 분할 추가매수 검토에 쓸 현금 여력 기록도 없습니다.`;
    if (analysis.upperRangeChase && path !== "STRENGTH_ADD") return `${analysis.asset} 가격이 최근 범위 상단에 너무 높아 지금은 보수적인 추가매수 검토가 적절하지 않습니다.`;
    if (analysis.regime === "BREAKDOWN_RISK" || (analysis.regime === "WEAK_DOWNTREND" && path !== "STRENGTH_ADD")) return `${analysis.asset} 구조 약화가 커서 분할 추가매수 검토가 보수적이지 않습니다.`;
    if (setup.state === "PROMISING" && trigger.state !== "CONFIRMED") return `${analysis.asset} 눌림 구조가 완전히 무너지진 않았지만 분할 추가매수 검토를 하기엔 트리거가 아직 덜 갖춰졌습니다.`;
    return `${analysis.asset} 구조가 혼재돼 있어, 보수적으로는 관찰을 유지하고 무효화 기준을 분명히 두는 편이 낫습니다.`;
  }
  if (!hasCash) return `${analysis.asset} structure is mixed, and there is no recorded cash buffer for a staged add-buy review right now.`;
  if (analysis.upperRangeChase && path !== "STRENGTH_ADD") return `${analysis.asset} is sitting too high in the recent range for a conservative add-buy review right now.`;
  if (analysis.regime === "BREAKDOWN_RISK" || (analysis.regime === "WEAK_DOWNTREND" && path !== "STRENGTH_ADD")) return `${analysis.asset} is weakening too aggressively for a staged add-buy review.`;
  if (setup.state === "PROMISING" && trigger.state !== "CONFIRMED") return `${analysis.asset} pullback structure is not broken, but the trigger is still incomplete for a staged add-buy review.`;
  return `${analysis.asset} structure is mixed, so the conservative posture is to observe and keep invalidation levels explicit.`;
}

function addNoActionReasons(analysis: PositionStructureAnalysis, hasCash: boolean, setup: SetupEval, trigger: TriggerEval, risk: RiskEval, path: BullishPath): string[] {
  const reasons = [formatPnL(analysis), `Regime: ${regimeText(analysis.regime)}.`, rangeText(analysis), invalidationText(risk)];
  if (!hasCash) return [...reasons, "No available cash is recorded, so a staged add-buy review is unavailable."];
  if (analysis.upperRangeChase && path !== "STRENGTH_ADD") return [...reasons, "Current price is already too extended for a conservative staged add-buy review."];
  return [...reasons, `Setup: ${setup.blockers[0] ?? setup.supports[0] ?? "structure reviewed"}.`, `Trigger: ${trigger.missing[0] ?? trigger.confirmed[0] ?? "trigger reviewed"}.`];
}

function buildEntryExecutionGuide(
  context: DecisionContext,
  analysis: MarketStructureAnalysis,
  risk: RiskEval,
  path: BullishPath,
): ExecutionGuide {
  const pullback = path !== "RECLAIM_ENTRY";
  const zone = pullback
    ? buildPullbackZone(analysis)
    : buildReclaimZone(analysis);
  const sizing = buildCashSizingGuide(context, analysis.asset, false);

  return {
    planType: "ENTRY",
    setupType: pullback ? "PULLBACK_ENTRY" : "RECLAIM_ENTRY",
    entryZoneLow: zone.low,
    entryZoneHigh: zone.high,
    initialSizePctOfCash: sizing.initialPct,
    maxTotalSizePctOfCash: sizing.maxPct,
    reducePctOfPosition: null,
    invalidationLevel: risk.invalidationLevel,
    invalidationRuleText: pullback
      ? buildPullbackInvalidationText(risk.invalidationLevel)
      : buildReclaimInvalidationText(risk.invalidationLevel),
    chaseGuardText: pullback
      ? buildPullbackChaseGuardText(analysis, zone)
      : buildReclaimChaseGuardText(analysis, zone),
    actionText: pullback
      ? buildPullbackEntryActionText(zone, sizing)
      : buildReclaimEntryActionText(zone, sizing),
    cautionText: sizing.caution,
  };
}

function buildAddBuyExecutionGuide(
  context: DecisionContext,
  analysis: PositionStructureAnalysis,
  risk: RiskEval,
  path: BullishPath,
): ExecutionGuide {
  const strengthAdd = path === "STRENGTH_ADD";
  const zone = strengthAdd
    ? buildReclaimZone(analysis)
    : buildPullbackZone(analysis);
  const sizing = buildCashSizingGuide(context, analysis.asset, true);

  return {
    planType: "ADD_BUY",
    setupType: strengthAdd ? "STRENGTH_ADD" : "PULLBACK_ADD",
    entryZoneLow: zone.low,
    entryZoneHigh: zone.high,
    initialSizePctOfCash: sizing.initialPct,
    maxTotalSizePctOfCash: sizing.maxPct,
    reducePctOfPosition: null,
    invalidationLevel: risk.invalidationLevel,
    invalidationRuleText: strengthAdd
      ? buildReclaimInvalidationText(risk.invalidationLevel)
      : buildAddInvalidationText(risk.invalidationLevel),
    chaseGuardText: strengthAdd
      ? buildStrengthAddChaseGuardText(analysis, zone)
      : buildPullbackAddChaseGuardText(analysis, zone),
    actionText: strengthAdd
      ? buildStrengthAddActionText(zone, sizing)
      : buildPullbackAddActionText(zone, sizing),
    cautionText: buildAddCautionText(analysis, sizing),
  };
}

function buildReduceExecutionGuide(
  context: DecisionContext,
  analysis: PositionStructureAnalysis,
  risk: RiskEval,
): ExecutionGuide {
  const strongExit = analysis.breakdown1d || risk.level === "HIGH";
  const reductionPct = strongExit ? 65 : 35;
  const zone = buildReduceZone(analysis);

  return {
    planType: strongExit ? "EXIT_PLAN" : "REDUCE",
    setupType: strongExit ? "EXIT_PLAN_REVIEW" : "PARTIAL_REDUCE",
    entryZoneLow: zone.low,
    entryZoneHigh: zone.high,
    initialSizePctOfCash: null,
    maxTotalSizePctOfCash: null,
    reducePctOfPosition: reductionPct,
    invalidationLevel: risk.invalidationLevel,
    invalidationRuleText: buildReduceInvalidationText(risk.invalidationLevel, strongExit),
    chaseGuardText: strongExit
      ? "Do not wait for a full recovery story after higher-timeframe support has already failed."
      : "Do not let a weakening structure turn into passive hope while the position stays fully sized.",
    actionText: strongExit
      ? buildExitPlanActionText(zone, reductionPct)
      : buildReduceActionText(zone, reductionPct),
    cautionText: context.user.sleepModeEnabled
      ? "Sleep mode is on in the stored profile, so review whether delayed reaction is adding avoidable downside risk."
      : null,
  };
}

function buildExecutionGuideReasons(
  guide: ExecutionGuide,
  locale: "ko" | "en",
): string[] {
  const reasons: string[] = [];
  if (guide.entryZoneLow !== null || guide.entryZoneHigh !== null) {
    reasons.push(
      locale === "ko"
        ? `행동 구간: ${formatGuideZone(guide)}.`
        : `Action zone: ${formatGuideZone(guide)}.`,
    );
  }
  if (guide.initialSizePctOfCash !== null) {
    reasons.push(
      locale === "ko"
        ? `초기 분할은 기록 현금의 약 ${guide.initialSizePctOfCash}% 기준입니다.`
        : `Initial staged size is about ${guide.initialSizePctOfCash}% of recorded cash.`,
    );
  }
  if (guide.maxTotalSizePctOfCash !== null) {
    reasons.push(
      locale === "ko"
        ? `최대 누적은 기록 현금의 약 ${guide.maxTotalSizePctOfCash}% 기준입니다.`
        : `Maximum staged allocation is about ${guide.maxTotalSizePctOfCash}% of recorded cash.`,
    );
  }
  if (guide.reducePctOfPosition !== null) {
    reasons.push(
      locale === "ko"
        ? `기록 포지션의 약 ${guide.reducePctOfPosition}% 축소 검토 구간입니다.`
        : `Review reducing about ${guide.reducePctOfPosition}% of the recorded position.`,
    );
  }
  reasons.push(localizeGuideInvalidationText(guide, locale));
  reasons.push(localizeGuideChaseGuardText(guide, locale));
  const cautionText = localizeGuideCautionText(guide, locale);
  if (cautionText) reasons.push(cautionText);
  return reasons;
}

function buildExecutionGuideAlertMessage(
  locale: "ko" | "en",
  summary: string,
  guide: ExecutionGuide,
): string {
  const lines = [
    locale === "ko" ? `조치 필요: ${summary}` : `Action needed: ${summary}`,
    (locale === "ko" ? "왜 지금:" : "Why now:") + ` ${localizeGuideActionText(guide, locale)}`,
  ];

  if (guide.entryZoneLow !== null || guide.entryZoneHigh !== null) {
    lines.push(`${locale === "ko" ? "행동 구간:" : "Action zone:"} ${formatGuideZone(guide)}`);
  }
  if (guide.initialSizePctOfCash !== null) {
    lines.push(
      locale === "ko"
        ? `첫 분할: 기록 현금의 약 ${guide.initialSizePctOfCash}%`
        : `First staged size: ${guide.initialSizePctOfCash}% of recorded cash`,
    );
  }
  if (guide.maxTotalSizePctOfCash !== null) {
    lines.push(
      locale === "ko"
        ? `최대 누적: 기록 현금의 약 ${guide.maxTotalSizePctOfCash}%`
        : `Max staged allocation: ${guide.maxTotalSizePctOfCash}% of recorded cash`,
    );
  }
  if (guide.reducePctOfPosition !== null) {
    lines.push(
      locale === "ko"
        ? `축소 검토: 기록 포지션의 약 ${guide.reducePctOfPosition}%`
        : `Reduce review: ${guide.reducePctOfPosition}% of recorded position`,
    );
  }
  lines.push(`${locale === "ko" ? "무효화:" : "Invalidation:"} ${localizeGuideInvalidationText(guide, locale)}`);
  lines.push(`${locale === "ko" ? "추격 규칙:" : "Chase guard:"} ${localizeGuideChaseGuardText(guide, locale)}`);
  const cautionText = localizeGuideCautionText(guide, locale);
  if (cautionText) {
    lines.push(`${locale === "ko" ? "주의:" : "Caution:"} ${cautionText}`);
  }
  return lines.join("\n");
}

function buildCashSizingGuide(
  context: DecisionContext,
  asset: "BTC" | "ETH",
  isAdd: boolean,
): CashSizingGuide {
  const cash = Math.max(0, context.accountState?.availableCash ?? 0);
  if (cash <= 0) return { initialPct: null, maxPct: null, caution: "No recorded cash remains for a staged review." };
  const baseInitial = isAdd ? 20 : 25;
  const baseMax = isAdd ? 40 : 50;
  const cappedInitial = context.user.sleepModeEnabled ? Math.min(baseInitial, 15) : baseInitial;
  const cappedMax = context.user.sleepModeEnabled ? Math.min(baseMax, 35) : baseMax;
  return {
    initialPct: cappedInitial,
    maxPct: cappedMax,
    caution: isAdd && cash < 300000
      ? `Recorded ${asset} add-buy cash buffer is small, so keep any review unusually small.`
      : null,
  };
}

function buildPullbackZone(analysis: MarketStructureAnalysis | PositionStructureAnalysis): { low: number | null; high: number | null } {
  const anchorLow = maxDefined(
    analysis.timeframes["4h"].support,
    analysis.timeframes["4h"].indicators.ema20,
    analysis.timeframes["1d"].support,
  );
  const anchorHigh = minDefined(
    analysis.timeframes["1h"].indicators.ema20,
    analysis.timeframes["4h"].indicators.ema20,
    analysis.currentPrice,
  );
  return normalizeZone(anchorLow, anchorHigh, analysis.timeframes["4h"].indicators.atr14, 0.2, 0.15);
}

function buildReclaimZone(analysis: MarketStructureAnalysis | PositionStructureAnalysis): { low: number | null; high: number | null } {
  const anchorLow = maxDefined(
    analysis.reclaimLevel,
    analysis.timeframes["4h"].support,
    analysis.timeframes["4h"].indicators.ema20,
  );
  const anchorHigh = minDefined(
    analysis.timeframes["1h"].resistance,
    analysis.timeframes["4h"].resistance,
    analysis.currentPrice,
  );
  return normalizeZone(anchorLow, anchorHigh, analysis.timeframes["1h"].indicators.atr14, 0.15, 0.1);
}

function buildReduceZone(analysis: PositionStructureAnalysis): { low: number | null; high: number | null } {
  const anchorLow = maxDefined(
    analysis.currentPrice,
    analysis.timeframes["1h"].support,
  );
  const anchorHigh = minDefined(
    analysis.timeframes["1h"].resistance,
    analysis.timeframes["4h"].resistance,
    analysis.averageEntryPrice > 0 ? analysis.averageEntryPrice : null,
  );
  return normalizeZone(anchorLow, anchorHigh, analysis.timeframes["1h"].indicators.atr14, 0, 0.15);
}

function normalizeZone(
  lowAnchor: number | null,
  highAnchor: number | null,
  atr: number | null,
  lowAtrMultiplier: number,
  highAtrMultiplier: number,
): { low: number | null; high: number | null } {
  if (lowAnchor === null && highAnchor === null) return { low: null, high: null };
  const atrPadding = atr !== null && atr > 0 ? atr : 0;
  const low = lowAnchor !== null ? Math.max(0, lowAnchor - atrPadding * lowAtrMultiplier) : highAnchor;
  const high = highAnchor !== null ? Math.max(low ?? 0, highAnchor + atrPadding * highAtrMultiplier) : lowAnchor;
  return { low: low ?? null, high: high ?? null };
}

function buildPullbackInvalidationText(level: number | null): string {
  return level === null
    ? "Pullback invalidation is not precise enough yet, so keep the idea staged only."
    : `The pullback idea is invalid if price loses roughly ${price(level)} KRW on a closing basis.`;
}

function buildReclaimInvalidationText(level: number | null): string {
  return level === null
    ? "Reclaim invalidation is not precise enough yet, so wait for a clearer hold."
    : `The reclaim idea is invalid if price falls back below roughly ${price(level)} KRW and cannot hold it.`;
}

function buildAddInvalidationText(level: number | null): string {
  return level === null
    ? "Add-buy invalidation is still too unclear for aggressive averaging."
    : `Any add-buy review is invalid if price loses roughly ${price(level)} KRW on the retest.`;
}

function buildReduceInvalidationText(level: number | null, strongExit: boolean): string {
  if (level === null) {
    return strongExit
      ? "Re-stabilization is still unclear, so treat this as damage control rather than a prediction."
      : "Re-stabilization is still unclear, so keep the reduction review conservative.";
  }
  return strongExit
    ? `Only pause the stronger exit-plan review if price reclaims and holds roughly ${price(level)} KRW again.`
    : `Pause the partial-reduce review only if price re-stabilizes back above roughly ${price(level)} KRW.`;
}

function buildPullbackChaseGuardText(analysis: MarketStructureAnalysis, zone: { low: number | null; high: number | null }): string {
  if (zone.high !== null && analysis.currentPrice > zone.high) {
    return `Current price is already above the preferred pullback zone near ${formatGuideZone(zone)}; do not chase above the retest area.`;
  }
  return "Only review a pullback entry near support or EMA retest; do not convert it into a late breakout chase.";
}

function buildReclaimChaseGuardText(analysis: MarketStructureAnalysis, zone: { low: number | null; high: number | null }): string {
  if (zone.high !== null && analysis.currentPrice > zone.high * 1.01) {
    return `Current price is stretched above the reclaim area near ${formatGuideZone(zone)}; wait for hold or retest instead of chasing.`;
  }
  return "Only treat this as a reclaim entry while the reclaimed area keeps holding; do not chase a vertical extension.";
}

function buildPullbackAddChaseGuardText(analysis: PositionStructureAnalysis, zone: { low: number | null; high: number | null }): string {
  if (analysis.pnlPct <= -0.06) {
    return "Do not average deeper into weakness if the pullback starts behaving like a breakdown.";
  }
  return `Keep any add-buy review near the pullback zone ${formatGuideZone(zone)} and avoid adding into upper-range extension.`;
}

function buildStrengthAddChaseGuardText(analysis: PositionStructureAnalysis, zone: { low: number | null; high: number | null }): string {
  if (zone.high !== null && analysis.currentPrice > zone.high * 1.01) {
    return `Strength-add structure is valid only on hold or retest of ${formatGuideZone(zone)}; do not chase a second extension leg.`;
  }
  return "Strength-add is only for a valid reclaim hold; do not treat momentum alone as permission to oversize.";
}

function buildPullbackEntryActionText(zone: { low: number | null; high: number | null }, sizing: CashSizingGuide): string {
  return `Review a staged pullback entry near ${formatGuideZone(zone)} with about ${sizing.initialPct ?? "small"}% of recorded cash first.`;
}

function buildReclaimEntryActionText(zone: { low: number | null; high: number | null }, sizing: CashSizingGuide): string {
  return `Review a reclaim entry only while ${formatGuideZone(zone)} keeps holding, starting with about ${sizing.initialPct ?? "small"}% of recorded cash.`;
}

function buildPullbackAddActionText(zone: { low: number | null; high: number | null }, sizing: CashSizingGuide): string {
  return `Review a staged add-buy near ${formatGuideZone(zone)} with about ${sizing.initialPct ?? "small"}% of recorded cash, not as deep averaging.`;
}

function buildStrengthAddActionText(zone: { low: number | null; high: number | null }, sizing: CashSizingGuide): string {
  return `Review a strength add only on hold or retest of ${formatGuideZone(zone)}, starting near ${sizing.initialPct ?? "small"}% of recorded cash.`;
}

function buildReduceActionText(zone: { low: number | null; high: number | null }, reductionPct: number): string {
  return `Review trimming about ${reductionPct}% of the recorded position into weakness or failed bounces around ${formatGuideZone(zone)}.`;
}

function buildExitPlanActionText(zone: { low: number | null; high: number | null }, reductionPct: number): string {
  return `Review a stronger exit-plan response of about ${reductionPct}% if damage continues and price cannot re-stabilize around ${formatGuideZone(zone)}.`;
}

function buildAddCautionText(analysis: PositionStructureAnalysis, sizing: CashSizingGuide): string | null {
  if (analysis.pnlPct <= -0.06) {
    return "Recorded loss is already meaningful, so keep any add-buy review smaller than usual and avoid deep averaging.";
  }
  return sizing.caution;
}

function formatGuideZone(input: Pick<ExecutionGuide, "entryZoneLow" | "entryZoneHigh"> | { low: number | null; high: number | null }): string {
  const low = "entryZoneLow" in input ? input.entryZoneLow : input.low;
  const high = "entryZoneHigh" in input ? input.entryZoneHigh : input.high;
  if (low !== null && high !== null) return `${price(low)}-${price(high)} KRW`;
  if (low !== null) return `>= ${price(low)} KRW`;
  if (high !== null) return `<= ${price(high)} KRW`;
  return "not precise enough yet";
}

function localizeGuideActionText(guide: ExecutionGuide, locale: "ko" | "en"): string {
  if (locale === "en") return guide.actionText;
  const zone = formatGuideZone(guide);
  if (guide.setupType === "PULLBACK_ENTRY") {
    return `${zone} 부근 지지/EMA 되돌림에서 기록 현금 기준 ${guide.initialSizePctOfCash ?? "소규모"}% 1차 분할 진입 검토 구간입니다.`;
  }
  if (guide.setupType === "RECLAIM_ENTRY") {
    return `${zone} 리클레임 유지 구간에서 기록 현금 기준 ${guide.initialSizePctOfCash ?? "소규모"}% 1차 분할 진입 검토 구간입니다.`;
  }
  if (guide.setupType === "PULLBACK_ADD") {
    return `${zone} 눌림 구간에서 기록 현금 기준 ${guide.initialSizePctOfCash ?? "소규모"}% 분할 추가매수 검토 구간입니다.`;
  }
  if (guide.setupType === "STRENGTH_ADD") {
    return `${zone} 리클레임 유지 또는 재테스트 구간에서 기록 현금 기준 ${guide.initialSizePctOfCash ?? "소규모"}% 강세 추가매수 검토 구간입니다.`;
  }
  if (guide.setupType === "EXIT_PLAN_REVIEW") {
    return `${zone} 부근에서 구조 훼손이 이어지면 기록 포지션의 약 ${guide.reducePctOfPosition ?? "일부"}% 축소 또는 이탈 계획 재검토 구간입니다.`;
  }
  return `${zone} 부근에서 기록 포지션의 약 ${guide.reducePctOfPosition ?? "일부"}% 부분 축소 검토 구간입니다.`;
}

function localizeGuideInvalidationText(guide: ExecutionGuide, locale: "ko" | "en"): string {
  if (locale === "en") return guide.invalidationRuleText;
  if (guide.invalidationLevel === null) {
    return guide.planType === "EXIT_PLAN"
      ? "재안정화 기준이 아직 충분히 선명하지 않으므로, 예측보다 리스크 축소 관점으로 보세요."
      : "무효화 기준이 아직 충분히 선명하지 않으므로, 큰 사이즈보다 분할/대기 관점이 우선입니다.";
  }
  if (guide.planType === "ENTRY" || guide.planType === "ADD_BUY") {
    return `아이디어 무효화 기준은 대략 ${price(guide.invalidationLevel)} KRW 이탈 및 종가 기준 미회복입니다.`;
  }
  return `대략 ${price(guide.invalidationLevel)} KRW 재회복 및 유지 전까지는 축소 검토를 쉽게 되돌리지 마세요.`;
}

function localizeGuideChaseGuardText(guide: ExecutionGuide, locale: "ko" | "en"): string {
  if (locale === "en") return guide.chaseGuardText;
  if (guide.planType === "ENTRY") {
    return guide.setupType === "RECLAIM_ENTRY"
      ? "리클레임 유지 또는 재테스트가 아닌 수직 확장은 추격 매수로 보세요."
      : "지지/EMA 되돌림을 벗어난 상단 확장은 추격 매수로 보세요.";
  }
  if (guide.planType === "ADD_BUY") {
    return guide.setupType === "STRENGTH_ADD"
      ? "강세 추가매수도 리클레임 유지 구간에서만 검토하고, 2차 확장은 추격으로 보세요."
      : "평단 낮추기 목적의 깊은 물타기로 바꾸지 말고, 눌림 구조 안에서만 분할 검토하세요.";
  }
  return guide.planType === "EXIT_PLAN"
    ? "상위 지지가 깨진 뒤 막연한 반등 기대만으로 전량 버티지 마세요."
    : "구조 약화가 진행 중일 때 희망회로로 풀사이즈를 계속 유지하지 마세요.";
}

function localizeGuideCautionText(guide: ExecutionGuide, locale: "ko" | "en"): string | null {
  if (!guide.cautionText) return null;
  if (locale === "en") return guide.cautionText;
  if (guide.planType === "ADD_BUY") {
    return "손실 구간 추가매수는 작게 유지하고, 붕괴형 물타기로 바뀌지 않게 주의하세요.";
  }
  if (guide.planType === "EXIT_PLAN" || guide.planType === "REDUCE") {
    return "저장된 설정과 반응 속도를 다시 확인해, 지연 대응이 추가 하방 노출로 이어지지 않게 보세요.";
  }
  return "구조는 좋아도 기록 현금과 분할 전제를 벗어난 과도한 사이즈 확대는 피하세요.";
}

function maxDefined(...values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value !== null && typeof value !== "undefined" && Number.isFinite(value));
  return filtered.length > 0 ? Math.max(...filtered) : null;
}

function minDefined(...values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value !== null && typeof value !== "undefined" && Number.isFinite(value));
  return filtered.length > 0 ? Math.min(...filtered) : null;
}

function withAlert(
  context: DecisionContext,
  diagnostics: DecisionDiagnostics,
  reason: NonNullable<DecisionResult["alert"]>["reason"],
  cooldownKey: string,
  summary: string,
  reasons: string[],
  message: string,
  executionGuide?: ExecutionGuide | null,
): DecisionResult {
  return {
    ...baseResult(context, "ACTION_NEEDED", summary, reasons, true),
    symbol: context.marketSnapshot?.market ?? null,
    alert: { reason, cooldownKey, message },
    executionGuide: executionGuide ?? null,
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
function formatInvalidationLevelFromMode(invalidationLevel: number | null, invalidationState: RiskEval["invalidationState"]): string {
  if (invalidationLevel === null) return "Invalidation is still unclear.";
  if (invalidationState === "BROKEN") return `Invalidation has already broken below ${price(invalidationLevel)} KRW.`;
  return `Invalidation is near ${price(invalidationLevel)} KRW.`;
}
function price(value: number): string { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, value)); }
function setupState(
  supports: string[],
  blockers: SetupBlocker[],
  path?: BullishPath,
  analysis?: MarketStructureAnalysis | PositionStructureAnalysis,
): DecisionSetupState {
  if (blockers.length === 0) return "READY";
  if (canStrongReclaimOverride(blockers, path, analysis)) return "READY";
  return supports.length >= 3 && blockers.length <= 2 ? "PROMISING" : "BLOCKED";
}

function hardBlocker(code: SetupBlockerCode, message: string): SetupBlocker {
  return { code, severity: "HARD", message };
}

function softBlocker(code: SetupBlockerCode, message: string): SetupBlocker {
  return { code, severity: "SOFT", message };
}

function isHardBlocker(blocker: SetupBlocker): boolean {
  return blocker.severity === "HARD";
}

function isSoftBlocker(blocker: SetupBlocker): boolean {
  return blocker.severity === "SOFT";
}

function canStrongReclaimOverride(
  blockers: SetupBlocker[],
  path?: BullishPath,
  analysis?: MarketStructureAnalysis | PositionStructureAnalysis,
): boolean {
  if (!analysis || (path !== "RECLAIM_ENTRY" && path !== "STRENGTH_ADD")) return false;
  if (!hasStrongReclaimActionQuality(analysis)) return false;
  if (blockers.some(isHardBlocker)) return false;
  return blockers.filter(isSoftBlocker).length <= 1;
}

function getBullishPath(analysis: MarketStructureAnalysis | PositionStructureAnalysis, isAdd: boolean): BullishPath {
  if ((analysis.reclaimStructure || analysis.breakoutHoldStructure) && !analysis.breakdown1d && !analysis.failedReclaim && getModeInvalidationState(analysis, "RECLAIM") !== "BROKEN") return isAdd ? "STRENGTH_ADD" : "RECLAIM_ENTRY";
  if (analysis.pullbackZone && !analysis.upperRangeChase && !analysis.breakdown4h && !analysis.breakdown1d) return isAdd ? "PULLBACK_ADD" : "PULLBACK_ENTRY";
  return null;
}

function getInvalidationMode(path: BullishPath): InvalidationMode {
  return path === "RECLAIM_ENTRY" || path === "STRENGTH_ADD" ? "RECLAIM" : "PULLBACK";
}

function getModeInvalidationLevel(
  analysis: MarketStructureAnalysis | PositionStructureAnalysis,
  mode: InvalidationMode,
): number | null {
  if (mode === "RECLAIM") {
    const candidates = [
      analysis.reclaimLevel,
      analysis.timeframes["4h"].support,
      analysis.timeframes["4h"].indicators.ema20,
    ].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
    return candidates.length > 0 ? Math.max(...candidates) : analysis.invalidationLevel;
  }
  return analysis.invalidationLevel;
}

function getModeInvalidationState(
  analysis: MarketStructureAnalysis | PositionStructureAnalysis,
  mode: InvalidationMode,
): RiskEval["invalidationState"] {
  if (mode !== "RECLAIM") return analysis.invalidationState;
  const reclaimLevel = analysis.reclaimLevel;
  if (reclaimLevel === null) return "UNCLEAR";
  const buffer = getEngineLevelBuffer(reclaimLevel, analysis.timeframes["1h"].indicators.atr14, 0.08);
  return analysis.failedReclaim || analysis.timeframes["1h"].latestClose <= reclaimLevel - buffer ? "BROKEN" : "CLEAR";
}

function hasStrongReclaimActionQuality(analysis: MarketStructureAnalysis | PositionStructureAnalysis): boolean {
  return Boolean(
    (analysis.reclaimStructure || analysis.breakoutHoldStructure)
    && getModeInvalidationState(analysis, "RECLAIM") === "CLEAR"
    && (!analysis.upperRangeChase || analysis.volumeRecovery || analysis.macdImproving)
    && (analysis.regime === "BULL_TREND" || analysis.regime === "EARLY_RECOVERY" || analysis.regime === "PULLBACK_IN_UPTREND" || analysis.regime === "RECLAIM_ATTEMPT")
  );
}

function isBullishTriggerConfirmed(
  analysis: MarketStructureAnalysis | PositionStructureAnalysis,
  path: BullishPath,
  confirmed: string[],
): boolean {
  if (path === "RECLAIM_ENTRY" || path === "STRENGTH_ADD") {
    const structuralQuality = Number(analysis.reclaimStructure) + Number(analysis.breakoutHoldStructure);
    const supportingQuality = Number(analysis.macdImproving) + Number(analysis.volumeRecovery);
    return structuralQuality >= 2 || (structuralQuality >= 1 && supportingQuality >= 1 && confirmed.length >= 2);
  }
  return confirmed.length >= 2;
}

function getEngineLevelBuffer(level: number, atr: number | null, atrMultiplier: number): number {
  const atrBuffer = atr !== null && atr > 0 ? atr * atrMultiplier : 0;
  return Math.max(level * 0.0025, atrBuffer);
}

function bucketEntry(analysis: MarketStructureAnalysis, path: BullishPath): string { return path === "RECLAIM_ENTRY" ? "reclaim-continuation" : analysis.timeframes["4h"].location === "LOWER" ? "four-hour-pullback" : "balanced-range"; }
function bucketAdd(analysis: PositionStructureAnalysis, path: BullishPath): string { return path === "STRENGTH_ADD" ? "reclaim-strength" : analysis.timeframes["4h"].location === "LOWER" ? "four-hour-pullback" : analysis.pnlPct < 0 ? "near-entry-pullback" : "staged-retest"; }
function bucketReduce(analysis: PositionStructureAnalysis): string { return analysis.breakdown1d ? "daily-break" : analysis.breakdown4h ? "four-hour-break" : analysis.pnlPct <= -0.08 ? "deep-drawdown" : "trend-weakness"; }
function getFallbackMarket(context: DecisionContext) { return context.positionState?.asset === "BTC" ? "KRW-BTC" as const : context.positionState?.asset === "ETH" ? "KRW-ETH" as const : null; }

