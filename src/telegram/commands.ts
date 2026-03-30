import type { TelegramCommandContext, TelegramOutgoingAction, TelegramReplyMarkup, TelegramRouterDependencies, TelegramUserStateSnapshot } from './types';
import { parseCashAmount, parseSleepModeArg, parseTelegramCallbackAction } from './parser';

export function routeCommand(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  const bootstrap = deps.stateStore?.upsertUserState({
    telegramUserId: context.userId,
  });
  const command = context.command.toLowerCase();

  if (command === 'callback') {
    return Promise.resolve(bootstrap).then(() => routeCallback(context, deps));
  }

  switch (command) {
    case 'start':
      return Promise.resolve(bootstrap).then(() => [send(context.chatId, buildStartText(), buildPrimaryKeyboard())]);
    case 'help':
      return Promise.resolve(bootstrap).then(() => [send(context.chatId, buildHelpText(), buildPrimaryKeyboard())]);
    case 'status':
      return Promise.resolve(bootstrap).then(() => handleStatus(context, deps));
    case 'setcash':
      return Promise.resolve(bootstrap).then(() => handleSetCash(context, deps));
    case 'sleep':
      return Promise.resolve(bootstrap).then(() => handleSleep(context, deps));
    default:
      return Promise.resolve(bootstrap).then(() => [send(context.chatId, buildUnknownCommandText())]);
  }
}

async function routeCallback(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  const callbackQuery = context.replyToCallback;
  const action = parseTelegramCallbackAction(callbackQuery?.data);
  if (!action || !callbackQuery) {
    return [answer(callbackQuery?.id ?? '', 'Unsupported action')];
  }

  if (action.kind === 'sleep:on') {
    return [answer(callbackQuery.id), ...(await handleSleep(context, deps, true))];
  }

  if (action.kind === 'sleep:off') {
    return [answer(callbackQuery.id), ...(await handleSleep(context, deps, false))];
  }

  return [answer(callbackQuery.id), ...(await handleStatus(context, deps))];
}

function handleStatus(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  if (deps.statusProvider) {
    return deps.statusProvider.getStatus(context.userId).then((text) => [send(context.chatId, text)]);
  }

  if (deps.stateStore) {
    return deps.stateStore.getUserState(context.userId).then((state) => [send(context.chatId, formatStatus(state))]);
  }

  return Promise.resolve([send(context.chatId, formatStatus(null))]);
}

async function handleSetCash(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  const amount = parseCashAmount(context.args.join(' '));
  if (amount === null) {
    return [send(context.chatId, 'Usage: /setcash <amount>\nExample: /setcash 1000000')];
  }

  if (deps.stateStore) {
    await deps.stateStore.setCash(context.userId, amount);
  }

  return [send(context.chatId, `Cash recorded: ${formatNumber(amount)}.`)];
}

async function handleSleep(context: TelegramCommandContext, deps: TelegramRouterDependencies, forced?: boolean): Promise<TelegramOutgoingAction[]> {
  const arg = typeof forced === 'boolean' ? forced : parseSleepModeArg(context.args);
  if (arg === null || typeof arg === 'undefined') {
    return [send(context.chatId, 'Usage: /sleep on or /sleep off')];
  }

  if (deps.stateStore) {
    await deps.stateStore.setSleepMode(context.userId, arg);
  }

  return [send(context.chatId, arg ? 'Sleep mode is now on.' : 'Sleep mode is now off.')];
}

function buildStartText(): string {
  return [
    'PositionGuard is a BTC/ETH spot position coach.',
    'It is not an auto-trading bot.',
    '',
    'Use /help to see the available commands.',
  ].join('\n');
}

function buildHelpText(): string {
  return [
    'Commands:',
    '/start - intro and setup boundary',
    '/help - command list',
    '/status - view stored state summary',
    '/setcash <amount> - record available cash',
    '/sleep on - pause alerts',
    '/sleep off - resume alerts',
    '',
    'This bot records user-reported state only and does not execute trades.',
  ].join('\n');
}

function buildUnknownCommandText(): string {
  return 'Unknown command. Use /help to see supported commands.';
}

function buildPrimaryKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Status', callback_data: 'status:refresh' },
        { text: 'Sleep On', callback_data: 'sleep:on' },
      ],
      [{ text: 'Sleep Off', callback_data: 'sleep:off' }],
    ],
  };
}

function formatStatus(state: TelegramUserStateSnapshot | null): string {
  if (!state) {
    return 'Status is not wired yet. Use /setcash and /sleep after the DB layer is connected.';
  }

  return [
    `User: ${state.telegramUserId}`,
    `Sleep: ${state.isSleeping ? 'on' : 'off'}`,
    `Cash: ${state.cash === null ? 'not set' : formatNumber(state.cash)}`,
  ].join('\n');
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 8,
  }).format(value);
}

function send(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup): TelegramOutgoingAction {
  return replyMarkup
    ? { kind: 'sendMessage', chatId, text, replyMarkup }
    : { kind: 'sendMessage', chatId, text };
}

function answer(callbackQueryId: string, text?: string): TelegramOutgoingAction {
  return text
    ? { kind: 'answerCallbackQuery', callbackQueryId, text }
    : { kind: 'answerCallbackQuery', callbackQueryId };
}
