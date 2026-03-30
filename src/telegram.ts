import { createTelegramBotClient, executeTelegramActions } from './telegram/client.js';
import { callbackContextFromQuery, commandContextFromMessage, parseTelegramUpdate } from './telegram/parser.js';
import { routeCommand } from './telegram/commands.js';
import type { TelegramOutgoingAction, TelegramRouterDependencies, TelegramUpdate, TelegramWebhookContext, TelegramWebhookEnv } from './telegram/types.js';

export { createTelegramBotClient, executeTelegramActions } from './telegram/client.js';
export type {
  TelegramActionNeededReason,
  TelegramCallbackQuery,
  TelegramChat,
  TelegramCommandContext,
  TelegramMessage,
  TelegramOutgoingAction,
  TelegramReplyMarkup,
  TelegramRouterDependencies,
  TelegramOnboardingProvider,
  TelegramOnboardingSnapshot,
  TelegramNotificationProvider,
  TelegramNotificationSnapshot,
  TelegramStateStore,
  TelegramStatusProvider,
  TelegramTrackedAssetsSelection,
  TelegramUpdate,
  TelegramUser,
  TelegramUserStateSnapshot,
  TelegramWebhookContext,
  TelegramWebhookEnv,
} from './telegram/types.js';
export {
  buildActionNeededAlertActions,
  buildActionNeededAlertText,
  buildOnboardingKeyboard,
} from './telegram/commands.js';

export async function handleTelegramWebhook(request: Request, ctx: TelegramWebhookContext): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }

  if (!isAuthorizedWebhook(request, ctx.env)) {
    return new Response('Forbidden', { status: 403 });
  }

  const parsed = await safeParseJson(request);
  const update = parseTelegramUpdate(parsed);
  if (!update) {
    return new Response('OK');
  }

  const client = createTelegramBotClient(ctx.env);
  const actions = await routeTelegramUpdate(update, ctx.deps);

  try {
    await executeTelegramActions(client, actions);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Telegram dispatch failed', { status: 502 });
  }

  return new Response('OK');
}

export async function routeTelegramUpdate(update: TelegramUpdate | null, deps: TelegramRouterDependencies = {}): Promise<TelegramOutgoingAction[]> {
  if (!update) {
    return [];
  }

  if (update.callback_query) {
    const context = callbackContextFromQuery(update, update.callback_query);
    if (!context) {
      return [];
    }
    return routeCommand(context, deps);
  }

  if (update.message) {
    const context = commandContextFromMessage(update, update.message);
    if (!context) {
      return [];
    }
    return routeCommand(context, deps);
  }

  return [];
}

export async function handleTelegramHealth(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, service: 'telegram' }), {
    headers: { 'content-type': 'application/json' },
  });
}

function isAuthorizedWebhook(request: Request, env: TelegramWebhookEnv): boolean {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    return true;
  }

  return request.headers.get('x-telegram-bot-api-secret-token') === env.TELEGRAM_WEBHOOK_SECRET;
}

async function safeParseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
