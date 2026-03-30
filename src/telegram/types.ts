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
}

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

export interface TelegramRouterDependencies {
  stateStore?: TelegramStateStore;
  statusProvider?: TelegramStatusProvider;
}

export interface TelegramWebhookContext {
  env: TelegramWebhookEnv;
  deps?: TelegramRouterDependencies;
}

export type TelegramCallbackAction =
  | { kind: 'sleep:on' }
  | { kind: 'sleep:off' }
  | { kind: 'status:refresh' };

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
