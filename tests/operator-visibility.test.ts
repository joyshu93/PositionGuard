import {
  buildHourlyHealthView,
  buildLastDecisionView,
  renderHourlyHealthMessage,
  renderLastDecisionMessage,
} from "../src/operator-visibility.js";
import type {
  DecisionLogRecord,
  NotificationEventRecord,
} from "../src/types/persistence.js";
import { assert, assertEqual } from "./test-helpers.js";

const cooldownDecision: DecisionLogRecord = {
  id: 1,
  userId: 10,
  asset: "BTC",
  symbol: "KRW-BTC",
  decisionStatus: "ACTION_NEEDED",
  summary: "Manual setup is incomplete.",
  reasons: ["Missing setup items: cash."],
  actionable: true,
  notificationEmitted: false,
  context: {
    diagnostics: {
      marketData: {
        ok: true,
      },
      notificationState: {
        sent: false,
        suppressedBy: "cooldown",
      },
      decisionDetails: {
        regime: "PULLBACK_IN_UPTREND",
        triggerState: "CONFIRMED",
        invalidationState: "CLEAR",
      },
    },
  },
  createdAt: "2026-01-01T03:00:00.000Z",
};

const marketFailureDecision: DecisionLogRecord = {
  id: 2,
  userId: 10,
  asset: "ETH",
  symbol: "KRW-ETH",
  decisionStatus: "INSUFFICIENT_DATA",
  summary: "Public market context is unavailable for this cycle.",
  reasons: ["The decision scaffold requires a normalized market snapshot."],
  actionable: false,
  notificationEmitted: false,
  context: {
    diagnostics: {
      marketData: {
        ok: false,
        reason: "FETCH_FAILURE",
        message: "Timeout while calling Upbit.",
      },
      notificationState: {
        sent: false,
        suppressedBy: null,
      },
      decisionDetails: {
        regime: "BREAKDOWN_RISK",
        triggerState: "RISK_OFF",
        invalidationState: "BROKEN",
      },
    },
  },
  createdAt: "2026-01-01T02:00:00.000Z",
};

const setupBlockedDecision: DecisionLogRecord = {
  id: 3,
  userId: 10,
  asset: "BTC",
  symbol: "KRW-BTC",
  decisionStatus: "SETUP_INCOMPLETE",
  summary: "Manual setup is incomplete; waiting for user-reported inputs.",
  reasons: ["Missing setup items: BTC position."],
  actionable: false,
  notificationEmitted: false,
  context: {
    diagnostics: {
      marketData: {
        ok: true,
      },
      notificationState: {
        sent: false,
        suppressedBy: null,
      },
      decisionDetails: {
        regime: null,
        triggerState: null,
        invalidationState: null,
      },
    },
  },
  createdAt: "2026-01-01T01:00:00.000Z",
};

const notificationEvents: NotificationEventRecord[] = [
  {
    id: 1,
    userId: 10,
    decisionLogId: null,
    asset: "BTC",
    reasonKey: "setup:10",
    deliveryStatus: "SKIPPED",
    eventType: "ACTION_NEEDED",
    channel: "telegram",
    payload: null,
    sentAt: null,
    cooldownUntil: "2026-01-01T09:00:00.000Z",
    suppressedBy: "cooldown",
    createdAt: "2026-01-01T03:00:00.000Z",
  },
  {
    id: 2,
    userId: 10,
    decisionLogId: null,
    asset: "BTC",
    reasonKey: "setup:10",
    deliveryStatus: "SKIPPED",
    eventType: "ACTION_NEEDED",
    channel: "telegram",
    payload: null,
    sentAt: null,
    cooldownUntil: "2026-01-01T09:00:00.000Z",
    suppressedBy: "sleep_mode",
    createdAt: "2026-01-01T02:30:00.000Z",
  },
];

const lastDecisionView = buildLastDecisionView(cooldownDecision);
assertEqual(
  lastDecisionView?.alertOutcome ?? null,
  "skipped",
  "Last decision view should surface skipped alert outcomes.",
);
assertEqual(
  lastDecisionView?.suppressionReason ?? null,
  "cooldown",
  "Last decision view should preserve suppression reason visibility.",
);
assertEqual(
  lastDecisionView?.regime ?? null,
  "PULLBACK_IN_UPTREND",
  "Last decision view should expose the latest regime.",
);
assert(
  renderLastDecisionMessage(lastDecisionView).includes("Verdict: action needed") &&
    renderLastDecisionMessage(lastDecisionView).includes("Alert: skipped (cooldown)") &&
    renderLastDecisionMessage(lastDecisionView).includes("Regime: PULLBACK_IN_UPTREND | Trigger: CONFIRMED | Invalidation: CLEAR") &&
    renderLastDecisionMessage(lastDecisionView).includes("Note: operator follow-up is required"),
  "Rendered last-decision message should explain the verdict and cooldown skip.",
);

const hourlyHealthView = buildHourlyHealthView({
  decisions: [cooldownDecision, marketFailureDecision, setupBlockedDecision],
  notifications: notificationEvents,
});

assertEqual(
  hourlyHealthView.recentMarketFailureCount,
  1,
  "Hourly health should count recent market-data failures.",
);
assertEqual(
  hourlyHealthView.recentCooldownSkipCount,
  1,
  "Hourly health should count recent cooldown skips.",
);
assertEqual(
  hourlyHealthView.recentSleepSuppressionCount,
  1,
  "Hourly health should count recent sleep suppressions.",
);
assertEqual(
  hourlyHealthView.recentSetupBlockedCount,
  1,
  "Hourly health should count recent setup-blocked cycles.",
);
assert(
  renderHourlyHealthMessage(hourlyHealthView).includes("Latest verdict: action needed") &&
    renderHourlyHealthMessage(hourlyHealthView).includes("Latest structure: regime PULLBACK_IN_UPTREND | trigger CONFIRMED | invalidation CLEAR") &&
    renderHourlyHealthMessage(hourlyHealthView).includes("Latest market issue: Timeout while calling Upbit."),
  "Rendered hourly health should surface the latest verdict and market-data issue.",
);
