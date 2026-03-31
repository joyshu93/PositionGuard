import { buildDecisionContext } from "../src/decision/context.js";
import { runDecisionEngine } from "../src/decision/engine.js";
import type {
  MarketCandle,
  MarketSnapshot,
  SupportedAsset,
  SupportedMarket,
  SupportedTimeframe,
  UserStateBundle,
} from "../src/domain/types.js";
import { assert, assertEqual } from "./test-helpers.js";

const baseUserState: UserStateBundle = {
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
      averageEntryPrice: 100,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
};

const setupIncomplete = runDecisionEngine(
  buildDecisionContext({
    userState: {
      ...baseUserState,
      accountState: null,
    },
    asset: "BTC",
    marketSnapshot: null,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  setupIncomplete.status,
  "SETUP_INCOMPLETE",
  "Decision engine should preserve the setup-incomplete boundary.",
);

const insufficientData = runDecisionEngine(
  buildDecisionContext({
    userState: baseUserState,
    asset: "BTC",
    marketSnapshot: null,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  insufficientData.status,
  "INSUFFICIENT_DATA",
  "Missing normalized market data should remain a distinct status.",
);

const entryReviewDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      tradePrice: 99,
      oneHourCloses: [101, 102, 103, 102, 101, 100],
      fourHourCloses: [95, 97, 99, 100, 101, 102],
      oneDayCloses: [90, 93, 96, 98, 100, 102, 104],
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  entryReviewDecision.status,
  "ACTION_NEEDED",
  "No-position setups with cash and constructive pullback structure should open an entry review.",
);
assertEqual(
  entryReviewDecision.alert?.reason ?? null,
  "ENTRY_REVIEW_REQUIRED",
  "Entry-review setups should use the explicit entry-review alert reason.",
);
assert(
  entryReviewDecision.summary.includes("spot entry review"),
  "Entry-review summaries should remain coaching-oriented and non-execution based.",
);

const noPositionChaseDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      tradePrice: 105,
      oneHourCloses: [100, 101, 102, 103, 104, 105],
      fourHourCloses: [96, 98, 100, 102, 103, 104],
      oneDayCloses: [90, 93, 96, 99, 101, 103, 104],
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  noPositionChaseDecision.status,
  "NO_ACTION",
  "No-position setups should stay quiet when price is already extended into the upper range.",
);
assert(
  noPositionChaseDecision.summary.includes("not justified right now"),
  "Chase conditions should be described as a rejected entry review, not as an execution instruction.",
);

const addBuyDecision = runDecisionEngine(
  buildDecisionContext({
    userState: baseUserState,
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      tradePrice: 100,
      oneHourCloses: [102, 103, 104, 103, 102, 101],
      fourHourCloses: [95, 97, 99, 101, 103, 104],
      oneDayCloses: [90, 93, 96, 99, 102, 104, 106],
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  addBuyDecision.status,
  "ACTION_NEEDED",
  "Existing positions with cash and constructive pullback structure should open an add-buy review.",
);
assertEqual(
  addBuyDecision.alert?.reason ?? null,
  "ADD_BUY_REVIEW_REQUIRED",
  "Add-buy review setups should use the explicit add-buy alert reason.",
);
assert(
  addBuyDecision.summary.includes("add-buy review"),
  "Add-buy review summaries should stay explicit while remaining non-execution oriented.",
);

const reduceReviewDecision = runDecisionEngine(
  buildDecisionContext({
    userState: baseUserState,
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      tradePrice: 86,
      oneHourCloses: [87, 86, 85, 84, 83, 82],
      fourHourCloses: [98, 97, 96, 95, 92, 88],
      oneDayCloses: [100, 98, 96, 94, 92, 89, 87],
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  reduceReviewDecision.status,
  "ACTION_NEEDED",
  "Weakening structure should escalate to a reduce review for existing spot inventory.",
);
assertEqual(
  reduceReviewDecision.alert?.reason ?? null,
  "REDUCE_REVIEW_REQUIRED",
  "Reduce-review setups should use the explicit reduce-review alert reason.",
);
assert(
  reduceReviewDecision.summary.includes("partial reduction or exit plan"),
  "Reduce-review summaries should allow direct coaching language without implying execution.",
);

const noCashNoPositionDecision = runDecisionEngine(
  buildDecisionContext({
    userState: {
      ...withPositionState({
        quantity: 0,
        averageEntryPrice: 0,
      }),
      accountState: {
        ...baseUserState.accountState!,
        availableCash: 0,
      },
    },
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      tradePrice: 99,
      oneHourCloses: [101, 102, 103, 102, 101, 100],
      fourHourCloses: [95, 97, 99, 100, 101, 102],
      oneDayCloses: [90, 93, 96, 98, 100, 102, 104],
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  noCashNoPositionDecision.status,
  "NO_ACTION",
  "No-position setups with no available cash should stay quiet even if structure is constructive.",
);
assert(
  noCashNoPositionDecision.reasons.some((reason) => reason.includes("No available cash is recorded")),
  "No-cash no-position cases should explain why no entry review is available.",
);

function withPositionState(input: {
  quantity: number;
  averageEntryPrice: number;
}): UserStateBundle {
  return {
    ...baseUserState,
    positions: {
      BTC: {
        ...baseUserState.positions.BTC!,
        quantity: input.quantity,
        averageEntryPrice: input.averageEntryPrice,
      },
    },
  };
}

function buildMarketSnapshot(input: {
  market: SupportedMarket;
  asset: SupportedAsset;
  tradePrice: number;
  oneHourCloses: number[];
  fourHourCloses: number[];
  oneDayCloses: number[];
}): MarketSnapshot {
  return {
    market: input.market,
    asset: input.asset,
    ticker: {
      market: input.market,
      tradePrice: input.tradePrice,
      changeRate: 0,
      fetchedAt: "2026-01-01T01:00:00.000Z",
    },
    timeframes: {
      "1h": buildTimeframe("1h", input.market, input.oneHourCloses),
      "4h": buildTimeframe("4h", input.market, input.fourHourCloses),
      "1d": buildTimeframe("1d", input.market, input.oneDayCloses),
    },
  };
}

function buildTimeframe(
  timeframe: SupportedTimeframe,
  market: SupportedMarket,
  closes: number[],
): { timeframe: SupportedTimeframe; candles: MarketCandle[] } {
  return {
    timeframe,
    candles: closes.map((closePrice, index) => buildCandle(timeframe, market, closePrice, index)),
  };
}

function buildCandle(
  timeframe: SupportedTimeframe,
  market: SupportedMarket,
  closePrice: number,
  index: number,
): MarketCandle {
  return {
    market,
    timeframe,
    openTime: `2026-01-01T0${index}:00:00.000Z`,
    closeTime: `2026-01-01T0${index + 1}:00:00.000Z`,
    openPrice: closePrice,
    highPrice: closePrice * 1.01,
    lowPrice: closePrice * 0.99,
    closePrice,
    volume: 1,
    quoteVolume: closePrice,
  };
}
