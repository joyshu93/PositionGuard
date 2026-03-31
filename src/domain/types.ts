export type SupportedAsset = "BTC" | "ETH";
export type SupportedMarket = "KRW-BTC" | "KRW-ETH";
export type SupportedTimeframe = "1h" | "4h" | "1d";
export type TrackedAssetPreference = "BTC" | "ETH" | "BTC,ETH";

export interface User {
  id: number;
  telegramUserId: string;
  telegramChatId: string | null;
  username: string | null;
  displayName: string | null;
  trackedAssets: TrackedAssetPreference;
  sleepModeEnabled: boolean;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountState {
  id: number;
  userId: number;
  availableCash: number;
  reportedAt: string;
  source: "USER_REPORTED";
  createdAt: string;
  updatedAt: string;
}

export interface PositionState {
  id: number;
  userId: number;
  asset: SupportedAsset;
  quantity: number;
  averageEntryPrice: number;
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketTicker {
  market: SupportedMarket;
  tradePrice: number;
  changeRate: number;
  fetchedAt: string;
}

export interface MarketCandle {
  market: SupportedMarket;
  timeframe: SupportedTimeframe;
  openTime: string;
  closeTime: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  quoteVolume: number;
}

export interface TimeframeMarketSnapshot {
  timeframe: SupportedTimeframe;
  candles: MarketCandle[];
}

export interface MarketSnapshot {
  market: SupportedMarket;
  asset: SupportedAsset;
  ticker: MarketTicker;
  timeframes: Record<SupportedTimeframe, TimeframeMarketSnapshot>;
}

export interface DecisionContext {
  user: Pick<
    User,
    | "id"
    | "telegramUserId"
    | "telegramChatId"
    | "username"
    | "displayName"
    | "trackedAssets"
    | "sleepModeEnabled"
    | "onboardingComplete"
  >;
  setup: {
    trackedAssets: SupportedAsset[];
    hasAccountState: boolean;
    readyPositionAssets: SupportedAsset[];
    isReady: boolean;
    missingItems: string[];
  };
  accountState: AccountState | null;
  positionState: PositionState | null;
  marketSnapshot: MarketSnapshot | null;
  generatedAt: string;
}

export type DecisionStatus =
  | "SETUP_INCOMPLETE"
  | "INSUFFICIENT_DATA"
  | "NO_ACTION"
  | "ACTION_NEEDED";

export type MarketRegime =
  | "BULL_TREND"
  | "PULLBACK_IN_UPTREND"
  | "RANGE"
  | "WEAK_DOWNTREND"
  | "BREAKDOWN_RISK";

export type DecisionSetupState =
  | "READY"
  | "PROMISING"
  | "BLOCKED"
  | "NOT_APPLICABLE";

export type DecisionTriggerState =
  | "CONFIRMED"
  | "PENDING"
  | "BEARISH_CONFIRMATION"
  | "NOT_APPLICABLE";

export type DecisionRiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export type InvalidationState = "CLEAR" | "UNCLEAR" | "BROKEN";

export type ActionNeededReason =
  | "COMPLETE_SETUP"
  | "INVALID_RECORDED_STATE"
  | "MARKET_DATA_UNAVAILABLE"
  | "RISK_REVIEW_REQUIRED"
  | "ENTRY_REVIEW_REQUIRED"
  | "ADD_BUY_REVIEW_REQUIRED"
  | "REDUCE_REVIEW_REQUIRED";

export interface ActionNeededAlert {
  reason: ActionNeededReason;
  cooldownKey: string;
  message: string;
}

export interface DecisionDiagnosticsTimeframeSnapshot {
  trend: "UP" | "DOWN" | "FLAT";
  location: "LOWER" | "MIDDLE" | "UPPER";
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  atr14: number | null;
  rsi14: number | null;
  macdHistogram: number | null;
  volumeRatio: number | null;
  support: number | null;
  resistance: number | null;
  swingLow: number | null;
  swingHigh: number | null;
}

export interface DecisionDiagnostics {
  regime: {
    classification: MarketRegime;
    summary: string;
  } | null;
  setup: {
    kind: "ENTRY" | "ADD_BUY" | "REDUCE" | "NONE";
    state: DecisionSetupState;
    supports: string[];
    blockers: string[];
  };
  trigger: {
    state: DecisionTriggerState;
    confirmed: string[];
    missing: string[];
  };
  risk: {
    level: DecisionRiskLevel;
    invalidationState: InvalidationState;
    invalidationLevel: number | null;
    notes: string[];
  };
  indicators: {
    price: number | null;
    timeframes: Record<SupportedTimeframe, DecisionDiagnosticsTimeframeSnapshot>;
  };
}

export interface DecisionResult {
  status: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  symbol: SupportedMarket | null;
  generatedAt: string;
  alert: ActionNeededAlert | null;
  diagnostics?: DecisionDiagnostics | null;
}

export interface DecisionLogRecord {
  id: number;
  userId: number;
  market: SupportedMarket | null;
  status: DecisionStatus;
  summary: string;
  contextJson: string;
  notificationSent: boolean;
  createdAt: string;
}

export interface NotificationEventRecord {
  id: number;
  userId: number;
  eventType: string;
  market: SupportedMarket | null;
  payloadJson: string;
  createdAt: string;
}

export interface UserStateBundle {
  user: User;
  accountState: AccountState | null;
  positions: Partial<Record<SupportedAsset, PositionState>>;
}
