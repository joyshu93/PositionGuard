import {
  DEFAULT_HEALTH_PATH,
  DEFAULT_TELEGRAM_WEBHOOK_PATH,
  type Env,
} from "./env.js";
import { runHourlyCycle } from "./hourly.js";
import { handleTelegramWebhook } from "./telegram.js";
import {
  ensureTelegramUser,
  getTelegramStatusSnapshot,
  getUserStateBundleByUserId,
  setCashByTelegramUserId,
  setPositionByTelegramUserId,
  setSleepModeByTelegramUserId,
} from "./db/repositories.js";
import { renderStatusMessage } from "./status.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },
  async scheduled(_controller, env, _ctx) {
    await runHourlyCycle(env);
  },
} satisfies ExportedHandler<Env>;

async function handleFetch(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const healthPath = env.HEALTH_PATH ?? DEFAULT_HEALTH_PATH;
  const webhookPath = env.TELEGRAM_WEBHOOK_PATH ?? DEFAULT_TELEGRAM_WEBHOOK_PATH;

  if (request.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      ok: true,
      service: "position-guard",
      healthPath,
      webhookPath,
      scope: "telegram BTC/ETH spot position coach scaffold",
    });
  }

  if (request.method === "GET" && url.pathname === healthPath) {
    return jsonResponse({
      ok: true,
      status: "healthy",
      service: "position-guard",
      mode: "scaffold",
    });
  }

  if (url.pathname === webhookPath) {
    const telegramEnv = {
      TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
      ...(env.TELEGRAM_WEBHOOK_SECRET
        ? { TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET }
        : {}),
    };

    return handleTelegramWebhook(request, {
      env: telegramEnv,
      deps: {
        stateStore: {
          async getUserState(telegramUserId) {
            const snapshot = await getTelegramStatusSnapshot(
              env.DB,
              String(telegramUserId),
            );
            if (!snapshot) {
              return null;
            }

            return {
              telegramUserId,
              isSleeping: snapshot.user.sleepModeEnabled,
              cash: snapshot.accountState?.availableCash ?? null,
            };
          },
          async upsertUserState(input) {
            await ensureTelegramUser(env.DB, {
              telegramUserId: String(input.telegramUserId),
              telegramChatId: String(input.telegramChatId),
              username: input.username ?? null,
              displayName: input.displayName ?? null,
            });
          },
          async setCash(telegramUserId, cash) {
            await setCashByTelegramUserId(env.DB, String(telegramUserId), cash);
          },
          async setPosition(input) {
            await setPositionByTelegramUserId(env.DB, String(input.telegramUserId), {
              asset: input.asset,
              quantity: input.quantity,
              averageEntryPrice: input.averageEntryPrice,
            });
          },
          async setSleepMode(telegramUserId, isSleeping) {
            await setSleepModeByTelegramUserId(
              env.DB,
              String(telegramUserId),
              isSleeping,
            );
          },
        },
        statusProvider: {
          async getStatus(telegramUserId) {
            const statusSnapshot = await getTelegramStatusSnapshot(
              env.DB,
              String(telegramUserId),
            );
            if (!statusSnapshot) {
              return renderStatusMessage(null);
            }

            const userState = await getUserStateBundleByUserId(
              env.DB,
              statusSnapshot.user.id,
            );

            return renderStatusMessage(userState);
          },
        },
      },
    });
  }

  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
