import type {
  TelegramActionNeededReason,
  TelegramCommandContext,
  TelegramOutgoingAction,
  TelegramReplyMarkup,
  TelegramRouterDependencies,
  TelegramUserStateSnapshot,
} from './types.js';
import { formatValidationErrors, validatePositionInput } from '../validation.js';
import { parseCashAmount, parsePositionArgs, parseSleepModeArg, parseTelegramCallbackAction } from './parser.js';

export function routeCommand(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  const bootstrap = deps.stateStore?.upsertUserState(context.profile);
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
    case 'setposition':
      return Promise.resolve(bootstrap).then(() => handleSetPosition(context, deps));
    case 'lastalert':
      return Promise.resolve(bootstrap).then(() => handleLastAlert(context, deps));
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
    return [send(context.chatId, formatValidationErrors(
      ['Available cash must be a non-negative number.'],
      'Usage: /setcash <amount>\nExample: /setcash 1000000',
    ))];
  }

  if (deps.stateStore) {
    await deps.stateStore.setCash(context.userId, amount);
  }

  return [send(context.chatId, `Cash recorded: ${formatNumber(amount)}.`)];
}

async function handleSetPosition(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  const parsed = parsePositionArgs(context.args);
  if (!parsed) {
    return [send(
      context.chatId,
      'Usage: /setposition <BTC|ETH> <quantity> <average-entry-price>\nExample: /setposition BTC 0.25 95000000',
    )];
  }

  const validation = validatePositionInput(parsed);
  if (!validation.ok || !validation.value) {
    return [send(
      context.chatId,
      formatValidationErrors(
        validation.errors,
        'Usage: /setposition <BTC|ETH> <quantity> <average-entry-price>\nExample: /setposition ETH 1.2 3500000',
      ),
    )];
  }

  if (deps.stateStore) {
    await deps.stateStore.setPosition({
      telegramUserId: context.userId,
      asset: validation.value.asset,
      quantity: validation.value.quantity,
      averageEntryPrice: validation.value.averageEntryPrice,
    });
  }

  return [send(
    context.chatId,
    `${validation.value.asset} spot position recorded: ${formatNumber(validation.value.quantity)} @ avg ${formatNumber(validation.value.averageEntryPrice)} KRW.\nThis is a manual record only. No trade was executed.`,
  )];
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
    '/setposition <BTC|ETH> <quantity> <average-entry-price> - record spot inventory only',
    '/lastalert - inspect the last recorded alert state',
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
    return 'No stored setup yet. Use /setcash and /setposition to record manual state.';
  }

  return [
    `User: ${state.telegramUserId}`,
    `Sleep: ${state.isSleeping ? 'on' : 'off'}`,
    `Cash: ${state.cash === null ? 'not set' : formatNumber(state.cash)}`,
  ].join('\n');
}

async function handleLastAlert(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const snapshot = await deps.notificationProvider?.getLastAlert(context.userId);
  if (!snapshot) {
    return [
      send(
        context.chatId,
        'No alert record is available yet. ACTION_NEEDED alerts are only sent when the hourly loop records one.',
      ),
    ];
  }

  return [
    send(
      context.chatId,
      [
        'Last alert:',
        `Reason: ${snapshot.reason}`,
        `Asset: ${snapshot.asset ?? 'n/a'}`,
        `When: ${snapshot.sentAt}`,
        `Summary: ${snapshot.summary}`,
        `Cooldown until: ${snapshot.cooldownUntil ?? 'n/a'}`,
      ].join('\n'),
    ),
  ];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 8,
  }).format(value);
}

export interface TelegramActionNeededAlertInput {
  chatId: number;
  reason: TelegramActionNeededReason;
  asset: "BTC" | "ETH" | null;
  summary: string;
  nextStep: string;
}

export function buildActionNeededAlertText(
  input: TelegramActionNeededAlertInput,
): string {
  const assetLabel = input.asset ?? 'setup';
  const headline = formatActionNeededHeadline(input.reason, assetLabel);
  return [
    `ACTION NEEDED: ${headline}`,
    input.summary,
    input.nextStep,
    'No trade was executed.',
    'This is record-only guidance.',
  ].join('\n');
}

export function buildActionNeededAlertActions(
  input: TelegramActionNeededAlertInput,
): TelegramOutgoingAction[] {
  return [send(input.chatId, buildActionNeededAlertText(input))];
}

function formatActionNeededHeadline(
  reason: TelegramActionNeededReason,
  assetLabel: string,
): string {
  if (reason === 'SETUP_INCOMPLETE') {
    return `${assetLabel} setup is incomplete`;
  }

  if (reason === 'MISSING_MARKET_DATA') {
    return `${assetLabel} market snapshot is unavailable`;
  }

  return `${assetLabel} stored state needs correction`;
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
