import {
  getConsecutiveMarketFailureCount,
  buildHourlyDiagnostics,
  shouldRecordSuppressedNotification,
  shouldSkipDecisionLog,
} from "../src/hourly.js";
import { buildDecisionContext } from "../src/decision/context.js";
import { buildStrategyInputsFromState } from "../src/decision/strategy-core.js";
import { classifyPositionTransition } from "../src/db/position-state.js";
import {
  assessStateUpdateReminder,
  buildManualStateSnapshot,
  buildStateUpdateReminderPlan,
} from "../src/runtime-alerts.js";
import {
  filterAssetScopedRecordsOnOrAfterStrategyReset,
  filterRecordsOnOrAfterStrategyReset,
  takeLatestRecordOnOrAfterStrategyReset,
} from "../src/decision/strategy-memory.js";
import type { UserStateBundle } from "../src/domain/types.js";
import type { DecisionLogRecord } from "../src/types/persistence.js";
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
    reminderState: {
      eligible: false,
      sent: false,
      reasonKey: null,
      cooldownUntil: null,
      suppressedBy: null,
      repeatedSignalCount: 0,
      stateChangedSinceLastSignal: null,
      signalReason: null,
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
    reminderState: {
      eligible: true,
      sent: false,
      reasonKey: "state-update-reminder:1:btc:entry",
      cooldownUntil: "2026-01-01T12:00:00.000Z",
      suppressedBy: "cooldown",
      repeatedSignalCount: 2,
      stateChangedSinceLastSignal: false,
      signalReason: "ENTRY_REVIEW_REQUIRED",
    },
  }).notification.cooldownUntil,
  "2026-01-01T06:00:00.000Z",
  "Hourly diagnostics should expose notification cooldown timing.",
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
      status: "ACTION_NEEDED",
      summary: "BTC structure supports a conservative spot entry review.",
      reasons: [],
      actionable: true,
      symbol: "KRW-BTC",
      generatedAt: "2026-01-01T00:00:00.000Z",
      alert: {
        reason: "ENTRY_REVIEW_REQUIRED",
        cooldownKey: "entry-review:1:BTC:balanced-range",
        message: "Action needed",
      },
    },
    finalDecision: {
      status: "ACTION_NEEDED",
      summary: "BTC structure supports a conservative spot entry review.",
      reasons: [],
      actionable: true,
      symbol: "KRW-BTC",
      generatedAt: "2026-01-01T00:00:00.000Z",
      alert: {
        reason: "ENTRY_REVIEW_REQUIRED",
        cooldownKey: "entry-review:1:BTC:balanced-range",
        message: "Action needed",
      },
    },
    marketResult: {
      ok: true,
    },
    consecutiveMarketFailures: 0,
    notificationEligible: true,
    notificationState: {
      sent: false,
      reasonKey: "entry-review:1:BTC:balanced-range",
      suppressedBy: "cooldown",
      cooldownUntil: "2026-01-01T06:00:00.000Z",
    },
    reminderState: {
      eligible: true,
      sent: false,
      reasonKey: "state-update-reminder:1:btc:entry-review-required",
      cooldownUntil: "2026-01-01T12:00:00.000Z",
      suppressedBy: "cooldown",
      repeatedSignalCount: 2,
      stateChangedSinceLastSignal: false,
      signalReason: "ENTRY_REVIEW_REQUIRED",
    },
  }).reminderState.repeatedSignalCount,
  2,
  "Hourly diagnostics should expose repeated-signal reminder state without conflicting with market notification diagnostics.",
);

const reminderUserState: UserStateBundle = {
  user: {
    id: 1,
    telegramUserId: "123",
    telegramChatId: "456",
    username: "tester",
    displayName: "Test User",
    trackedAssets: "BTC",
    sleepModeEnabled: false,
    onboardingComplete: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  accountState: {
    id: 10,
    userId: 1,
    availableCash: 1000000,
    reportedAt: "2026-01-01T01:00:00.000Z",
    source: "USER_REPORTED",
    createdAt: "2026-01-01T01:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
  },
  positions: {
    BTC: {
      id: 20,
      userId: 1,
      asset: "BTC",
      quantity: 0.25,
      averageEntryPrice: 150,
      reportedAt: "2026-01-01T01:00:00.000Z",
      createdAt: "2026-01-01T01:00:00.000Z",
      updatedAt: "2026-01-01T01:00:00.000Z",
    },
  },
};

const reminderContext = buildDecisionContext({
  userState: reminderUserState,
  asset: "BTC",
  marketSnapshot: null,
  generatedAt: "2026-01-01T02:00:00.000Z",
});

const reminderAssessment = assessStateUpdateReminder({
  decision: {
    status: "ACTION_NEEDED",
    summary: "BTC structure supports a conservative spot entry review.",
    reasons: ["Constructive structure remains intact."],
    alert: {
      reason: "ENTRY_REVIEW_REQUIRED",
      cooldownKey: "entry-review:1:BTC:balanced-range",
      message: "Action needed",
    },
  },
  context: reminderContext,
  asset: "BTC",
  recentDecisionLogs: [
    {
      decisionStatus: "ACTION_NEEDED",
      context: {
        context: {
          accountState: reminderContext.accountState,
          positionState: reminderContext.positionState,
        },
        diagnostics: {
          alertReason: "ENTRY_REVIEW_REQUIRED",
        },
      },
    },
  ],
});

assertEqual(
  reminderAssessment.repeatedSignalCount,
  2,
  "Reminder assessment should count the current signal plus the immediately prior matching signal.",
);
assertEqual(
  reminderAssessment.stateChangedSinceLastSignal,
  false,
  "Reminder assessment should detect unchanged manual state across repeated signals.",
);
assertEqual(
  reminderAssessment.reminderEligible,
  true,
  "Reminder assessment should mark repeated unchanged signals as eligible for a state-update reminder.",
);
assertEqual(
  reminderAssessment.reasonKey,
  "state-update-reminder-1-btc-entry-review-required",
  "Reminder assessment should produce a stable reminder reason key.",
);

const reminderPlan = buildStateUpdateReminderPlan({
  assessment: reminderAssessment,
  asset: "BTC",
  locale: "en",
  nowIso: "2026-01-01T02:00:00.000Z",
  hasChatId: true,
  sleepModeEnabled: false,
  primaryAlertSent: false,
  latestReminderNotification: null,
});

assertEqual(
  reminderPlan.shouldSend,
  true,
  "Eligible repeated signals should produce a sendable reminder plan when delivery is allowed.",
);
assertEqual(
  reminderPlan.suppressionReason,
  null,
  "Sendable reminder plans should not carry a suppression reason.",
);
assertEqual(
  buildManualStateSnapshot({
    accountState: reminderContext.accountState,
    positionState: reminderContext.positionState,
  }).quantity,
  0.25,
  "Manual-state snapshots should preserve the stored position quantity used by reminder memory.",
);

assertEqual(
  classifyPositionTransition(null, { quantity: 0 }),
  null,
  "Zero-to-zero manual records should not fabricate a position transition event.",
);
assertEqual(
  classifyPositionTransition(null, { quantity: 0.1 }),
  "ENTRY",
  "Zero-to-positive manual records should be classified as a fresh entry.",
);
assertEqual(
  classifyPositionTransition(
    { quantity: 0.2 } as never,
    { quantity: 0 },
  ),
  "EXIT",
  "Positive-to-zero manual records should be classified as a full exit.",
);
assertEqual(
  classifyPositionTransition(
    { quantity: 0.2 } as never,
    { quantity: 0.3 },
  ),
  "ADD",
  "Growing manual inventory should be classified as an add.",
);
assertEqual(
  classifyPositionTransition(
    { quantity: 0.3 } as never,
    { quantity: 0.1 },
  ),
  "REDUCE",
  "Shrinking manual inventory without going flat should be classified as a reduce.",
);

const deferredStrategyLog: DecisionLogRecord = {
  id: 50,
  userId: 1,
  asset: "BTC",
  symbol: "KRW-BTC",
  decisionStatus: "NO_ACTION",
  summary: "BTC entry review is justified, but confirmation is deferred to the next hourly repeat.",
  reasons: [],
  actionable: false,
  notificationEmitted: false,
  context: {
    strategySnapshot: {
      action: "ENTRY",
      executionDisposition: "DEFERRED_CONFIRMATION",
      referencePrice: 150,
      signalQuality: {
        score: 6,
        bucket: "MEDIUM",
        confirmationRequired: true,
        confirmationSatisfied: false,
        reentryPenaltyApplied: false,
      },
      entryPath: "RECLAIM",
      qualityBucket: "MEDIUM",
      createdAt: "2026-01-01T01:00:00.000Z",
    },
  },
  createdAt: "2026-01-01T01:00:00.000Z",
};

const strategyInputsWithoutManualExit = buildStrategyInputsFromState({
  userState: {
    ...reminderUserState,
    positions: {
      BTC: {
        ...reminderUserState.positions.BTC!,
        quantity: 0,
        averageEntryPrice: 0,
      },
    },
  },
  asset: "BTC",
  marketSnapshots: {
    BTC: null,
    ETH: null,
  },
  recentDecisionLogs: [deferredStrategyLog],
  generatedAt: "2026-01-01T02:00:00.000Z",
});

assertEqual(
  strategyInputsWithoutManualExit.latestDecision?.executionDisposition ?? null,
  "DEFERRED_CONFIRMATION",
  "Strategy inputs should still recover the latest deferred confirmation snapshot from the latest decision log.",
);
assertEqual(
  strategyInputsWithoutManualExit.recentExit.createdAt,
  null,
  "Decision logs alone should no longer fabricate a recent-exit memory when no manual exit transition was recorded.",
);

const strategyInputsWithManualExit = buildStrategyInputsFromState({
  userState: {
    ...reminderUserState,
    positions: {
      BTC: {
        ...reminderUserState.positions.BTC!,
        quantity: 0,
        averageEntryPrice: 0,
      },
    },
  },
  asset: "BTC",
  marketSnapshots: {
    BTC: null,
    ETH: null,
  },
  recentDecisionLogs: [deferredStrategyLog],
  latestManualExit: {
    createdAt: "2026-01-01T01:30:00.000Z",
  },
  generatedAt: "2026-01-01T02:00:00.000Z",
});

assertEqual(
  strategyInputsWithManualExit.recentExit.createdAt,
  "2026-01-01T01:30:00.000Z",
  "Explicit manual exit memory should become the source of truth for recent-exit timing.",
);
assertEqual(
  strategyInputsWithManualExit.recentExit.hoursSinceExit,
  0.5,
  "Recent-exit timing should be computed from the recorded manual exit transition.",
);

assertEqual(
  filterRecordsOnOrAfterStrategyReset(
    [
      { createdAt: "2026-01-01T00:00:00.000Z", value: 1 },
      { createdAt: "2026-01-01T02:00:00.000Z", value: 2 },
    ],
    "2026-01-01T01:00:00.000Z",
  ).length,
  1,
  "Strategy-memory reset filtering should drop records older than the reset marker.",
);

assertEqual(
  takeLatestRecordOnOrAfterStrategyReset(
    { createdAt: "2026-01-01T00:30:00.000Z", value: 1 },
    "2026-01-01T01:00:00.000Z",
  ),
  null,
  "Latest-record reset filtering should ignore stale memory older than the reset marker.",
);

const resetScopedNotifications = filterAssetScopedRecordsOnOrAfterStrategyReset(
  [
    { asset: "BTC" as const, createdAt: "2026-01-01T00:00:00.000Z", reasonKey: "btc-old" },
    { asset: "BTC" as const, createdAt: "2026-01-01T02:00:00.000Z", reasonKey: "btc-new" },
    { asset: "ETH" as const, createdAt: "2026-01-01T00:00:00.000Z", reasonKey: "eth-old" },
    { asset: null, createdAt: "2026-01-01T00:00:00.000Z", reasonKey: "setup" },
  ],
  {
    BTC: "2026-01-01T01:00:00.000Z",
    ETH: null,
  },
);

assertEqual(
  resetScopedNotifications.length,
  3,
  "Asset-scoped reset filtering should only drop stale records for the reset asset while keeping global records.",
);
