import type {
  DecisionDiagnosticsTimeframeSnapshot,
  DecisionRiskLevel,
  DecisionTriggerState,
  InvalidationState,
  MarketCandle,
  MarketRegime,
  MarketSnapshot,
  SupportedTimeframe,
} from "../domain/types.js";

export type TrendDirection = "UP" | "DOWN" | "FLAT";
export type RangeLocation = "LOWER" | "MIDDLE" | "UPPER";

export interface TimeframeIndicatorState { ema20: number | null; ema50: number | null; ema200: number | null; atr14: number | null; rsi14: number | null; macdLine: number | null; macdSignal: number | null; macdHistogram: number | null; previousMacdHistogram: number | null; volumeRatio: number | null; }
export interface TimeframeStructure {
  timeframe: SupportedTimeframe; trend: TrendDirection; rangeHigh: number; rangeLow: number; previousRangeLow: number; previousRangeHigh: number; location: RangeLocation; changePct: number; latestClose: number; previousClose: number; swingHigh: number; swingLow: number; support: number; resistance: number; indicators: TimeframeIndicatorState; aboveEma20: boolean; aboveEma50: boolean; aboveEma200: boolean; emaStackBullish: boolean; emaStackBearish: boolean; macdHistogramImproving: boolean; rsiOverbought: boolean; rsiOversold: boolean;
}
export interface MarketStructureAnalysis {
  asset: "BTC" | "ETH"; market: "KRW-BTC" | "KRW-ETH"; currentPrice: number; timeframes: Record<SupportedTimeframe, TimeframeStructure>; bearishTrendCount: number; bullishTrendCount: number; lowerLocationCount: number; upperLocationCount: number; breakdown4h: boolean; breakdown1d: boolean; regime: MarketRegime; regimeSummary: string; invalidationLevel: number | null; invalidationState: InvalidationState; riskLevel: DecisionRiskLevel; upperRangeChase: boolean; pullbackZone: boolean; reclaimStructure: boolean; volumeRecovery: boolean; macdImproving: boolean; rsiRecovery: boolean; bearishMomentumExpansion: boolean; atrShock: boolean;
}
export interface PositionStructureAnalysis extends MarketStructureAnalysis { averageEntryPrice: number; pnlPct: number; }

const LOOKBACK: Record<SupportedTimeframe, number> = { "1h": 24, "4h": 24, "1d": 30 };
const TREND_THRESHOLD: Record<SupportedTimeframe, number> = { "1h": 0.015, "4h": 0.025, "1d": 0.03 };
const SWING_LOOKBACK: Record<SupportedTimeframe, number> = { "1h": 18, "4h": 18, "1d": 20 };

export function analyzeMarketStructure(snapshot: MarketSnapshot): MarketStructureAnalysis {
  const currentPrice = snapshot.ticker.tradePrice;
  const timeframes = {
    "1h": analyzeTimeframe("1h", snapshot.timeframes["1h"].candles, currentPrice),
    "4h": analyzeTimeframe("4h", snapshot.timeframes["4h"].candles, currentPrice),
    "1d": analyzeTimeframe("1d", snapshot.timeframes["1d"].candles, currentPrice),
  };
  const structures = Object.values(timeframes);
  const breakdown4h = currentPrice <= timeframes["4h"].support;
  const breakdown1d = currentPrice <= timeframes["1d"].support;
  const upperRangeChase = timeframes["4h"].location === "UPPER" || timeframes["1d"].location === "UPPER" || (timeframes["1h"].location === "UPPER" && currentPrice > (timeframes["1h"].indicators.ema20 ?? currentPrice));
  const pullbackZone = !breakdown4h && !breakdown1d && (timeframes["4h"].location === "LOWER" || timeframes["4h"].location === "MIDDLE" || timeframes["1h"].location === "LOWER");
  const reclaimStructure = currentPrice > timeframes["1h"].resistance && currentPrice > (timeframes["1h"].indicators.ema20 ?? currentPrice) && timeframes["1h"].previousClose <= timeframes["1h"].resistance;
  const volumeRecovery = (timeframes["1h"].indicators.volumeRatio ?? 0) >= 0.9 || (timeframes["4h"].indicators.volumeRatio ?? 0) >= 0.9;
  const macdImproving = timeframes["1h"].macdHistogramImproving || timeframes["4h"].macdHistogramImproving;
  const rsiRecovery = isRsiRecovery(timeframes["1h"]) || isRsiRecovery(timeframes["4h"]);
  const bearishMomentumExpansion = (timeframes["1h"].indicators.macdHistogram ?? 0) < 0 && !timeframes["1h"].macdHistogramImproving && (timeframes["4h"].indicators.macdHistogram ?? 0) < 0;
  const atrShock = isAtrShock(timeframes["1h"], currentPrice) || isAtrShock(timeframes["4h"], currentPrice);
  const regime = classifyRegime(timeframes, currentPrice, breakdown4h, breakdown1d);
  const invalidationLevel = getInvalidationLevel(timeframes);
  const invalidationState = invalidationLevel === null ? "UNCLEAR" : currentPrice <= invalidationLevel ? "BROKEN" : "CLEAR";
  const riskLevel = breakdown1d || regime === "BREAKDOWN_RISK" ? "HIGH" : breakdown4h || atrShock || bearishMomentumExpansion ? "ELEVATED" : regime === "WEAK_DOWNTREND" ? "MODERATE" : "LOW";
  return { asset: snapshot.asset, market: snapshot.market, currentPrice, timeframes, bearishTrendCount: structures.filter((x) => x.trend === "DOWN").length, bullishTrendCount: structures.filter((x) => x.trend === "UP").length, lowerLocationCount: structures.filter((x) => x.location === "LOWER").length, upperLocationCount: structures.filter((x) => x.location === "UPPER").length, breakdown4h, breakdown1d, regime, regimeSummary: describeRegime(regime), invalidationLevel, invalidationState, riskLevel, upperRangeChase, pullbackZone, reclaimStructure, volumeRecovery, macdImproving, rsiRecovery, bearishMomentumExpansion, atrShock };
}

export function analyzePositionStructure(snapshot: MarketSnapshot, averageEntryPrice: number): PositionStructureAnalysis {
  const base = analyzeMarketStructure(snapshot);
  return { ...base, averageEntryPrice, pnlPct: averageEntryPrice > 0 ? (base.currentPrice - averageEntryPrice) / averageEntryPrice : 0 };
}

export function summarizeLocation(location: RangeLocation): string { return location === "LOWER" ? "lower" : location === "UPPER" ? "upper" : "middle"; }
export function toDecisionSnapshot(structure: TimeframeStructure): DecisionDiagnosticsTimeframeSnapshot { return { trend: structure.trend, location: structure.location, ema20: structure.indicators.ema20, ema50: structure.indicators.ema50, ema200: structure.indicators.ema200, atr14: structure.indicators.atr14, rsi14: structure.indicators.rsi14, macdHistogram: structure.indicators.macdHistogram, volumeRatio: structure.indicators.volumeRatio, support: structure.support, resistance: structure.resistance, swingLow: structure.swingLow, swingHigh: structure.swingHigh }; }
export function getTriggerStateFromSignals(input: { bullishSignals: string[]; missingSignals: string[]; bearishConfirmation?: boolean; }): DecisionTriggerState { return input.bearishConfirmation ? "BEARISH_CONFIRMATION" : input.bullishSignals.length > 0 ? "CONFIRMED" : input.missingSignals.length > 0 ? "PENDING" : "NOT_APPLICABLE"; }

function analyzeTimeframe(timeframe: SupportedTimeframe, candles: MarketCandle[], currentPrice: number): TimeframeStructure {
  const recent = candles.slice(-Math.min(candles.length, LOOKBACK[timeframe]));
  const prior = recent.length > 1 ? recent.slice(0, -1) : recent;
  const closes = candles.map((c) => c.closePrice);
  const latestClose = recent[recent.length - 1]?.closePrice ?? currentPrice;
  const previousClose = recent[recent.length - 2]?.closePrice ?? latestClose;
  const firstClose = recent[0]?.closePrice ?? currentPrice;
  const changePct = firstClose > 0 ? (latestClose - firstClose) / firstClose : 0;
  const ema20 = calculateEma(closes, 20); const ema50 = calculateEma(closes, 50); const ema200 = calculateEma(closes, 200); const atr14 = calculateAtr(candles, 14); const rsi14 = calculateRsi(closes, 14); const macd = calculateMacd(closes); const volumeRatio = calculateVolumeRatio(candles, 20); const swings = findSwings(candles.slice(-SWING_LOOKBACK[timeframe]), currentPrice);
  return { timeframe, trend: classifyTrend(timeframe, changePct, latestClose, ema20, ema50), rangeHigh: getHigh(recent, currentPrice), rangeLow: getLow(recent, currentPrice), previousRangeHigh: getHigh(prior, currentPrice), previousRangeLow: getLow(prior, currentPrice), location: classifyLocation(currentPrice, swings.swingLow, swings.swingHigh), changePct, latestClose, previousClose, swingHigh: swings.swingHigh, swingLow: swings.swingLow, support: swings.swingLow, resistance: swings.swingHigh, indicators: { ema20, ema50, ema200, atr14, rsi14, macdLine: macd.line, macdSignal: macd.signal, macdHistogram: macd.histogram, previousMacdHistogram: macd.previousHistogram, volumeRatio }, aboveEma20: ema20 !== null ? latestClose >= ema20 : false, aboveEma50: ema50 !== null ? latestClose >= ema50 : false, aboveEma200: ema200 !== null ? latestClose >= ema200 : false, emaStackBullish: ema20 !== null && ema50 !== null && ema200 !== null ? ema20 >= ema50 && ema50 >= ema200 : false, emaStackBearish: ema20 !== null && ema50 !== null && ema200 !== null ? ema20 <= ema50 && ema50 <= ema200 : false, macdHistogramImproving: macd.histogram !== null && macd.previousHistogram !== null ? macd.histogram > macd.previousHistogram : false, rsiOverbought: rsi14 !== null ? rsi14 >= 70 : false, rsiOversold: rsi14 !== null ? rsi14 <= 35 : false };
}
function classifyTrend(timeframe: SupportedTimeframe, changePct: number, latestClose: number, ema20: number | null, ema50: number | null): TrendDirection { const above20 = ema20 !== null ? latestClose >= ema20 : false; const above50 = ema50 !== null ? latestClose >= ema50 : false; return changePct >= TREND_THRESHOLD[timeframe] && above20 && (ema50 === null || above50) ? "UP" : changePct <= -TREND_THRESHOLD[timeframe] && !above20 && (ema50 === null || !above50) ? "DOWN" : "FLAT"; }
function classifyRegime(timeframes: Record<SupportedTimeframe, TimeframeStructure>, currentPrice: number, breakdown4h: boolean, breakdown1d: boolean): MarketRegime { const oneHour = timeframes["1h"]; const fourHour = timeframes["4h"]; const oneDay = timeframes["1d"]; if (breakdown1d || (breakdown4h && oneDay.trend === "DOWN") || (oneDay.emaStackBearish && currentPrice < oneDay.support)) return "BREAKDOWN_RISK"; if (oneDay.emaStackBullish && fourHour.emaStackBullish && oneDay.trend !== "DOWN" && fourHour.trend !== "DOWN") return fourHour.location !== "UPPER" && (fourHour.latestClose <= (fourHour.indicators.ema20 ?? fourHour.latestClose) * 1.02 || oneHour.location !== "UPPER") ? "PULLBACK_IN_UPTREND" : "BULL_TREND"; if (oneDay.trend === "FLAT" && fourHour.trend !== "DOWN" && !oneDay.emaStackBearish && oneDay.location !== "LOWER") return "RANGE"; return "WEAK_DOWNTREND"; }
function describeRegime(regime: MarketRegime): string { return regime === "BULL_TREND" ? "Higher timeframes are aligned upward." : regime === "PULLBACK_IN_UPTREND" ? "Higher timeframes are constructive, but price is still in a pullback or retest." : regime === "RANGE" ? "Higher timeframes are mixed and range-bound." : regime === "WEAK_DOWNTREND" ? "Higher timeframes are soft enough that patience matters more than forcing a review." : "Higher timeframe support is failing and breakdown risk is elevated."; }
function getInvalidationLevel(timeframes: Record<SupportedTimeframe, TimeframeStructure>): number | null { const levels = [timeframes["4h"].support, timeframes["1d"].support].filter((v) => Number.isFinite(v) && v > 0); return levels.length === 0 ? null : Math.max(...levels); }
function classifyLocation(currentPrice: number, rangeLow: number, rangeHigh: number): RangeLocation { const width = rangeHigh - rangeLow; if (width <= 0) return "MIDDLE"; const p = (currentPrice - rangeLow) / width; return p <= 0.33 ? "LOWER" : p >= 0.67 ? "UPPER" : "MIDDLE"; }
function calculateEma(values: number[], period: number): number | null { if (values.length < period) return null; const mult = 2 / (period + 1); let ema = average(values.slice(0, period)); for (let i = period; i < values.length; i += 1) ema = ((values[i] ?? ema) - ema) * mult + ema; return ema; }
function calculateAtr(candles: MarketCandle[], period: number): number | null { if (candles.length <= period) return null; const trs: number[] = []; for (let i = 1; i < candles.length; i += 1) { const c = candles[i]; const p = candles[i - 1]; if (!c || !p) continue; trs.push(Math.max(c.highPrice - c.lowPrice, Math.abs(c.highPrice - p.closePrice), Math.abs(c.lowPrice - p.closePrice))); } if (trs.length < period) return null; let atr = average(trs.slice(0, period)); for (let i = period; i < trs.length; i += 1) atr = ((atr * (period - 1)) + (trs[i] ?? atr)) / period; return atr; }
function calculateRsi(values: number[], period: number): number | null { if (values.length <= period) return null; let gains = 0; let losses = 0; for (let i = 1; i <= period; i += 1) { const change = (values[i] ?? 0) - (values[i - 1] ?? 0); if (change >= 0) gains += change; else losses += Math.abs(change); } let avgGain = gains / period; let avgLoss = losses / period; for (let i = period + 1; i < values.length; i += 1) { const change = (values[i] ?? 0) - (values[i - 1] ?? 0); avgGain = ((avgGain * (period - 1)) + Math.max(change, 0)) / period; avgLoss = ((avgLoss * (period - 1)) + Math.max(-change, 0)) / period; } if (avgLoss === 0) return 100; const rs = avgGain / avgLoss; return 100 - (100 / (1 + rs)); }
function calculateMacd(values: number[]): { line: number | null; signal: number | null; histogram: number | null; previousHistogram: number | null } { if (values.length < 35) return { line: null, signal: null, histogram: null, previousHistogram: null }; const ema12 = calculateEmaSeries(values, 12); const ema26 = calculateEmaSeries(values, 26); const macdSeries = ema12.map((value, index) => { const slow = ema26[index] ?? null; return value !== null && slow !== null ? value - slow : null; }).filter((value): value is number => value !== null); const signalSeries = calculateEmaSeries(macdSeries, 9).filter((value): value is number => value !== null); if (macdSeries.length === 0 || signalSeries.length === 0) return { line: null, signal: null, histogram: null, previousHistogram: null }; const line = macdSeries[macdSeries.length - 1] ?? null; const signal = signalSeries[signalSeries.length - 1] ?? null; const prevLine = macdSeries[macdSeries.length - 2] ?? null; const prevSignal = signalSeries[signalSeries.length - 2] ?? null; return { line, signal, histogram: line !== null && signal !== null ? line - signal : null, previousHistogram: prevLine !== null && prevSignal !== null ? prevLine - prevSignal : null }; }
function calculateEmaSeries(values: number[], period: number): Array<number | null> { if (values.length < period) return values.map(() => null); const mult = 2 / (period + 1); const out: Array<number | null> = values.map(() => null); let ema = average(values.slice(0, period)); out[period - 1] = ema; for (let i = period; i < values.length; i += 1) { ema = ((values[i] ?? ema) - ema) * mult + ema; out[i] = ema; } return out; }
function calculateVolumeRatio(candles: MarketCandle[], period: number): number | null { if (candles.length < 2) return null; const latest = candles[candles.length - 1]?.volume ?? null; if (latest === null) return null; const baseline = candles.slice(Math.max(0, candles.length - 1 - period), candles.length - 1).map((c) => c.volume); if (baseline.length === 0) return null; const avg = average(baseline); return avg <= 0 ? null : latest / avg; }
function findSwings(candles: MarketCandle[], fallback: number): { swingHigh: number; swingLow: number } { if (candles.length < 5) return { swingHigh: getHigh(candles, fallback), swingLow: getLow(candles, fallback) }; let pivotHigh: number | null = null; let pivotLow: number | null = null; for (let i = 2; i < candles.length - 2; i += 1) { const current = candles[i]; if (!current) continue; const highs = candles.slice(i - 2, i + 3).map((c) => c.highPrice); const lows = candles.slice(i - 2, i + 3).map((c) => c.lowPrice); if (current.highPrice === Math.max(...highs)) pivotHigh = current.highPrice; if (current.lowPrice === Math.min(...lows)) pivotLow = current.lowPrice; } return { swingHigh: pivotHigh ?? getHigh(candles, fallback), swingLow: pivotLow ?? getLow(candles, fallback) }; }
function isRsiRecovery(structure: TimeframeStructure): boolean { const rsi = structure.indicators.rsi14; return rsi !== null && rsi >= 38 && rsi <= 62 && structure.macdHistogramImproving; }
function isAtrShock(structure: TimeframeStructure, currentPrice: number): boolean { const atr = structure.indicators.atr14; return atr !== null && atr > 0 && Math.abs(structure.latestClose - structure.previousClose) >= atr * 1.2 && currentPrice <= structure.support; }
function average(values: number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function getHigh(candles: MarketCandle[], fallback: number): number { return candles.length === 0 ? fallback : candles.reduce((highest, candle) => Math.max(highest, candle.highPrice), candles[0]?.highPrice ?? fallback); }
function getLow(candles: MarketCandle[], fallback: number): number { return candles.length === 0 ? fallback : candles.reduce((lowest, candle) => Math.min(lowest, candle.lowPrice), candles[0]?.lowPrice ?? fallback); }
