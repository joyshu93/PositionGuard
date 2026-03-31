import type {
  AssetSymbol,
  DecisionLogRecord,
  NotificationEventRecord,
} from "./types/persistence.js";

export interface LastDecisionView {
  asset: AssetSymbol;
  status: string;
  summary: string;
  generatedAt: string;
  alertOutcome: "sent" | "skipped" | "not_applicable";
  suppressionReason: string | null;
}

export interface HourlyHealthView {
  latestDecisionStatus: string | null;
  latestDecisionAt: string | null;
  recentMarketFailureCount: number;
  recentCooldownSkipCount: number;
  recentSleepSuppressionCount: number;
  recentSetupBlockedCount: number;
  latestMarketFailureMessage: string | null;
}

export function buildLastDecisionView(
  decision: DecisionLogRecord | null,
): LastDecisionView | null {
  if (!decision) {
    return null;
  }

  const diagnostics = getDiagnostics(decision.context);
  const notificationState = diagnostics?.notificationState;
  const alertOutcome = getAlertOutcome(decision, notificationState);
  const suppressionReason =
    typeof notificationState?.suppressedBy === "string"
      ? notificationState.suppressedBy
      : null;

  return {
    asset: decision.asset,
    status: decision.decisionStatus,
    summary: decision.summary,
    generatedAt: decision.createdAt,
    alertOutcome,
    suppressionReason,
  };
}

export function buildHourlyHealthView(input: {
  decisions: DecisionLogRecord[];
  notifications: NotificationEventRecord[];
}): HourlyHealthView {
  const latestDecision = input.decisions[0] ?? null;
  const marketFailureLogs = input.decisions.filter((decision) => {
    const marketData = getDiagnostics(decision.context)?.marketData;
    return marketData?.ok === false;
  });
  const latestMarketFailure = marketFailureLogs[0] ?? null;

  return {
    latestDecisionStatus: latestDecision?.decisionStatus ?? null,
    latestDecisionAt: latestDecision?.createdAt ?? null,
    recentMarketFailureCount: marketFailureLogs.length,
    recentCooldownSkipCount: countSuppression(input.notifications, "cooldown"),
    recentSleepSuppressionCount: countSuppression(input.notifications, "sleep_mode"),
    recentSetupBlockedCount: input.decisions.filter(
      (decision) => decision.decisionStatus === "SETUP_INCOMPLETE",
    ).length,
    latestMarketFailureMessage: getLatestMarketFailureMessage(latestMarketFailure),
  };
}

export function renderLastDecisionMessage(view: LastDecisionView | null): string {
  if (!view) {
    return "No decision record is available yet.";
  }

  const lines = [
    "Last decision:",
    `Asset: ${view.asset}`,
    `Verdict: ${describeDecisionVerdict(view.status)}`,
    `Status: ${view.status}`,
    `When: ${view.generatedAt}`,
    `Summary: ${view.summary}`,
    `Alert: ${formatAlertOutcome(view)}`,
    `Note: ${describeDecisionNote(view.status)}`,
  ];

  return lines.join("\n");
}

export function renderHourlyHealthMessage(view: HourlyHealthView): string {
  return [
    "Hourly health:",
    `Latest decision: ${view.latestDecisionStatus ?? "none"}${view.latestDecisionAt ? ` @ ${view.latestDecisionAt}` : ""}`,
    `Latest verdict: ${describeDecisionVerdict(view.latestDecisionStatus)}`,
    `Recent market-data failures: ${view.recentMarketFailureCount}`,
    `Recent cooldown skips: ${view.recentCooldownSkipCount}`,
    `Recent sleep suppressions: ${view.recentSleepSuppressionCount}`,
    `Recent setup-blocked cycles: ${view.recentSetupBlockedCount}`,
    `Latest market issue: ${view.latestMarketFailureMessage ?? "none"}`,
    "Operational only. No trade was executed.",
  ].join("\n");
}

function getAlertOutcome(
  decision: DecisionLogRecord,
  notificationState: { sent?: unknown; suppressedBy?: unknown } | undefined,
): "sent" | "skipped" | "not_applicable" {
  if (decision.notificationEmitted) {
    return "sent";
  }

  if (typeof notificationState?.suppressedBy === "string") {
    return "skipped";
  }

  return "not_applicable";
}

function formatAlertOutcome(view: LastDecisionView): string {
  if (view.alertOutcome !== "skipped" || !view.suppressionReason) {
    return view.alertOutcome;
  }

  return `${view.alertOutcome} (${view.suppressionReason})`;
}

export function describeDecisionVerdict(status: string | null | undefined): string {
  if (status === "SETUP_INCOMPLETE") {
    return "setup incomplete";
  }

  if (status === "INSUFFICIENT_DATA") {
    return "insufficient data";
  }

  if (status === "NO_ACTION") {
    return "no action";
  }

  if (status === "ACTION_NEEDED") {
    return "action needed";
  }

  return "unknown";
}

function describeDecisionNote(status: string | null | undefined): string {
  if (status === "SETUP_INCOMPLETE") {
    return "waiting for missing manual inputs";
  }

  if (status === "INSUFFICIENT_DATA") {
    return "hourly market context was not complete";
  }

  if (status === "NO_ACTION") {
    return "current rules do not require action";
  }

  if (status === "ACTION_NEEDED") {
    return "operator follow-up is required";
  }

  return "status is not recognized";
}

function countSuppression(
  notifications: NotificationEventRecord[],
  suppressionReason: string,
): number {
  return notifications.filter(
    (event) =>
      event.deliveryStatus === "SKIPPED" &&
      event.suppressedBy === suppressionReason &&
      event.eventType === "ACTION_NEEDED",
  ).length;
}

function getDiagnostics(
  context: unknown,
):
  | {
      marketData?: {
        ok?: unknown;
        message?: unknown;
      };
      notificationState?: {
        sent?: unknown;
        suppressedBy?: unknown;
      };
    }
  | undefined {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const diagnostics = (context as { diagnostics?: unknown }).diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") {
    return undefined;
  }

  return diagnostics as {
    marketData?: {
      ok?: unknown;
      message?: unknown;
    };
    notificationState?: {
      sent?: unknown;
      suppressedBy?: unknown;
    };
  };
}

function getLatestMarketFailureMessage(
  decision: DecisionLogRecord | null,
): string | null {
  const message = getDiagnostics(decision?.context)?.marketData?.message;
  return typeof message === "string" ? message : null;
}
