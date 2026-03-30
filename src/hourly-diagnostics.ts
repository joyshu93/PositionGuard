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
}): HourlyDiagnostics {
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
      ? {
          ok: true,
          reason: null,
          message: null,
          consecutiveFailures: input.consecutiveMarketFailures,
          repeatedFailure: false,
        }
      : {
          ok: false,
          reason: input.marketResult.reason,
          message: input.marketResult.message,
          consecutiveFailures: input.consecutiveMarketFailures,
          repeatedFailure: input.consecutiveMarketFailures >= 3,
        },
    notification: {
      eligible: input.notificationEligible,
      sent: input.notificationState.sent,
      reasonKey: input.notificationState.reasonKey,
      cooldownUntil: input.notificationState.cooldownUntil,
      suppressedBy: input.notificationState.suppressedBy,
    },
  };
}

function getHourlyCycleOutcome(
  decision: DecisionResult,
  notificationState: HourlyNotificationState,
): HourlyCycleOutcome {
  if (decision.status === "SETUP_INCOMPLETE") {
    return "SETUP_INCOMPLETE";
  }

  if (decision.status === "INSUFFICIENT_DATA") {
    return "INSUFFICIENT_DATA";
  }

  if (decision.status === "NO_ACTION") {
    return "NO_ACTION";
  }

  if (notificationState.sent) {
    return "ACTION_NEEDED_SENT";
  }

  if (notificationState.suppressedBy === "cooldown") {
    return "ACTION_NEEDED_COOLDOWN_SKIP";
  }

  if (notificationState.suppressedBy === "sleep_mode") {
    return "ACTION_NEEDED_SLEEP_SUPPRESSED";
  }

  if (notificationState.suppressedBy === "missing_chat_id") {
    return "ACTION_NEEDED_MISSING_CHAT_ID";
  }

  return "ACTION_NEEDED_SUPPRESSED";
}
