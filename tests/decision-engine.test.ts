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

const entryReviewDecision = runDecisionEngine(
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
  entryReviewDecision.status,
  "ACTION_NEEDED",
  "No-position healthy pullbacks in a bullish regime should open an entry review.",
);
assertEqual(
  entryReviewDecision.alert?.reason ?? null,
  "ENTRY_REVIEW_REQUIRED",
  "Entry-review setups should use the explicit entry-review alert reason.",
);
assert(
  entryReviewDecision.summary.includes("spot entry review") &&
    entryReviewDecision.reasons.some((reason: string) => reason.includes("Regime:")) &&
    entryReviewDecision.reasons.some((reason: string) => reason.includes("Invalidation")) &&
    entryReviewDecision.reasons.some((reason: string) => reason.includes("No chase buying")) &&
    entryReviewDecision.alert?.message.includes("No trade was executed."),
  "Entry-review reasons should explain regime, invalidation, and no-chase framing.",
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

const noPositionChaseDecision = runDecisionEngine(
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
  noPositionChaseDecision.status,
  "NO_ACTION",
  "Upper-range chase conditions should block a no-position entry review.",
);
assert(
  noPositionChaseDecision.summary.includes("not justified right now"),
  "Chase conditions should be described as a rejected entry review, not as an execution instruction.",
);

const reclaimContinuationSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  oneHourCloses: buildSeries([
    { start: 100, end: 158, length: 220 },
    { start: 158, end: 151, length: 10 },
    { start: 151, end: 166, length: 10 },
  ]),
  fourHourCloses: buildSeries([
    { start: 100, end: 156, length: 220 },
    { start: 156, end: 150, length: 10 },
    { start: 150, end: 162, length: 10 },
  ]),
  oneDayCloses: buildSeries([
    { start: 100, end: 160, length: 220 },
    { start: 160, end: 156, length: 10 },
    { start: 156, end: 164, length: 10 },
  ]),
  oneHourVolumeMultiplier: 1.45,
  fourHourVolumeMultiplier: 1.2,
  oneDayVolumeMultiplier: 1.08,
  tradePrice: 166,
});

const reclaimEntryDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: reclaimContinuationSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  reclaimEntryDecision.status,
  "ACTION_NEEDED",
  "Supportive reclaim-continuation structure should still open an entry review instead of being auto-blocked as a chase.",
);
assert(
  reclaimEntryDecision.summary.includes("reclaim structure") &&
    reclaimEntryDecision.reasons.some((reason: string) => reason.includes("valid reclaim")) &&
    !reclaimEntryDecision.diagnostics?.setup.blockers.some((blocker: string) => blocker.includes("extended")),
  "Reclaim-path entries should explain that a valid reclaim is treated differently from a pure upper-range chase.",
);

const breakdownSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  oneHourCloses: buildSeries([
    { start: 170, end: 150, length: 150 },
    { start: 150, end: 130, length: 35 },
    { start: 130, end: 118, length: 35 },
  ]),
  fourHourCloses: buildSeries([
    { start: 175, end: 150, length: 150 },
    { start: 150, end: 126, length: 35 },
    { start: 126, end: 112, length: 35 },
  ]),
  oneDayCloses: buildSeries([
    { start: 180, end: 155, length: 150 },
    { start: 155, end: 128, length: 35 },
    { start: 128, end: 108, length: 35 },
  ]),
  oneHourVolumeMultiplier: 1.4,
  fourHourVolumeMultiplier: 1.25,
  oneDayVolumeMultiplier: 1.15,
  tradePrice: 110,
});

const dailyBreakdownDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: breakdownSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  dailyBreakdownDecision.status,
  "NO_ACTION",
  "Daily breakdown risk should block entry review.",
);
assert(
  dailyBreakdownDecision.reasons.some((reason: string) => reason.includes("Invalidation"))
    || dailyBreakdownDecision.reasons.some((reason: string) => reason.includes("weak downtrend")),
  "Breakdown-side entry blocking should stay explicit in the reasoning even if the regime remains weak-downtrend rather than full breakdown risk.",
);

const wickOnlyDipDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 154,
    }),
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      oneHourCloses: bullishPullbackSnapshot.timeframes["1h"].candles.map((candle) => candle.closePrice),
      fourHourCloses: bullishPullbackSnapshot.timeframes["4h"].candles.map((candle) => candle.closePrice),
      oneDayCloses: bullishPullbackSnapshot.timeframes["1d"].candles.map((candle) => candle.closePrice),
      oneHourVolumeMultiplier: 1.35,
      fourHourVolumeMultiplier: 1.15,
      oneDayVolumeMultiplier: 1.05,
      tradePrice: 150,
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assert(
  wickOnlyDipDecision.status !== "ACTION_NEEDED"
    || wickOnlyDipDecision.alert?.reason !== "REDUCE_REVIEW_REQUIRED",
  "A wick-only ticker dip should not confirm higher-timeframe breakdown when candle closes still hold support.",
);
assertEqual(
  wickOnlyDipDecision.diagnostics?.risk.invalidationState ?? null,
  "CLEAR",
  "Invalidation should remain clear when support has not failed on a closing basis.",
);

const addBuyDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 154,
    }),
    asset: "BTC",
    marketSnapshot: bullishPullbackSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  addBuyDecision.status,
  "ACTION_NEEDED",
  "Existing positions with cash and healthy pullback structure should open an add-buy review.",
);
assertEqual(
  addBuyDecision.alert?.reason ?? null,
  "ADD_BUY_REVIEW_REQUIRED",
  "Add-buy review setups should use the explicit add-buy alert reason.",
);
assert(
  addBuyDecision.summary.includes("add-buy review") &&
    addBuyDecision.reasons.some((reason: string) => reason.includes("No chase buying")),
  "Add-buy reviews should stay coaching-oriented and non-execution based.",
);

const reclaimStrengthAddDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 155,
    }),
    asset: "BTC",
    marketSnapshot: reclaimContinuationSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  reclaimStrengthAddDecision.status,
  "ACTION_NEEDED",
  "Existing positions should allow a staged strength add after a valid reclaim keeps holding.",
);
assert(
  reclaimStrengthAddDecision.summary.includes("valid reclaim strength"),
  "Strength-add paths should be distinct from pullback add paths in the coaching summary.",
);

const fallingKnifeDecision = runDecisionEngine(
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
  fallingKnifeDecision.status,
  "ACTION_NEEDED",
  "Falling-knife breakdown cases should escalate to a reduce review instead of an add-buy review.",
);
assertEqual(
  fallingKnifeDecision.alert?.reason ?? null,
  "REDUCE_REVIEW_REQUIRED",
  "Breakdown pressure should map to a reduce-review alert.",
);

const addBuyTooHighDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 150,
    }),
    asset: "BTC",
    marketSnapshot: chaseSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  addBuyTooHighDecision.status,
  "NO_ACTION",
  "Existing positions should stay quiet when price is too extended for a staged add-buy review.",
);

const earlyRecoverySnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  oneHourCloses: buildSeries([
    { start: 160, end: 130, length: 120 },
    { start: 130, end: 126, length: 12 },
    { start: 126, end: 134, length: 10 },
    { start: 134, end: 138, length: 6 },
  ]),
  fourHourCloses: buildSeries([
    { start: 165, end: 136, length: 120 },
    { start: 136, end: 132, length: 10 },
    { start: 132, end: 137, length: 8 },
  ]),
  oneDayCloses: buildSeries([
    { start: 170, end: 142, length: 120 },
    { start: 142, end: 138, length: 10 },
    { start: 138, end: 140, length: 8 },
  ]),
  oneHourVolumeMultiplier: 1.4,
  fourHourVolumeMultiplier: 1.15,
  oneDayVolumeMultiplier: 1.0,
  tradePrice: 139,
});

const earlyRecoveryDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: earlyRecoverySnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assert(
  earlyRecoveryDecision.diagnostics?.regime?.classification === "EARLY_RECOVERY"
    || earlyRecoveryDecision.diagnostics?.regime?.classification === "RECLAIM_ATTEMPT",
  "Improving but not fully bullish structure should classify as an intermediate recovery regime instead of a broad weak downtrend.",
);
assert(
  earlyRecoveryDecision.diagnostics?.setup.state !== "BLOCKED",
  "Constructive early-recovery structure should still allow at least a cautious review posture instead of being auto-blocked.",
);

const weakDowntrendSnapshot = buildMarketSnapshot({
  market: "KRW-BTC",
  asset: "BTC",
  oneHourCloses: buildSeries([
    { start: 160, end: 145, length: 120 },
    { start: 145, end: 140, length: 18 },
    { start: 140, end: 141, length: 6 },
  ]),
  fourHourCloses: buildSeries([
    { start: 165, end: 150, length: 120 },
    { start: 150, end: 145, length: 18 },
    { start: 145, end: 146, length: 6 },
  ]),
  oneDayCloses: buildSeries([
    { start: 170, end: 155, length: 120 },
    { start: 155, end: 150, length: 18 },
    { start: 150, end: 151, length: 6 },
  ]),
  oneHourVolumeMultiplier: 0.9,
  fourHourVolumeMultiplier: 0.9,
  oneDayVolumeMultiplier: 0.95,
  tradePrice: 141,
});

const weakDowntrendDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0,
      averageEntryPrice: 0,
    }),
    asset: "BTC",
    marketSnapshot: weakDowntrendSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  weakDowntrendDecision.diagnostics?.regime?.classification ?? null,
  "WEAK_DOWNTREND",
  "Soft but still unimproved structure should remain in the weak-downtrend bucket.",
);
assertEqual(
  weakDowntrendDecision.status,
  "NO_ACTION",
  "Weak downtrends should still block bad entry setups.",
);

const reduceReviewDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 165,
    }),
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      oneHourCloses: buildSeries([
        { start: 160, end: 142, length: 120 },
        { start: 142, end: 134, length: 18 },
        { start: 134, end: 132, length: 6 },
      ]),
      fourHourCloses: buildSeries([
        { start: 165, end: 145, length: 120 },
        { start: 145, end: 136, length: 18 },
        { start: 136, end: 134, length: 6 },
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
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  reduceReviewDecision.status,
  "ACTION_NEEDED",
  "Drawdown plus higher-timeframe weakness should escalate to a reduce review.",
);
assert(
  reduceReviewDecision.summary.includes("review") &&
    reduceReviewDecision.reasons.some((reason: string) => reason.includes("Survival first")),
  "Reduce-review output should explain the survival-first framing.",
);

const singleWeakSignalDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 162,
    }),
    asset: "BTC",
    marketSnapshot: bullishPullbackSnapshot,
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assert(
  singleWeakSignalDecision.alert?.reason !== "REDUCE_REVIEW_REQUIRED"
    && singleWeakSignalDecision.diagnostics?.trigger.state !== "BEARISH_CONFIRMATION",
  "Reduce should not fire from a single weak symptom without confirmed structure damage plus additional weakness.",
);

const deepDrawdownDecision = runDecisionEngine(
  buildDecisionContext({
    userState: withPositionState({
      quantity: 0.25,
      averageEntryPrice: 170,
    }),
    asset: "BTC",
    marketSnapshot: buildMarketSnapshot({
      market: "KRW-BTC",
      asset: "BTC",
      oneHourCloses: buildSeries([
        { start: 160, end: 142, length: 120 },
        { start: 142, end: 134, length: 18 },
        { start: 134, end: 132, length: 6 },
      ]),
      fourHourCloses: buildSeries([
        { start: 165, end: 145, length: 120 },
        { start: 145, end: 136, length: 18 },
        { start: 136, end: 134, length: 6 },
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
    }),
    generatedAt: "2026-01-01T01:00:00.000Z",
  }),
);

assertEqual(
  deepDrawdownDecision.status,
  "ACTION_NEEDED",
  "Deep drawdown plus bearish regime and weak momentum should stay in reduce-review mode.",
);
assert(
  deepDrawdownDecision.reasons.some((reason: string) => reason.includes("What broke:")) &&
    deepDrawdownDecision.reasons.some((reason: string) => reason.includes("Survival first")),
  "Reduce-review reasons should say what broke and why survival comes first.",
);

assert(
  entryReviewDecision.alert?.message.includes("No trade was executed.") ?? false,
  "Entry-review alerts must remain non-execution framed.",
);

assert(
  addBuyDecision.alert?.message.includes("No trade was executed.") ?? false,
  "Add-buy review alerts must remain non-execution framed.",
);

assert(
  fallingKnifeDecision.alert?.message.includes("No trade was executed.") ?? false,
  "Reduce-review alerts must remain non-execution framed.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "ENTRY_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC structure supports a conservative spot entry review.",
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
  };
}

function buildTimeframe(
  timeframe: SupportedTimeframe,
  market: SupportedMarket,
  closes: number[],
  latestVolumeMultiplier: number,
): { timeframe: SupportedTimeframe; candles: MarketCandle[] } {
  return {
    timeframe,
    candles: closes.map((closePrice, index) =>
      buildCandle(timeframe, market, closePrice, index, closes.length, latestVolumeMultiplier)),
  };
}

function buildCandle(
  timeframe: SupportedTimeframe,
  market: SupportedMarket,
  closePrice: number,
  index: number,
  total: number,
  latestVolumeMultiplier: number,
): MarketCandle {
  const slope = index > 0 ? closePrice - Math.max(1, closePrice - 1) : 0;
  const openPrice = closePrice - slope * 0.3;
  const highPrice = Math.max(openPrice, closePrice) * 1.008;
  const lowPrice = Math.min(openPrice, closePrice) * 0.992;
  const baseVolume = 100 + (index % 7) * 5;
  const isLatest = index === total - 1;
  const volume = isLatest ? baseVolume * latestVolumeMultiplier : baseVolume;

  return {
    market,
    timeframe,
    openTime: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    closeTime: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T01:00:00.000Z`,
    openPrice,
    highPrice,
    lowPrice,
    closePrice,
    volume,
    quoteVolume: volume * closePrice,
  };
}

function buildSeries(
  segments: Array<{ start: number; end: number; length: number }>,
): number[] {
  const values: number[] = [];

  for (const [segmentIndex, segment] of segments.entries()) {
    const steps = Math.max(2, segment.length);
    for (let index = 0; index < steps; index += 1) {
      if (segmentIndex > 0 && index === 0) {
        continue;
      }

      const ratio = index / (steps - 1);
      values.push(Number((segment.start + (segment.end - segment.start) * ratio).toFixed(4)));
    }
  }

  return values;
}
