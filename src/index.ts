import {
  DEFAULT_HEALTH_PATH,
  DEFAULT_TELEGRAM_WEBHOOK_PATH,
  type Env,
} from "./env";
import { runHourlyCycle } from "./hourly";
import { handleTelegramWebhook } from "./telegram";
import {
  ensureTelegramUser,
  getTelegramStatusSnapshot,
  setCashByTelegramUserId,
  setSleepModeByTelegramUserId,
} from "./db/repositories";

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
              telegramChatId: String(input.telegramUserId),
            });

            if (typeof input.cash === "number") {
              await setCashByTelegramUserId(
                env.DB,
                String(input.telegramUserId),
                input.cash,
              );
            }

            if (typeof input.isSleeping === "boolean") {
              await setSleepModeByTelegramUserId(
                env.DB,
                String(input.telegramUserId),
                input.isSleeping,
              );
            }
          },
          async setCash(telegramUserId, cash) {
            await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            });
            await setCashByTelegramUserId(env.DB, String(telegramUserId), cash);
          },
          async setSleepMode(telegramUserId, isSleeping) {
            await ensureTelegramUser(env.DB, {
              telegramUserId: String(telegramUserId),
              telegramChatId: String(telegramUserId),
            });
            await setSleepModeByTelegramUserId(
              env.DB,
              String(telegramUserId),
              isSleeping,
            );
          },
        },
        statusProvider: {
          async getStatus(telegramUserId) {
            const snapshot = await getTelegramStatusSnapshot(
              env.DB,
              String(telegramUserId),
            );

            if (!snapshot) {
              return [
                "No stored setup yet.",
                "Use /setcash <amount> to record available cash.",
                "Position recording scaffolding exists in the database but is not yet exposed as a Telegram command.",
              ].join("\n");
            }

            const btc = snapshot.positions.BTC;
            const eth = snapshot.positions.ETH;

            return [
              `Sleep mode: ${snapshot.user.sleepModeEnabled ? "on" : "off"}`,
              `Available cash: ${
                snapshot.accountState
                  ? formatNumber(snapshot.accountState.availableCash)
                  : "not set"
              } KRW`,
              `BTC spot: ${
                btc
                  ? `${formatNumber(btc.quantity)} @ avg ${formatNumber(
                      btc.averageEntryPrice,
                    )}`
                  : "not set"
              }`,
              `ETH spot: ${
                eth
                  ? `${formatNumber(eth.quantity)} @ avg ${formatNumber(
                      eth.averageEntryPrice,
                    )}`
                  : "not set"
              }`,
              "This bot records state only. It does not execute trades.",
            ].join("\n");
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}
