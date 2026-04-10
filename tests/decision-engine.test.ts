import { buildDecisionContext } from "../src/decision/context.js";
import { runDecisionEngine } from "../src/decision/engine.js";
import { buildDefaultStrategyInputs } from "../src/decision/settings.js";
import type {
  MarketCandle,
  MarketSnapshot,
  SupportedAsset,
  SupportedMarket,
  SupportedTimeframe,
  UserStateBundle,
} from "../src/domain/types.js";
import { buildActionNeededAlertText } from "../src/telegram/commands.js";
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
    availableCash: 1_000_000,
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
      averageEntryPrice: 150,
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

const bullishPullbackSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  oneHourCloses: buildSeries([
    { start: 100, end: 168, length: 220 },
    { start: 168, end: 157, length: 12 },
    { start: 157, end: 160, length: 8 },
  ]),
  fourHourCloses: buildSeries([
    { start: 100, end: 166, length: 220 },
    { start: 166, end: 158, length: 12 },
    { start: 158, end: 161, length: 8 },
  ]),
  oneDayCloses: buildSeries([
    { start: 100, end: 170, length: 220 },
    { start: 170, end: 162, length: 12 },
    { start: 162, end: 165, length: 8 },
  ]),
  oneHourVolumeMultiplier: 1.35,
  fourHourVolumeMultiplier: 1.15,
  oneDayVolumeMultiplier: 1.05,
  tradePrice: 161,
});

const immediateEntryDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: bullishPullbackSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  immediateEntryDecision.status,
  "ACTION_NEEDED",
  "Strong bullish pullbacks should promote directly to actionable review.",
);
assertEqual(
  immediateEntryDecision.alert?.reason ?? null,
  "ENTRY_REVIEW_REQUIRED",
  "Immediate entry setups should use the entry-review alert reason.",
);
assertEqual(
  immediateEntryDecision.diagnostics?.strategy?.action ?? null,
  "ENTRY",
  "Immediate entry setups should record the intended strategy action.",
);
assertEqual(
  immediateEntryDecision.diagnostics?.strategy?.executionDisposition ?? null,
  "IMMEDIATE",
  "Strong entry setups should clear straight into immediate review.",
);
assert(
  immediateEntryDecision.alert?.message.includes("Action zone:")
    && immediateEntryDecision.alert?.message.includes("First staged size:")
    && immediateEntryDecision.alert?.message.includes("Invalidation:")
    && immediateEntryDecision.alert?.message.includes("Chase guard:"),
  "Immediate entry alerts should include structured execution guidance.",
);

const deferredEntryDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: bullishPullbackSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
    strategy: {
      ...buildDefaultStrategyInputs(),
      portfolio: {
        totalEquity: 1_000_000,
        assetMarketValue: 0,
        totalExposureValue: 0,
        assetExposureRatio: 0,
        totalExposureRatio: 0,
      },
      recentExit: {
        createdAt: "2026-01-01T00:30:00.000Z",
        hoursSinceExit: 0.5,
        realizedPnl: -1,
      },
    },
  }),
);

assertEqual(
  deferredEntryDecision.status,
  "NO_ACTION",
  "Recent-exit penalty should push borderline recoveries into deferred confirmation instead of immediate action.",
);
assertEqual(
  deferredEntryDecision.alert,
  null,
  "Deferred confirmation should not emit an immediate alert.",
);
assertEqual(
  deferredEntryDecision.diagnostics?.strategy?.action ?? null,
  "ENTRY",
  "Deferred confirmation should still preserve the intended entry action.",
);
assertEqual(
  deferredEntryDecision.diagnostics?.strategy?.executionDisposition ?? null,
  "DEFERRED_CONFIRMATION",
  "Recent-exit penalty should demote the setup into deferred confirmation rather than hold.",
);

const deferredStrategy = deferredEntryDecision.diagnostics?.strategy;
if (!deferredStrategy) {
  throw new Error("Deferred entry decision should expose strategy diagnostics.");
}

const confirmedEntryDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: bullishPullbackSnapshot,
    generatedAt: "2026-01-01T02:00:00.000Z",
    strategy: {
      ...buildDefaultStrategyInputs(),
      portfolio: {
        totalEquity: 1_000_000,
        assetMarketValue: 0,
        totalExposureValue: 0,
        assetExposureRatio: 0,
        totalExposureRatio: 0,
      },
      recentExit: {
        createdAt: "2026-01-01T00:30:00.000Z",
        hoursSinceExit: 1.5,
        realizedPnl: -1,
      },
      latestDecision: {
        action: deferredStrategy.action,
        executionDisposition: deferredStrategy.executionDisposition,
        referencePrice: deferredStrategy.referencePrice,
        signalQuality: deferredStrategy.signalQuality,
        entryPath: deferredStrategy.entryPath,
        qualityBucket: deferredStrategy.signalQuality.bucket,
        createdAt: "2026-01-01T01:00:00.000Z",
      },
    },
  }),
);

assertEqual(
  confirmedEntryDecision.status,
  "ACTION_NEEDED",
  "Repeated borderline entry setups should promote to actionable review after one hourly confirmation.",
);
assertEqual(
  confirmedEntryDecision.alert?.reason ?? null,
  "ENTRY_REVIEW_REQUIRED",
  "Confirmed entry setups should use the explicit entry-review alert reason.",
);
assertEqual(
  confirmedEntryDecision.diagnostics?.trigger.state ?? null,
  "CONFIRMED",
  "Confirmed entry setups should show confirmed trigger state.",
);

const chaseSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  oneHourCloses: buildSeries([
    { start: 100, end: 150, length: 170 },
    { start: 150, end: 175, length: 35 },
    { start: 175, end: 182, length: 20 },
    { start: 182, end: 186, length: 6 },
  ]),
  fourHourCloses: buildSeries([
    { start: 100, end: 145, length: 170 },
    { start: 145, end: 170, length: 35 },
    { start: 170, end: 178, length: 20 },
  ]),
  oneDayCloses: buildSeries([
    { start: 100, end: 160, length: 170 },
    { start: 160, end: 178, length: 35 },
    { start: 178, end: 186, length: 20 },
  ]),
  oneHourVolumeMultiplier: 1.25,
  fourHourVolumeMultiplier: 1.15,
  oneDayVolumeMultiplier: 1.05,
  tradePrice: 188,
});

const chaseDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: chaseSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  chaseDecision.status,
  "NO_ACTION",
  "Upper-range chase conditions should remain silent.",
);
assertEqual(
  chaseDecision.executionGuide ?? null,
  null,
  "Silent hold states should not fabricate an execution guide.",
);

const breakdownSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  oneHourCloses: buildSeries([
    { start: 170, end: 150, length: 150 },
    { start: 150, end: 138, length: 20 },
    { start: 138, end: 132, length: 8 },
  ]),
  fourHourCloses: buildSeries([
    { start: 170, end: 148, length: 120 },
    { start: 148, end: 140, length: 18 },
    { start: 140, end: 134, length: 8 },
  ]),
  oneDayCloses: buildSeries([
    { start: 170, end: 150, length: 120 },
    { start: 150, end: 140, length: 18 },
    { start: 140, end: 138, length: 6 },
  ]),
  oneHourVolumeMultiplier: 0.9,
  fourHourVolumeMultiplier: 0.95,
  oneDayVolumeMultiplier: 1.15,
  tradePrice: 132,
});

const reduceDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 150,
    }),
    asset: "BTC",
    marketSnapshot: breakdownSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  reduceDecision.status,
  "ACTION_NEEDED",
  "Clear weakening should surface a reduce-side review.",
);
assertEqual(
  reduceDecision.alert?.reason ?? null,
  "REDUCE_REVIEW_REQUIRED",
  "Weakening or failure states should map to reduce-review alerts.",
);
assert(
  (reduceDecision.executionGuide?.planType === "REDUCE" || reduceDecision.executionGuide?.planType === "EXIT_PLAN")
    && reduceDecision.alert?.message.includes("Invalidation:")
    && reduceDecision.alert?.message.includes("Chase guard:"),
  "Reduce-side alerts should also include structured guidance.",
);

const koreanConfirmedEntryDecision = runDecisionEngine(
  buildDecisionContext({
    userState: {
      ...withPositionState({
        quantity: 0,
        averageEntryPrice: 0,
      }),
      user: {
        ...baseUserState.user,
        locale: "ko",
      },
    },
    asset: "BTC",
    marketSnapshot: bullishPullbackSnapshot,
    generatedAt: "2026-01-01T02:00:00.000Z",
    strategy: {
      ...buildDefaultStrategyInputs(),
      portfolio: {
        totalEquity: 1_000_000,
        assetMarketValue: 0,
        totalExposureValue: 0,
        assetExposureRatio: 0,
        totalExposureRatio: 0,
      },
      latestDecision: {
        action: deferredStrategy.action,
        executionDisposition: deferredStrategy.executionDisposition,
        referencePrice: deferredStrategy.referencePrice,
        signalQuality: deferredStrategy.signalQuality,
        entryPath: deferredStrategy.entryPath,
        qualityBucket: deferredStrategy.signalQuality.bucket,
        createdAt: "2026-01-01T01:00:00.000Z",
      },
    },
  }),
);

assert(
  koreanConfirmedEntryDecision.summary.includes("진입 검토")
    && koreanConfirmedEntryDecision.alert?.message.includes("행동 구간:")
    && koreanConfirmedEntryDecision.alert?.message.includes("첫 분할:")
    && koreanConfirmedEntryDecision.alert?.message.includes("무효화:")
    && koreanConfirmedEntryDecision.alert?.message.includes("추격 금지:")
    && koreanConfirmedEntryDecision.alert?.message.includes("진입 무효화 기준")
    && !koreanConfirmedEntryDecision.alert?.message.includes("entry review")
    && !koreanConfirmedEntryDecision.alert?.message.includes("Wait for the structure"),
  "Korean actionable messages should localize both the headline summary and execution-guide body.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "ENTRY_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC entry review is justified and the deferred confirmation has now been satisfied.",
    nextStep: "Keep it staged, confirm the invalidation level first, and avoid chasing the upper end of the range.",
  }).includes("ACTION NEEDED: BTC entry review is needed"),
  "Telegram alert headlines should keep the expected coaching headline.",
);

function withPositionState(input: {
  quantity: number;
  averageEntryPrice: number;
  availableCash?: number;
}): UserStateBundle {
  return {
    ...baseUserState,
    accountState: {
      ...baseUserState.accountState!,
      availableCash: input.availableCash ?? baseUserState.accountState!.availableCash,
    },
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
  oneHourCloses: number[];
  fourHourCloses: number[];
  oneDayCloses: number[];
  oneHourVolumeMultiplier?: number;
  fourHourVolumeMultiplier?: number;
  oneDayVolumeMultiplier?: number;
  tradePrice?: number;
}): MarketSnapshot {
  const tradePrice =
    input.tradePrice ?? input.oneHourCloses[input.oneHourCloses.length - 1] ?? 0;

  return {
    market: input.market,
    asset: input.asset,
    ticker: {
      market: input.market,
      tradePrice,
      changeRate: 0,
      fetchedAt: "2026-01-01T01:00:00.000Z",
    },
    timeframes: {
      "1h": buildTimeframe("1h", input.market, input.oneHourCloses, input.oneHourVolumeMultiplier ?? 1),
      "4h": buildTimeframe("4h", input.market, input.fourHourCloses, input.fourHourVolumeMultiplier ?? 1),
      "1d": buildTimeframe("1d", input.market, input.oneDayCloses, input.oneDayVolumeMultiplier ?? 1),
    },
    fetchedAt: "2026-01-01T01:00:00.000Z",
  };
}

function buildTimeframe(
  timeframe: SupportedTimeframe,
  market: SupportedMarket,
  closes: number[],
  volumeMultiplier: number,
): { timeframe: SupportedTimeframe; candles: MarketCandle[] } {
  const latestCloseMs = Date.parse("2026-01-01T01:00:00.000Z");
  const durationHours = timeframe === "1h" ? 1 : timeframe === "4h" ? 4 : 24;
  const durationMs = durationHours * 60 * 60 * 1000;
  const candles = closes.map((close, index) => {
    const previousClose = closes[Math.max(0, index - 1)] ?? close;
    const open = index === 0 ? close : previousClose;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    const baseVolume = index >= closes.length - 4 ? 100 * volumeMultiplier : 100;
    const closeMs = latestCloseMs - (closes.length - 1 - index) * durationMs;
    const start = new Date(closeMs - durationMs).toISOString();
    const closeTime = new Date(closeMs).toISOString();

    return {
      market,
      timeframe,
      openTime: start,
      closeTime,
      openPrice: open,
      highPrice: high,
      lowPrice: low,
      closePrice: close,
      volume: baseVolume,
      quoteVolume: baseVolume * close,
    };
  });

  return { timeframe, candles };
}

function buildSeries(input: Array<{ start: number; end: number; length: number }>): number[] {
  const values: number[] = [];

  for (const segment of input) {
    if (segment.length <= 1) {
      values.push(segment.end);
      continue;
    }

    const step = (segment.end - segment.start) / (segment.length - 1);
    for (let index = 0; index < segment.length; index += 1) {
      values.push(Number((segment.start + step * index).toFixed(4)));
    }
  }

  return values;
}
