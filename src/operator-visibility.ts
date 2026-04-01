import type {
  AssetSymbol,
  DecisionLogRecord,
  NotificationEventRecord,
} from "./types/persistence.js";
import type { SupportedLocale } from "./domain/types.js";
import { formatAvailability, getMessages, resolveUserLocale } from "./i18n/index.js";

export interface LastDecisionView {
  asset: AssetSymbol;
  status: string;
  summary: string;
  generatedAt: string;
  alertOutcome: "sent" | "skipped" | "not_applicable";
  suppressionReason: string | null;
  regime: string | null;
  triggerState: string | null;
  invalidationState: string | null;
}

export interface HourlyHealthView {
  latestDecisionStatus: string | null;
  latestDecisionAt: string | null;
  recentMarketFailureCount: number;
  recentCooldownSkipCount: number;
  recentSleepSuppressionCount: number;
  recentSetupBlockedCount: number;
  latestMarketFailureMessage: string | null;
  latestRegime: string | null;
  latestTriggerState: string | null;
  latestInvalidationState: string | null;
  latestReminderEligible: boolean | null;
  latestReminderSent: boolean | null;
  latestReminderSuppressedBy: string | null;
  latestReminderRepeatedSignalCount: number | null;
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
    regime:
      typeof diagnostics?.decisionDetails?.regime === "string"
        ? diagnostics.decisionDetails.regime
        : null,
    triggerState:
      typeof diagnostics?.decisionDetails?.triggerState === "string"
        ? diagnostics.decisionDetails.triggerState
        : null,
    invalidationState:
      typeof diagnostics?.decisionDetails?.invalidationState === "string"
        ? diagnostics.decisionDetails.invalidationState
        : null,
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
    latestRegime: getLatestDecisionDetail(latestDecision, "regime"),
    latestTriggerState: getLatestDecisionDetail(latestDecision, "triggerState"),
    latestInvalidationState: getLatestDecisionDetail(latestDecision, "invalidationState"),
    latestReminderEligible: getLatestReminderFlag(latestDecision, "eligible"),
    latestReminderSent: getLatestReminderFlag(latestDecision, "sent"),
    latestReminderSuppressedBy: getLatestReminderSuppressedBy(latestDecision),
    latestReminderRepeatedSignalCount: getLatestReminderRepeatedSignalCount(latestDecision),
  };
}

export function renderLastDecisionMessage(
  view: LastDecisionView | null,
  localeInput?: SupportedLocale | null,
): string {
  const locale = resolveUserLocale(localeInput ?? null);
  const messages = getMessages(locale);

  if (!view) {
    return locale === "ko"
      ? "\uC544\uC9C1 \uACB0\uC815 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."
      : "No decision record is available yet.";
  }

  const lines = [
    messages.operator.lastDecisionTitle,
    messages.operator.asset(view.asset),
    messages.operator.verdict(describeDecisionVerdict(view.status, locale)),
    messages.operator.status(view.status),
    messages.operator.when(view.generatedAt),
    messages.operator.summary(view.summary),
    messages.operator.alert(formatAlertOutcome(view)),
    messages.operator.structure(view.regime ?? messages.booleans.notAvailable, view.triggerState ?? messages.booleans.notAvailable, view.invalidationState ?? messages.booleans.notAvailable),
    messages.operator.note(describeDecisionNote(view.status, locale)),
  ];

  return lines.join("\n");
}

export function renderHourlyHealthMessage(
  view: HourlyHealthView,
  localeInput?: SupportedLocale | null,
): string {
  const locale = resolveUserLocale(localeInput ?? null);
  const messages = getMessages(locale);

  return [
    messages.operator.hourlyHealthTitle,
    messages.operator.latestDecision(view.latestDecisionStatus ?? messages.booleans.none, view.latestDecisionAt ?? ""),
    messages.operator.latestVerdict(describeDecisionVerdict(view.latestDecisionStatus, locale)),
    messages.operator.recentMarketDataFailures(view.recentMarketFailureCount),
    messages.operator.recentCooldownSkips(view.recentCooldownSkipCount),
    messages.operator.recentSleepSuppressions(view.recentSleepSuppressionCount),
    messages.operator.recentSetupBlockedCycles(view.recentSetupBlockedCount),
    messages.operator.latestStructure(
      view.latestRegime ?? messages.booleans.notAvailable,
      view.latestTriggerState ?? messages.booleans.notAvailable,
      view.latestInvalidationState ?? messages.booleans.notAvailable,
    ),
    messages.operator.latestReminder(
      `eligible ${formatBoolean(view.latestReminderEligible, locale)} | sent ${formatBoolean(view.latestReminderSent, locale)} | repeated ${view.latestReminderRepeatedSignalCount ?? messages.booleans.notAvailable}${view.latestReminderSuppressedBy ? ` | suppressed ${view.latestReminderSuppressedBy}` : ""}`,
    ),
    messages.operator.latestMarketIssue(view.latestMarketFailureMessage ?? messages.booleans.none),
    messages.operator.operationalOnly,
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

export function describeDecisionVerdict(
  status: string | null | undefined,
  localeInput?: SupportedLocale | null,
): string {
  const locale = resolveUserLocale(localeInput ?? null);
  const messages = getMessages(locale);
  if (status === "SETUP_INCOMPLETE") {
    return messages.operator.setupIncomplete;
  }

  if (status === "INSUFFICIENT_DATA") {
    return messages.operator.insufficientData;
  }

  if (status === "NO_ACTION") {
    return messages.operator.noAction;
  }

  if (status === "ACTION_NEEDED") {
    return messages.operator.actionNeeded;
  }

  return messages.operator.unknown;
}

function describeDecisionNote(
  status: string | null | undefined,
  localeInput?: SupportedLocale | null,
): string {
  const locale = resolveUserLocale(localeInput ?? null);
  const messages = getMessages(locale);
  if (status === "SETUP_INCOMPLETE") {
    return messages.operator.noteSetupIncomplete;
  }

  if (status === "INSUFFICIENT_DATA") {
    return messages.operator.noteInsufficientData;
  }

  if (status === "NO_ACTION") {
    return messages.operator.noteNoAction;
  }

  if (status === "ACTION_NEEDED") {
    return messages.operator.noteActionNeeded;
  }

  return messages.operator.noteUnknown;
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
      reminderState?: {
        eligible?: unknown;
        sent?: unknown;
        suppressedBy?: unknown;
        repeatedSignalCount?: unknown;
      };
      decisionDetails?: {
        regime?: unknown;
        triggerState?: unknown;
        invalidationState?: unknown;
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
    reminderState?: {
      eligible?: unknown;
      sent?: unknown;
      suppressedBy?: unknown;
      repeatedSignalCount?: unknown;
    };
    decisionDetails?: {
      regime?: unknown;
      triggerState?: unknown;
      invalidationState?: unknown;
    };
  };
}

function getLatestMarketFailureMessage(
  decision: DecisionLogRecord | null,
): string | null {
  const message = getDiagnostics(decision?.context)?.marketData?.message;
  return typeof message === "string" ? message : null;
}

function getLatestDecisionDetail(
  decision: DecisionLogRecord | null,
  key: "regime" | "triggerState" | "invalidationState",
): string | null {
  const value = getDiagnostics(decision?.context)?.decisionDetails?.[key];
  return typeof value === "string" ? value : null;
}

function getLatestReminderFlag(
  decision: DecisionLogRecord | null,
  key: "eligible" | "sent",
): boolean | null {
  const value = getDiagnostics(decision?.context)?.reminderState?.[key];
  return typeof value === "boolean" ? value : null;
}

function getLatestReminderSuppressedBy(
  decision: DecisionLogRecord | null,
): string | null {
  const value = getDiagnostics(decision?.context)?.reminderState?.suppressedBy;
  return typeof value === "string" ? value : null;
}

function getLatestReminderRepeatedSignalCount(
  decision: DecisionLogRecord | null,
): number | null {
  const value = getDiagnostics(decision?.context)?.reminderState?.repeatedSignalCount;
  return typeof value === "number" ? value : null;
}

function formatBoolean(value: boolean | null, locale: SupportedLocale): string {
  if (value === null) {
    return getMessages(locale).booleans.notAvailable;
  }

  return formatAvailability(locale, value);
}
