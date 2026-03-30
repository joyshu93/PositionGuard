import { buildDecisionContext } from "../src/decision/context.js";
import type { MarketSnapshot, UserStateBundle } from "../src/domain/types";
import { assert, assertEqual } from "./test-helpers.js";

const userState: UserStateBundle = {
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
      quantity: 0.1,
      averageEntryPrice: 100000000,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ETH: {
      id: 21,
      userId: 1,
      asset: "ETH",
      quantity: 1.5,
      averageEntryPrice: 3500000,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
};

const marketSnapshot: MarketSnapshot = {
  market: "KRW-BTC",
  asset: "BTC",
  ticker: {
    market: "KRW-BTC",
    tradePrice: 101000000,
    changeRate: 0.02,
    fetchedAt: "2026-01-01T01:00:00.000Z",
  },
  timeframes: {
    "1h": { timeframe: "1h", candles: [] },
    "4h": { timeframe: "4h", candles: [] },
    "1d": { timeframe: "1d", candles: [] },
  },
};

const completeContext = buildDecisionContext({
  userState,
  asset: "BTC",
  marketSnapshot,
  generatedAt: "2026-01-01T01:00:00.000Z",
});

assert(completeContext.setup.isReady, "Decision context should mark ready setup.");
assertEqual(
  completeContext.positionState?.asset ?? null,
  "BTC",
  "Decision context should retain the requested asset position.",
);
assertEqual(
  completeContext.marketSnapshot?.market ?? null,
  "KRW-BTC",
  "Decision context should include the market snapshot.",
);

assertEqual(
  completeContext.setup.missingItems.length,
  0,
  "Decision context should not report missing items for ready setup.",
);
assertEqual(
  completeContext.setup.trackedAssets.join(","),
  "BTC,ETH",
  "Decision context should preserve the user's tracked asset preference.",
);

const incompleteContext = buildDecisionContext({
  userState: {
    ...userState,
    positions: {},
  },
  asset: "ETH",
  marketSnapshot: null,
  generatedAt: "2026-01-01T01:00:00.000Z",
});

assert(
  !incompleteContext.setup.isReady,
  "Decision context should mark setup incomplete when tracked positions are missing.",
);
assertEqual(
  incompleteContext.positionState ?? null,
  null,
  "Decision context should not invent a missing position state.",
);
assert(
  incompleteContext.setup.missingItems.includes("BTC position"),
  "Decision context should report missing BTC position when none is tracked.",
);
assert(
  incompleteContext.setup.missingItems.includes("ETH position"),
  "Decision context should report missing ETH position when none is tracked.",
);
