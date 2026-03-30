import { shouldSkipDecisionLog } from "../src/hourly.js";
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
