import type {
  DecisionContext,
  DecisionResult,
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
