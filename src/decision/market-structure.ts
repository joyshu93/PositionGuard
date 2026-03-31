import type {
  DecisionContext,
  MarketCandle,
  MarketSnapshot,
  SupportedTimeframe,
} from "../domain/types.js";

export type TrendDirection = "UP" | "DOWN" | "FLAT";
export type RangeLocation = "LOWER" | "MIDDLE" | "UPPER";

export interface TimeframeStructure {
  timeframe: SupportedTimeframe;
  trend: TrendDirection;
  rangeHigh: number;
  rangeLow: number;
  previousRangeLow: number;
  previousRangeHigh: number;
  location: RangeLocation;
  changePct: number;
  latestClose: number;
}

export interface MarketStructureAnalysis {
  asset: "BTC" | "ETH";
  market: "KRW-BTC" | "KRW-ETH";
  currentPrice: number;
  timeframes: Record<SupportedTimeframe, TimeframeStructure>;
  bearishTrendCount: number;
  bullishTrendCount: number;
  lowerLocationCount: number;
  upperLocationCount: number;
  breakdown4h: boolean;
  breakdown1d: boolean;
}

export interface PositionStructureAnalysis extends MarketStructureAnalysis {
  averageEntryPrice: number;
  pnlPct: number;
}

const LOOKBACK_BY_TIMEFRAME: Record<SupportedTimeframe, number> = {
  "1h": 6,
  "4h": 6,
  "1d": 7,
};

const TREND_THRESHOLD_BY_TIMEFRAME: Record<SupportedTimeframe, number> = {
  "1h": 0.01,
  "4h": 0.015,
  "1d": 0.02,
};

export function analyzeMarketStructure(
  marketSnapshot: MarketSnapshot,
): MarketStructureAnalysis {
  const currentPrice = marketSnapshot.ticker.tradePrice;

  const timeframes = {
    "1h": analyzeTimeframe("1h", marketSnapshot.timeframes["1h"].candles, currentPrice),
    "4h": analyzeTimeframe("4h", marketSnapshot.timeframes["4h"].candles, currentPrice),
    "1d": analyzeTimeframe("1d", marketSnapshot.timeframes["1d"].candles, currentPrice),
  };

  const structures = Object.values(timeframes);

  return {
    asset: marketSnapshot.asset,
    market: marketSnapshot.market,
    currentPrice,
    timeframes,
    bearishTrendCount: structures.filter((item) => item.trend === "DOWN").length,
    bullishTrendCount: structures.filter((item) => item.trend === "UP").length,
    lowerLocationCount: structures.filter((item) => item.location === "LOWER").length,
    upperLocationCount: structures.filter((item) => item.location === "UPPER").length,
    breakdown4h: currentPrice <= timeframes["4h"].previousRangeLow,
    breakdown1d: currentPrice <= timeframes["1d"].previousRangeLow,
  };
}

export function analyzePositionStructure(
  context: DecisionContext,
): PositionStructureAnalysis | null {
  if (!context.positionState || !context.marketSnapshot) {
    return null;
  }

  const marketStructure = analyzeMarketStructure(context.marketSnapshot);
  const averageEntryPrice = context.positionState.averageEntryPrice;
  const pnlPct =
    averageEntryPrice > 0
      ? (marketStructure.currentPrice - averageEntryPrice) / averageEntryPrice
      : 0;

  return {
    ...marketStructure,
    averageEntryPrice,
    pnlPct,
  };
}

export function summarizeTrend(direction: TrendDirection): string {
  if (direction === "UP") {
    return "up";
  }

  if (direction === "DOWN") {
    return "down";
  }

  return "flat";
}

export function summarizeLocation(location: RangeLocation): string {
  if (location === "LOWER") {
    return "lower";
  }

  if (location === "UPPER") {
    return "upper";
  }

  return "middle";
}

function analyzeTimeframe(
  timeframe: SupportedTimeframe,
  candles: MarketCandle[],
  currentPrice: number,
): TimeframeStructure {
  const lookback = Math.min(candles.length, LOOKBACK_BY_TIMEFRAME[timeframe]);
  const recent = candles.slice(-lookback);
  const prior = recent.length > 1 ? recent.slice(0, -1) : recent;
  const latestClose = recent[recent.length - 1]?.closePrice ?? currentPrice;
  const firstClose = recent[0]?.closePrice ?? currentPrice;
  const changePct = firstClose > 0 ? (latestClose - firstClose) / firstClose : 0;
  const trend = classifyTrend(timeframe, changePct);
  const rangeHigh = getHigh(recent, currentPrice);
  const rangeLow = getLow(recent, currentPrice);
  const previousRangeHigh = getHigh(prior, currentPrice);
  const previousRangeLow = getLow(prior, currentPrice);

  return {
    timeframe,
    trend,
    rangeHigh,
    rangeLow,
    previousRangeHigh,
    previousRangeLow,
    location: classifyLocation(currentPrice, rangeLow, rangeHigh),
    changePct,
    latestClose,
  };
}

function classifyTrend(
  timeframe: SupportedTimeframe,
  changePct: number,
): TrendDirection {
  const threshold = TREND_THRESHOLD_BY_TIMEFRAME[timeframe];
  if (changePct >= threshold) {
    return "UP";
  }

  if (changePct <= -threshold) {
    return "DOWN";
  }

  return "FLAT";
}

function classifyLocation(
  currentPrice: number,
  rangeLow: number,
  rangeHigh: number,
): RangeLocation {
  const width = rangeHigh - rangeLow;
  if (width <= 0) {
    return "MIDDLE";
  }

  const percentile = (currentPrice - rangeLow) / width;
  if (percentile <= 0.33) {
    return "LOWER";
  }

  if (percentile >= 0.67) {
    return "UPPER";
  }

  return "MIDDLE";
}

function getHigh(candles: MarketCandle[], fallback: number): number {
  if (candles.length === 0) {
    return fallback;
  }

  return candles.reduce(
    (highest, candle) => Math.max(highest, candle.highPrice),
    candles[0]?.highPrice ?? fallback,
  );
}

function getLow(candles: MarketCandle[], fallback: number): number {
  if (candles.length === 0) {
    return fallback;
  }

  return candles.reduce(
    (lowest, candle) => Math.min(lowest, candle.lowPrice),
    candles[0]?.lowPrice ?? fallback,
  );
}
