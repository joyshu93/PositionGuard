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

assert(completeContext.setup.isComplete, "Decision context should mark complete setup.");
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
  !incompleteContext.setup.isComplete,
  "Decision context should mark setup incomplete when position data is missing.",
);
assertEqual(
  incompleteContext.positionState ?? null,
  null,
  "Decision context should not invent a missing position state.",
);
