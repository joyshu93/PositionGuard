import { buildDecisionContext } from "../src/decision/context.js";
import { runDecisionEngine } from "../src/decision/engine.js";
import type {
  MarketCandle,
  MarketSnapshot,
  SupportedMarket,
  SupportedTimeframe,
  UserStateBundle,
} from "../src/domain/types.js";
import { assert, assertEqual } from "./test-helpers.js";

const readyUserState: UserStateBundle = {
  user: {
    id: 1,
    telegramUserId: "123",
    telegramChatId: "456",
    username: "tester",
    displayName: "Test User",
    trackedAssets: "BTC,ETH",
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

const setupIncomplete = runDecisionEngine(
  buildDecisionContext({
    userState: {
      ...readyUserState,
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
assert(
  setupIncomplete.summary.toLowerCase().includes("setup"),
  "Setup-incomplete summaries should stay coaching-oriented.",
);
assert(
  setupIncomplete.reasons.some((reason) =>
    reason.toLowerCase().includes("user-reported"),
  ),
  "Setup-incomplete reasons should emphasize user-reported inputs.",
);
assert(
  setupIncomplete.reasons.length >= 2,
  "Decision summaries should remain explanatory rather than terse flags.",
);

const insufficientData = runDecisionEngine(
  buildDecisionContext({
    userState: readyUserState,
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
assert(
  insufficientData.summary.toLowerCase().includes("unavailable"),
  "Insufficient-data summaries should be explicit about missing market context.",
);
assert(
  insufficientData.reasons.some((reason) =>
    reason.toLowerCase().includes("normalized market snapshot"),
  ),
  "Insufficient-data reasons should mention the normalized market snapshot contract.",
);

const noActionSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  tradePrice: 98000000,
  closeSeed: 97000000,
  oneHourCloses: [97000000, 97500000, 97800000, 98000000, 98100000, 98200000],
  fourHourCloses: [96000000, 96500000, 96800000, 97000000, 97200000, 97300000],
  oneDayCloses: [94000000, 95000000, 95500000, 96000000, 96500000, 97000000, 97500000],
});

const noAction = runDecisionEngine(
  buildDecisionContext({
    userState: readyUserState,
    asset: "BTC",
    marketSnapshot: noActionSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  noAction.status,
  "NO_ACTION",
  "Ready setups with constructive structure should remain non-execution oriented.",
);
assertEqual(
  noAction.symbol,
  "KRW-BTC",
  "The engine should preserve the requested BTC market symbol.",
);
assert(
  noAction.summary.toLowerCase().includes("no urgent coaching action"),
  "No-action summaries should stay explicit about patience and non-execution.",
);
assert(
  noAction.reasons.some((reason) => reason.startsWith("Trend summary:")),
  "No-action reasons should explain the trend structure.",
);
assert(
  noAction.reasons.some((reason) => reason.includes("Trend first and no chase buying")),
  "No-action reasons should preserve the no-chase coaching rule.",
);
assert(
  noAction.reasons.length >= 4,
  "No-action results should still provide a multi-part explanation.",
);

const actionNeededSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  tradePrice: 86000000,
  closeSeed: 87000000,
  oneHourCloses: [87000000, 86800000, 86600000, 86400000, 86200000, 86000000],
  fourHourCloses: [98000000, 97000000, 96000000, 95000000, 94000000, 90000000],
  oneDayCloses: [100000000, 98000000, 96000000, 94000000, 92000000, 88000000, 86000000],
});

const actionNeeded = runDecisionEngine(
  buildDecisionContext({
    userState: readyUserState,
    asset: "BTC",
    marketSnapshot: actionNeededSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  actionNeeded.status,
  "ACTION_NEEDED",
  "Severe drawdown plus weakening higher-timeframe structure should escalate to ACTION_NEEDED.",
);
assert(
  actionNeeded.actionable,
  "ACTION_NEEDED results should remain actionable without implying execution.",
);
assert(
  actionNeeded.summary.toLowerCase().includes("review invalidation and cash risk"),
  "ACTION_NEEDED summaries should stay coaching-oriented and risk-first.",
);
assert(
  actionNeeded.reasons.some((reason) => reason.includes("Survival first")),
  "ACTION_NEEDED reasons should preserve survival-first framing.",
);
assert(
  actionNeeded.alert?.reason === "RISK_REVIEW_REQUIRED",
  "Risk escalation should use the explicit risk-review alert reason.",
);
assert(
  actionNeeded.alert?.message.includes("No trade was executed."),
  "ACTION_NEEDED alerts must stay record-only.",
);
assert(
  actionNeeded.alert?.cooldownKey.startsWith("risk-review:"),
  "Risk escalation should produce an inspectable cooldown key.",
);

function buildMarketSnapshot(input: {
  market: SupportedMarket;
  asset: "BTC" | "ETH";
  tradePrice: number;
  closeSeed: number;
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
