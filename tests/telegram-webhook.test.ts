import { handleTelegramWebhook } from "../src/telegram.js";
import { assert, assertEqual } from "./test-helpers.js";

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const requests: Array<{ url: string; init: RequestInit | undefined }> = [];

globalThis.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
  requests.push({ url: String(url), init });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

try {
  const missingSecretResponse = await handleTelegramWebhook(
    new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    }),
    {
      env: {
        TELEGRAM_BOT_TOKEN: "bot-token",
      },
    },
  );

  assertEqual(
    missingSecretResponse.status,
    500,
    "Webhook requests should fail clearly when the webhook secret is not configured.",
  );

  const missingTokenResponse = await handleTelegramWebhook(
    new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "expected-secret",
      },
      body: "{}",
    }),
    {
      env: {
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_WEBHOOK_SECRET: "expected-secret",
      },
    },
  );

  assertEqual(
    missingTokenResponse.status,
    500,
    "Webhook requests should fail clearly when the bot token is not configured.",
  );

  const forbiddenResponse = await handleTelegramWebhook(
    new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong-secret",
      },
      body: "{}",
    }),
    {
      env: {
        TELEGRAM_BOT_TOKEN: "bot-token",
        TELEGRAM_WEBHOOK_SECRET: "expected-secret",
      },
    },
  );

  assertEqual(
    forbiddenResponse.status,
    403,
    "Webhook requests with the wrong secret should be rejected.",
  );
  assertEqual(
    requests.length,
    0,
    "Rejected webhook requests should not reach Telegram API dispatch.",
  );

  const invalidJsonResponse = await handleTelegramWebhook(
    new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "expected-secret",
      },
      body: "{",
    }),
    {
      env: {
        TELEGRAM_BOT_TOKEN: "bot-token",
        TELEGRAM_WEBHOOK_SECRET: "expected-secret",
      },
    },
  );

  assertEqual(
    invalidJsonResponse.status,
    200,
    "Malformed webhook JSON should be acknowledged safely.",
  );
  assertEqual(
    requests.length,
    0,
    "Malformed webhook JSON should not dispatch Telegram actions.",
  );

  const smokeResponse = await handleTelegramWebhook(
    new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "expected-secret",
      },
      body: JSON.stringify({
        update_id: 1,
        message: {
          message_id: 1,
          date: 1,
          chat: { id: 12345, type: "private" },
          from: { id: 999, first_name: "Tester" },
          text: "/start",
        },
      }),
    }),
    {
      env: {
        TELEGRAM_BOT_TOKEN: "bot-token",
        TELEGRAM_WEBHOOK_SECRET: "expected-secret",
      },
    },
  );

  assertEqual(
    smokeResponse.status,
    200,
    "A valid webhook update should be acknowledged successfully.",
  );
  assertEqual(
    requests.length,
    1,
    "A valid webhook update should dispatch exactly one Telegram API request in the smoke path.",
  );
  assert(
    requests[0]?.url.includes("/sendMessage"),
    "The smoke path should send a Telegram message response.",
  );

  const sentPayload = JSON.parse(String(requests[0]?.init?.body ?? "{}")) as {
    chat_id?: number;
    text?: string;
  };
  assertEqual(
    sentPayload.chat_id,
    12345,
    "The smoke path should target the webhook chat id.",
  );
  assert(
    typeof sentPayload.text === "string" && sentPayload.text.includes("PositionGuard is a BTC/ETH spot position coach."),
    "The smoke path should remain record-only and user-facing.",
  );

  requests.length = 0;
  globalThis.fetch = async () =>
    new Response("Telegram unavailable", {
      status: 502,
      statusText: "Bad Gateway",
    });
  console.error = () => undefined;

  const resilientResponse = await handleTelegramWebhook(
    new Request("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "expected-secret",
      },
      body: JSON.stringify({
        update_id: 2,
        message: {
          message_id: 2,
          date: 1,
          chat: { id: 54321, type: "private" },
          from: { id: 999, first_name: "Tester" },
          text: "/help",
        },
      }),
    }),
    {
      env: {
        TELEGRAM_BOT_TOKEN: "bot-token",
        TELEGRAM_WEBHOOK_SECRET: "expected-secret",
      },
    },
  );

  assertEqual(
    resilientResponse.status,
    200,
    "Telegram API failures should be acknowledged safely to avoid webhook retries.",
  );
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
}
