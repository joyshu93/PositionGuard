import { routeCommand } from "../src/telegram/commands.js";
import type { TelegramCommandContext } from "../src/telegram/types.js";
import { assert, assertEqual } from "./test-helpers.js";

const calls: Array<{ kind: string; payload: unknown }> = [];

const deps = {
  stateStore: {
    async getUserState() {
      return null;
    },
    async upsertUserState(input: unknown) {
      calls.push({ kind: "upsert", payload: input });
    },
    async setCash(telegramUserId: number, cash: number) {
      calls.push({ kind: "setCash", payload: { telegramUserId, cash } });
    },
    async setPosition(input: unknown) {
      calls.push({ kind: "setPosition", payload: input });
    },
    async setSleepMode(telegramUserId: number, isSleeping: boolean) {
      calls.push({ kind: "setSleepMode", payload: { telegramUserId, isSleeping } });
    },
  },
};

const baseContext: TelegramCommandContext = {
  update: { update_id: 1 },
  chatId: 200,
  userId: 100,
  profile: {
    telegramUserId: 100,
    telegramChatId: 200,
    username: "tester",
    displayName: "Test User",
  },
  text: "/setposition BTC 0.25 95000000",
  command: "setposition",
  args: ["BTC", "0.25", "95000000"],
};

const actions = await routeCommand(baseContext, deps);
assertEqual(actions.length, 1, "setposition should send one confirmation message.");
assert(
  calls.some((call) => call.kind === "setPosition"),
  "setposition should persist the manual position state.",
);

const alertActions = await routeCommand(
  {
    ...baseContext,
    command: "lastalert",
    args: [],
    text: "/lastalert",
  },
  {
    ...deps,
    notificationProvider: {
      async getLastAlert() {
        return {
          reason: "SETUP_INCOMPLETE",
          summary: "Manual setup is incomplete; waiting for user-reported inputs.",
          asset: null,
          sentAt: "2026-01-01T03:00:00.000Z",
          cooldownUntil: "2026-01-01T09:00:00.000Z",
        };
      },
    },
  },
);

assertEqual(
  alertActions[0]?.kind,
  "sendMessage",
  "/lastalert should return a Telegram message when an alert snapshot exists.",
);
const alertAction = alertActions[0];
let alertText = "";
if (alertAction && alertAction.kind === "sendMessage") {
  alertText = alertAction.text;
}

assert(
  alertText.includes("Cooldown until: 2026-01-01T09:00:00.000Z"),
  "/lastalert should expose cooldown visibility for debugging.",
);

const invalidActions = await routeCommand(
  {
    ...baseContext,
    text: "/setposition BTC 0 95000000",
    args: ["BTC", "0", "95000000"],
  },
  deps,
);

const invalidAction = invalidActions[0];
let invalidActionText = "";
if (invalidAction && invalidAction.kind === "sendMessage") {
  invalidActionText = invalidAction.text;
}

assert(
  invalidAction?.kind === "sendMessage" &&
    invalidActionText.includes("Average entry price must be 0 when quantity is 0."),
  "Invalid setposition input should return a Telegram-friendly validation error.",
);
