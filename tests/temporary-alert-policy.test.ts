import { buildDecisionContext } from "../src/decision/context.js";
import { applyTemporaryAlertPolicy } from "../src/decision/temporary-policy.js";
import type { DecisionResult, UserStateBundle } from "../src/domain/types.js";
import { assert, assertEqual } from "./test-helpers.js";

const baseUserState: UserStateBundle = {
  user: {
    id: 1,
    telegramUserId: "123",
    telegramChatId: "456",
    username: "tester",
    displayName: "Test User",
    trackedAssets: "BTC,ETH",
    sleepModeEnabled: false,
    onboardingComplete: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  accountState: {
    id: 10,
    userId: 1,
    availableCash: 1000000,
    reportedAt: "2026-01-01T00:00:00.000Z",
    source: "USER_REPORTED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  positions: {
    BTC: {
      id: 20,
      userId: 1,
      asset: "BTC",
      quantity: 0.25,
      averageEntryPrice: 95000000,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ETH: {
      id: 21,
      userId: 1,
      asset: "ETH",
      quantity: 1.2,
      averageEntryPrice: 3500000,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
};

function createBaseDecision(
  status: DecisionResult["status"],
  summary: string,
): DecisionResult {
  return {
    status,
    summary,
    reasons: [summary],
    actionable: false,
    symbol: "KRW-BTC",
    generatedAt: "2026-01-01T01:00:00.000Z",
    alert: null,
  };
}

const incompleteSetupDecision = applyTemporaryAlertPolicy({
  context: buildDecisionContext({
    userState: {
      ...baseUserState,
      positions: baseUserState.positions.BTC
        ? {
            BTC: baseUserState.positions.BTC,
          }
        : {},
    },
    asset: "BTC",
    marketSnapshot: null,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
  baseDecision: createBaseDecision(
    "SETUP_INCOMPLETE",
    "Manual setup is incomplete; waiting for user-reported inputs.",
  ),
  consecutiveMarketFailures: 0,
});

assertEqual(
  incompleteSetupDecision.status,
  "ACTION_NEEDED",
  "Temporary policy should elevate incomplete setup into ACTION_NEEDED.",
);
assertEqual(
  incompleteSetupDecision.alert?.reason ?? null,
  "COMPLETE_SETUP",
  "Temporary policy should classify incomplete setup alerts explicitly.",
);

const invalidStateDecision = applyTemporaryAlertPolicy({
  context: buildDecisionContext({
    userState: {
      ...baseUserState,
      positions: {
        ...baseUserState.positions,
        BTC: {
          ...baseUserState.positions.BTC!,
          quantity: 0,
          averageEntryPrice: 95000000,
        },
      },
    },
    asset: "BTC",
    marketSnapshot: null,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
  baseDecision: createBaseDecision(
    "NO_ACTION",
    "No action is produced in the scaffold stage.",
  ),
  consecutiveMarketFailures: 0,
});

assertEqual(
  invalidStateDecision.status,
  "ACTION_NEEDED",
  "Temporary policy should elevate contradictory stored state into ACTION_NEEDED.",
);
assertEqual(
  invalidStateDecision.alert?.reason ?? null,
  "INVALID_RECORDED_STATE",
  "Temporary policy should mark contradictory stored state clearly.",
);

const marketUnavailableDecision = applyTemporaryAlertPolicy({
  context: buildDecisionContext({
    userState: baseUserState,
    asset: "BTC",
    marketSnapshot: null,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
  baseDecision: createBaseDecision(
    "INSUFFICIENT_DATA",
    "Public market context is unavailable for this cycle.",
  ),
  consecutiveMarketFailures: 3,
});

assertEqual(
  marketUnavailableDecision.status,
  "ACTION_NEEDED",
  "Temporary policy should elevate repeated market snapshot failures for an existing position.",
);
assertEqual(
  marketUnavailableDecision.alert?.reason ?? null,
  "MARKET_DATA_UNAVAILABLE",
  "Temporary policy should classify repeated market-data failures explicitly.",
);
assert(
  !(marketUnavailableDecision.alert?.message.includes("No trade was executed.") ?? false),
  "Temporary market-data alerts should no longer append the removed no-execution sentence.",
);
