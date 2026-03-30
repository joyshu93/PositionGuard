import { routeCommand } from "../src/telegram/commands.js";
import type { TelegramCommandContext, TelegramOnboardingProvider } from "../src/telegram/types.js";
import { assert, assertEqual } from "./test-helpers.js";

const calls: Array<{ kind: string; payload: unknown }> = [];
const onboardingCalls: Array<{ telegramUserId: number; trackedAssets: ("BTC" | "ETH")[] }> = [];

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

const onboardingProvider: TelegramOnboardingProvider = {
  async getOnboardingSnapshot() {
    return {
      trackedAssets: ["BTC"],
      hasCashRecord: true,
      trackedPositionAssets: ["BTC"],
      isReady: false,
      missingNextSteps: ["record BTC position"],
    };
  },
  async setTrackedAssets(_telegramUserId: number, trackedAssets: ("BTC" | "ETH")[]) {
    onboardingCalls.push({ telegramUserId: _telegramUserId, trackedAssets });
    return {
      trackedAssets,
      hasCashRecord: true,
      trackedPositionAssets: trackedAssets.includes("BTC") ? ["BTC"] : [],
      isReady: trackedAssets.includes("BTC"),
      missingNextSteps: trackedAssets.includes("BTC")
        ? ["record BTC position"]
        : ["record cash"],
    };
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

const startActions = await routeCommand(
  {
    ...baseContext,
    command: "start",
    text: "/start",
    args: [],
  },
  deps,
);

const startAction = startActions[0];
let startCallbackData: string[] = [];
if (startAction && startAction.kind === "sendMessage" && startAction.replyMarkup) {
  startCallbackData = startAction.replyMarkup.inline_keyboard.flat().map((button) => button.callback_data);
}

assert(
  startCallbackData.includes("setup:track:btc") &&
    startCallbackData.includes("setup:track:eth") &&
    startCallbackData.includes("setup:track:both") &&
    startCallbackData.includes("setup:progress"),
  "/start should expose setup buttons for tracked assets and progress.",
);

const callbackStatusActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "setup:progress",
    args: [],
    replyToCallback: {
      id: "cb-status",
      from: { id: 100, first_name: "Test" },
      data: "setup:progress",
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Status",
      },
    },
  },
  {
    ...deps,
    onboardingProvider: {
      async getOnboardingSnapshot() {
        return {
          trackedAssets: ["BTC"],
          hasCashRecord: true,
          trackedPositionAssets: ["BTC"],
          isReady: true,
          missingNextSteps: [],
        };
      },
      async setTrackedAssets() {
        return null;
      },
    },
  },
);

assertEqual(
  callbackStatusActions[0]?.kind,
  "answerCallbackQuery",
  "setup progress callback should acknowledge the button press first.",
);
assert(
  callbackStatusActions.some(
    (action) => action.kind === "sendMessage" && action.text.includes("Readiness: ready for coaching"),
  ),
  "setup progress callback should render onboarding progress.",
);

const onboardingStatusActions = await routeCommand(
  {
    ...baseContext,
    command: "status",
    text: "/status",
    args: [],
  },
  {
    ...deps,
    onboardingProvider,
  },
);

const onboardingStatusAction = onboardingStatusActions[0];
let onboardingStatusText = "";
if (onboardingStatusAction && onboardingStatusAction.kind === "sendMessage") {
  onboardingStatusText = onboardingStatusAction.text;
}

assert(
  onboardingStatusText.includes("Tracked assets: BTC") &&
    onboardingStatusText.includes("Readiness:"),
  "/status should surface onboarding progress when available.",
);

const trackedAssetActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "setup:track:both",
    args: [],
    replyToCallback: {
      id: "cb-track",
      from: { id: 100, first_name: "Test" },
      data: "setup:track:both",
      message: {
        message_id: 3,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Setup",
      },
    },
  },
  {
    ...deps,
    onboardingProvider,
  },
);

const trackedAssetMessage = trackedAssetActions.find((action) => action.kind === "sendMessage");
let trackedAssetText = "";
if (trackedAssetMessage && trackedAssetMessage.kind === "sendMessage") {
  trackedAssetText = trackedAssetMessage.text;
}

assert(
  onboardingCalls.some((call) => call.trackedAssets.includes("BTC") && call.trackedAssets.includes("ETH")),
  "Tracked-asset callback should pass both assets to the onboarding provider.",
);
assert(
  trackedAssetText.includes("Tracked assets recorded: BTC, ETH") &&
    trackedAssetText.includes("State is record-only. No trade execution is performed."),
  "Tracked-asset callback should stay record-only.",
);

const callbackSleepActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "sleep:on",
    args: [],
    replyToCallback: {
      id: "cb-sleep",
      from: { id: 100, first_name: "Test" },
      data: "sleep:on",
      message: {
        message_id: 2,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Sleep",
      },
    },
  },
  deps,
);

assert(
  callbackSleepActions.some((action) => action.kind === "answerCallbackQuery"),
  "sleep callback should acknowledge the button press.",
);
assert(
  calls.some((call) => call.kind === "setSleepMode" && (call.payload as { isSleeping?: boolean }).isSleeping === true),
  "sleep callback should still toggle sleep mode through the callback path.",
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
