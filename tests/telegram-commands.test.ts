import {
  buildActionNeededAlertText,
  routeCommand,
  routeMediaMessage,
} from "../src/telegram/commands.js";
import type {
  TelegramCommandContext,
  TelegramInspectionProvider,
  TelegramMediaMessageContext,
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
      return null;
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
    async setLocale(telegramUserId: number, locale: "ko" | "en") {
      calls.push({ kind: "setLocale", payload: { telegramUserId, locale } });
      return locale;
    },
    async resetStrategyMemory(telegramUserId: number, scope: "BTC" | "ETH" | "ALL") {
      calls.push({ kind: "resetStrategyMemory", payload: { telegramUserId, scope } });
      return {
        scope,
        createdAt: "2026-01-01T04:00:00.000Z",
      };
    },
  },
  imageImportProvider: {
    isConfigured() {
      return true;
    },
    async beginImport(input: { telegramUserId: number }) {
      calls.push({ kind: "beginImport", payload: input });
      return {
        kind: "READY" as const,
        importId: 77,
        expiresAt: "2026-01-01T05:00:00.000Z",
      };
    },
    async processMedia(input: unknown) {
      calls.push({ kind: "processMedia", payload: input });
      return {
        kind: "PENDING_CONFIRMATION" as const,
        importId: 78,
        confidence: 0.91,
        summary: "Portfolio snapshot detected.",
        warnings: [],
        expiresAt: "2026-01-01T05:10:00.000Z",
        portfolio: {
          hasCash: true,
          cashKrw: 541736,
          hasBtc: true,
          btcQuantity: 0.00277852,
          btcAverageEntryPrice: 106166978,
          hasEth: true,
          ethQuantity: 0.04976593,
          ethAverageEntryPrice: 3280890,
        },
      };
    },
    async confirmImport(input: { telegramUserId: number; importId: number }) {
      calls.push({ kind: "confirmImport", payload: input });
      return {
        kind: "APPLIED" as const,
        importId: input.importId,
        confirmedAt: "2026-01-01T05:01:00.000Z",
        applied: {
          cash: true,
          btc: true,
          eth: false,
        },
        portfolio: {
          hasCash: true,
          cashKrw: 541736,
          hasBtc: true,
          btcQuantity: 0.00277852,
          btcAverageEntryPrice: 106166978,
          hasEth: false,
          ethQuantity: 0,
          ethAverageEntryPrice: 0,
        },
      };
    },
    async rejectImport(input: { telegramUserId: number; importId: number }) {
      calls.push({ kind: "rejectImport", payload: input });
      return {
        kind: "REJECTED" as const,
        importId: input.importId,
      };
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
      latestReminderEligible: true,
      latestReminderSent: false,
      latestReminderSuppressedBy: "cooldown",
      latestReminderRepeatedSignalCount: 2,
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
const startKoActions = await routeCommand(
  {
    ...baseContext,
    command: "start",
    text: "/start",
    args: [],
    profile: {
      ...baseContext.profile,
      languageCode: "ko-KR",
    },
  },
  deps,
);

const startAction = startActions[0];
let startCallbackData: string[] = [];
if (startAction && startAction.kind === "sendMessage" && startAction.replyMarkup) {
  startCallbackData = startAction.replyMarkup.inline_keyboard.flat().map((button) => button.callback_data);
}

assert(
    startCallbackData.includes("menu:record") &&
      startCallbackData.includes("status:refresh") &&
      startCallbackData.includes("menu:inspect") &&
      startCallbackData.includes("menu:settings"),
    "/start should expose the top-level home menu buttons.",
  );
assert(
  startActions[0]?.kind === "sendMessage" &&
    startActions[0].text.includes("PositionGuard is a BTC/ETH spot position coach."),
  "/start should render English by default.",
);
assert(
  startKoActions[0]?.kind === "sendMessage" &&
    startKoActions[0].text.includes("\uD604\uBB3C \uD3EC\uC9C0\uC158 \uCF54\uCE58 \uBD07") &&
    startKoActions[0].replyMarkup?.inline_keyboard[0]?.[0]?.text === "\uAE30\uB85D\uD558\uAE30",
  "/start should render Korean copy and button labels for Korean users.",
);

const recordMenuActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "menu:record",
    args: [],
    replyToCallback: {
      id: "cb-menu-record",
      from: { id: 100, first_name: "Test" },
      data: "menu:record",
      message: {
        message_id: 11,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Menu record",
      },
    },
  },
  deps,
);

assertEqual(
  recordMenuActions[0]?.kind,
  "answerCallbackQuery",
  "record menu callback should acknowledge the button press first.",
);
assert(
  recordMenuActions.some(
    (action) =>
      action.kind === "sendMessage" &&
      action.text.includes("Choose how to update your record.") &&
      action.replyMarkup?.inline_keyboard.flat().some((button) => button.callback_data === "menu:record:direct"),
  ),
  "record menu callback should open the record submenu.",
);

const settingsMenuActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "menu:settings",
    args: [],
    replyToCallback: {
      id: "cb-menu-settings",
      from: { id: 100, first_name: "Test" },
      data: "menu:settings",
      message: {
        message_id: 12,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Menu settings",
      },
    },
  },
  deps,
);

assert(
  settingsMenuActions.some(
    (action) =>
      action.kind === "sendMessage" &&
      action.text.includes("Choose a settings section.") &&
      action.replyMarkup?.inline_keyboard.flat().some((button) => button.callback_data === "menu:settings:restart"),
  ),
  "settings menu callback should open the settings submenu.",
);

const helpKoActions = await routeCommand(
  {
    ...baseContext,
    command: "help",
    text: "/help",
    args: [],
    profile: {
      ...baseContext.profile,
      languageCode: "ko",
    },
  },
  deps,
);
assert(
  helpKoActions[0]?.kind === "sendMessage" &&
    helpKoActions[0].text.includes("/language <ko|en>") &&
    helpKoActions[0].text.includes("/importimage") &&
    helpKoActions[0].text.includes("/freshstart <BTC|ETH|ALL> confirm") &&
    helpKoActions[0].text.includes("\uBD07 \uC5B8\uC5B4 \uC120\uD0DD"),
  "/help should render Korean help copy including /language and /freshstart.",
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
    trackedAssetText.includes("This only updates your record. No trades are executed."),
  "Tracked-asset callback should stay record-only.",
);

const languageKoActions = await routeCommand(
  {
    ...baseContext,
    command: "language",
    text: "/language ko",
    args: ["ko"],
  },
  deps,
);
assert(
  calls.some((call) => call.kind === "setLocale" && (call.payload as { locale?: string }).locale === "ko"),
  "Explicit /language ko should persist the selected locale.",
);
assert(
  languageKoActions[0]?.kind === "sendMessage" &&
    languageKoActions[0].text.includes("\uC5B8\uC5B4\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4"),
  "/language ko confirmation should render in Korean.",
);

const languageEnActions = await routeCommand(
  {
    ...baseContext,
    command: "language",
    text: "/language en",
    args: ["en"],
    profile: {
      ...baseContext.profile,
      languageCode: "ko-KR",
    },
  },
  deps,
);
assert(
  calls.some((call) => call.kind === "setLocale" && (call.payload as { locale?: string }).locale === "en"),
  "Explicit /language en should persist the selected locale.",
);
assert(
  languageEnActions[0]?.kind === "sendMessage" &&
    languageEnActions[0].text.includes("Language saved: English."),
  "Explicit /language en should override Telegram Korean fallback and confirm in English.",
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

const importStartActions = await routeCommand(
  {
    ...baseContext,
    command: "importimage",
    text: "/importimage",
    args: [],
  },
  deps,
);

assert(
  calls.some((call) => call.kind === "beginImport"),
  "/importimage should begin a pending image-import flow.",
);
assert(
  importStartActions[0]?.kind === "sendMessage" &&
    importStartActions[0].text.includes("portfolio screenshot"),
  "/importimage should guide the user toward sending a portfolio screenshot.",
);

const importCallbackActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "import:start",
    args: [],
    replyToCallback: {
      id: "cb-import-start",
      from: { id: 100, first_name: "Test" },
      data: "import:start",
      message: {
        message_id: 5,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Import",
      },
    },
  },
  deps,
);

assertEqual(
  importCallbackActions[0]?.kind,
  "answerCallbackQuery",
  "import:start callback should acknowledge the button press first.",
);
assert(
  importCallbackActions.some(
    (action) => action.kind === "sendMessage" && action.text.includes("portfolio screenshot"),
  ),
  "import:start callback should send image-import guidance.",
);

const importConfirmActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "import:confirm:78",
    args: [],
    replyToCallback: {
      id: "cb-import-confirm",
      from: { id: 100, first_name: "Test" },
      data: "import:confirm:78",
      message: {
        message_id: 6,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Confirm import",
      },
    },
  },
  deps,
);

assert(
  calls.some(
    (call) => call.kind === "confirmImport" && (call.payload as { importId?: number }).importId === 78,
  ),
  "import confirm callback should call the image-import provider with the pending import id.",
);
assert(
  importConfirmActions.some(
    (action) => action.kind === "sendMessage" && action.text.includes("Imported values were saved"),
  ),
  "import confirm callback should send a saved confirmation message.",
);

const importRetryActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "import:retry:78",
    args: [],
    replyToCallback: {
      id: "cb-import-retry",
      from: { id: 100, first_name: "Test" },
      data: "import:retry:78",
      message: {
        message_id: 7,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Retry import",
      },
    },
  },
  deps,
);

assert(
  calls.some(
    (call) => call.kind === "rejectImport" && (call.payload as { importId?: number }).importId === 78,
  ),
  "import retry should cancel the previous pending import first.",
);
assert(
  importRetryActions.some(
    (action) => action.kind === "sendMessage" && action.text.includes("Please send the portfolio screenshot again"),
  ),
  "import retry should prompt the user to send the screenshot again.",
);

const importCancelActions = await routeCommand(
  {
    ...baseContext,
    command: "callback",
    text: "import:cancel:79",
    args: [],
    replyToCallback: {
      id: "cb-import-cancel",
      from: { id: 100, first_name: "Test" },
      data: "import:cancel:79",
      message: {
        message_id: 8,
        date: 1,
        chat: { id: 200, type: "private" },
        from: { id: 100, first_name: "Test" },
        text: "Cancel import",
      },
    },
  },
  deps,
);

assert(
  importCancelActions.some(
    (action) => action.kind === "sendMessage" && action.text.includes("cancelled"),
  ),
  "import cancel should confirm cancellation to the user.",
);

const invalidFreshStartActions = await routeCommand(
  {
    ...baseContext,
    command: "freshstart",
    text: "/freshstart BTC",
    args: ["BTC"],
  },
  deps,
);

assert(
  invalidFreshStartActions[0]?.kind === "sendMessage" &&
    invalidFreshStartActions[0].text.includes("Usage: /freshstart <BTC|ETH|ALL> confirm"),
  "/freshstart should require an explicit confirm token.",
);

const freshStartActions = await routeCommand(
  {
    ...baseContext,
    command: "freshstart",
    text: "/freshstart ETH confirm",
    args: ["ETH", "confirm"],
  },
  deps,
);

assert(
  calls.some(
    (call) =>
      call.kind === "setPosition" &&
      (call.payload as { asset?: string; quantity?: number; averageEntryPrice?: number }).asset === "ETH" &&
      (call.payload as { asset?: string; quantity?: number; averageEntryPrice?: number }).quantity === 0 &&
      (call.payload as { asset?: string; quantity?: number; averageEntryPrice?: number }).averageEntryPrice === 0,
  ),
  "/freshstart ETH confirm should reset the ETH record to 0 before severing recent memory.",
);
assert(
  calls.some((call) => call.kind === "resetStrategyMemory" && (call.payload as { scope?: string }).scope === "ETH"),
  "/freshstart should persist a strategy-memory reset marker for the requested scope.",
);
assert(
  freshStartActions[0]?.kind === "sendMessage" &&
    freshStartActions[0].text.includes("The stored ETH record was reset to 0."),
  "/freshstart should confirm that the selected asset record was reset for a real restart.",
);

const freshStartAllActions = await routeCommand(
  {
    ...baseContext,
    command: "freshstart",
    text: "/freshstart ALL confirm",
    args: ["ALL", "confirm"],
  },
  deps,
);

assert(
  calls.some((call) => call.kind === "setCash" && (call.payload as { cash?: number }).cash === 0),
  "/freshstart ALL confirm should reset available cash to 0.",
);
assert(
  calls.filter((call) => call.kind === "setPosition").some(
    (call) =>
      (call.payload as { asset?: string; quantity?: number }).asset === "BTC" &&
      (call.payload as { asset?: string; quantity?: number }).quantity === 0,
  ) &&
    calls.filter((call) => call.kind === "setPosition").some(
      (call) =>
        (call.payload as { asset?: string; quantity?: number }).asset === "ETH" &&
        (call.payload as { asset?: string; quantity?: number }).quantity === 0,
    ),
  "/freshstart ALL confirm should reset both BTC and ETH records to 0.",
);
assert(
  calls.some((call) => call.kind === "resetStrategyMemory" && (call.payload as { scope?: string }).scope === "ALL"),
  "/freshstart ALL confirm should still sever recent strategy memory after resetting stored state.",
);
assert(
  freshStartAllActions[0]?.kind === "sendMessage" &&
    freshStartAllActions[0].text.includes("Cash, BTC, and ETH records were reset to 0."),
  "/freshstart ALL confirm should explain that all stored records were reset.",
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
          reason: "STATE_UPDATE_REMINDER",
          summary: "PositionGuard is still seeing the same stored manual state.",
          asset: "BTC",
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
  alertText.includes("Alert type: BTC state update reminder") &&
  alertText.includes("Next send time: 2026-01-01 18:00:00 KST"),
  "/lastalert should expose a plain-language alert type and cooldown time.",
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
    lastDecisionText.includes("BTC | action needed") &&
    lastDecisionText.includes("Summary: Manual setup is incomplete.") &&
    lastDecisionText.includes("Market structure: pullback in uptrend | trigger: confirmed | invalidation: clear") &&
    lastDecisionText.includes("plain-language summary"),
  "/lastdecision should render a plain-language decision summary.",
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
    hourlyHealthText.includes("Latest review: action needed | 2026-01-01 12:00:00 KST") &&
    hourlyHealthText.includes("Market data status: fetch failure") &&
    hourlyHealthText.includes("Recent market-data failures: 3") &&
    hourlyHealthText.includes("Last failure reason: Upbit request failed (502 Bad Gateway): upstream timeout") &&
    hourlyHealthText.includes("Market structure: pullback in uptrend | trigger: confirmed | invalidation: clear") &&
    hourlyHealthText.includes("Reminder status: Repeated 2 | Not sent | Reminder eligible | cooldown") &&
    hourlyHealthText.includes("Alert holds: cooldown 2 | sleep 1 | setup blocked 4"),
  "/hourlyhealth should render a plain-language health summary.",
);

const unsupportedReminderHealthActions = await routeCommand(
  {
    ...baseContext,
    command: "hourlyhealth",
    args: [],
    text: "/hourlyhealth",
  },
  {
    ...deps,
    inspectionProvider: {
      async getLastDecisionSnapshot() {
        return null;
      },
      async getHourlyHealthSnapshot() {
        return {
          trackedAssets: ["BTC"] as ("BTC" | "ETH")[],
          readiness: {
            isReady: true,
            missingItems: [],
            hasCashRecord: true,
            readyPositionAssets: ["BTC"] as ("BTC" | "ETH")[],
          },
          lastRunAt: "2026-01-01T03:00:00.000Z",
          lastDecisionStatus: "NO_ACTION",
          marketDataStatus: "ok" as const,
          recentMarketFailureCount: 10,
          recentCooldownSkipCount: 0,
          recentSleepSuppressionCount: 0,
          recentSetupBlockedCount: 0,
          latestMarketFailureMessage: "Upbit request failed (522 <none>): error code: 522",
          latestRegime: "RECLAIM_ATTEMPT",
          latestTriggerState: "PENDING",
          latestInvalidationState: "CLEAR",
          latestReminderEligible: false,
          latestReminderSent: false,
          latestReminderSuppressedBy: "unsupported_reason",
          latestReminderRepeatedSignalCount: 0,
          latestNotification: null,
        };
      },
    },
  },
);

const unsupportedReminderHealthAction = unsupportedReminderHealthActions[0];
let unsupportedReminderHealthText = "";
if (
  unsupportedReminderHealthAction &&
  unsupportedReminderHealthAction.kind === "sendMessage"
) {
  unsupportedReminderHealthText = unsupportedReminderHealthAction.text;
}

assert(
  unsupportedReminderHealthText.includes("Reminder status: not applicable") &&
    !unsupportedReminderHealthText.includes("unsupported_reason"),
  "/hourlyhealth should hide internal unsupported_reason values from user-facing reminder text.",
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
  "inspection callbacks should route to the plain-language decision summary.",
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

const invalidLanguageActions = await routeCommand(
  {
    ...baseContext,
    command: "language",
    text: "/language jp",
    args: ["jp"],
    profile: {
      ...baseContext.profile,
      languageCode: "ko-KR",
    },
  },
  deps,
);
assert(
  invalidLanguageActions[0]?.kind === "sendMessage" &&
    invalidLanguageActions[0].text.includes("\uC9C0\uC6D0\uB418\uC9C0 \uC54A\uB294 \uC5B8\uC5B4"),
  "Invalid /language input should return localized usage guidance.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "RISK_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC structure is weakening; review invalidation and cash risk now.",
    nextStep: "Review the invalidation level and whether the recorded spot size still fits your plan.",
  }).includes("Review needed: BTC risk review is needed"),
  "Risk-review alerts should render a clear coaching headline without execution language.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    locale: "ko",
    reason: "ENTRY_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC structure supports a conservative spot entry review.",
    nextStep: "Keep it staged, confirm the invalidation level first, and avoid chasing the upper end of the range.",
  }).includes("BTC \uC9C4\uC785 \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4"),
  "ACTION_NEEDED alerts should localize Korean user-facing text without changing alert semantics.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "ADD_BUY_REVIEW_REQUIRED",
    asset: "ETH",
    summary: "ETH pullback may justify a staged add-buy review.",
    nextStep: "Only consider it if the invalidation level is clear and the pullback is not turning into breakdown.",
  }).includes("Review needed: ETH add-buy review is needed"),
  "Add-buy review alerts should render a clear non-execution headline.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "REDUCE_REVIEW_REQUIRED",
    asset: "BTC",
    summary: "BTC structure is weakening; review partial reduction or exit plan.",
    nextStep: "Review the invalidation level before deciding whether to reduce or step aside.",
  }).includes("Review needed: BTC reduce review is needed"),
  "Reduce-review alerts should render a clear non-execution headline.",
);

assert(
  buildActionNeededAlertText({
    chatId: 200,
    reason: "STATE_UPDATE_REMINDER",
    asset: "BTC",
    summary: "If you already bought or sold, update your recorded position.",
    nextStep: "Use /setposition for inventory changes and /setcash if available cash changed.",
  }).includes("Review needed: BTC state update reminder is needed"),
  "State-update reminder alerts should render a dedicated non-execution headline.",
);

const mediaActions = await routeMediaMessage(
  {
    update: { update_id: 99 },
    chatId: 200,
    userId: 100,
    profile: {
      telegramUserId: 100,
      telegramChatId: 200,
      username: "tester",
      displayName: "Test User",
    },
    message: {
      message_id: 15,
      date: 1,
      chat: { id: 200, type: "private" },
      from: { id: 100, first_name: "Test" },
      photo: [
        {
          file_id: "photo-small",
          width: 100,
          height: 100,
        },
        {
          file_id: "photo-large",
          width: 1200,
          height: 1600,
        },
      ],
    },
  } satisfies TelegramMediaMessageContext,
  deps,
);

assert(
  calls.some(
    (call) =>
      call.kind === "processMedia" &&
      (call.payload as { telegramFileId?: string }).telegramFileId === "photo-large",
  ),
  "routeMediaMessage should pass the highest-resolution Telegram photo to the image-import provider.",
);
const mediaAction = mediaActions[0];
assert(
  mediaAction?.kind === "sendMessage" &&
    mediaAction.text.includes("Portfolio snapshot detected.") &&
    mediaAction.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data === "import:confirm:78",
  "routeMediaMessage should return a confirmation message with confirm/retry/cancel buttons.",
);
