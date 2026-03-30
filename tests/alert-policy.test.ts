import {
  buildActionNeededAlertPlan,
  buildAlertReasonKey,
  buildActionNeededMessage,
  isWithinCooldown,
} from "../src/runtime-alerts.js";
import { buildDecisionContext } from "../src/decision/context.js";
import { runDecisionEngine } from "../src/decision/engine.js";
import { applyTemporaryAlertPolicy } from "../src/decision/temporary-policy.js";
import type { UserStateBundle } from "../src/domain/types.js";
import { buildActionNeededAlertText } from "../src/telegram/commands.js";
import { assert, assertEqual } from "./test-helpers.js";

const incompleteSetupState: UserStateBundle = {
  user: {
    id: 11,
    telegramUserId: "11",
    telegramChatId: "22",
    username: "tester",
    displayName: "Tester",
    trackedAssets: "BTC,ETH",
    sleepModeEnabled: false,
    onboardingComplete: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  accountState: {
    id: 10,
    userId: 11,
    availableCash: 1000000,
    reportedAt: "2026-01-01T00:00:00.000Z",
    source: "USER_REPORTED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  positions: {
    BTC: {
      id: 20,
      userId: 11,
      asset: "BTC",
      quantity: 0.1,
      averageEntryPrice: 100000000,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
};

const incompleteContext = buildDecisionContext({
  userState: incompleteSetupState,
  asset: "BTC",
  marketSnapshot: null,
  generatedAt: "2026-01-01T01:00:00.000Z",
});

const incompleteBaseDecision = runDecisionEngine(incompleteContext);
const incompleteAlertDecision = applyTemporaryAlertPolicy({
  context: incompleteContext,
  baseDecision: incompleteBaseDecision,
  consecutiveMarketFailures: 0,
});

assertEqual(
  incompleteBaseDecision.status,
  "SETUP_INCOMPLETE",
  "Base decision should remain conservative when setup is incomplete.",
);
assertEqual(
  incompleteAlertDecision.status,
  "ACTION_NEEDED",
  "Temporary policy should elevate incomplete setup to ACTION_NEEDED.",
);
assertEqual(
  incompleteAlertDecision.alert?.reason,
  "COMPLETE_SETUP",
  "Incomplete setup should map to the complete-setup alert reason.",
);
assert(
  incompleteAlertDecision.alert?.message.includes("/setcash"),
  "Complete-setup alert text should point to record-only setup commands.",
);

const invalidStateContext = buildDecisionContext({
  userState: {
    ...incompleteSetupState,
    positions: {
      BTC: {
        id: 20,
        userId: 11,
        asset: "BTC",
        quantity: 0,
        averageEntryPrice: 100000000,
        reportedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      ETH: {
        id: 21,
        userId: 11,
        asset: "ETH",
        quantity: 1.5,
        averageEntryPrice: 3500000,
        reportedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  },
  asset: "BTC",
  marketSnapshot: null,
  generatedAt: "2026-01-01T01:00:00.000Z",
});

const invalidStateDecision = runDecisionEngine(invalidStateContext);
const invalidStateAlertDecision = applyTemporaryAlertPolicy({
  context: invalidStateContext,
  baseDecision: invalidStateDecision,
  consecutiveMarketFailures: 0,
});

assertEqual(
  invalidStateAlertDecision.status,
  "ACTION_NEEDED",
  "Invalid recorded state should elevate to ACTION_NEEDED.",
);
assertEqual(
  invalidStateAlertDecision.alert?.reason,
  "INVALID_RECORDED_STATE",
  "Invalid recorded state should map to the invalid-state alert reason.",
);

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
