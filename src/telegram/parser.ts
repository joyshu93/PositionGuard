import type {
  TelegramCallbackAction,
  TelegramCallbackQuery,
  TelegramCommandContext,
  TelegramDocument,
  TelegramMediaMessageContext,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramPhotoSize,
  TelegramUserProfile,
  TelegramUpdate,
} from './types.js';

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

export function parsePositionArgs(args: string[]): {
  asset: string;
  quantity: string;
  averageEntryPrice: string;
} | null {
  if (args.length < 3) {
    return null;
  }

  const [asset, quantity, averageEntryPrice] = args;
  if (!asset || !quantity || !averageEntryPrice) {
    return null;
  }

  return {
    asset,
    quantity,
    averageEntryPrice,
  };
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
  if (data === 'setup:progress') {
    return { kind: 'setup:progress' };
  }
  if (data === 'setup:cash') {
    return { kind: 'setup:cash' };
  }
  if (data === 'setup:track:btc') {
    return { kind: 'setup:track', trackedAssets: 'BTC' };
  }
  if (data === 'setup:track:eth') {
    return { kind: 'setup:track', trackedAssets: 'ETH' };
  }
  if (data === 'setup:track:both') {
    return { kind: 'setup:track', trackedAssets: 'BOTH' };
  }
  if (data === 'setup:position:btc') {
    return { kind: 'setup:position', asset: 'BTC' };
  }
  if (data === 'setup:position:eth') {
    return { kind: 'setup:position', asset: 'ETH' };
  }
  if (data === 'import:start') {
    return { kind: 'import:start' };
  }
  if (data.startsWith('import:confirm:')) {
    const importId = Number(data.slice('import:confirm:'.length));
    return Number.isInteger(importId) && importId > 0
      ? { kind: 'import:confirm', importId }
      : null;
  }
  if (data.startsWith('import:retry:')) {
    const importId = Number(data.slice('import:retry:'.length));
    return Number.isInteger(importId) && importId > 0
      ? { kind: 'import:retry', importId }
      : null;
  }
  if (data.startsWith('import:cancel:')) {
    const importId = Number(data.slice('import:cancel:'.length));
    return Number.isInteger(importId) && importId > 0
      ? { kind: 'import:cancel', importId }
      : null;
  }
  if (data === 'inspect:lastdecision') {
    return { kind: 'inspect:lastdecision' };
  }
  if (data === 'inspect:hourlyhealth') {
    return { kind: 'inspect:hourlyhealth' };
  }

  return null;
}

export function commandContextFromMessage(update: TelegramUpdate, message: TelegramMessage): TelegramCommandContext | null {
  const from = message.from;
  const text = (message.text ?? message.caption)?.trim();
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
    profile: buildTelegramProfile(from, message.chat.id, message.chat),
    text,
    command: parsed.command,
    args: parsed.args,
  };
}

export function mediaContextFromMessage(
  update: TelegramUpdate,
  message: TelegramMessage,
): TelegramMediaMessageContext | null {
  const from = message.from;
  if (!from) {
    return null;
  }

  if (!hasImagePayload(message)) {
    return null;
  }

  return {
    update,
    chatId: message.chat.id,
    userId: from.id,
    profile: buildTelegramProfile(from, message.chat.id, message.chat),
    message,
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
    profile: buildTelegramProfile(from, message.chat.id, message.chat),
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
  if (typeof input.caption === 'string') {
    message.caption = input.caption;
  }
  if (Array.isArray(input.entities)) {
    message.entities = input.entities as TelegramMessageEntity[];
  }
  if (Array.isArray(input.photo)) {
    message.photo = input.photo.filter(isTelegramPhotoSize) as TelegramPhotoSize[];
  }
  if (isTelegramDocument(input.document)) {
    message.document = input.document;
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

function isTelegramPhotoSize(value: unknown): value is TelegramPhotoSize {
  return (
    isObject(value) &&
    typeof value.file_id === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function isTelegramDocument(value: unknown): value is TelegramDocument {
  return isObject(value) && typeof value.file_id === 'string';
}

function hasImagePayload(message: TelegramMessage): boolean {
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    return true;
  }

  if (!message.document) {
    return false;
  }

  const mimeType = message.document.mime_type?.toLowerCase() ?? '';
  const fileName = message.document.file_name?.toLowerCase() ?? '';
  return (
    mimeType.startsWith('image/') ||
    fileName.endsWith('.png') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.webp')
  );
}

function buildTelegramProfile(
  user: TelegramCallbackQuery["from"],
  chatId: number,
  chat: TelegramMessage["chat"],
): TelegramUserProfile {
  const profile: TelegramUserProfile = {
    telegramUserId: user.id,
    telegramChatId: chatId,
  };

  if (user.username) {
    profile.username = user.username;
  }

  const displayName = getDisplayName(user, chat);
  if (displayName) {
    profile.displayName = displayName;
  }
  if (user.language_code) {
    profile.languageCode = user.language_code;
  }

  return profile;
}

function getDisplayName(
  user: TelegramCallbackQuery["from"],
  chat: TelegramMessage["chat"],
): string | undefined {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (name.length > 0) {
    return name;
  }

  if (chat.type === "private") {
    const chatName = [chat.first_name, chat.last_name].filter(Boolean).join(" ").trim();
    if (chatName.length > 0) {
      return chatName;
    }
  }

  return user.username ?? chat.title ?? chat.username;
}
