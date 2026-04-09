export type SupportedAsset = "BTC" | "ETH";
export type SupportedMarket = "KRW-BTC" | "KRW-ETH";
export type SupportedTimeframe = "1h" | "4h" | "1d";
export type TrackedAssetPreference = "BTC" | "ETH" | "BTC,ETH";
export type SupportedLocale = "ko" | "en";

export interface User {
  id: number;
  telegramUserId: string;
  telegramChatId: string | null;
  username: string | null;
  displayName: string | null;
  locale?: SupportedLocale | null;
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
  tradeTimeKst?: string | null;
  tradeTimeUtc?: string | null;
  exchangeTimestampMs?: number | null;
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
  fetchedAt?: string;
}

export interface DecisionContext {
  user: Pick<
    User,
    | "id"
    | "telegramUserId"
    | "telegramChatId"
    | "username"
    | "displayName"
    | "locale"
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
  strategy: StrategyInputs;
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
  | "EARLY_RECOVERY"
  | "RECLAIM_ATTEMPT"
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

export type EntryPath = "PULLBACK" | "RECLAIM" | "BREAKOUT_HOLD" | "NONE";

export type WeakeningStage = "NONE" | "SOFT" | "CLEAR" | "FAILURE";

export type SignalQualityBucket = "HIGH" | "MEDIUM" | "BORDERLINE" | "LOW";

export type StrategyAction = "HOLD" | "ENTRY" | "ADD" | "REDUCE" | "EXIT";

export type DecisionExecutionDisposition =
  | "IMMEDIATE"
  | "DEFERRED_CONFIRMATION"
  | "EXECUTED_AFTER_CONFIRMATION"
  | "SKIPPED";

export type ActionNeededReason =
  | "COMPLETE_SETUP"
  | "INVALID_RECORDED_STATE"
  | "MARKET_DATA_UNAVAILABLE"
  | "RISK_REVIEW_REQUIRED"
  | "ENTRY_REVIEW_REQUIRED"
  | "ADD_BUY_REVIEW_REQUIRED"
  | "REDUCE_REVIEW_REQUIRED"
  | "STATE_UPDATE_REMINDER";

export interface ActionNeededAlert {
  reason: ActionNeededReason;
  cooldownKey: string;
  message: string;
}

export interface StrategySignalQuality {
  score: number;
  bucket: SignalQualityBucket;
  confirmationRequired: boolean;
  confirmationSatisfied: boolean;
  reentryPenaltyApplied: boolean;
}

export interface StrategyExposureGuardrails {
  perAssetMaxAllocation: number;
  totalPortfolioMaxExposure: number;
  remainingAssetCapacity: number;
  remainingPortfolioCapacity: number;
}

export interface StrategySettings {
  minimumTradeValueKrw: number;
  entryAllocation: number;
  addAllocation: number;
  reduceFraction: number;
  perAssetMaxAllocation: number;
  totalPortfolioMaxExposure: number;
}

export interface StrategyPortfolioSnapshot {
  totalEquity: number;
  assetMarketValue: number;
  totalExposureValue: number;
  assetExposureRatio: number;
  totalExposureRatio: number;
}

export interface StrategyLatestDecision {
  action: StrategyAction;
  executionDisposition: DecisionExecutionDisposition;
  referencePrice: number;
  signalQuality: StrategySignalQuality;
  entryPath: EntryPath;
  qualityBucket: SignalQualityBucket;
  createdAt: string;
}

export interface StrategyRecentExit {
  createdAt: string | null;
  hoursSinceExit: number | null;
  realizedPnl: number | null;
}

export interface StrategyInputs {
  portfolio: StrategyPortfolioSnapshot;
  latestDecision: StrategyLatestDecision | null;
  recentExit: StrategyRecentExit;
  settings: StrategySettings;
}

export type ExecutionPlanType =
  | "ENTRY"
  | "ADD_BUY"
  | "REDUCE"
  | "EXIT_PLAN";

export type ExecutionSetupType =
  | "PULLBACK_ENTRY"
  | "RECLAIM_ENTRY"
  | "PULLBACK_ADD"
  | "STRENGTH_ADD"
  | "PARTIAL_REDUCE"
  | "EXIT_PLAN_REVIEW";

export interface ExecutionGuide {
  planType: ExecutionPlanType;
  setupType: ExecutionSetupType;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  initialSizePctOfCash: number | null;
  maxTotalSizePctOfCash: number | null;
  reducePctOfPosition: number | null;
  invalidationLevel: number | null;
  invalidationRuleText: string;
  chaseGuardText: string;
  actionText: string;
  cautionText: string | null;
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
  strategy?: {
    action: StrategyAction;
    executionDisposition: DecisionExecutionDisposition;
    signalQuality: StrategySignalQuality;
    exposureGuardrails: StrategyExposureGuardrails;
    entryPath: EntryPath;
    trendAlignmentScore: number;
    recoveryQualityScore: number;
    breakdownPressureScore: number;
    weakeningStage: WeakeningStage;
    referencePrice: number;
    bullishScore?: number;
    weaknessScore?: number;
    confirmationRequired?: boolean;
    confirmationSatisfied?: boolean;
    reentryPenaltyApplied?: boolean;
    latestDecisionAction?: StrategyAction | null;
    latestDecisionDisposition?: DecisionExecutionDisposition | null;
    recentExitHoursSince?: number | null;
    portfolio?: StrategyPortfolioSnapshot | null;
  } | null;
}

export interface DecisionResult {
  status: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  symbol: SupportedMarket | null;
  generatedAt: string;
  alert: ActionNeededAlert | null;
  executionGuide?: ExecutionGuide | null;
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
