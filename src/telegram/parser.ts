import type {
  TelegramCallbackAction,
  TelegramCallbackQuery,
  TelegramCommandContext,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramOutgoingAction,
  TelegramUpdate,
} from './types';

export interface TelegramParsedCommand {
  command: string;
  args: string[];
}

export function parseTelegramUpdate(input: unknown): TelegramUpdate | null {
  if (!isObject(input) || typeof input.update_id !== 'number') {
    return null;
  }

  const update: TelegramUpdate = { update_id: input.update_id };

  if (isObject(input.message) && typeof input.message.message_id === 'number') {
    update.message = parseTelegramMessage(input.message);
  }

  if (isObject(input.callback_query) && typeof input.callback_query.id === 'string') {
    update.callback_query = parseTelegramCallbackQuery(input.callback_query);
  }

  return update;
}

export function parseMessageCommand(text: string): TelegramParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const firstLine = trimmed.split(/\s+/u);
  const rawCommand = firstLine[0] ?? '';
  const commandName = rawCommand.slice(1).split('@')[0]?.toLowerCase() ?? '';
  const args = firstLine.slice(1);

  if (!commandName) {
    return null;
  }

  return { command: commandName, args };
}

export function parseCashAmount(text: string): number | null {
  const normalized = text.trim().replace(/,/g, '');
  if (!normalized) {
    return null;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

export function parseSleepModeArg(args: string[]): boolean | null {
  const value = args[0]?.toLowerCase();
  if (value === 'on') {
    return true;
  }
  if (value === 'off') {
    return false;
  }
  return null;
}

export function parseTelegramCallbackAction(data: string | undefined): TelegramCallbackAction | null {
  if (!data) {
    return null;
  }

  if (data === 'sleep:on') {
    return { kind: 'sleep:on' };
  }
  if (data === 'sleep:off') {
    return { kind: 'sleep:off' };
  }
  if (data === 'status:refresh') {
    return { kind: 'status:refresh' };
  }

  return null;
}

export function commandContextFromMessage(update: TelegramUpdate, message: TelegramMessage): TelegramCommandContext | null {
  const from = message.from;
  const text = message.text?.trim();
  if (!from || !text) {
    return null;
  }

  const parsed = parseMessageCommand(text);
  if (!parsed) {
    return null;
  }

  return {
    update,
    chatId: message.chat.id,
    userId: from.id,
    text,
    command: parsed.command,
    args: parsed.args,
  };
}

export function callbackContextFromQuery(update: TelegramUpdate, callbackQuery: TelegramCallbackQuery): TelegramCommandContext | null {
  const from = callbackQuery.from;
  const message = callbackQuery.message;
  if (!message) {
    return null;
  }

  return {
    update,
    chatId: message.chat.id,
    userId: from.id,
    text: callbackQuery.data ?? '',
    command: 'callback',
    args: [],
    replyToCallback: callbackQuery,
  };
}

function parseTelegramMessage(input: Record<string, unknown>): TelegramMessage {
  const message: TelegramMessage = {
    message_id: input.message_id as number,
    date: input.date as number,
    chat: input.chat as TelegramMessage['chat'],
  };

  if (isTelegramUser(input.from)) {
    message.from = input.from;
  }
  if (typeof input.text === 'string') {
    message.text = input.text;
  }
  if (Array.isArray(input.entities)) {
    message.entities = input.entities as TelegramMessageEntity[];
  }

  return message;
}

function parseTelegramCallbackQuery(input: Record<string, unknown>): TelegramCallbackQuery {
  const callbackQuery: TelegramCallbackQuery = {
    id: input.id as string,
    from: isTelegramUser(input.from) ? input.from : { id: 0 },
  };

  if (typeof input.data === 'string') {
    callbackQuery.data = input.data;
  }
  if (isObject(input.message)) {
    callbackQuery.message = parseTelegramMessage(input.message);
  }

  return callbackQuery;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTelegramUser(value: unknown): value is TelegramCallbackQuery['from'] {
  return isObject(value) && typeof value.id === 'number';
}
