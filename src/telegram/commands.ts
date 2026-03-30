import type {
  TelegramActionNeededReason,
  TelegramCommandContext,
  TelegramHourlyHealthSnapshot,
  TelegramLastDecisionSnapshot,
  TelegramOutgoingAction,
  TelegramReplyMarkup,
  TelegramOnboardingSnapshot,
  TelegramRouterDependencies,
  TelegramUserStateSnapshot,
  TelegramTrackedAssetsSelection,
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
      return Promise.resolve(bootstrap).then(() => [send(context.chatId, buildStartText(), buildOnboardingKeyboard())]);
    case 'help':
      return Promise.resolve(bootstrap).then(() => [send(context.chatId, buildHelpText(), buildOnboardingKeyboard())]);
    case 'track':
      return Promise.resolve(bootstrap).then(() => handleTrack(context, deps));
    case 'status':
      return Promise.resolve(bootstrap).then(() => handleStatus(context, deps));
    case 'setcash':
      return Promise.resolve(bootstrap).then(() => handleSetCash(context, deps));
    case 'setposition':
      return Promise.resolve(bootstrap).then(() => handleSetPosition(context, deps));
    case 'lastdecision':
      return Promise.resolve(bootstrap).then(() => handleLastDecision(context, deps));
    case 'hourlyhealth':
      return Promise.resolve(bootstrap).then(() => handleHourlyHealth(context, deps));
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

  if (action.kind === 'setup:progress') {
    return [answer(callbackQuery.id), ...(await handleSetupProgress(context, deps))];
  }

  if (action.kind === 'status:refresh') {
    return [answer(callbackQuery.id), ...(await handleStatus(context, deps))];
  }

  if (action.kind === 'setup:track') {
    return [answer(callbackQuery.id), ...(await handleTrackedAssetsChoice(context, deps, action.trackedAssets))];
  }

  if (action.kind === 'setup:cash') {
    return [answer(callbackQuery.id), ...buildCashShortcutActions(context)];
  }

  if (action.kind === 'setup:position') {
    return [answer(callbackQuery.id), ...buildPositionShortcutActions(context, action.asset)];
  }

  if (action.kind === 'inspect:lastdecision') {
    return [answer(callbackQuery.id), ...(await handleLastDecision(context, deps))];
  }

  if (action.kind === 'inspect:hourlyhealth') {
    return [answer(callbackQuery.id), ...(await handleHourlyHealth(context, deps))];
  }

  return [answer(callbackQuery.id), ...(await handleStatus(context, deps))];
}

function handleStatus(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  if (deps.statusProvider) {
    return deps.statusProvider.getStatus(context.userId).then((text) => [send(context.chatId, text, buildOnboardingKeyboard())]);
  }

  if (deps.onboardingProvider) {
    return deps.onboardingProvider.getOnboardingSnapshot(context.userId).then((snapshot) => {
      if (snapshot) {
        return [send(context.chatId, formatOnboardingSnapshot(snapshot), buildOnboardingKeyboard())];
      }

      return buildFallbackStatus(context, deps);
    });
  }

  if (deps.stateStore) {
    return deps.stateStore.getUserState(context.userId).then((state) => [
      send(context.chatId, formatStatus(state), buildOnboardingKeyboard()),
    ]);
  }

  return Promise.resolve([send(context.chatId, formatStatus(null), buildOnboardingKeyboard())]);
}

function handleSetupProgress(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  if (!deps.onboardingProvider) {
    return handleStatus(context, deps);
  }

  return deps.onboardingProvider.getOnboardingSnapshot(context.userId).then((snapshot) => {
    if (!snapshot) {
      return buildFallbackStatus(context, deps);
    }

    return [send(context.chatId, formatOnboardingSnapshot(snapshot), buildOnboardingKeyboard())];
  });
}

async function handleSetCash(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  const amount = parseCashAmount(context.args.join(' '));
  if (amount === null) {
    return [send(context.chatId, formatValidationErrors(
      ['Available cash must be a non-negative number.'],
      'Usage: /setcash <amount>\nExample: /setcash 1000000',
    ), buildOnboardingKeyboard())];
  }

  if (deps.stateStore) {
    await deps.stateStore.setCash(context.userId, amount);
  }

  return [send(context.chatId, `Cash recorded: ${formatNumber(amount)}.`, buildOnboardingKeyboard())];
}

async function handleTrack(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const trackedAssets = parseTrackedAssetsSelection(context.args[0]);
  if (!trackedAssets) {
    return [
      send(
        context.chatId,
        [
          'Usage: /track <BTC|ETH|BOTH>',
          'Example: /track BTC',
          'This only changes which spot assets PositionGuard expects in setup readiness.',
        ].join('\n'),
        buildOnboardingKeyboard(),
      ),
    ];
  }

  return handleTrackedAssetsChoice(context, deps, trackedAssets);
}

async function handleSetPosition(context: TelegramCommandContext, deps: TelegramRouterDependencies): Promise<TelegramOutgoingAction[]> {
  const parsed = parsePositionArgs(context.args);
  if (!parsed) {
    return [send(
      context.chatId,
      'Usage: /setposition <BTC|ETH> <quantity> <average-entry-price>\nExample: /setposition BTC 0.25 95000000',
      buildOnboardingKeyboard(),
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
      buildOnboardingKeyboard(),
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
    buildOnboardingKeyboard(),
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

  return [send(context.chatId, arg ? 'Sleep mode is now on.' : 'Sleep mode is now off.', buildOnboardingKeyboard())];
}

function buildStartText(): string {
  return [
    'PositionGuard is a BTC/ETH spot position coach.',
    'It is not an auto-trading bot.',
    '',
    'Choose which assets you want to track with the buttons below, then record cash and spot inventory manually.',
    'Use /help to see the available commands.',
  ].join('\n');
}

function buildHelpText(): string {
  return [
    'Commands:',
    '/start - intro and setup boundary',
    '/help - command list',
    '/status - view stored state summary',
    '/track <BTC|ETH|BOTH> - choose which spot assets to track',
    'Setup buttons below - choose tracked assets and next steps',
    '/setcash <amount> - record available cash',
    '/setposition <BTC|ETH> <quantity> <average-entry-price> - record spot inventory only',
    '/lastdecision - inspect the latest hourly decision',
    '/hourlyhealth - inspect recent hourly processing health',
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

export function buildOnboardingKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Track BTC', callback_data: 'setup:track:btc' },
        { text: 'Track ETH', callback_data: 'setup:track:eth' },
      ],
      [
        { text: 'Track both', callback_data: 'setup:track:both' },
        { text: 'Setup progress', callback_data: 'setup:progress' },
      ],
      [
        { text: 'Record cash', callback_data: 'setup:cash' },
        { text: 'Record BTC', callback_data: 'setup:position:btc' },
      ],
      [
        { text: 'Record ETH', callback_data: 'setup:position:eth' },
        { text: 'Status', callback_data: 'status:refresh' },
      ],
      [
        { text: 'Last decision', callback_data: 'inspect:lastdecision' },
        { text: 'Hourly health', callback_data: 'inspect:hourlyhealth' },
      ],
    ],
  };
}

function formatStatus(state: TelegramUserStateSnapshot | null): string {
  if (!state) {
    return [
      'No stored setup yet.',
      'Use the buttons below to choose tracked assets, then record cash and spot inventory manually.',
      'This bot records manual state only. No trade was executed.',
    ].join('\n');
  }

  return [
    `User: ${state.telegramUserId}`,
    `Tracked assets: ${state.trackedAssets}`,
    `Sleep: ${state.isSleeping ? 'on' : 'off'}`,
    `Cash: ${state.cash === null ? 'not set' : formatNumber(state.cash)}`,
    'Choose tracked assets with the buttons below, then record BTC or ETH inventory if you want them coached.',
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
        buildOnboardingKeyboard(),
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
        `When: ${formatCompactTimestamp(snapshot.sentAt)}`,
        `Summary: ${truncateText(snapshot.summary, 120)}`,
        `Cooldown until: ${snapshot.cooldownUntil ? formatCompactTimestamp(snapshot.cooldownUntil) : 'n/a'}`,
      ].join('\n'),
      buildOnboardingKeyboard(),
    ),
  ];
}

async function handleLastDecision(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const snapshot = await deps.inspectionProvider?.getLastDecisionSnapshot(context.userId);
  return [
    send(
      context.chatId,
      renderLastDecisionSnapshot(snapshot),
      buildOnboardingKeyboard(),
    ),
  ];
}

async function handleHourlyHealth(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const snapshot = await deps.inspectionProvider?.getHourlyHealthSnapshot(context.userId);
  return [
    send(
      context.chatId,
      renderHourlyHealthSnapshot(snapshot),
      buildOnboardingKeyboard(),
    ),
  ];
}

async function handleTrackedAssetsChoice(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  trackedAssets: TelegramTrackedAssetsSelection,
): Promise<TelegramOutgoingAction[]> {
  const selectedAssets: ("BTC" | "ETH")[] = trackedAssets === 'BOTH'
    ? ['BTC', 'ETH']
    : [trackedAssets];

  if (deps.onboardingProvider) {
    const snapshot = await deps.onboardingProvider.setTrackedAssets(
      context.userId,
      selectedAssets,
    );

    if (snapshot) {
      return [
        send(
          context.chatId,
          [
            `Tracked assets recorded: ${formatTrackedAssets(selectedAssets)}.`,
            formatOnboardingSnapshot(snapshot),
            'No trade was executed.',
          ].join('\n'),
          buildOnboardingKeyboard(),
        ),
      ];
    }
  }

  return [
    send(
      context.chatId,
      [
        `Tracked assets chosen: ${formatTrackedAssets(selectedAssets)}.`,
        'Next steps:',
        '- record cash with /setcash <amount>',
        ...selectedAssets.map((asset) =>
          `- record ${asset} spot state with /setposition ${asset} <quantity> <average-entry-price>`,
        ),
        'This is record-only guidance. No trade was executed.',
      ].join('\n'),
      buildOnboardingKeyboard(),
    ),
  ];
}

function buildCashShortcutActions(
  context: TelegramCommandContext,
): TelegramOutgoingAction[] {
  return [
    send(
      context.chatId,
      [
        'Record available cash with /setcash <amount>.',
        'Example: /setcash 1000000',
        'This is record-only guidance. No trade was executed.',
      ].join('\n'),
      buildOnboardingKeyboard(),
    ),
  ];
}

function buildPositionShortcutActions(
  context: TelegramCommandContext,
  asset: "BTC" | "ETH",
): TelegramOutgoingAction[] {
  return [
    send(
      context.chatId,
      [
        `Record ${asset} spot state with /setposition ${asset} <quantity> <average-entry-price>.`,
        asset === 'BTC'
          ? 'Example: /setposition BTC 0.25 95000000'
          : 'Example: /setposition ETH 1.2 3500000',
        'This is record-only guidance. No trade was executed.',
      ].join('\n'),
      buildOnboardingKeyboard(),
    ),
  ];
}

function buildFallbackStatus(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  if (deps.statusProvider) {
    return deps.statusProvider.getStatus(context.userId).then((text) => [send(context.chatId, text, buildOnboardingKeyboard())]);
  }

  if (deps.stateStore) {
    return deps.stateStore.getUserState(context.userId).then((state) => [
      send(context.chatId, formatStatus(state), buildOnboardingKeyboard()),
    ]);
  }

  return Promise.resolve([send(context.chatId, formatStatus(null), buildOnboardingKeyboard())]);
}

function parseTrackedAssetsSelection(
  value: string | undefined,
): TelegramTrackedAssetsSelection | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'BTC') {
    return 'BTC';
  }
  if (normalized === 'ETH') {
    return 'ETH';
  }
  if (normalized === 'BOTH' || normalized === 'BTC,ETH') {
    return 'BOTH';
  }
  return null;
}

function formatOnboardingSnapshot(snapshot: TelegramOnboardingSnapshot): string {
  return [
    `Tracked assets: ${formatTrackedAssets(snapshot.trackedAssets)}`,
    `Cash record: ${snapshot.hasCashRecord ? 'present' : 'missing'}`,
    `Tracked positions: ${
      snapshot.trackedPositionAssets.length > 0
        ? formatTrackedAssets(snapshot.trackedPositionAssets)
        : 'none yet'
    }`,
    `Readiness: ${snapshot.isReady ? 'ready for coaching' : 'needs setup'}`,
    `Next steps: ${formatNextSteps(snapshot.missingNextSteps)}`,
    'State is record-only. No trade execution is performed.',
  ].join('\n');
}

function renderLastDecisionSnapshot(
  snapshot: TelegramLastDecisionSnapshot | null | undefined,
): string {
  if (!snapshot || snapshot.lines.length === 0) {
    return 'No decision record is available yet.';
  }

  return [
    'Last decision:',
    `Tracked assets: ${formatTrackedAssets(snapshot.trackedAssets)}`,
    ...snapshot.lines.map((line) => formatDecisionLine(line)),
    'Operational only. No trade was executed.',
  ].join('\n');
}

function renderHourlyHealthSnapshot(
  snapshot: TelegramHourlyHealthSnapshot | null | undefined,
): string {
  if (!snapshot) {
    return 'No hourly health summary is available yet.';
  }

  const latestNotification = snapshot.latestNotification
    ? `${snapshot.latestNotification.deliveryStatus}${snapshot.latestNotification.reasonKey ? ` | ${snapshot.latestNotification.reasonKey}` : ''}${snapshot.latestNotification.suppressedBy ? ` | ${snapshot.latestNotification.suppressedBy}` : ''}${snapshot.latestNotification.sentAt ? ` | ${formatCompactTimestamp(snapshot.latestNotification.sentAt)}` : ''}`
    : 'none';

  return [
    'Hourly health:',
    `Tracked assets: ${formatTrackedAssets(snapshot.trackedAssets)}`,
    `Readiness: ${snapshot.readiness.isReady ? 'ready' : 'blocked'} | cash: ${snapshot.readiness.hasCashRecord ? 'yes' : 'no'} | positions: ${formatTrackedAssets(snapshot.readiness.readyPositionAssets)}`,
    `Missing: ${formatNextSteps(snapshot.readiness.missingItems)}`,
    `Last run: ${snapshot.lastRunAt ? formatCompactTimestamp(snapshot.lastRunAt) : 'none'} | status: ${snapshot.lastDecisionStatus ?? 'none'}`,
    `Market data: ${snapshot.marketDataStatus ?? 'none'} | failures: ${snapshot.recentMarketFailureCount} | latest issue: ${snapshot.latestMarketFailureMessage ? truncateText(snapshot.latestMarketFailureMessage, 100) : 'none'}`,
    `Suppression: cooldown ${snapshot.recentCooldownSkipCount} | sleep ${snapshot.recentSleepSuppressionCount} | setup ${snapshot.recentSetupBlockedCount}`,
    `Latest alert: ${latestNotification}`,
    'Operational only. No trade was executed.',
  ].join('\n');
}

function formatTrackedAssets(assets: Array<"BTC" | "ETH">): string {
  if (assets.length === 0) {
    return 'not selected';
  }

  return assets.join(', ');
}

function formatNextSteps(steps: string[]): string {
  if (steps.length === 0) {
    return 'none';
  }

  return steps.join('; ');
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 8,
  }).format(value);
}

function formatDecisionLine(line: TelegramLastDecisionSnapshot['lines'][number]): string {
  return [
    `${line.asset}: ${line.status}`,
    `${line.alertOutcome}${line.suppressedBy ? ` (${line.suppressedBy})` : ''}`,
    formatCompactTimestamp(line.createdAt),
    truncateText(line.summary, 90),
  ].join(' | ');
}

function formatCompactTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().replace('.000Z', 'Z');
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
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
