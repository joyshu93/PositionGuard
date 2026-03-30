import {
  getConsecutiveMarketFailureCount,
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
