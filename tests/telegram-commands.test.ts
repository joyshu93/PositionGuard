import { buildActionNeededAlertText, routeCommand } from "../src/telegram/commands.js";
import type {
  TelegramCommandContext,
  TelegramInspectionProvider,
  TelegramOnboardingProvider,
} from "../src/telegram/types.js";
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

const inspectionProvider: TelegramInspectionProvider = {
  async getLastDecisionSnapshot() {
    return {
      trackedAssets: ["BTC", "ETH"] as ("BTC" | "ETH")[],
      lines: [
        {
          asset: "BTC",
          status: "ACTION_NEEDED",
          summary: "Manual setup is incomplete.",
          createdAt: "2026-01-01T03:00:00.000Z",
          alertOutcome: "sent",
          suppressedBy: null,
          regime: "PULLBACK_IN_UPTREND",
          triggerState: "CONFIRMED",
          invalidationState: "CLEAR",
        },
        {
          asset: "ETH",
          status: "NO_ACTION",
          summary: "No coach action is needed.",
          createdAt: "2026-01-01T02:00:00.000Z",
          alertOutcome: "not_applicable",
          suppressedBy: null,
          regime: "RANGE",
          triggerState: "WAITING",
          invalidationState: "CLEAR",
        },
      ],
    };
  },
  async getHourlyHealthSnapshot() {
    return {
      trackedAssets: ["BTC", "ETH"] as ("BTC" | "ETH")[],
      readiness: {
        isReady: false,
        missingItems: ["ETH position"],
        hasCashRecord: true,
        readyPositionAssets: ["BTC"] as ("BTC" | "ETH")[],
      },
      lastRunAt: "2026-01-01T03:00:00.000Z",
      lastDecisionStatus: "ACTION_NEEDED",
      marketDataStatus: "fetch_failure",
      recentMarketFailureCount: 3,
      recentCooldownSkipCount: 2,
      recentSleepSuppressionCount: 1,
      recentSetupBlockedCount: 4,
      latestMarketFailureMessage: "Upbit request failed (502 Bad Gateway): upstream timeout",
      latestRegime: "PULLBACK_IN_UPTREND",
      latestTriggerState: "CONFIRMED",
      latestInvalidationState: "CLEAR",
      latestNotification: {
        deliveryStatus: "SENT",
        reasonKey: "btc-setup-incomplete",
        suppressedBy: null,
        sentAt: "2026-01-01T03:00:00.000Z",
      },
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
      startCallbackData.includes("setup:progress") &&
      startCallbackData.includes("inspect:lastdecision") &&
      startCallbackData.includes("inspect:hourlyhealth"),
    "/start should expose setup and operator-inspection buttons.",
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
  alertText.includes("Cooldown until: 2026-01-01 18:00:00 KST"),
  "/lastalert should expose cooldown visibility for debugging.",
);

const lastDecisionActions = await routeCommand(
  {
    ...baseContext,
    command: "lastdecision",
    args: [],
    text: "/lastdecision",
  },
  {
    ...deps,
    inspectionProvider,
  },
);

const lastDecisionAction = lastDecisionActions[0];
let lastDecisionText = "";
if (lastDecisionAction && lastDecisionAction.kind === "sendMessage") {
  lastDecisionText = lastDecisionAction.text;
}

assert(
  lastDecisionText.includes("Last decision:") &&
    lastDecisionText.includes("Tracked assets: BTC, ETH") &&
    lastDecisionText.includes("status ACTION_NEEDED") &&
    lastDecisionText.includes("summary Manual setup is incomplete.") &&
    lastDecisionText.includes("regime PULLBACK_IN_UPTREND | trigger CONFIRMED | invalidation CLEAR") &&
    lastDecisionText.includes("Operational only. No trade was executed."),
  "/lastdecision should render a compact operational summary.",
);

const hourlyHealthActions = await routeCommand(
  {
    ...baseContext,
    command: "hourlyhealth",
    args: [],
    text: "/hourlyhealth",
  },
  {
    ...deps,
    inspectionProvider,
  },
);

const hourlyHealthAction = hourlyHealthActions[0];
let hourlyHealthText = "";
if (hourlyHealthAction && hourlyHealthAction.kind === "sendMessage") {
  hourlyHealthText = hourlyHealthAction.text;
}

assert(
  hourlyHealthText.includes("Hourly health:") &&
    hourlyHealthText.includes("verdict: action needed") &&
    hourlyHealthText.includes("Market data: fetch_failure") &&
    hourlyHealthText.includes("Structure: regime PULLBACK_IN_UPTREND | trigger CONFIRMED | invalidation CLEAR") &&
    hourlyHealthText.includes("Suppression: cooldown 2 | sleep 1 | setup 4"),
  "/hourlyhealth should render compact operational health details.",
);

const callbackInspectionActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "inspect:lastdecision",
    args: [],
    replyToCallback: {
      id: "cb-inspect",
      from: { id: 100, first_name: "Test" },
      data: "inspect:lastdecision",
      message: {
        message_id: 4,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Inspect",
      },
    },
  },
  {
    ...deps,
    inspectionProvider,
  },
);

assertEqual(
  callbackInspectionActions[0]?.kind,
  "answerCallbackQuery",
  "inspection callbacks should acknowledge the button press first.",
);
assert(
  callbackInspectionActions.some(
    (action) => action.kind === "sendMessage" && action.text.includes("Last decision:"),
  ),
  "inspection callbacks should route to the compact decision summary.",
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

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "RISK_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC structure is weakening; review invalidation and cash risk now.",
    nextStep: "Review the invalidation level and whether the recorded spot size still fits your plan.",
  }).includes("ACTION NEEDED: BTC risk review is needed"),
  "Risk-review alerts should render a clear coaching headline without execution language.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "ENTRY_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC structure supports a conservative spot entry review.",
    nextStep: "Keep it staged, confirm the invalidation level first, and avoid chasing the upper end of the range.",
  }).includes("ACTION NEEDED: BTC entry review is needed"),
  "Entry-review alerts should render a clear non-execution headline.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "ADD_BUY_REVIEW_REQUIRED",
    asset: "ETH",
    summary: "ETH pullback may justify a staged add-buy review.",
    nextStep: "Only consider it if the invalidation level is clear and the pullback is not turning into breakdown.",
  }).includes("ACTION NEEDED: ETH add-buy review is needed"),
  "Add-buy review alerts should render a clear non-execution headline.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "REDUCE_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC structure is weakening; review partial reduction or exit plan.",
    nextStep: "Review the invalidation level before deciding whether to reduce or step aside.",
  }).includes("ACTION NEEDED: BTC reduce review is needed"),
  "Reduce-review alerts should render a clear non-execution headline.",
);
