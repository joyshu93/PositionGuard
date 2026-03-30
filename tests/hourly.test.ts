import {
  getConsecutiveMarketFailureCount,
  buildHourlyDiagnostics,
  shouldRecordSuppressedNotification,
  shouldSkipDecisionLog,
} from "../src/hourly.js";
import { assertEqual } from "./test-helpers.js";

assertEqual(
  shouldSkipDecisionLog(
    {
      decisionStatus: "NO_ACTION",
      summary: "No action is produced in the scaffold stage.",
      createdAt: "2026-01-01T00:15:00.000Z",
    },
    "NO_ACTION",
    "No action is produced in the scaffold stage.",
    "2026-01-01T00:45:00.000Z",
  ),
  true,
  "Hourly cycle should skip duplicate recent decision logs.",
);

assertEqual(
  shouldSkipDecisionLog(
    {
      decisionStatus: "NO_ACTION",
      summary: "No action is produced in the scaffold stage.",
      createdAt: "2026-01-01T00:15:00.000Z",
    },
    "INSUFFICIENT_DATA",
    "Public market context is unavailable for this cycle.",
    "2026-01-01T00:45:00.000Z",
  ),
  false,
  "Hourly cycle should keep logs when the status changes.",
);

assertEqual(
  getConsecutiveMarketFailureCount(
    {
      ok: false,
      reason: "FETCH_FAILURE",
      message: "Timed out",
    },
    [
      {
        decisionStatus: "ACTION_NEEDED",
        context: {
          diagnostics: {
            marketData: {
              ok: false,
            },
          },
        },
      },
      {
        decisionStatus: "INSUFFICIENT_DATA",
        context: {
          diagnostics: {
            marketData: {
              ok: false,
            },
          },
        },
      },
      {
        decisionStatus: "NO_ACTION",
        context: {
          diagnostics: {
            marketData: {
              ok: true,
            },
          },
        },
      },
    ],
  ),
  3,
  "Hourly cycle should count the current market failure plus consecutive prior market failures.",
);

assertEqual(
  shouldRecordSuppressedNotification(
    {
      createdAt: "2026-01-01T03:00:00.000Z",
      cooldownUntil: "2026-01-01T09:00:00.000Z",
    },
    "2026-01-01T04:00:00.000Z",
  ),
  false,
  "Hourly cycle should avoid repeated skipped notification writes inside the cooldown window.",
);

assertEqual(
  buildHourlyDiagnostics({
    context: {
      setup: {
        isReady: false,
        missingItems: ["cash", "BTC position"],
      },
    } as never,
    baseDecision: {
      status: "SETUP_INCOMPLETE",
      summary: "Manual setup is incomplete; waiting for user-reported inputs.",
      reasons: [],
      actionable: false,
      symbol: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
      alert: null,
    },
    finalDecision: {
      status: "SETUP_INCOMPLETE",
      summary: "Manual setup is incomplete; waiting for user-reported inputs.",
      reasons: [],
      actionable: false,
      symbol: null,
      generatedAt: "2026-01-01T00:00:00.000Z",
      alert: null,
    },
    marketResult: {
      ok: false,
      reason: "FETCH_FAILURE",
      message: "Timed out",
    },
    consecutiveMarketFailures: 3,
    notificationEligible: false,
    notificationState: {
      sent: false,
      reasonKey: null,
      suppressedBy: null,
      cooldownUntil: null,
    },
  }).cycleOutcome,
  "SETUP_INCOMPLETE",
  "Hourly diagnostics should label incomplete setup cycles explicitly.",
);

assertEqual(
  buildHourlyDiagnostics({
    context: {
      setup: {
        isReady: true,
        missingItems: [],
      },
    } as never,
    baseDecision: {
      status: "NO_ACTION",
      summary: "No action is produced in the scaffold stage.",
      reasons: [],
      actionable: false,
      symbol: "KRW-BTC",
      generatedAt: "2026-01-01T00:00:00.000Z",
      alert: null,
    },
    finalDecision: {
      status: "ACTION_NEEDED",
      summary: "Action needed: complete manual setup for cash, BTC position.",
      reasons: [],
      actionable: true,
      symbol: "KRW-BTC",
      generatedAt: "2026-01-01T00:00:00.000Z",
      alert: {
        reason: "COMPLETE_SETUP",
        cooldownKey: "setup:1",
        message: "Action needed",
      },
    },
    marketResult: {
      ok: false,
      reason: "FETCH_FAILURE",
      message: "Timed out",
    },
    consecutiveMarketFailures: 3,
    notificationEligible: true,
    notificationState: {
      sent: false,
      reasonKey: "setup-1",
      suppressedBy: "cooldown",
      cooldownUntil: "2026-01-01T06:00:00.000Z",
    },
  }).notification.cooldownUntil,
  "2026-01-01T06:00:00.000Z",
  "Hourly diagnostics should expose notification cooldown timing.",
);
