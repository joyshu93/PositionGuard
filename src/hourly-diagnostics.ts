import type {
  DecisionContext,
  DecisionResult,
  DecisionExecutionDisposition,
  EntryPath,
  SignalQualityBucket,
  StrategyAction,
  StrategyExposureGuardrails,
  WeakeningStage,
} from "./domain/types.js";

export type HourlyCycleOutcome =
  | "SETUP_INCOMPLETE"
  | "INSUFFICIENT_DATA"
  | "NO_ACTION"
  | "ACTION_NEEDED_SENT"
  | "ACTION_NEEDED_COOLDOWN_SKIP"
  | "ACTION_NEEDED_SLEEP_SUPPRESSED"
  | "ACTION_NEEDED_MISSING_CHAT_ID"
  | "ACTION_NEEDED_SUPPRESSED";

export interface HourlyNotificationState {
  sent: boolean;
  reasonKey: string | null;
  suppressedBy: string | null;
  cooldownUntil: string | null;
}

export interface HourlyReminderState {
  eligible: boolean;
  sent: boolean;
  reasonKey: string | null;
  cooldownUntil: string | null;
  suppressedBy: string | null;
  repeatedSignalCount: number;
  stateChangedSinceLastSignal: boolean | null;
  signalReason: string | null;
}

export interface HourlyDiagnostics {
  cycleOutcome: HourlyCycleOutcome;
  baseDecisionStatus: DecisionResult["status"];
  decisionStatus: DecisionResult["status"];
  decisionSummary: string;
  alertReason: string | null;
  setup: {
    complete: boolean;
    missingItems: string[];
  };
  marketData: {
    ok: boolean;
    reason: string | null;
    message: string | null;
    consecutiveFailures: number;
    repeatedFailure: boolean;
  };
  notification: {
    eligible: boolean;
    sent: boolean;
    reasonKey: string | null;
    cooldownUntil: string | null;
    suppressedBy: string | null;
  };
  notificationState: {
    eligible: boolean;
    sent: boolean;
    reasonKey: string | null;
    cooldownUntil: string | null;
    suppressedBy: string | null;
  };
  reminderState: HourlyReminderState;
  decisionDetails: {
    regime: string | null;
    setupKind: string | null;
    setupStatus: string | null;
    triggerState: string | null;
    invalidationState: string | null;
    invalidationLevel: number | null;
    indicators: {
      price: number | null;
      rsi14_4h: number | null;
      volumeRatio1h: number | null;
      macdHistogram1d: number | null;
    };
  };
  strategy: {
    action: StrategyAction | null;
    executionDisposition: DecisionExecutionDisposition | null;
    entryPath: EntryPath | null;
    score: number | null;
    bucket: SignalQualityBucket | null;
    confirmationRequired: boolean | null;
    confirmationSatisfied: boolean | null;
    reentryPenaltyApplied: boolean | null;
    bullishScore: number | null;
    weaknessScore: number | null;
    trendAlignmentScore: number | null;
    recoveryQualityScore: number | null;
    breakdownPressureScore: number | null;
    weakeningStage: WeakeningStage | null;
    referencePrice: number | null;
    latestDecisionAction: StrategyAction | null;
    latestDecisionDisposition: DecisionExecutionDisposition | null;
    recentExitHoursSince: number | null;
    exposureGuardrails: StrategyExposureGuardrails | null;
  };
}

export function buildHourlyDiagnostics(input: {
  context: DecisionContext;
  baseDecision: DecisionResult;
  finalDecision: DecisionResult;
  marketResult:
    | { ok: true }
    | { ok: false; reason: string; message: string };
  consecutiveMarketFailures: number;
  notificationEligible: boolean;
  notificationState: HourlyNotificationState;
  reminderState: HourlyReminderState;
}): HourlyDiagnostics {
  const notificationState = {
    eligible: input.notificationEligible,
    sent: input.notificationState.sent,
    reasonKey: input.notificationState.reasonKey,
    cooldownUntil: input.notificationState.cooldownUntil,
    suppressedBy: input.notificationState.suppressedBy,
  };

  return {
    cycleOutcome: getHourlyCycleOutcome(input.finalDecision, input.notificationState),
    baseDecisionStatus: input.baseDecision.status,
    decisionStatus: input.finalDecision.status,
    decisionSummary: input.finalDecision.summary,
    alertReason: input.finalDecision.alert?.reason ?? null,
    setup: {
      complete: input.context.setup.isReady,
      missingItems: [...input.context.setup.missingItems],
    },
    marketData: input.marketResult.ok
      ? { ok: true, reason: null, message: null, consecutiveFailures: input.consecutiveMarketFailures, repeatedFailure: false }
      : { ok: false, reason: input.marketResult.reason, message: input.marketResult.message, consecutiveFailures: input.consecutiveMarketFailures, repeatedFailure: input.consecutiveMarketFailures >= 3 },
    notification: notificationState,
    notificationState,
    reminderState: input.reminderState,
    decisionDetails: {
      regime: input.finalDecision.diagnostics?.regime?.classification ?? null,
      setupKind: input.finalDecision.diagnostics?.setup.kind ?? null,
      setupStatus: input.finalDecision.diagnostics?.setup.state ?? null,
      triggerState: input.finalDecision.diagnostics?.trigger.state ?? null,
      invalidationState: input.finalDecision.diagnostics?.risk.invalidationState ?? null,
      invalidationLevel: input.finalDecision.diagnostics?.risk.invalidationLevel ?? null,
      indicators: {
        price: input.finalDecision.diagnostics?.indicators.price ?? null,
        rsi14_4h: input.finalDecision.diagnostics?.indicators.timeframes["4h"].rsi14 ?? null,
        volumeRatio1h: input.finalDecision.diagnostics?.indicators.timeframes["1h"].volumeRatio ?? null,
        macdHistogram1d: input.finalDecision.diagnostics?.indicators.timeframes["1d"].macdHistogram ?? null,
      },
    },
    strategy: extractStrategyDiagnostics(input.context, input.finalDecision.diagnostics?.strategy ?? null),
  };
}

function extractStrategyDiagnostics(
  context: DecisionContext,
  diagnostics: unknown,
): HourlyDiagnostics["strategy"] {
  const value = toRecord(diagnostics);
  const latestDecision = context.strategy?.latestDecision ?? null;
  const recentExitHoursSince = context.strategy?.recentExit?.hoursSinceExit ?? null;
  return {
    action: asStrategyAction(value?.action) ?? latestDecision?.action ?? null,
    executionDisposition: asExecutionDisposition(value?.executionDisposition) ?? latestDecision?.executionDisposition ?? null,
    entryPath: asEntryPath(value?.entryPath) ?? latestDecision?.entryPath ?? null,
    score: asNumber(value?.signalQuality && toRecord(value.signalQuality)?.score) ?? null,
    bucket: asSignalQualityBucket(value?.signalQuality && toRecord(value.signalQuality)?.bucket) ?? latestDecision?.qualityBucket ?? null,
    confirmationRequired: asBoolean(value?.signalQuality && toRecord(value.signalQuality)?.confirmationRequired),
    confirmationSatisfied: asBoolean(value?.signalQuality && toRecord(value.signalQuality)?.confirmationSatisfied),
    reentryPenaltyApplied: asBoolean(value?.signalQuality && toRecord(value.signalQuality)?.reentryPenaltyApplied),
    bullishScore: asNumber(value?.bullishScore),
    weaknessScore: asNumber(value?.weaknessScore),
    trendAlignmentScore: asNumber(value?.trendAlignmentScore),
    recoveryQualityScore: asNumber(value?.recoveryQualityScore),
    breakdownPressureScore: asNumber(value?.breakdownPressureScore),
    weakeningStage: asWeakeningStage(value?.weakeningStage),
    referencePrice: asNumber(value?.referencePrice),
    latestDecisionAction: latestDecision?.action ?? null,
    latestDecisionDisposition: latestDecision?.executionDisposition ?? null,
    recentExitHoursSince,
    exposureGuardrails: toExposureGuardrails(value?.exposureGuardrails),
  };
}

function getHourlyCycleOutcome(decision: DecisionResult, notificationState: HourlyNotificationState): HourlyCycleOutcome {
  if (decision.status === "SETUP_INCOMPLETE") return "SETUP_INCOMPLETE";
  if (decision.status === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  if (decision.status === "NO_ACTION") return "NO_ACTION";
  if (notificationState.sent) return "ACTION_NEEDED_SENT";
  if (notificationState.suppressedBy === "cooldown") return "ACTION_NEEDED_COOLDOWN_SKIP";
  if (notificationState.suppressedBy === "sleep_mode") return "ACTION_NEEDED_SLEEP_SUPPRESSED";
  if (notificationState.suppressedBy === "missing_chat_id") return "ACTION_NEEDED_MISSING_CHAT_ID";
  return "ACTION_NEEDED_SUPPRESSED";
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

function asEntryPath(value: unknown): EntryPath | null {
  return value === "PULLBACK" || value === "RECLAIM" || value === "BREAKOUT_HOLD" || value === "NONE" ? value : null;
}

function asSignalQualityBucket(value: unknown): SignalQualityBucket | null {
  return value === "LOW" || value === "BORDERLINE" || value === "MEDIUM" || value === "HIGH" ? value : null;
}

function asWeakeningStage(value: unknown): WeakeningStage | null {
  return value === "NONE" || value === "SOFT" || value === "CLEAR" || value === "FAILURE" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function toExposureGuardrails(value: unknown): StrategyExposureGuardrails | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const perAssetMaxAllocation = asNumber(record.perAssetMaxAllocation);
  const totalPortfolioMaxExposure = asNumber(record.totalPortfolioMaxExposure);
  const remainingAssetCapacity = asNumber(record.remainingAssetCapacity);
  const remainingPortfolioCapacity = asNumber(record.remainingPortfolioCapacity);
  if (perAssetMaxAllocation === null || totalPortfolioMaxExposure === null || remainingAssetCapacity === null || remainingPortfolioCapacity === null) {
    return null;
  }

  return {
    perAssetMaxAllocation,
    totalPortfolioMaxExposure,
    remainingAssetCapacity,
    remainingPortfolioCapacity,
  };
}
