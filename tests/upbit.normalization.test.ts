import {
  getCandleEndpoint,
  normalizeUpbitCandleSeries,
  normalizeUpbitDayCandle,
  normalizeUpbitMinuteCandle,
  normalizeUpbitTicker,
} from "../src/upbit.js";
import { assertEqual } from "./test-helpers.js";

const ticker = normalizeUpbitTicker({
  market: "KRW-BTC",
  trade_date_kst: "2026-03-30",
  trade_time_kst: "11:00:00",
  trade_date_utc: "2026-03-30",
  trade_time_utc: "02:00:00",
  trade_price: 12345,
  change_rate: 0.12,
  signed_change_price: 34,
  acc_trade_price_24h: 1000,
  acc_trade_volume_24h: 2,
  timestamp: 1711767600000,
});

assertEqual(ticker.market, "KRW-BTC", "Ticker normalization should preserve market.");
assertEqual(ticker.tradePrice, 12345, "Ticker normalization should map trade price.");
assertEqual(
  ticker.tradeDateTimeKst,
  "2026-03-30T11:00:00",
  "Ticker normalization should compose KST timestamp.",
);
assertEqual(
  ticker.tradeDateTimeUtc,
  "2026-03-30T02:00:00",
  "Ticker normalization should compose UTC timestamp.",
);
assertEqual(
  ticker.timestamp,
  1711767600000,
  "Ticker normalization should preserve the exchange timestamp.",
);

const fourHourCandle = normalizeUpbitMinuteCandle(
  {
    market: "KRW-ETH",
    candle_date_time_utc: "2026-03-30T00:00:00",
    candle_date_time_kst: "2026-03-30T09:00:00",
    opening_price: 100,
    high_price: 120,
    low_price: 90,
    trade_price: 110,
    candle_acc_trade_price: 5000,
    candle_acc_trade_volume: 42,
    unit: 240,
    timestamp: 1711756800000,
  },
  "4h",
);

assertEqual(fourHourCandle.timeframe, "4h", "4h normalization should preserve timeframe.");
assertEqual(
  fourHourCandle.sourceUnitMinutes,
  240,
  "4h normalization should map to the 240-minute Upbit endpoint.",
);
assertEqual(
  fourHourCandle.closedAtUtc,
  "2026-03-30T04:00:00",
  "Minute candle normalization should derive the UTC close time.",
);

const dailyCandle = normalizeUpbitDayCandle({
  market: "KRW-BTC",
  candle_date_time_utc: "2026-03-29T00:00:00",
  candle_date_time_kst: "2026-03-29T09:00:00",
  opening_price: 80,
  high_price: 130,
  low_price: 70,
  trade_price: 115,
  candle_acc_trade_price: 9000,
  candle_acc_trade_volume: 64,
  timestamp: 1711670400000,
});

assertEqual(dailyCandle.timeframe, "1d", "Daily normalization should produce the 1d timeframe.");
assertEqual(dailyCandle.close, 115, "Daily normalization should map close price.");
assertEqual(
  dailyCandle.closedAtUtc,
  "2026-03-30T00:00:00",
  "Daily candle normalization should derive the UTC close time.",
);

const series = normalizeUpbitCandleSeries("KRW-BTC", "1h", [
  {
    market: "KRW-BTC",
    candle_date_time_utc: "2026-03-30T02:00:00",
    candle_date_time_kst: "2026-03-30T11:00:00",
    opening_price: 100,
    high_price: 110,
    low_price: 95,
    trade_price: 105,
    candle_acc_trade_price: 1000,
    candle_acc_trade_volume: 10,
    unit: 60,
  },
  {
    market: "KRW-BTC",
    candle_date_time_utc: "2026-03-30T01:00:00",
    candle_date_time_kst: "2026-03-30T10:00:00",
    opening_price: 90,
    high_price: 100,
    low_price: 85,
    trade_price: 95,
    candle_acc_trade_price: 900,
    candle_acc_trade_volume: 9,
    unit: 60,
  },
]);

assertEqual(
  series.candles[0]?.openedAtUtc ?? null,
  "2026-03-30T01:00:00",
  "Candle series normalization should sort ascending by open time.",
);
assertEqual(
  series.candles[0]?.closedAtUtc ?? null,
  "2026-03-30T02:00:00",
  "Candle series normalization should preserve derived close times.",
);
assertEqual(
  getCandleEndpoint("4h"),
  "/v1/candles/minutes/240",
  "Endpoint resolution should use the public Upbit 240-minute path for 4h candles.",
);
