export const SUPPORTED_MARKETS = ["KRW-BTC", "KRW-ETH"] as const;
export type SupportedMarket = (typeof SUPPORTED_MARKETS)[number];

export const SUPPORTED_TIMEFRAMES = ["1h", "4h", "1d"] as const;
export type SupportedTimeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

export type CandleSource = "minutes" | "days";

export interface UpbitTickerResponse {
  market: string;
  trade_date_kst: string;
  trade_time_kst: string;
  trade_date_utc: string;
  trade_time_utc: string;
  trade_price: number;
  change_rate?: number;
  signed_change_price?: number;
  acc_trade_price_24h?: number;
  acc_trade_volume_24h?: number;
  timestamp?: number;
}

export interface UpbitMinuteCandleResponse {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
  unit: number;
  timestamp?: number;
}

export interface UpbitDayCandleResponse {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
  timestamp?: number;
}

export interface NormalizedTicker {
  market: SupportedMarket;
  tradePrice: number;
  changeRate: number | null;
  signedChangePrice: number | null;
  accTradePrice24h: number | null;
  accTradeVolume24h: number | null;
  tradeDateTimeKst: string;
  tradeDateTimeUtc: string;
  timestamp: number | null;
}

export interface NormalizedCandle {
  market: SupportedMarket;
  timeframe: SupportedTimeframe;
  source: CandleSource;
  sourceUnitMinutes: number;
  openedAtUtc: string;
  openedAtKst: string;
  closedAtUtc: string;
  closedAtKst: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  value: number;
  timestamp: number | null;
}

export interface NormalizedCandleSeries {
  market: SupportedMarket;
  timeframe: SupportedTimeframe;
  candles: NormalizedCandle[];
  fetchedAt: string;
}

export interface UpbitClientOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export type MarketSnapshotFailureReason =
  | "NO_DATA"
  | "FETCH_FAILURE"
  | "NORMALIZATION_FAILURE";

export type MarketSnapshotResult =
  | {
      ok: true;
      snapshot: import("./domain/types").MarketSnapshot;
    }
  | {
      ok: false;
      snapshot: null;
      reason: MarketSnapshotFailureReason;
      message: string;
    };

export interface CandleQueryOptions {
  count?: number;
  to?: string;
}

const DEFAULT_BASE_URL = "https://api.upbit.com";
const MAX_CANDLE_COUNT = 200;

const timeframeConfig: Record<SupportedTimeframe, { source: CandleSource; endpointUnit: number; sourceUnitMinutes: number }> = {
  "1h": { source: "minutes", endpointUnit: 60, sourceUnitMinutes: 60 },
  "4h": { source: "minutes", endpointUnit: 240, sourceUnitMinutes: 240 },
  "1d": { source: "days", endpointUnit: 1, sourceUnitMinutes: 1440 },
};

export function isSupportedMarket(market: string): market is SupportedMarket {
  return (SUPPORTED_MARKETS as readonly string[]).includes(market);
}

export function isSupportedTimeframe(timeframe: string): timeframe is SupportedTimeframe {
  return (SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframe);
}

export function normalizeUpbitTicker(input: UpbitTickerResponse): NormalizedTicker {
  if (!isSupportedMarket(input.market)) {
    throw new Error(`Unsupported market: ${input.market}`);
  }

  return {
    market: input.market,
    tradePrice: input.trade_price,
    changeRate: typeof input.change_rate === "number" ? input.change_rate : null,
    signedChangePrice: typeof input.signed_change_price === "number" ? input.signed_change_price : null,
    accTradePrice24h: typeof input.acc_trade_price_24h === "number" ? input.acc_trade_price_24h : null,
    accTradeVolume24h: typeof input.acc_trade_volume_24h === "number" ? input.acc_trade_volume_24h : null,
    tradeDateTimeKst: `${input.trade_date_kst}T${input.trade_time_kst}`,
    tradeDateTimeUtc: `${input.trade_date_utc}T${input.trade_time_utc}`,
    timestamp: typeof input.timestamp === "number" ? input.timestamp : null,
  };
}

export function normalizeUpbitMinuteCandle(
  input: UpbitMinuteCandleResponse,
  timeframe: SupportedTimeframe,
): NormalizedCandle {
  if (!isSupportedMarket(input.market)) {
    throw new Error(`Unsupported market: ${input.market}`);
  }

  const expected = timeframeConfig[timeframe];
  if (expected.source !== "minutes") {
    throw new Error(`Timeframe ${timeframe} is not a minute candle timeframe`);
  }

  if (input.unit !== expected.endpointUnit) {
    throw new Error(`Unexpected Upbit minute candle unit ${input.unit} for timeframe ${timeframe}`);
  }

  return {
    market: input.market,
    timeframe,
    source: expected.source,
    sourceUnitMinutes: expected.sourceUnitMinutes,
    openedAtUtc: input.candle_date_time_utc,
    openedAtKst: input.candle_date_time_kst,
    open: input.opening_price,
    high: input.high_price,
    low: input.low_price,
    close: input.trade_price,
    volume: input.candle_acc_trade_volume,
    value: input.candle_acc_trade_price,
    timestamp: typeof input.timestamp === "number" ? input.timestamp : null,
    closedAtUtc: addMinutesIso(input.candle_date_time_utc, expected.sourceUnitMinutes),
    closedAtKst: addMinutesIso(input.candle_date_time_kst, expected.sourceUnitMinutes),
  };
}

export function normalizeUpbitDayCandle(input: UpbitDayCandleResponse): NormalizedCandle {
  if (!isSupportedMarket(input.market)) {
    throw new Error(`Unsupported market: ${input.market}`);
  }

  return {
    market: input.market,
    timeframe: "1d",
    source: "days",
    sourceUnitMinutes: timeframeConfig["1d"].sourceUnitMinutes,
    openedAtUtc: input.candle_date_time_utc,
    openedAtKst: input.candle_date_time_kst,
    open: input.opening_price,
    high: input.high_price,
    low: input.low_price,
    close: input.trade_price,
    volume: input.candle_acc_trade_volume,
    value: input.candle_acc_trade_price,
    timestamp: typeof input.timestamp === "number" ? input.timestamp : null,
    closedAtUtc: addMinutesIso(input.candle_date_time_utc, timeframeConfig["1d"].sourceUnitMinutes),
    closedAtKst: addMinutesIso(input.candle_date_time_kst, timeframeConfig["1d"].sourceUnitMinutes),
  };
}

export function sortCandlesAscending<T extends { openedAtUtc: string }>(candles: T[]): T[] {
  return [...candles].sort((a, b) => a.openedAtUtc.localeCompare(b.openedAtUtc));
}

export function normalizeUpbitCandleSeries(
  market: SupportedMarket,
  timeframe: SupportedTimeframe,
  candles: Array<UpbitMinuteCandleResponse | UpbitDayCandleResponse>,
): NormalizedCandleSeries {
  for (const candle of candles) {
    if (!isSupportedMarket(candle.market)) {
      throw new Error(`Unsupported market: ${candle.market}`);
    }
    if (candle.market !== market) {
      throw new Error(`Mismatched candle market ${candle.market} for requested market ${market}`);
    }
  }

  const normalized = candles.map((candle) =>
    timeframe === "1d"
      ? normalizeUpbitDayCandle(candle as UpbitDayCandleResponse)
      : normalizeUpbitMinuteCandle(candle as UpbitMinuteCandleResponse, timeframe),
  );

  return {
    market,
    timeframe,
    candles: sortCandlesAscending(normalized),
    fetchedAt: new Date().toISOString(),
  };
}

export class UpbitClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: UpbitClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async getTicker(market: SupportedMarket): Promise<NormalizedTicker> {
    const response = await this.fetchJson<UpbitTickerResponse[]>(`/v1/ticker?markets=${encodeURIComponent(market)}`);
    const ticker = Array.isArray(response) ? response[0] : undefined;
    if (!ticker) {
      throw new Error(`Upbit ticker response was empty for market ${market}`);
    }

    return normalizeUpbitTicker(ticker);
  }

  async getCandleSeries(
    market: SupportedMarket,
    timeframe: SupportedTimeframe,
    options: CandleQueryOptions = {},
  ): Promise<NormalizedCandleSeries> {
    const { source, endpointUnit } = timeframeConfig[timeframe];
    const params = new URLSearchParams();
    params.set("market", market);
    params.set("count", String(Math.min(options.count ?? 200, MAX_CANDLE_COUNT)));
    if (options.to) {
      params.set("to", options.to);
    }

    const path = source === "days" ? "/v1/candles/days" : `/v1/candles/minutes/${endpointUnit}`;
    const response = await this.fetchJson<Array<UpbitMinuteCandleResponse | UpbitDayCandleResponse>>(
      `${path}?${params.toString()}`,
    );

    if (!Array.isArray(response)) {
      throw new Error(`Upbit candle response was not an array for market ${market} timeframe ${timeframe}`);
    }

    return normalizeUpbitCandleSeries(market, timeframe, response);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Upbit request failed (${response.status} ${response.statusText}): ${body}`);
    }

    return (await response.json()) as T;
  }
}

export function getCandleEndpoint(timeframe: SupportedTimeframe): string {
  const { source, endpointUnit } = timeframeConfig[timeframe];
  return source === "days" ? "/v1/candles/days" : `/v1/candles/minutes/${endpointUnit}`;
}

export function getMarketForAsset(asset: "BTC" | "ETH"): SupportedMarket {
  return asset === "BTC" ? "KRW-BTC" : "KRW-ETH";
}

export async function getMarketSnapshot(
  baseUrl: string | undefined,
  market: SupportedMarket,
): Promise<import("./domain/types").MarketSnapshot | null> {
  const result = await getMarketSnapshotResult(baseUrl, market);
  return result.ok ? result.snapshot : null;
}

export async function getMarketSnapshotResult(
  baseUrl: string | undefined,
  market: SupportedMarket,
): Promise<MarketSnapshotResult> {
  const client = new UpbitClient(baseUrl ? { baseUrl } : {});
  const fetchedAt = new Date().toISOString();

  try {
    const [ticker, hourly, fourHour, daily] = await Promise.all([
      client.getTicker(market),
      client.getCandleSeries(market, "1h", { count: 24 }),
      client.getCandleSeries(market, "4h", { count: 24 }),
      client.getCandleSeries(market, "1d", { count: 30 }),
    ]);

    if (
      hourly.candles.length === 0 ||
      fourHour.candles.length === 0 ||
      daily.candles.length === 0
    ) {
      return {
        ok: false,
        snapshot: null,
        reason: "NO_DATA",
        message: `Upbit returned empty candle data for ${market}.`,
      };
    }

    return {
      ok: true,
      snapshot: {
        market,
        asset: market === "KRW-BTC" ? "BTC" : "ETH",
        ticker: {
          market,
          tradePrice: ticker.tradePrice,
          changeRate: ticker.changeRate ?? 0,
          tradeTimeKst: ticker.tradeDateTimeKst,
          tradeTimeUtc: ticker.tradeDateTimeUtc,
          exchangeTimestampMs: ticker.timestamp,
          fetchedAt,
        },
        timeframes: {
          "1h": {
            timeframe: "1h",
            candles: hourly.candles.map(mapNormalizedCandle),
          },
          "4h": {
            timeframe: "4h",
            candles: fourHour.candles.map(mapNormalizedCandle),
          },
          "1d": {
            timeframe: "1d",
            candles: daily.candles.map(mapNormalizedCandle),
          },
        },
        fetchedAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Upbit error.";
    const reason = message.includes("Unsupported") || message.includes("Unexpected")
      ? "NORMALIZATION_FAILURE"
      : "FETCH_FAILURE";
    console.warn(`[upbit] ${market} snapshot failed (${reason}): ${message}`);

    return {
      ok: false,
      snapshot: null,
      reason,
      message,
    };
  }
}

function mapNormalizedCandle(
  candle: NormalizedCandle,
): import("./domain/types").MarketCandle {
  return {
    market: candle.market,
    timeframe: candle.timeframe,
    openTime: candle.openedAtUtc,
    closeTime: candle.closedAtUtc,
    openPrice: candle.open,
    highPrice: candle.high,
    lowPrice: candle.low,
    closePrice: candle.close,
    volume: candle.volume,
    quoteVolume: candle.value,
  };
}

function addMinutesIso(value: string, minutes: number): string {
  const parsed = Date.parse(`${value}Z`);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed + minutes * 60_000).toISOString().slice(0, 19);
}
