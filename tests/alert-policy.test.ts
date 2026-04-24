import {
  assessStateUpdateReminder,
  buildActionNeededAlertPlan,
  buildAlertReasonKey,
  buildActionNeededMessage,
  buildStateUpdateReminderPlan,
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
  !message.includes("No trade was executed.") && message.includes("This only updates your record. No trades are executed."),
  "ACTION_NEEDED message should stay record-only without the removed no-execution sentence.",
);
assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "SETUP_INCOMPLETE",
    asset: null,
    summary: "Manual setup is incomplete; waiting for user-reported inputs.",
    nextStep: "Use /setcash and /setposition to finish setup.",
  }).includes("This only updates your record. No trades are executed."),
  "Telegram alert text should preserve the record-only boundary.",
);

const reminderContext = buildDecisionContext({
  userState: {
    ...incompleteSetupState,
    user: {
      ...incompleteSetupState.user,
      trackedAssets: "BTC",
      onboardingComplete: true,
    },
    positions: {
      BTC: {
        id: 20,
        userId: 11,
        asset: "BTC",
        quantity: 0,
        averageEntryPrice: 0,
        reportedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  },
  asset: "BTC",
  marketSnapshot: {
    market: "KRW-BTC",
    asset: "BTC",
    ticker: {
      market: "KRW-BTC",
      tradePrice: 161,
      changeRate: 0,
      fetchedAt: "2026-01-01T01:00:00.000Z",
    },
    timeframes: {
      "1h": { timeframe: "1h", candles: [] },
      "4h": { timeframe: "4h", candles: [] },
      "1d": { timeframe: "1d", candles: [] },
    },
  },
  generatedAt: "2026-01-01T01:00:00.000Z",
});

const reminderDecision = {
  status: "ACTION_NEEDED",
  summary: "BTC structure supports a conservative spot entry review.",
  reasons: ["Regime: pullback in uptrend."],
  alert: {
    reason: "ENTRY_REVIEW_REQUIRED" as const,
    cooldownKey: "entry-review:11:BTC:four-hour-pullback",
    message: "Action needed",
  },
};

const repeatedSignalLog = {
  decisionStatus: "ACTION_NEEDED",
  context: {
    context: {
      accountState: {
        availableCash: 1000000,
        reportedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      positionState: {
        quantity: 0,
        averageEntryPrice: 0,
        reportedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    diagnostics: {
      alertReason: "ENTRY_REVIEW_REQUIRED",
    },
  },
};

const changedStateSignalLog = {
  decisionStatus: "ACTION_NEEDED",
  context: {
    context: {
      accountState: {
        availableCash: 500000,
        reportedAt: "2025-12-31T00:00:00.000Z",
        updatedAt: "2025-12-31T00:00:00.000Z",
      },
      positionState: {
        quantity: 0,
        averageEntryPrice: 0,
        reportedAt: "2025-12-31T00:00:00.000Z",
        updatedAt: "2025-12-31T00:00:00.000Z",
      },
    },
    diagnostics: {
      alertReason: "ENTRY_REVIEW_REQUIRED",
    },
  },
};

const entryReminderAssessment = assessStateUpdateReminder({
  decision: reminderDecision,
  context: reminderContext,
  asset: "BTC",
  recentDecisionLogs: [repeatedSignalLog],
});

assertEqual(
  entryReminderAssessment.reminderEligible,
  true,
  "Repeated identical entry-review signals with unchanged manual state should become reminder-eligible.",
);
assertEqual(
  entryReminderAssessment.repeatedSignalCount,
  2,
  "Reminder eligibility should count the current signal plus the prior repeated signal.",
);

const changedStateAssessment = assessStateUpdateReminder({
  decision: reminderDecision,
  context: reminderContext,
  asset: "BTC",
  recentDecisionLogs: [changedStateSignalLog],
});

assertEqual(
  changedStateAssessment.reminderEligible,
  false,
  "Reminder should stay off when the user-reported state changed since the last repeated signal.",
);
assertEqual(
  changedStateAssessment.stateChangedSinceLastSignal,
  true,
  "Reminder assessment should surface state-change detection explicitly.",
);

const reminderPlan = buildStateUpdateReminderPlan({
  assessment: entryReminderAssessment,
  asset: "BTC",
  nowIso: "2026-01-01T10:00:00.000Z",
  hasChatId: true,
  sleepModeEnabled: false,
  primaryAlertSent: false,
  latestReminderNotification: null,
});

assertEqual(
  reminderPlan.shouldSend,
  true,
  "Eligible reminder assessments should produce a sendable reminder plan.",
);
assert(
  reminderPlan.message?.includes("/setposition") &&
    reminderPlan.message?.includes("/setcash") &&
    !reminderPlan.message?.includes("No trade was executed.") &&
    reminderPlan.message?.includes("This only updates your record. No trades are executed.") &&
    reminderPlan.message?.includes("stored manual state"),
  "Reminder messages should point to manual state update commands without the removed no-execution sentence.",
);

const reminderCooldownPlan = buildStateUpdateReminderPlan({
  assessment: entryReminderAssessment,
  asset: "BTC",
  nowIso: "2026-01-01T12:00:00.000Z",
  hasChatId: true,
  sleepModeEnabled: false,
  primaryAlertSent: false,
  latestReminderNotification: {
    createdAt: "2026-01-01T03:00:00.000Z",
    reasonKey: entryReminderAssessment.reasonKey,
  },
});

assertEqual(
  reminderCooldownPlan.shouldSend,
  false,
  "Reminder cooldown should suppress repeated reminder delivery inside the separate reminder window.",
);
assertEqual(
  reminderCooldownPlan.suppressionReason,
  "cooldown",
  "Reminder cooldown suppression should be explicit.",
);

const sleepReminderPlan = buildStateUpdateReminderPlan({
  assessment: entryReminderAssessment,
  asset: "BTC",
  nowIso: "2026-01-01T10:00:00.000Z",
  hasChatId: true,
  sleepModeEnabled: true,
  primaryAlertSent: false,
  latestReminderNotification: null,
});

assertEqual(
  sleepReminderPlan.suppressionReason,
  "sleep_mode",
  "Sleep mode should suppress reminder delivery as well.",
);

const missingChatReminderPlan = buildStateUpdateReminderPlan({
  assessment: entryReminderAssessment,
  asset: "BTC",
  nowIso: "2026-01-01T10:00:00.000Z",
  hasChatId: false,
  sleepModeEnabled: false,
  primaryAlertSent: false,
  latestReminderNotification: null,
});

assertEqual(
  missingChatReminderPlan.suppressionReason,
  "missing_chat_id",
  "Missing chat id should suppress reminder delivery as well.",
);

const setupReminderAssessment = assessStateUpdateReminder({
  decision: {
    status: "ACTION_NEEDED",
    summary: "Manual setup is incomplete; waiting for user-reported inputs.",
    reasons: ["Missing setup items: cash."],
    alert: {
      reason: "COMPLETE_SETUP" as const,
      cooldownKey: "setup:11",
      message: "Action needed",
    },
  },
  context: reminderContext,
  asset: "BTC",
  recentDecisionLogs: [repeatedSignalLog],
});

assertEqual(
  setupReminderAssessment.reminderEligible,
  false,
  "Setup-incomplete repeats should not be treated as state-update reminder targets.",
);

const marketDataReminderAssessment = assessStateUpdateReminder({
  decision: {
    status: "ACTION_NEEDED",
    summary: "Public market context is unavailable for this cycle.",
    reasons: ["The decision scaffold requires a normalized market snapshot."],
    alert: {
      reason: "MARKET_DATA_UNAVAILABLE" as const,
      cooldownKey: "market-data:11:BTC",
      message: "Action needed",
    },
  },
  context: reminderContext,
  asset: "BTC",
  recentDecisionLogs: [repeatedSignalLog],
});

assertEqual(
  marketDataReminderAssessment.reminderEligible,
  false,
  "Market-data failure repeats should not be treated as state-update reminder targets.",
);

const addBuyReminderAssessment = assessStateUpdateReminder({
  decision: {
    ...reminderDecision,
    alert: {
      reason: "ADD_BUY_REVIEW_REQUIRED" as const,
      cooldownKey: "add-buy-review:11:BTC:four-hour-pullback",
      message: "Action needed",
    },
  },
  context: reminderContext,
  asset: "BTC",
  recentDecisionLogs: [
    {
      ...repeatedSignalLog,
      context: {
        ...repeatedSignalLog.context,
        diagnostics: {
          alertReason: "ADD_BUY_REVIEW_REQUIRED",
        },
      },
    },
  ],
});

assertEqual(
  addBuyReminderAssessment.reminderEligible,
  true,
  "Repeated identical add-buy-review signals with unchanged manual state should become reminder-eligible.",
);

const reduceReminderAssessment = assessStateUpdateReminder({
  decision: {
    ...reminderDecision,
    alert: {
      reason: "REDUCE_REVIEW_REQUIRED" as const,
      cooldownKey: "reduce-review:11:BTC:four-hour-break",
      message: "Action needed",
    },
  },
  context: reminderContext,
  asset: "BTC",
  recentDecisionLogs: [
    {
      ...repeatedSignalLog,
      context: {
        ...repeatedSignalLog.context,
        diagnostics: {
          alertReason: "REDUCE_REVIEW_REQUIRED",
        },
      },
    },
  ],
});

assertEqual(
  reduceReminderAssessment.reminderEligible,
  true,
  "Repeated identical reduce-review signals with unchanged manual state should become reminder-eligible.",
);
