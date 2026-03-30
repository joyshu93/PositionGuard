export type AssetSymbol = "BTC" | "ETH";
export type MarketSymbol = "KRW-BTC" | "KRW-ETH";

export interface UserRecord {
  id: number;
  telegramUserId: string;
  telegramChatId: string | null;
  username: string | null;
  displayName: string | null;
  sleepMode: boolean;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileInput {
  telegramUserId: string;
  telegramChatId?: string | null;
  username?: string | null;
  displayName?: string | null;
}

export interface AccountStateRecord {
  id: number;
  userId: number;
  currency: string;
  availableCash: number;
  source: "user_reported";
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountStateInput {
  currency?: string;
  availableCash: number;
  reportedAt?: string;
}

export interface PositionStateRecord {
  id: number;
  userId: number;
  asset: AssetSymbol;
  quantity: number;
  averageEntryPrice: number;
  source: "user_reported";
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PositionStateInput {
  asset: AssetSymbol;
  quantity: number;
  averageEntryPrice: number;
  reportedAt?: string;
}

export type DecisionStatus =
  | "SETUP_INCOMPLETE"
  | "INSUFFICIENT_DATA"
  | "NO_ACTION"
  | "ACTION_NEEDED";
export type NotificationDeliveryStatus = "SENT" | "SKIPPED";

export interface DecisionLogInput {
  userId: number;
  asset: AssetSymbol;
  symbol: MarketSymbol;
  decisionStatus: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  notificationEmitted?: boolean;
  context: unknown;
  createdAt?: string;
}

export interface DecisionLogRecord {
  id: number;
  userId: number;
  asset: AssetSymbol;
  symbol: MarketSymbol;
  decisionStatus: DecisionStatus;
  summary: string;
  reasons: string[];
  actionable: boolean;
  notificationEmitted: boolean;
  context: unknown;
  createdAt: string;
}

export interface NotificationEventInput {
  userId: number;
  decisionLogId?: number | null;
  asset?: AssetSymbol | null;
  reasonKey?: string | null;
  deliveryStatus?: NotificationDeliveryStatus;
  eventType: string;
  channel?: string;
  payload?: unknown;
  sentAt?: string | null;
  cooldownUntil?: string | null;
  suppressedBy?: string | null;
}

export interface NotificationEventRecord {
  id: number;
  userId: number;
  decisionLogId: number | null;
  asset: AssetSymbol | null;
  reasonKey: string | null;
  deliveryStatus: NotificationDeliveryStatus;
  eventType: string;
  channel: string;
  payload: unknown;
  sentAt: string | null;
  cooldownUntil: string | null;
  suppressedBy: string | null;
  createdAt: string;
}

export interface NotificationEventLookup {
  id: number;
  userId: number;
  asset: AssetSymbol | null;
  reasonKey: string | null;
  deliveryStatus: NotificationDeliveryStatus;
  eventType: string;
  sentAt: string | null;
  cooldownUntil: string | null;
  createdAt: string;
}

export interface UserStateSnapshot {
  user: UserRecord;
  accountState: AccountStateRecord | null;
  positionStates: PositionStateRecord[];
}

export interface DecisionLogLookup {
  userId: number;
  asset: AssetSymbol;
  decisionStatus: DecisionStatus;
  summary: string;
  createdAt: string;
}
