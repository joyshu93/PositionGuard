export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: TelegramChatType;
  username?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  entities?: TelegramMessageEntity[];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramWebhookEnv {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export interface TelegramUserStateSnapshot {
  telegramUserId: number;
  isSleeping: boolean;
  cash: number | null;
  trackedAssets: "BTC" | "ETH" | "BTC,ETH";
}

export type TelegramTrackedAssetsSelection = "BTC" | "ETH" | "BOTH";

export type TelegramActionNeededReason =
  | "SETUP_INCOMPLETE"
  | "MISSING_MARKET_DATA"
  | "INVALID_STORED_STATE"
  | "RISK_REVIEW_REQUIRED"
  | "ENTRY_REVIEW_REQUIRED"
  | "ADD_BUY_REVIEW_REQUIRED"
  | "REDUCE_REVIEW_REQUIRED";

export interface TelegramUserProfile {
  telegramUserId: number;
  telegramChatId: number;
  username?: string;
  displayName?: string;
}

export interface TelegramStateStore {
  getUserState(telegramUserId: number): Promise<TelegramUserStateSnapshot | null>;
  upsertUserState(input: TelegramUserProfile): Promise<void>;
  setCash(telegramUserId: number, cash: number): Promise<void>;
  setPosition(input: {
    telegramUserId: number;
    asset: "BTC" | "ETH";
    quantity: number;
    averageEntryPrice: number;
  }): Promise<void>;
  setSleepMode(telegramUserId: number, isSleeping: boolean): Promise<void>;
}

export interface TelegramStatusProvider {
  getStatus(telegramUserId: number): Promise<string>;
}

export interface TelegramNotificationSnapshot {
  reason: TelegramActionNeededReason;
  summary: string;
  asset: "BTC" | "ETH" | null;
  sentAt: string;
  cooldownUntil: string | null;
}

export interface TelegramNotificationProvider {
  getLastAlert(telegramUserId: number): Promise<TelegramNotificationSnapshot | null>;
}

export interface TelegramOnboardingSnapshot {
  trackedAssets: ("BTC" | "ETH")[];
  hasCashRecord: boolean;
  trackedPositionAssets: ("BTC" | "ETH")[];
  isReady: boolean;
  missingNextSteps: string[];
}

export interface TelegramOnboardingProvider {
  getOnboardingSnapshot(telegramUserId: number): Promise<TelegramOnboardingSnapshot | null>;
  setTrackedAssets(
    telegramUserId: number,
    trackedAssets: ("BTC" | "ETH")[],
  ): Promise<TelegramOnboardingSnapshot | null>;
}

export interface TelegramLastDecisionLine {
  asset: "BTC" | "ETH";
  status: string;
  summary: string;
  createdAt: string;
  alertOutcome: "sent" | "skipped" | "not_applicable";
  suppressedBy: string | null;
}

export interface TelegramLastDecisionSnapshot {
  trackedAssets: ("BTC" | "ETH")[];
  lines: TelegramLastDecisionLine[];
}

export interface TelegramHourlyHealthSnapshot {
  trackedAssets: ("BTC" | "ETH")[];
  readiness: {
    isReady: boolean;
    missingItems: string[];
    hasCashRecord: boolean;
    readyPositionAssets: ("BTC" | "ETH")[];
  };
  lastRunAt: string | null;
  lastDecisionStatus: string | null;
  marketDataStatus: "ok" | "no_data" | "fetch_failure" | "normalization_failure" | null;
  recentMarketFailureCount: number;
  recentCooldownSkipCount: number;
  recentSleepSuppressionCount: number;
  recentSetupBlockedCount: number;
  latestMarketFailureMessage: string | null;
  latestNotification: {
    deliveryStatus: "SENT" | "SKIPPED";
    reasonKey: string | null;
    suppressedBy: string | null;
    sentAt: string | null;
  } | null;
}

export interface TelegramInspectionProvider {
  getLastDecisionSnapshot(telegramUserId: number): Promise<TelegramLastDecisionSnapshot | null>;
  getHourlyHealthSnapshot(telegramUserId: number): Promise<TelegramHourlyHealthSnapshot | null>;
}

export interface TelegramRouterDependencies {
  stateStore?: TelegramStateStore;
  statusProvider?: TelegramStatusProvider;
  notificationProvider?: TelegramNotificationProvider;
  onboardingProvider?: TelegramOnboardingProvider;
  inspectionProvider?: TelegramInspectionProvider;
}

export interface TelegramWebhookContext {
  env: TelegramWebhookEnv;
  deps?: TelegramRouterDependencies;
}

export type TelegramCallbackAction =
  | { kind: 'sleep:on' }
  | { kind: 'sleep:off' }
  | { kind: 'status:refresh' }
  | { kind: 'setup:progress' }
  | { kind: 'setup:track'; trackedAssets: TelegramTrackedAssetsSelection }
  | { kind: 'setup:cash' }
  | { kind: 'setup:position'; asset: "BTC" | "ETH" }
  | { kind: 'inspect:lastdecision' }
  | { kind: 'inspect:hourlyhealth' };

export interface TelegramReplyMarkupButton {
  text: string;
  callback_data: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard: TelegramReplyMarkupButton[][];
}

export type TelegramOutgoingAction =
  | {
      kind: 'sendMessage';
      chatId: number;
      text: string;
      replyMarkup?: TelegramReplyMarkup;
    }
  | {
      kind: 'answerCallbackQuery';
      callbackQueryId: string;
      text?: string;
      showAlert?: boolean;
    };

export interface TelegramCommandContext {
  update: TelegramUpdate;
  chatId: number;
  userId: number;
  profile: TelegramUserProfile;
  text: string;
  command: string;
  args: string[];
  replyToCallback?: TelegramCallbackQuery;
}
