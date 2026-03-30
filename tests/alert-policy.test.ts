import {
  buildActionNeededAlertPlan,
  buildAlertReasonKey,
  buildActionNeededMessage,
  isWithinCooldown,
} from "../src/runtime-alerts.js";
import { buildActionNeededAlertText } from "../src/telegram/commands.js";
import { assert, assertEqual } from "./test-helpers.js";

const sleepModePlan = buildActionNeededAlertPlan({
  decision: {
    status: "ACTION_NEEDED",
    summary: "Manual setup is incomplete; waiting for user-reported inputs.",
    reasons: ["Missing setup items: cash, BTC position, ETH position."],
  },
  asset: "BTC",
  market: "KRW-BTC",
  nowIso: "2026-01-01T03:00:00.000Z",
  hasChatId: true,
  sleepModeEnabled: true,
  latestNotification: null,
});

assertEqual(
  sleepModePlan.shouldSend,
  false,
  "Sleep mode should suppress ACTION_NEEDED alerts.",
);
assertEqual(
  sleepModePlan.suppressionReason,
  "sleep_mode",
  "Sleep mode suppression should be reported explicitly.",
);

const cooldownPlan = buildActionNeededAlertPlan({
  decision: {
    status: "ACTION_NEEDED",
    summary: "Public market context is unavailable for this cycle.",
    reasons: ["The decision scaffold requires a normalized market snapshot."],
  },
  asset: "ETH",
  market: "KRW-ETH",
  nowIso: "2026-01-01T06:00:00.000Z",
  hasChatId: true,
  sleepModeEnabled: false,
  latestNotification: {
    createdAt: "2026-01-01T03:30:00.000Z",
    reasonKey: buildAlertReasonKey({
      asset: "ETH",
      market: "KRW-ETH",
      summary: "Public market context is unavailable for this cycle.",
      reasons: ["The decision scaffold requires a normalized market snapshot."],
    }),
  },
});

assertEqual(
  cooldownPlan.shouldSend,
  false,
  "Repeated ACTION_NEEDED alerts inside the cooldown window should be suppressed.",
);
assertEqual(
  cooldownPlan.suppressionReason,
  "cooldown",
  "Cooldown suppression should be reported explicitly.",
);
assert(
  isWithinCooldown("2026-01-01T03:30:00.000Z", "2026-01-01T06:00:00.000Z"),
  "Cooldown helper should recognize the configured alert window.",
);

const freshPlan = buildActionNeededAlertPlan({
  decision: {
    status: "ACTION_NEEDED",
    summary: "Manual setup is incomplete; waiting for user-reported inputs.",
    reasons: ["Missing setup items: cash."],
  },
  asset: "BTC",
  market: "KRW-BTC",
  nowIso: "2026-01-01T10:00:00.000Z",
  hasChatId: true,
  sleepModeEnabled: false,
  latestNotification: {
    createdAt: "2026-01-01T00:00:00.000Z",
    reasonKey: "stale-reason-key",
  },
});

assertEqual(
  freshPlan.shouldSend,
  true,
  "A stale alert record should not block a fresh ACTION_NEEDED notification.",
);

const message = buildActionNeededMessage({
  asset: "BTC",
  market: "KRW-BTC",
  summary: "Manual setup is incomplete; waiting for user-reported inputs.",
  reasons: ["Missing setup items: cash, BTC position, ETH position."],
});

assert(
  message.includes("No trade was executed."),
  "ACTION_NEEDED message should stay record-only.",
);
assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "SETUP_INCOMPLETE",
    asset: null,
    summary: "Manual setup is incomplete; waiting for user-reported inputs.",
    nextStep: "Use /setcash and /setposition to finish setup.",
  }).includes("record-only guidance"),
  "Telegram alert text should preserve the record-only boundary.",
);
