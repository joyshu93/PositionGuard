import type {
  AccountState,
  ActionNeededReason,
  DecisionContext,
  DecisionDiagnostics,
  DecisionExecutionDisposition,
  DecisionRiskLevel,
  DecisionSetupState,
  DecisionTriggerState,
  EntryPath,
  ExecutionGuide,
  MarketSnapshot,
  PositionState,
  SignalQualityBucket,
  StrategyAction,
  StrategyExposureGuardrails,
  StrategyInputs,
  StrategyLatestDecision,
  StrategyPortfolioSnapshot,
  StrategyRecentExit,
  StrategySettings,
  StrategySignalQuality,
  SupportedAsset,
  UserStateBundle,
  WeakeningStage,
} from "../domain/types.js";
import type {
  DecisionLogRecord as StoredDecisionLogRecord,
  PositionStateEventRecord,
} from "../types/persistence.js";
import { resolveUserLocale } from "../i18n/index.js";
import { analyzePositionStructure, toDecisionSnapshot, type PositionStructureAnalysis } from "./market-structure.js";
import { DEFAULT_STRATEGY_SETTINGS } from "./settings.js";

const ENTRY_STRONG_THRESHOLD = 8;
const ENTRY_BORDERLINE_THRESHOLD = 6;
const ADD_STRONG_THRESHOLD = 8;
const ADD_BORDERLINE_THRESHOLD = 6;
const REDUCE_THRESHOLD = 4;
const HEALTHY_HOLD_REDUCE_THRESHOLD = 5;
const RECENT_EXIT_PENALTY_HOURS = 24;
const RECENT_LOSS_EXIT_PENALTY_HOURS = 12;
const HOURLY_CONFIRMATION_WINDOW_MS = 60 * 60 * 1000;

type LogContext = {
  strategySnapshot?: {
    action?: unknown;
    executionDisposition?: unknown;
    referencePrice?: unknown;
    signalQuality?: unknown;
    entryPath?: unknown;
    qualityBucket?: unknown;
    createdAt?: unknown;
  } | null;
  context?: {
    strategy?: Partial<StrategyInputs> & {
      latestDecision?: Partial<StrategyLatestDecision> | null;
      recentExit?: Partial<StrategyRecentExit> | null;
      settings?: Partial<StrategySettings> | null;
    } | null;
    positionState?: PositionState | null;
    accountState?: AccountState | null;
    generatedAt?: string;
  };
  diagnostics?: {
    strategy?: Record<string, unknown> | null;
  } | null;
  marketTiming?: {
    decisionGeneratedAt?: string | null;
  } | null;
};

export interface BuildStrategyInputsParams {
  userState: UserStateBundle;
  asset: SupportedAsset;
  marketSnapshots: Partial<Record<SupportedAsset, MarketSnapshot | null>>;
  recentDecisionLogs: StoredDecisionLogRecord[];
  latestManualExit?: Pick<PositionStateEventRecord, "createdAt"> | null;
  generatedAt: string;
  settings?: StrategySettings;
}

export interface StrategyDecisionCore {
  action: StrategyAction;
  executionDisposition: DecisionExecutionDisposition;
  alertReason: ActionNeededReason | null;
  cooldownKey: string | null;
  summary: string;
  reasons: string[];
  signalQuality: StrategySignalQuality;
  exposureGuardrails: StrategyExposureGuardrails;
  executionGuide: ExecutionGuide | null;
  diagnostics: DecisionDiagnostics;
}

export function buildStrategyInputsFromState(input: BuildStrategyInputsParams): StrategyInputs {
  const positions = Object.values(input.userState.positions)
    .filter((position): position is PositionState => position !== undefined);
  const currentSnapshot = input.marketSnapshots[input.asset] ?? null;
  const currentPrice = currentSnapshot?.ticker.tradePrice
    ?? input.userState.positions[input.asset]?.averageEntryPrice
    ?? 0;
  const totalCash = Math.max(0, input.userState.accountState?.availableCash ?? 0);
  const assetMarketValue = getAssetMarketValue(input.asset, input.userState.positions[input.asset], currentPrice);
  const totalExposureValue = positions.reduce((sum, position) => {
    const snapshot = input.marketSnapshots[position.asset] ?? null;
    const price = snapshot?.ticker.tradePrice ?? position.averageEntryPrice;
    return sum + Math.max(0, position.quantity) * Math.max(0, price);
  }, 0);
  const totalEquity = totalCash + totalExposureValue;

  return {
    portfolio: {
      totalEquity,
      assetMarketValue,
      totalExposureValue,
      assetExposureRatio: totalEquity > 0 ? assetMarketValue / totalEquity : 0,
      totalExposureRatio: totalEquity > 0 ? totalExposureValue / totalEquity : 0,
    },
    latestDecision: extractLatestDecision(input.recentDecisionLogs),
    recentExit: inferRecentExit(input.latestManualExit ?? null, input.generatedAt),
    settings: input.settings ?? DEFAULT_STRATEGY_SETTINGS,
  };
}

export function buildStrategyDecision(context: DecisionContext): StrategyDecisionCore {
  if (!context.marketSnapshot) {
    throw new Error("Strategy decision requires a market snapshot");
  }

  const position = context.positionState;
  const quantity = Math.max(0, position?.quantity ?? 0);
  const analysis = analyzePositionStructure(context.marketSnapshot, position?.averageEntryPrice ?? 0);
  const exposureGuardrails = buildExposureGuardrails(context.strategy.portfolio, context.strategy.settings);
  const bullishScore = computeBullishScore(analysis) - getReentryPenalty(context, analysis, quantity);
  const weaknessScore = computeWeaknessScore(analysis);
  const qualityBucket = toQualityBucket(bullishScore);
  const bullishQuality = buildSignalQuality(bullishScore, qualityBucket, false, false, false);
  const bearishQuality = buildSignalQuality(weaknessScore, weaknessBucket(weaknessScore), false, false, false);

  if (quantity <= 0) {
    return decideEntryOrHold({
      context,
      analysis,
      bullishScore,
      qualityBucket,
      bullishQuality,
      exposureGuardrails,
    });
  }

  const reduceDecision = decideReduceOrHold({
    context,
    analysis,
    weaknessScore,
    bearishQuality,
    exposureGuardrails,
  });
  if (reduceDecision) {
    return reduceDecision;
  }

  return decideAddOrHold({
    context,
    analysis,
    bullishScore,
    qualityBucket,
    bullishQuality,
    exposureGuardrails,
  });
}

function decideEntryOrHold(input: {
  context: DecisionContext;
  analysis: PositionStructureAnalysis;
  bullishScore: number;
  qualityBucket: SignalQualityBucket;
  bullishQuality: StrategySignalQuality;
  exposureGuardrails: StrategyExposureGuardrails;
}): StrategyDecisionCore {
  const { context, analysis, bullishScore, qualityBucket, exposureGuardrails } = input;
  if (!isConstructiveBullishCandidate(analysis) || !hasBullishRiskCapacity(context, exposureGuardrails)) {
    return buildHoldDecision(context, analysis, bullishScore, qualityBucket, exposureGuardrails, [
      `Regime is ${analysis.regime}.`,
      analysis.entryPath === "NONE" ? "No constructive entry path is active." : `Entry path ${analysis.entryPath} is not strong enough yet.`,
    ]);
  }

  const thresholds = getBullishThresholds("ENTRY", analysis);
  if (bullishScore >= thresholds.strong) {
    return buildBullishDecision(context, analysis, "ENTRY", "IMMEDIATE", bullishScore, qualityBucket, exposureGuardrails, false);
  }

  if (bullishScore >= thresholds.borderline) {
    const confirmationSatisfied = hasPendingBullishConfirmation(context, "ENTRY", analysis, qualityBucket);
    return buildBullishDecision(
      context,
      analysis,
      "ENTRY",
      confirmationSatisfied ? "EXECUTED_AFTER_CONFIRMATION" : "DEFERRED_CONFIRMATION",
      bullishScore,
      qualityBucket,
      exposureGuardrails,
      confirmationSatisfied,
    );
  }

  return buildHoldDecision(context, analysis, bullishScore, qualityBucket, exposureGuardrails, [
    `Regime is ${analysis.regime}.`,
    `Bullish score ${bullishScore} did not clear the entry threshold.`,
  ]);
}
function decideAddOrHold(input: {
  context: DecisionContext;
  analysis: PositionStructureAnalysis;
  bullishScore: number;
  qualityBucket: SignalQualityBucket;
  bullishQuality: StrategySignalQuality;
  exposureGuardrails: StrategyExposureGuardrails;
}): StrategyDecisionCore {
  const { context, analysis, bullishScore, qualityBucket, exposureGuardrails } = input;
  if (!isConstructiveAddCandidate(analysis) || !hasBullishRiskCapacity(context, exposureGuardrails)) {
    return buildHoldDecision(context, analysis, bullishScore, qualityBucket, exposureGuardrails, [
      `Regime is ${analysis.regime}.`,
      analysis.weakeningStage === "SOFT" ? "Hold quality is still too soft for an add review." : "Current structure does not yet support a staged add review.",
    ]);
  }

  const thresholds = getBullishThresholds("ADD", analysis);
  if (bullishScore >= thresholds.strong) {
    return buildBullishDecision(context, analysis, "ADD", "IMMEDIATE", bullishScore, qualityBucket, exposureGuardrails, false);
  }

  if (bullishScore >= thresholds.borderline) {
    const confirmationSatisfied = hasPendingBullishConfirmation(context, "ADD", analysis, qualityBucket);
    return buildBullishDecision(
      context,
      analysis,
      "ADD",
      confirmationSatisfied ? "EXECUTED_AFTER_CONFIRMATION" : "DEFERRED_CONFIRMATION",
      bullishScore,
      qualityBucket,
      exposureGuardrails,
      confirmationSatisfied,
    );
  }

  return buildHoldDecision(context, analysis, bullishScore, qualityBucket, exposureGuardrails, [
    `Regime is ${analysis.regime}.`,
    `Bullish score ${bullishScore} did not clear the add threshold.`,
  ]);
}

function decideReduceOrHold(input: {
  context: DecisionContext;
  analysis: PositionStructureAnalysis;
  weaknessScore: number;
  bearishQuality: StrategySignalQuality;
  exposureGuardrails: StrategyExposureGuardrails;
}): StrategyDecisionCore | null {
  const { context, analysis, weaknessScore, bearishQuality, exposureGuardrails } = input;
  const locale = resolveUserLocale(context.user.locale ?? null);
  const plan = getStructuredReducePlan(context, analysis, weaknessScore);
  if (!plan) {
    return null;
  }

  const action: StrategyAction = analysis.weakeningStage === "FAILURE" || analysis.breakdown1d || weaknessScore >= 7 ? "EXIT" : "REDUCE";
  const summary = action === "EXIT"
    ? locale === "ko"
      ? `${analysis.asset} 구조가 충분히 손상되어 축소 또는 청산 계획 검토가 필요합니다.`
      : `${analysis.asset} structure is broken enough that a reduce/exit review is warranted.`
    : locale === "ko"
      ? `${analysis.asset} 구조가 약해지고 있어 축소 검토가 필요합니다.`
      : `${analysis.asset} structure is weakening enough that a reduce review is warranted.`;
  const reasons = [
    `Regime is ${analysis.regime}.`,
    `Weakness score is ${weaknessScore}.`,
    ...plan.reasons,
  ];

  return buildStrategyDecisionCore({
    context,
    action,
    executionDisposition: "IMMEDIATE",
    summary,
    reasons,
    signalQuality: bearishQuality,
    exposureGuardrails,
    analysis,
    bullishScore: 0,
    weaknessScore,
    confirmationRequired: false,
    confirmationSatisfied: false,
    reentryPenaltyApplied: false,
    alertReason: "REDUCE_REVIEW_REQUIRED",
    plannedReduceFraction: action === "EXIT" ? 1 : plan.reduceFraction,
  });
}

function buildBullishDecision(
  context: DecisionContext,
  analysis: PositionStructureAnalysis,
  action: "ENTRY" | "ADD",
  executionDisposition: DecisionExecutionDisposition,
  bullishScore: number,
  qualityBucket: SignalQualityBucket,
  exposureGuardrails: StrategyExposureGuardrails,
  confirmationSatisfied: boolean,
): StrategyDecisionCore {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const thresholds = getBullishThresholds(action, analysis);
  const summary = action === "ENTRY"
    ? buildEntrySummary(analysis, bullishScore, executionDisposition, confirmationSatisfied, locale)
    : buildAddSummary(analysis, bullishScore, executionDisposition, confirmationSatisfied, locale);
  const reasons = [
    `Regime is ${analysis.regime}.`,
    `Bullish score is ${bullishScore} with ${qualityBucket.toLowerCase()} quality.`,
    `Thresholds: strong ${thresholds.strong}, borderline ${thresholds.borderline}.`,
    `Entry path: ${analysis.entryPath}.`,
    analysis.reclaimStructure
      ? "Reclaim structure is present."
      : analysis.breakoutHoldStructure
        ? "Breakout-hold structure is present."
        : hasConstructivePullbackQuality(analysis)
          ? "Pullback quality is constructive."
          : "Bullish evidence remains incomplete.",
    executionDisposition === "DEFERRED_CONFIRMATION"
      ? "This setup is deferred until the next hourly repeat confirms it."
      : null,
    confirmationSatisfied ? "A prior deferred confirmation has been satisfied." : null,
  ].filter((reason): reason is string => reason !== null);

  return buildStrategyDecisionCore({
    context,
    action,
    executionDisposition,
    summary,
    reasons,
    signalQuality: buildSignalQuality(
      bullishScore,
      qualityBucket,
      false,
      executionDisposition !== "IMMEDIATE",
      confirmationSatisfied,
    ),
    exposureGuardrails,
    analysis,
    bullishScore,
    weaknessScore: 0,
    confirmationRequired: executionDisposition !== "IMMEDIATE",
    confirmationSatisfied,
    reentryPenaltyApplied: false,
    alertReason: action === "ENTRY" ? "ENTRY_REVIEW_REQUIRED" : "ADD_BUY_REVIEW_REQUIRED",
  });
}

function buildHoldDecision(
  context: DecisionContext,
  analysis: PositionStructureAnalysis,
  score: number,
  qualityBucket: SignalQualityBucket,
  exposureGuardrails: StrategyExposureGuardrails,
  reasons: string[],
): StrategyDecisionCore {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const summary = context.positionState && context.positionState.quantity > 0
    ? locale === "ko"
      ? `${analysis.asset} 구조가 축소 검토를 낼 만큼 약하지도, 새 검토를 낼 만큼 강하지도 않습니다.`
      : `${analysis.asset} structure is not weak enough for a reduce alert and not strong enough for a new alert.`
    : locale === "ko"
      ? `${analysis.asset}은 아직 진입 검토를 낼 만큼 강한 setup이 아닙니다.`
      : `${analysis.asset} does not have a strong enough setup for an entry alert yet.`;
  const diagnostics = buildDiagnostics({
    context,
    analysis,
    action: "HOLD",
    executionDisposition: "SKIPPED",
    signalQuality: buildSignalQuality(score, qualityBucket, false, false, false),
    exposureGuardrails,
    bullishScore: score,
    weaknessScore: 0,
    confirmationRequired: false,
    confirmationSatisfied: false,
    reentryPenaltyApplied: false,
  });

  return {
    action: "HOLD",
    executionDisposition: "SKIPPED",
    alertReason: null,
    cooldownKey: null,
    summary,
    reasons,
    signalQuality: buildSignalQuality(score, qualityBucket, false, false, false),
    exposureGuardrails,
    executionGuide: null,
    diagnostics,
  };
}

function buildStrategyDecisionCore(input: {
  context: DecisionContext;
  action: StrategyAction;
  executionDisposition: DecisionExecutionDisposition;
  summary: string;
  reasons: string[];
  signalQuality: StrategySignalQuality;
  exposureGuardrails: StrategyExposureGuardrails;
  analysis: PositionStructureAnalysis;
  bullishScore: number;
  weaknessScore: number;
  confirmationRequired: boolean;
  confirmationSatisfied: boolean;
  reentryPenaltyApplied: boolean;
  alertReason: ActionNeededReason;
  plannedReduceFraction?: number | null;
}): StrategyDecisionCore {
  const diagnostics = buildDiagnostics({
    context: input.context,
    analysis: input.analysis,
    action: input.action,
    executionDisposition: input.executionDisposition,
    signalQuality: input.signalQuality,
    exposureGuardrails: input.exposureGuardrails,
    bullishScore: input.bullishScore,
    weaknessScore: input.weaknessScore,
    confirmationRequired: input.confirmationRequired,
    confirmationSatisfied: input.confirmationSatisfied,
    reentryPenaltyApplied: input.reentryPenaltyApplied,
  });

  return {
    action: input.action,
    executionDisposition: input.executionDisposition,
    alertReason: input.alertReason,
    cooldownKey: buildCooldownKey(input.context, input.action, input.analysis.entryPath, input.signalQuality.bucket),
    summary: input.summary,
    reasons: input.reasons,
    signalQuality: input.signalQuality,
    exposureGuardrails: input.exposureGuardrails,
    executionGuide: buildExecutionGuide(
      input.context,
      input.action,
      input.analysis,
      input.exposureGuardrails,
      input.plannedReduceFraction ?? null,
      resolveUserLocale(input.context.user.locale ?? null),
    ),
    diagnostics,
  };
}

function buildExecutionGuide(
  context: DecisionContext,
  action: StrategyAction,
  analysis: PositionStructureAnalysis,
  exposureGuardrails: StrategyExposureGuardrails,
  plannedReduceFraction: number | null,
  locale: "ko" | "en",
): ExecutionGuide | null {
  const zone = referenceZone(analysis);
  const invalidationLevel = analysis.invalidationLevel;
  const settings = context.strategy.settings;

  if (action === "ENTRY") {
    const sizing = getEffectiveBuySizing(context, exposureGuardrails, settings.entryAllocation);
    return {
      planType: "ENTRY",
      setupType: analysis.entryPath === "RECLAIM" ? "RECLAIM_ENTRY" : "PULLBACK_ENTRY",
      entryZoneLow: zone.low,
      entryZoneHigh: zone.high,
      initialSizePctOfCash: sizing.initialSizePctOfCash,
      remainingBuyCapacityPctOfCash: sizing.remainingBuyCapacityPctOfCash,
      reducePctOfPosition: null,
      invalidationLevel,
      invalidationRuleText: invalidationLevel === null
        ? locale === "ko"
          ? "진입 무효화 기준이 아직 충분히 선명하지 않습니다."
          : "Entry invalidation is still unclear."
        : locale === "ko"
          ? `진입 무효화 기준은 대략 ${price(invalidationLevel, locale)} KRW 아래입니다.`
          : `Entry invalidation is below roughly ${price(invalidationLevel, locale)} KRW.`,
      chaseGuardText: analysis.upperRangeChase
        ? locale === "ko"
          ? "상단 구간으로 과하게 확장된 움직임은 추격하지 마세요."
          : "Do not chase an extended move into the upper range."
        : locale === "ko"
          ? "구조가 유지되는지 확인하고, 진입 구간을 과하게 넘겨 잡지 마세요."
          : "Wait for the structure to hold; do not overrun the entry zone.",
      actionText: locale === "ko"
        ? `${formatZone(zone, locale)} 부근의 분할 진입을 검토하세요.`
        : `Review a staged entry near ${formatZone(zone, locale)}.`,
      cautionText: null,
    };
  }

  if (action === "ADD") {
    const sizing = getEffectiveBuySizing(context, exposureGuardrails, settings.addAllocation);
    return {
      planType: "ADD_BUY",
      setupType: analysis.entryPath === "RECLAIM" ? "STRENGTH_ADD" : "PULLBACK_ADD",
      entryZoneLow: zone.low,
      entryZoneHigh: zone.high,
      initialSizePctOfCash: sizing.initialSizePctOfCash,
      remainingBuyCapacityPctOfCash: sizing.remainingBuyCapacityPctOfCash,
      reducePctOfPosition: null,
      invalidationLevel,
      invalidationRuleText: invalidationLevel === null
        ? locale === "ko"
          ? "추가매수 무효화 기준이 아직 충분히 선명하지 않습니다."
          : "Add-buy invalidation is still unclear."
        : locale === "ko"
          ? `추가매수 무효화 기준은 대략 ${price(invalidationLevel, locale)} KRW 아래입니다.`
          : `Add-buy invalidation is below roughly ${price(invalidationLevel, locale)} KRW.`,
      chaseGuardText: locale === "ko"
        ? "통제된 hold 또는 retest에서만 추가를 검토하고, 확장 구간에서는 과대 진입을 피하세요."
        : "Only add on a controlled hold or retest; avoid oversizing into extension.",
      actionText: locale === "ko"
        ? `${formatZone(zone, locale)} 부근의 분할 추가를 검토하세요.`
        : `Review a staged add near ${formatZone(zone, locale)}.`,
      cautionText: analysis.pnlPct <= -0.06
        ? locale === "ko"
          ? "기록상 drawdown이 이미 의미 있게 커진 상태입니다."
          : "Recorded drawdown is already meaningful."
        : null,
    };
  }

  if (action === "REDUCE" || action === "EXIT") {
    return {
      planType: action === "EXIT" ? "EXIT_PLAN" : "REDUCE",
      setupType: action === "EXIT" ? "EXIT_PLAN_REVIEW" : "PARTIAL_REDUCE",
      entryZoneLow: zone.low,
      entryZoneHigh: zone.high,
      initialSizePctOfCash: null,
      remainingBuyCapacityPctOfCash: null,
      reducePctOfPosition: toConservativePercent(
        plannedReduceFraction ?? (action === "EXIT" ? 1 : settings.reduceFraction),
        1,
      ),
      invalidationLevel,
      invalidationRuleText: invalidationLevel === null
        ? locale === "ko"
          ? "축소 무효화 기준이 아직 충분히 선명하지 않습니다."
          : "Reduce invalidation is still unclear."
        : locale === "ko"
          ? `가격이 대략 ${price(invalidationLevel, locale)} KRW 아래에 머무는 동안 리스크는 계속 높습니다.`
          : `Risk remains elevated while price stays below roughly ${price(invalidationLevel, locale)} KRW.`,
      chaseGuardText: locale === "ko"
        ? "약세 구간으로 물타기하지 말고, 대신 sell-side 대응을 검토하세요."
        : "Do not average down into weakness; review the sell-side response instead.",
      actionText: action === "EXIT"
        ? locale === "ko"
          ? `${formatZone(zone, locale)} 부근의 더 강한 exit response를 검토하세요.`
          : `Review a stronger exit response around ${formatZone(zone, locale)}.`
        : locale === "ko"
          ? `${formatZone(zone, locale)} 부근의 일부 축소를 검토하세요.`
          : `Review trimming around ${formatZone(zone, locale)}.`,
      cautionText: analysis.weakeningStage === "SOFT"
        ? locale === "ko"
          ? "약화가 아직 soft 단계라서 대응 강도는 과하지 않게 유지하세요."
          : "Weakening is still soft, so keep the response modest."
        : null,
    };
  }

  return null;
}

function getEffectiveBuySizing(
  context: DecisionContext,
  exposureGuardrails: StrategyExposureGuardrails,
  defaultAllocation: number,
): { initialSizePctOfCash: number | null; remainingBuyCapacityPctOfCash: number | null } {
  const availableCash = Math.max(0, context.accountState?.availableCash ?? 0);
  if (availableCash <= 0) {
    return {
      initialSizePctOfCash: null,
      remainingBuyCapacityPctOfCash: null,
    };
  }

  const remainingBuyCapacityValue = Math.max(0, Math.min(
    availableCash,
    exposureGuardrails.remainingAssetCapacity,
    exposureGuardrails.remainingPortfolioCapacity,
  ));
  const initialStageValue = Math.min(availableCash * defaultAllocation, remainingBuyCapacityValue);

  return {
    initialSizePctOfCash: toConservativePercent(initialStageValue, availableCash),
    remainingBuyCapacityPctOfCash: toConservativePercent(remainingBuyCapacityValue, availableCash),
  };
}

function toConservativePercent(value: number, total: number): number | null {
  if (!(value > 0) || !(total > 0)) {
    return null;
  }

  const rawPercent = (value / total) * 100;
  return Math.floor((rawPercent + Number.EPSILON) * 10) / 10;
}
function buildDiagnostics(input: {
  context: DecisionContext;
  analysis: PositionStructureAnalysis;
  action: StrategyAction;
  executionDisposition: DecisionExecutionDisposition;
  signalQuality: StrategySignalQuality;
  exposureGuardrails: StrategyExposureGuardrails;
  bullishScore: number;
  weaknessScore: number;
  confirmationRequired: boolean;
  confirmationSatisfied: boolean;
  reentryPenaltyApplied: boolean;
}): DecisionDiagnostics {
  const { context, analysis, action, executionDisposition, signalQuality, exposureGuardrails, bullishScore, weaknessScore, confirmationRequired, confirmationSatisfied, reentryPenaltyApplied } = input;
  const setupState: DecisionSetupState = action === "HOLD"
    ? analysis.entryPath === "NONE" ? "BLOCKED" : "PROMISING"
    : "READY";
  const triggerState: DecisionTriggerState = action === "REDUCE" || action === "EXIT"
    ? "BEARISH_CONFIRMATION"
    : action === "HOLD"
      ? "NOT_APPLICABLE"
      : executionDisposition === "DEFERRED_CONFIRMATION"
        ? "PENDING"
        : "CONFIRMED";

  const diagnostics: DecisionDiagnostics = {
    regime: {
      classification: analysis.regime,
      summary: analysis.regimeSummary,
    },
    setup: {
      kind: action === "ENTRY" ? "ENTRY" : action === "ADD" ? "ADD_BUY" : action === "REDUCE" || action === "EXIT" ? "REDUCE" : "NONE",
      state: setupState,
      supports: buildSetupSupports(analysis),
      blockers: buildSetupBlockers(analysis, action),
    },
    trigger: {
      state: triggerState,
      confirmed: buildTriggerConfirmed(action, executionDisposition, confirmationSatisfied),
      missing: buildTriggerMissing(action, executionDisposition, confirmationSatisfied),
    },
    risk: {
      level: analysis.riskLevel,
      invalidationState: analysis.invalidationState,
      invalidationLevel: analysis.invalidationLevel,
      notes: [
        `Bullish score: ${bullishScore}.`,
        `Weakness score: ${weaknessScore}.`,
        ...(analysis.breakdown1d ? ["Daily support is broken."] : []),
        ...(analysis.breakdown4h ? ["4h support is under pressure."] : []),
      ],
    },
    indicators: {
      price: analysis.currentPrice,
      timeframes: {
        "1h": toDecisionSnapshot(analysis.timeframes["1h"]),
        "4h": toDecisionSnapshot(analysis.timeframes["4h"]),
        "1d": toDecisionSnapshot(analysis.timeframes["1d"]),
      },
    },
    strategy: {
      action,
      executionDisposition,
      signalQuality,
      exposureGuardrails,
      entryPath: analysis.entryPath,
      trendAlignmentScore: analysis.trendAlignmentScore,
      recoveryQualityScore: analysis.recoveryQualityScore,
      breakdownPressureScore: analysis.breakdownPressureScore,
      weakeningStage: analysis.weakeningStage,
      referencePrice: analysis.currentPrice,
      bullishScore,
      weaknessScore,
      confirmationRequired,
      confirmationSatisfied,
      reentryPenaltyApplied,
      latestDecisionAction: context.strategy.latestDecision?.action ?? null,
      latestDecisionDisposition: context.strategy.latestDecision?.executionDisposition ?? null,
      recentExitHoursSince: context.strategy.recentExit.hoursSinceExit ?? null,
      portfolio: context.strategy.portfolio,
    } as NonNullable<DecisionDiagnostics["strategy"]>,
  };

  return diagnostics;
}

function buildExposureGuardrails(
  portfolio: StrategyPortfolioSnapshot,
  settings: StrategySettings,
): StrategyExposureGuardrails {
  const totalEquity = Math.max(0, portfolio.totalEquity);
  const perAssetLimitValue = totalEquity * settings.perAssetMaxAllocation;
  const totalExposureLimitValue = totalEquity * settings.totalPortfolioMaxExposure;

  return {
    perAssetMaxAllocation: settings.perAssetMaxAllocation,
    totalPortfolioMaxExposure: settings.totalPortfolioMaxExposure,
    remainingAssetCapacity: Math.max(0, perAssetLimitValue - portfolio.assetMarketValue),
    remainingPortfolioCapacity: Math.max(0, totalExposureLimitValue - portfolio.totalExposureValue),
  };
}

function hasBullishRiskCapacity(context: DecisionContext, guardrails: StrategyExposureGuardrails): boolean {
  const minTrade = context.strategy.settings.minimumTradeValueKrw;
  return (context.accountState?.availableCash ?? 0) >= minTrade
    && guardrails.remainingAssetCapacity >= minTrade
    && guardrails.remainingPortfolioCapacity >= minTrade;
}

function hasPendingBullishConfirmation(
  context: DecisionContext,
  action: "ENTRY" | "ADD",
  analysis: PositionStructureAnalysis,
  qualityBucket: SignalQualityBucket,
): boolean {
  const latestDecision = context.strategy.latestDecision;
  return Boolean(
    latestDecision
    && latestDecision.executionDisposition === "DEFERRED_CONFIRMATION"
    && latestDecision.action === action
    && latestDecision.entryPath === analysis.entryPath
    && latestDecision.qualityBucket === qualityBucket
    && isImmediatePreviousHourlyDecision(latestDecision.createdAt, context.generatedAt),
  );
}

function isImmediatePreviousHourlyDecision(previous: string, current: string): boolean {
  const previousBucket = toHourlyBucket(previous);
  const currentBucket = toHourlyBucket(current);
  return previousBucket !== null && currentBucket !== null && currentBucket - previousBucket === HOURLY_CONFIRMATION_WINDOW_MS;
}

function toHourlyBucket(value: string): number | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  const bucket = new Date(timestamp);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.getTime();
}

function getStructuredReducePlan(
  context: DecisionContext,
  analysis: PositionStructureAnalysis,
  weaknessScore: number,
): { reduceFraction: number; qualityBucket: SignalQualityBucket; reasons: string[] } | null {
  const hasProfitBuffer = analysis.pnlPct >= 0.02;
  if (analysis.weakeningStage === "SOFT") {
    if (!hasProfitBuffer || (!analysis.failedReclaim && !analysis.upperRangeChase && analysis.breakdownPressureScore < 2)) {
      return null;
    }
    return {
      reduceFraction: getSoftReduceFraction(context, analysis),
      qualityBucket: "BORDERLINE",
      reasons: ["Weakening is still soft, so any reduction stays modest and mainly protects open gains."],
    };
  }

  const reduceThreshold = analysis.weakeningStage === "CLEAR"
    ? Math.max(3, (isHealthyHoldState(analysis) ? HEALTHY_HOLD_REDUCE_THRESHOLD : REDUCE_THRESHOLD) - 1)
    : isHealthyHoldState(analysis)
      ? HEALTHY_HOLD_REDUCE_THRESHOLD
      : REDUCE_THRESHOLD;

  if (weaknessScore < reduceThreshold) {
    return null;
  }

  return {
    reduceFraction: getGraduatedReduceFraction(weaknessScore, context),
    qualityBucket: weaknessScore >= 7 ? "HIGH" : weaknessScore >= 5 ? "MEDIUM" : "BORDERLINE",
    reasons: [analysis.weakeningStage === "CLEAR" ? "Weakening has become clear enough that a larger staged reduction is now justified." : "Weakening evidence cleared the reduce hysteresis threshold."],
  };
}

function buildEntrySummary(
  analysis: PositionStructureAnalysis,
  score: number,
  disposition: DecisionExecutionDisposition,
  confirmationSatisfied: boolean,
  locale: "ko" | "en",
): string {
  if (locale === "ko") {
    if (disposition === "DEFERRED_CONFIRMATION") return `${analysis.asset} 진입 검토는 정당하지만, 확인은 다음 시간 반복까지 보류됩니다.`;
    if (confirmationSatisfied) return `${analysis.asset} 진입 검토가 정당하며, 이전 확인 보류도 이제 충족되었습니다.`;
    return `${analysis.asset} 진입 검토가 상승 점수 ${score} 기준으로 정당합니다.`;
  }

  if (disposition === "DEFERRED_CONFIRMATION") return `${analysis.asset} entry review is justified, but confirmation is deferred to the next hourly repeat.`;
  if (confirmationSatisfied) return `${analysis.asset} entry review is justified and the deferred confirmation has now been satisfied.`;
  return `${analysis.asset} entry review is justified with bullish score ${score}.`;
}

function buildAddSummary(
  analysis: PositionStructureAnalysis,
  score: number,
  disposition: DecisionExecutionDisposition,
  confirmationSatisfied: boolean,
  locale: "ko" | "en",
): string {
  if (locale === "ko") {
    if (disposition === "DEFERRED_CONFIRMATION") return `${analysis.asset} 추가매수 검토는 정당하지만, 확인은 다음 시간 반복까지 보류됩니다.`;
    if (confirmationSatisfied) return `${analysis.asset} 추가매수 검토가 정당하며, 이전 확인 보류도 이제 충족되었습니다.`;
    return `${analysis.asset} 추가매수 검토가 상승 점수 ${score} 기준으로 정당합니다.`;
  }

  if (disposition === "DEFERRED_CONFIRMATION") return `${analysis.asset} add review is justified, but confirmation is deferred to the next hourly repeat.`;
  if (confirmationSatisfied) return `${analysis.asset} add review is justified and the deferred confirmation has now been satisfied.`;
  return `${analysis.asset} add review is justified with bullish score ${score}.`;
}

function buildCooldownKey(
  context: DecisionContext,
  action: StrategyAction,
  entryPath: EntryPath,
  qualityBucket: SignalQualityBucket,
): string {
  return `${action.toLowerCase()}:${context.user.id}:${context.positionState?.asset ?? context.marketSnapshot?.asset ?? "asset"}:${entryPath}:${qualityBucket}`;
}

function referenceZone(analysis: PositionStructureAnalysis): { low: number | null; high: number | null } {
  const low = Math.min(analysis.timeframes["1h"].support, analysis.timeframes["4h"].support, analysis.currentPrice);
  const high = Math.max(analysis.timeframes["1h"].resistance, analysis.timeframes["4h"].resistance, analysis.currentPrice);
  return {
    low: Number.isFinite(low) ? low : null,
    high: Number.isFinite(high) ? high : null,
  };
}

function formatZone(zone: { low: number | null; high: number | null }, locale: "ko" | "en"): string {
  if (zone.low !== null && zone.high !== null) return `${price(zone.low, locale)}-${price(zone.high, locale)} KRW`;
  if (zone.low !== null) return `>= ${price(zone.low, locale)} KRW`;
  if (zone.high !== null) return `<= ${price(zone.high, locale)} KRW`;
  return locale === "ko" ? "더 명확한 구간" : "a clearer zone";
}

function buildSetupSupports(analysis: PositionStructureAnalysis): string[] {
  const supports: string[] = [];
  if (analysis.reclaimStructure) supports.push("Reclaim structure is present.");
  if (analysis.breakoutHoldStructure) supports.push("Breakout-hold structure is present.");
  if (hasConstructivePullbackQuality(analysis)) supports.push("Pullback quality is constructive.");
  if (analysis.volumeRecovery) supports.push("Volume recovery is supportive.");
  if (analysis.macdImproving) supports.push("MACD is improving.");
  if (analysis.rsiRecovery) supports.push("RSI recovery is supportive.");
  return supports;
}

function buildSetupBlockers(analysis: PositionStructureAnalysis, action: StrategyAction): string[] {
  const blockers: string[] = [];
  if (analysis.upperRangeChase) blockers.push("Upper range extension is still a caution.");
  if (analysis.breakdown4h) blockers.push("4h breakdown pressure is active.");
  if (analysis.breakdown1d) blockers.push("Daily breakdown pressure is active.");
  if (action !== "HOLD" && !isConstructiveBullishCandidate(analysis) && action !== "REDUCE" && action !== "EXIT") {
    blockers.push("Bullish candidate quality is not constructive enough.");
  }
  return blockers;
}

function buildTriggerConfirmed(action: StrategyAction, executionDisposition: DecisionExecutionDisposition, confirmationSatisfied: boolean): string[] {
  if (action === "ENTRY" || action === "ADD") {
    if (executionDisposition === "IMMEDIATE") return ["Bullish score cleared the strong threshold."];
    if (confirmationSatisfied) return ["Deferred confirmation matched the latest hourly signature."];
  }
  if (action === "REDUCE" || action === "EXIT") return ["Weakness pressure cleared the reduce threshold."];
  return [];
}

function buildTriggerMissing(action: StrategyAction, executionDisposition: DecisionExecutionDisposition, confirmationSatisfied: boolean): string[] {
  if (action === "ENTRY" || action === "ADD") {
    if (executionDisposition === "DEFERRED_CONFIRMATION" && !confirmationSatisfied) return ["Bullish confirmation is still deferred."];
    if (executionDisposition !== "IMMEDIATE") return ["Bullish threshold is still borderline."];
  }
  if (action === "HOLD") return ["No action trigger is active."];
  return [];
}

function getGraduatedReduceFraction(weaknessScore: number, context: DecisionContext): number {
  const base = context.strategy.settings.reduceFraction;
  if (weaknessScore >= 7) return Math.min(0.9, base * 1.75);
  if (weaknessScore >= 5) return Math.min(0.75, base * 1.2);
  return Math.max(0.2, base * 0.65);
}

function getSoftReduceFraction(context: DecisionContext, analysis: PositionStructureAnalysis): number {
  const base = context.strategy.settings.reduceFraction;
  let fraction = Math.max(0.15, Math.min(0.25, base * 0.5));
  if (analysis.upperRangeChase || analysis.pnlPct >= 0.05) {
    fraction = Math.max(fraction, 0.25);
  }
  return Math.min(0.35, fraction);
}

function hasConstructivePullbackQuality(analysis: PositionStructureAnalysis): boolean {
  return analysis.pullbackZone && (
    analysis.timeframes["1h"].location === "LOWER"
    || analysis.timeframes["4h"].location === "LOWER"
    || (analysis.timeframes["1h"].location === "MIDDLE" && analysis.volumeRecovery && analysis.timeframes["4h"].trend !== "DOWN")
  );
}

function isHealthyHoldState(analysis: PositionStructureAnalysis): boolean {
  return analysis.invalidationState === "CLEAR"
    && !analysis.failedReclaim
    && !analysis.bearishMomentumExpansion
    && analysis.regime !== "WEAK_DOWNTREND";
}

function extractLatestDecisionFromLog(log: StoredDecisionLogRecord): StrategyLatestDecision | null {
  const context = toRecord(log.context);
  const candidate = toRecord(context?.strategySnapshot);
  if (!candidate) return null;

  const action = asStrategyAction(candidate.action);
  const executionDisposition = asExecutionDisposition(candidate.executionDisposition);
  const entryPath = asEntryPath(candidate.entryPath);
  const qualityBucket = asSignalQualityBucket(candidate.qualityBucket ?? toRecord(candidate.signalQuality)?.bucket);
  if (!action || !executionDisposition || !entryPath || !qualityBucket) return null;

  return {
    action,
    executionDisposition,
    referencePrice: asNumber(candidate.referencePrice) ?? asNumber(toRecord(candidate.signalQuality)?.referencePrice) ?? 0,
    signalQuality: {
      score: asNumber(toRecord(candidate.signalQuality)?.score) ?? 0,
      bucket: qualityBucket,
      confirmationRequired: Boolean(toRecord(candidate.signalQuality)?.confirmationRequired),
      confirmationSatisfied: Boolean(toRecord(candidate.signalQuality)?.confirmationSatisfied),
      reentryPenaltyApplied: Boolean(toRecord(candidate.signalQuality)?.reentryPenaltyApplied),
    },
    entryPath,
    qualityBucket,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : log.createdAt,
  };
}

function diffHours(laterIso: string, earlierIso: string): number | null {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null;
  return Math.max(0, (later - earlier) / 3_600_000);
}
function getAssetMarketValue(asset: SupportedAsset, position: PositionState | undefined, tradePrice: number): number {
  if (!position || position.asset !== asset) return 0;
  return Math.max(0, position.quantity) * Math.max(0, tradePrice);
}

function extractLatestDecision(recentDecisionLogs: StoredDecisionLogRecord[]): StrategyLatestDecision | null {
  for (const log of recentDecisionLogs) {
    const decision = extractLatestDecisionFromLog(log);
    if (decision) return decision;
  }
  return null;
}

function inferRecentExit(
  latestManualExit: Pick<PositionStateEventRecord, "createdAt"> | null,
  generatedAt: string,
): StrategyRecentExit {
  if (!latestManualExit) {
    return { createdAt: null, hoursSinceExit: null, realizedPnl: null };
  }

  return {
    createdAt: latestManualExit.createdAt,
    hoursSinceExit: diffHours(generatedAt, latestManualExit.createdAt),
    realizedPnl: null,
  };
}

function computeBullishScore(analysis: PositionStructureAnalysis): number {
  let score = 0;
  if (analysis.regime === "BULL_TREND") score += 3;
  else if (analysis.regime === "PULLBACK_IN_UPTREND") score += 3;
  else if (analysis.regime === "EARLY_RECOVERY") score += 2;
  else if (analysis.regime === "RECLAIM_ATTEMPT") score += 1;
  if (analysis.invalidationState === "CLEAR") score += 2;
  if (hasConstructivePullbackQuality(analysis)) score += 1;
  else if (analysis.pullbackZone) score -= 1;
  if (analysis.reclaimStructure) score += 2;
  if (analysis.breakoutHoldStructure) score += 2;
  if (analysis.volumeRecovery) score += 1;
  if (analysis.macdImproving) score += 1;
  if (analysis.rsiRecovery) score += 1;
  if (analysis.upperRangeChase) score -= 2;
  if (analysis.breakdown4h) score -= 3;
  if (analysis.breakdown1d) score -= 4;
  if (analysis.trendAlignmentScore >= 4) score += 1;
  if (analysis.recoveryQualityScore >= 4) score += 1;
  if (analysis.entryPath === "NONE") score -= 1;
  if (analysis.breakdownPressureScore >= 3) score -= 1;
  return score;
}

function computeWeaknessScore(analysis: PositionStructureAnalysis): number {
  let score = 0;
  if (analysis.riskLevel === "ELEVATED") score += 2;
  if (analysis.failedReclaim) score += 2;
  if (analysis.bearishMomentumExpansion) score += 2;
  if (analysis.breakdown4h) score += 2;
  if (analysis.regime === "WEAK_DOWNTREND") score += 1;
  if (analysis.atrShock) score += 1;
  if (analysis.upperRangeChase && analysis.timeframes["1h"].trend === "DOWN") score += 1;
  return score;
}

function getReentryPenalty(context: DecisionContext, analysis: PositionStructureAnalysis, quantity: number): number {
  const recentExit = context.strategy.recentExit;
  if (quantity > 0 || recentExit.hoursSinceExit === null || recentExit.hoursSinceExit > RECENT_EXIT_PENALTY_HOURS) return 0;

  let penalty = 1;
  if (
    recentExit.hoursSinceExit <= RECENT_LOSS_EXIT_PENALTY_HOURS
    && recentExit.realizedPnl !== null
    && recentExit.realizedPnl <= 0
  ) {
    penalty += 1;
  }
  if (analysis.reclaimStructure && analysis.recoveryQualityScore >= 3) {
    penalty -= 1;
  }
  return Math.max(0, penalty);
}

function toQualityBucket(score: number): SignalQualityBucket {
  if (score >= 8) return "HIGH";
  if (score >= 6) return "MEDIUM";
  if (score >= 4) return "BORDERLINE";
  return "LOW";
}

function weaknessBucket(score: number): SignalQualityBucket {
  if (score >= 7) return "HIGH";
  if (score >= 5) return "MEDIUM";
  if (score >= 3) return "BORDERLINE";
  return "LOW";
}

function buildSignalQuality(
  score: number,
  bucket: SignalQualityBucket,
  reentryPenaltyApplied: boolean,
  confirmationRequired: boolean,
  confirmationSatisfied: boolean,
): StrategySignalQuality {
  return {
    score,
    bucket,
    confirmationRequired,
    confirmationSatisfied,
    reentryPenaltyApplied,
  };
}

function isConstructiveBullishCandidate(analysis: PositionStructureAnalysis): boolean {
  return analysis.invalidationState === "CLEAR"
    && !analysis.upperRangeChase
    && !analysis.breakdown1d
    && !analysis.breakdown4h
    && (hasConstructivePullbackQuality(analysis) || analysis.reclaimStructure || analysis.breakoutHoldStructure)
    && (
      analysis.regime === "BULL_TREND"
      || analysis.regime === "PULLBACK_IN_UPTREND"
      || analysis.regime === "EARLY_RECOVERY"
      || analysis.regime === "RECLAIM_ATTEMPT"
    );
}

function isConstructiveAddCandidate(analysis: PositionStructureAnalysis): boolean {
  return isConstructiveBullishCandidate(analysis)
    && isHealthyHoldState(analysis)
    && analysis.breakdownPressureScore <= 1
    && analysis.trendAlignmentScore >= 3
    && (
      analysis.entryPath === "RECLAIM"
      || analysis.entryPath === "BREAKOUT_HOLD"
      || (analysis.entryPath === "PULLBACK" && analysis.recoveryQualityScore >= 2)
    );
}

function getBullishThresholds(action: "ENTRY" | "ADD", analysis: PositionStructureAnalysis): { strong: number; borderline: number } {
  let strong = action === "ENTRY" ? ENTRY_STRONG_THRESHOLD : ADD_STRONG_THRESHOLD;
  let borderline = action === "ENTRY" ? ENTRY_BORDERLINE_THRESHOLD : ADD_BORDERLINE_THRESHOLD;
  switch (analysis.entryPath) {
    case "RECLAIM":
      if (analysis.recoveryQualityScore >= 3 && analysis.trendAlignmentScore >= 3) {
        strong -= 1;
        borderline -= 1;
      }
      break;
    case "BREAKOUT_HOLD":
      strong += 1;
      borderline += 1;
      if (analysis.timeframes["1h"].location === "UPPER") {
        strong += 1;
        borderline += 1;
      }
      break;
    case "PULLBACK":
      if (action === "ADD") {
        strong += 1;
        borderline += 1;
      }
      if (analysis.timeframes["1h"].location !== "LOWER" && analysis.timeframes["4h"].location !== "LOWER") {
        strong += 1;
        borderline += 1;
      }
      break;
  }
  if (analysis.breakdownPressureScore >= 2 && action === "ADD") {
    strong += 1;
    borderline += 1;
  }
  return { strong, borderline: Math.min(borderline, strong - 1) };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asStrategyAction(value: unknown): StrategyAction | null {
  return value === "HOLD" || value === "ENTRY" || value === "ADD" || value === "REDUCE" || value === "EXIT" ? value : null;
}

function asExecutionDisposition(value: unknown): DecisionExecutionDisposition | null {
  return value === "IMMEDIATE" || value === "DEFERRED_CONFIRMATION" || value === "EXECUTED_AFTER_CONFIRMATION" || value === "SKIPPED" ? value : null;
}

function asSignalQualityBucket(value: unknown): SignalQualityBucket | null {
  return value === "LOW" || value === "BORDERLINE" || value === "MEDIUM" || value === "HIGH" ? value : null;
}

function asEntryPath(value: unknown): EntryPath | null {
  return value === "PULLBACK" || value === "RECLAIM" || value === "BREAKOUT_HOLD" || value === "NONE" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function price(value: number, locale: "ko" | "en"): string {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 0 }).format(Math.max(0, value));
}

