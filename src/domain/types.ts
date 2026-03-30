export type SupportedAsset = "BTC" | "ETH";
export type SupportedMarket = "KRW-BTC" | "KRW-ETH";
export type SupportedTimeframe = "1h" | "4h" | "1d";

export interface User {
  id: number;
  telegramUserId: string;
  telegramChatId: string | null;
  username: string | null;
  displayName: string | null;
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
    | "sleepModeEnabled"
    | "onboardingComplete"
  >;
  setup: {
    hasAccountState: boolean;
    hasPositionState: boolean;
    isComplete: boolean;
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

export type ActionNeededReason =
  | "COMPLETE_SETUP"
  | "INVALID_RECORDED_STATE"
  | "MARKET_DATA_UNAVAILABLE";

export interface ActionNeededAlert {
  reason: ActionNeededReason;
  cooldownKey: string;
  message: string;
}

export interface DecisionResult {
  status: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  symbol: SupportedMarket | null;
  generatedAt: string;
  alert: ActionNeededAlert | null;
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
