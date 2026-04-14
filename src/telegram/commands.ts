import type { SupportedLocale } from "../domain/types.js";
import type {
  ImageImportConfirmResult,
  ImageImportProcessingResult,
  ImageImportRejectResult,
  PortfolioSnapshotImportData,
} from "../image-import/types.js";
import type { StrategyMemoryResetScope } from "../types/persistence.js";
import { formatAvailability, formatCompactTimestampForLocale, formatLocaleName, formatNumberForLocale, getMessages, resolveUserLocale } from "../i18n/index.js";
import { formatValidationErrors, validatePositionInput } from "../validation.js";
import { describeDecisionVerdict } from "../operator-visibility.js";
import { parseCashAmount, parsePositionArgs, parseSleepModeArg, parseTelegramCallbackAction } from "./parser.js";
import type {
  TelegramActionNeededReason,
  TelegramCommandContext,
  TelegramHourlyHealthSnapshot,
  TelegramLastDecisionSnapshot,
  TelegramMediaMessageContext,
  TelegramOutgoingAction,
  TelegramReplyMarkup,
  TelegramOnboardingSnapshot,
  TelegramRouterDependencies,
  TelegramTrackedAssetsSelection,
  TelegramUserStateSnapshot,
} from "./types.js";

export function routeCommand(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const bootstrap = deps.stateStore?.upsertUserState(context.profile);
  const command = context.command.toLowerCase();
  const fallbackLocale = resolveUserLocale(
    context.profile.preferredLocale ?? null,
    context.profile.languageCode ?? null,
  );

  return Promise.resolve(bootstrap).then((bootstrappedLocale) => {
    const locale = resolveUserLocale(
      (bootstrappedLocale as SupportedLocale | null | undefined) ?? fallbackLocale,
      context.profile.languageCode ?? null,
    );

    if (command === "callback") {
      return routeCallback(context, deps, locale);
    }

    switch (command) {
      case "start":
        return [send(context.chatId, getMessages(locale).command.start, buildOnboardingKeyboard(locale))];
      case "help":
        return [send(context.chatId, getMessages(locale).command.help, buildOnboardingKeyboard(locale))];
      case "language":
        return handleLanguage(context, deps, locale);
      case "track":
        return handleTrack(context, deps, locale);
      case "status":
        return handleStatus(context, deps, locale);
      case "setcash":
        return handleSetCash(context, deps, locale);
      case "setposition":
        return handleSetPosition(context, deps, locale);
      case "lastdecision":
        return handleLastDecision(context, deps, locale);
      case "hourlyhealth":
        return handleHourlyHealth(context, deps, locale);
      case "lastalert":
        return handleLastAlert(context, deps, locale);
      case "importimage":
        return handleImageImportStart(context, deps, locale);
      case "freshstart":
        return handleFreshStart(context, deps, locale);
      case "sleep":
        return handleSleep(context, deps, locale);
      default:
        return [send(context.chatId, getMessages(locale).command.unknown, buildOnboardingKeyboard(locale))];
    }
  });
}

async function routeCallback(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const callbackQuery = context.replyToCallback;
  const action = parseTelegramCallbackAction(callbackQuery?.data);
  const messages = getMessages(locale);

  if (!action || !callbackQuery) {
    return [answer(callbackQuery?.id ?? "", messages.command.unsupportedAction)];
  }

  if (action.kind === "sleep:on") {
    return [answer(callbackQuery.id), ...(await handleSleep(context, deps, locale, true))];
  }

  if (action.kind === "sleep:off") {
    return [answer(callbackQuery.id), ...(await handleSleep(context, deps, locale, false))];
  }

  if (action.kind === "setup:progress") {
    return [answer(callbackQuery.id), ...(await handleSetupProgress(context, deps, locale))];
  }

  if (action.kind === "status:refresh") {
    return [answer(callbackQuery.id), ...(await handleStatus(context, deps, locale))];
  }

  if (action.kind === "setup:track") {
    return [answer(callbackQuery.id), ...(await handleTrackedAssetsChoice(context, deps, locale, action.trackedAssets))];
  }

  if (action.kind === "setup:cash") {
    return [answer(callbackQuery.id), ...buildCashShortcutActions(context, locale)];
  }

  if (action.kind === "setup:position") {
    return [answer(callbackQuery.id), ...buildPositionShortcutActions(context, locale, action.asset)];
  }

  if (action.kind === "import:start") {
    return [answer(callbackQuery.id), ...(await handleImageImportStart(context, deps, locale))];
  }

  if (action.kind === "import:confirm") {
    return [answer(callbackQuery.id), ...(await handleImageImportConfirm(context, deps, locale, action.importId))];
  }

  if (action.kind === "import:retry") {
    return [answer(callbackQuery.id), ...(await handleImageImportRetry(context, deps, locale, action.importId))];
  }

  if (action.kind === "import:cancel") {
    return [answer(callbackQuery.id), ...(await handleImageImportCancel(context, deps, locale, action.importId))];
  }

  if (action.kind === "inspect:lastdecision") {
    return [answer(callbackQuery.id), ...(await handleLastDecision(context, deps, locale))];
  }

  if (action.kind === "inspect:hourlyhealth") {
    return [answer(callbackQuery.id), ...(await handleHourlyHealth(context, deps, locale))];
  }

  return [answer(callbackQuery.id), ...(await handleStatus(context, deps, locale))];
}

async function handleLanguage(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const requested = context.args[0]?.trim().toLowerCase();
  const currentMessages = getMessages(locale);

  if (requested !== "ko" && requested !== "en") {
    const invalidInput = requested ?? "";
    const text = invalidInput
      ? currentMessages.command.languageInvalid(invalidInput, currentMessages.localeName)
      : currentMessages.command.languageUsage(currentMessages.localeName);
    return [send(context.chatId, text, buildOnboardingKeyboard(locale))];
  }

  if (deps.stateStore?.setLocale) {
    await deps.stateStore.setLocale(context.userId, requested);
  }

  const selectedLocale = requested as SupportedLocale;
  const selectedMessages = getMessages(selectedLocale);
  return [
    send(
      context.chatId,
      selectedMessages.command.languageSet(selectedMessages.localeName),
      buildOnboardingKeyboard(selectedLocale),
    ),
  ];
}

async function handleStatus(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  if (deps.statusProvider) {
    const text = await deps.statusProvider.getStatus(context.userId, locale);
    return [send(context.chatId, text, buildOnboardingKeyboard(locale))];
  }

  if (deps.onboardingProvider) {
    const snapshot = await deps.onboardingProvider.getOnboardingSnapshot(context.userId);
    if (snapshot) {
      return [send(context.chatId, formatOnboardingSnapshot(snapshot, locale), buildOnboardingKeyboard(locale))];
    }
  }

  return buildFallbackStatus(context, deps, locale);
}

async function handleSetupProgress(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  if (!deps.onboardingProvider) {
    return handleStatus(context, deps, locale);
  }

  const snapshot = await deps.onboardingProvider.getOnboardingSnapshot(context.userId);
  if (!snapshot) {
    return buildFallbackStatus(context, deps, locale);
  }

  return [send(context.chatId, formatOnboardingSnapshot(snapshot, locale), buildOnboardingKeyboard(locale))];
}

async function handleSetCash(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const amount = parseCashAmount(context.args.join(" "));
  const messages = getMessages(locale);
  if (amount === null) {
    return [
      send(
        context.chatId,
        formatValidationErrors(
          [
            locale === "ko"
              ? "\uC0AC\uC6A9 \uAC00\uB2A5 \uD604\uAE08\uC740 0 \uC774\uC0C1\uC758 \uC22B\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4."
              : "Available cash must be a non-negative number.",
          ],
          messages.command.invalidCashUsage,
        ),
        buildOnboardingKeyboard(locale),
      ),
    ];
  }

  if (deps.stateStore) {
    await deps.stateStore.setCash(context.userId, amount);
  }

  return [
    send(
      context.chatId,
      messages.command.cashRecorded(formatNumberForLocale(locale, amount)),
      buildOnboardingKeyboard(locale),
    ),
  ];
}

async function handleTrack(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const trackedAssets = parseTrackedAssetsSelection(context.args[0]);
  if (!trackedAssets) {
    return [send(context.chatId, getMessages(locale).command.invalidTrackUsage, buildOnboardingKeyboard(locale))];
  }

  return handleTrackedAssetsChoice(context, deps, locale, trackedAssets);
}

async function handleSetPosition(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const parsed = parsePositionArgs(context.args);
  const messages = getMessages(locale);
  if (!parsed) {
    return [send(context.chatId, messages.command.invalidPositionUsage, buildOnboardingKeyboard(locale))];
  }

  const validation = validatePositionInput(parsed);
  if (!validation.ok || !validation.value) {
    return [
      send(
        context.chatId,
        formatValidationErrors(validation.errors, messages.command.invalidPositionUsage),
        buildOnboardingKeyboard(locale),
      ),
    ];
  }

  if (deps.stateStore) {
    await deps.stateStore.setPosition({
      telegramUserId: context.userId,
      asset: validation.value.asset,
      quantity: validation.value.quantity,
      averageEntryPrice: validation.value.averageEntryPrice,
    });
  }

  return [
    send(
      context.chatId,
      `${validation.value.asset} ${locale === "ko" ? "\uD604\uBB3C \uAE30\uB85D \uC644\uB8CC" : "spot position recorded"}: ${formatNumberForLocale(locale, validation.value.quantity)} @ avg ${formatNumberForLocale(locale, validation.value.averageEntryPrice)} KRW.`,
      buildOnboardingKeyboard(locale),
    ),
  ];
}

async function handleFreshStart(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const scope = parseFreshStartScope(context.args[0]);
  const confirmation = context.args[1]?.trim().toLowerCase();
  const messages = getMessages(locale);

  if (!scope || confirmation !== "confirm") {
    return [send(context.chatId, messages.command.invalidFreshStartUsage, buildOnboardingKeyboard(locale))];
  }

  if (deps.stateStore?.resetStrategyMemory) {
    await deps.stateStore.resetStrategyMemory(context.userId, scope);
  }

  return [send(context.chatId, messages.command.freshStartRecorded(scope), buildOnboardingKeyboard(locale))];
}

async function handleSleep(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
  forced?: boolean,
): Promise<TelegramOutgoingAction[]> {
  const arg = typeof forced === "boolean" ? forced : parseSleepModeArg(context.args);
  const messages = getMessages(locale);
  if (arg === null || typeof arg === "undefined") {
    return [send(context.chatId, messages.command.invalidSleepUsage, buildOnboardingKeyboard(locale))];
  }

  if (deps.stateStore) {
    await deps.stateStore.setSleepMode(context.userId, arg);
  }

  return [send(context.chatId, messages.command.sleepUpdated(arg), buildOnboardingKeyboard(locale))];
}

export async function routeMediaMessage(
  context: TelegramMediaMessageContext,
  deps: TelegramRouterDependencies,
): Promise<TelegramOutgoingAction[]> {
  const bootstrap = deps.stateStore?.upsertUserState(context.profile);
  const fallbackLocale = resolveUserLocale(
    context.profile.preferredLocale ?? null,
    context.profile.languageCode ?? null,
  );

  const bootstrappedLocale = await Promise.resolve(bootstrap);
  const locale = resolveUserLocale(
    (bootstrappedLocale as SupportedLocale | null | undefined) ?? fallbackLocale,
    context.profile.languageCode ?? null,
  );
  const messages = getMessages(locale);
  const provider = deps.imageImportProvider;

  if (!provider) {
    return [send(context.chatId, messages.importFlow.unavailable, buildOnboardingKeyboard(locale))];
  }

  const mediaFile = getPreferredImageFile(context);
  if (!mediaFile) {
    return [send(context.chatId, messages.importFlow.unsupportedMedia, buildOnboardingKeyboard(locale))];
  }

  const result = await provider.processMedia({
    telegramUserId: context.userId,
    telegramChatId: context.chatId,
    telegramMessageId: context.message.message_id,
    username: context.profile.username ?? null,
    displayName: context.profile.displayName ?? null,
    languageCode: context.profile.languageCode ?? null,
    preferredLocale: locale,
    sourceKind: mediaFile.kind,
    telegramFileId: mediaFile.fileId,
    mimeType: mediaFile.mimeType,
    caption: context.message.caption ?? null,
  });

  return buildImageImportProcessingActions(context.chatId, locale, result);
}

export function buildOnboardingKeyboard(locale: SupportedLocale = "en"): TelegramReplyMarkup {
  const messages = getMessages(locale);
  return {
    inline_keyboard: [
      [
        { text: messages.buttons.importImage, callback_data: "import:start" },
        { text: messages.buttons.setupProgress, callback_data: "setup:progress" },
      ],
      [
        { text: messages.buttons.trackBtc, callback_data: "setup:track:btc" },
        { text: messages.buttons.trackEth, callback_data: "setup:track:eth" },
      ],
      [
        { text: messages.buttons.trackBoth, callback_data: "setup:track:both" },
        { text: messages.buttons.recordCash, callback_data: "setup:cash" },
      ],
      [
        { text: messages.buttons.recordBtc, callback_data: "setup:position:btc" },
        { text: messages.buttons.recordEth, callback_data: "setup:position:eth" },
      ],
      [
        { text: messages.buttons.status, callback_data: "status:refresh" },
        { text: messages.buttons.lastDecision, callback_data: "inspect:lastdecision" },
      ],
      [
        { text: messages.buttons.hourlyHealth, callback_data: "inspect:hourlyhealth" },
      ],
    ],
  };
}

async function handleLastAlert(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const snapshot = await deps.notificationProvider?.getLastAlert(context.userId);
  const messages = getMessages(locale);
  if (!snapshot) {
    return [send(context.chatId, messages.command.noAlertYet, buildOnboardingKeyboard(locale))];
  }

  return [
    send(
      context.chatId,
      [
        messages.command.lastAlertTitle,
        messages.command.alertReason(snapshot.reason),
        messages.command.alertAsset(snapshot.asset ?? messages.booleans.notAvailable),
        messages.command.alertWhen(formatCompactTimestampForLocale(locale, snapshot.sentAt)),
        messages.command.alertSummary(truncateText(snapshot.summary, 120)),
        messages.command.alertCooldown(
          snapshot.cooldownUntil
            ? formatCompactTimestampForLocale(locale, snapshot.cooldownUntil)
            : messages.booleans.notAvailable,
        ),
      ].join("\n"),
      buildOnboardingKeyboard(locale),
    ),
  ];
}

async function handleLastDecision(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const snapshot = await deps.inspectionProvider?.getLastDecisionSnapshot(context.userId);
  return [send(context.chatId, renderLastDecisionSnapshot(snapshot, locale), buildOnboardingKeyboard(locale))];
}

async function handleHourlyHealth(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const snapshot = await deps.inspectionProvider?.getHourlyHealthSnapshot(context.userId);
  return [send(context.chatId, renderHourlyHealthSnapshot(snapshot, locale), buildOnboardingKeyboard(locale))];
}

async function handleTrackedAssetsChoice(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
  trackedAssets: TelegramTrackedAssetsSelection,
): Promise<TelegramOutgoingAction[]> {
  const selectedAssets: ("BTC" | "ETH")[] = trackedAssets === "BOTH" ? ["BTC", "ETH"] : [trackedAssets];
  const messages = getMessages(locale);

  if (deps.onboardingProvider) {
    const snapshot = await deps.onboardingProvider.setTrackedAssets(context.userId, selectedAssets);

    if (snapshot) {
      return [
        send(
          context.chatId,
          messages.command.trackedAssetsRecorded(
            formatTrackedAssets(selectedAssets, locale),
            formatOnboardingSnapshot(snapshot, locale),
          ),
          buildOnboardingKeyboard(locale),
        ),
      ];
    }
  }

  return [
    send(
      context.chatId,
      messages.command.trackedAssetsChosen(
        formatTrackedAssets(selectedAssets, locale),
        [
          `- /setcash <amount>`,
          ...selectedAssets.map((asset) => `- /setposition ${asset} <quantity> <average-entry-price>`),
        ],
      ),
      buildOnboardingKeyboard(locale),
    ),
  ];
}

async function handleImageImportStart(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  const messages = getMessages(locale);
  const provider = deps.imageImportProvider;

  if (!provider || !provider.isConfigured()) {
    return [send(context.chatId, messages.importFlow.unavailable, buildOnboardingKeyboard(locale))];
  }

  await provider.beginImport({ telegramUserId: context.userId });
  return [send(context.chatId, messages.importFlow.startPrompt, buildOnboardingKeyboard(locale))];
}

function buildCashShortcutActions(
  context: TelegramCommandContext,
  locale: SupportedLocale,
): TelegramOutgoingAction[] {
  const messages = getMessages(locale);
  return [
    send(
      context.chatId,
      [messages.command.recordCashShortcut, messages.command.recordCashExample, messages.alerts.manualRecordOnly].join("\n"),
      buildOnboardingKeyboard(locale),
    ),
  ];
}

function buildPositionShortcutActions(
  context: TelegramCommandContext,
  locale: SupportedLocale,
  asset: "BTC" | "ETH",
): TelegramOutgoingAction[] {
  const messages = getMessages(locale);
  return [
    send(
      context.chatId,
      [
        messages.command.recordPositionShortcut(asset),
        messages.command.recordPositionExample(asset),
        messages.alerts.manualRecordOnly,
      ].join("\n"),
      buildOnboardingKeyboard(locale),
    ),
  ];
}

async function handleImageImportConfirm(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
  importId: number,
): Promise<TelegramOutgoingAction[]> {
  const messages = getMessages(locale);
  const provider = deps.imageImportProvider;

  if (!provider) {
    return [send(context.chatId, messages.importFlow.unavailable, buildOnboardingKeyboard(locale))];
  }

  const result = await provider.confirmImport({
    telegramUserId: context.userId,
    importId,
  });

  return buildImageImportConfirmActions(context.chatId, locale, result);
}

async function handleImageImportRetry(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
  importId: number,
): Promise<TelegramOutgoingAction[]> {
  const messages = getMessages(locale);
  const provider = deps.imageImportProvider;

  if (!provider) {
    return [send(context.chatId, messages.importFlow.unavailable, buildOnboardingKeyboard(locale))];
  }

  await provider.rejectImport({
    telegramUserId: context.userId,
    importId,
  });
  await provider.beginImport({ telegramUserId: context.userId });

  return [send(context.chatId, messages.importFlow.retryPrompt, buildOnboardingKeyboard(locale))];
}

async function handleImageImportCancel(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
  importId: number,
): Promise<TelegramOutgoingAction[]> {
  const messages = getMessages(locale);
  const provider = deps.imageImportProvider;

  if (!provider) {
    return [send(context.chatId, messages.importFlow.unavailable, buildOnboardingKeyboard(locale))];
  }

  const result = await provider.rejectImport({
    telegramUserId: context.userId,
    importId,
  });

  return buildImageImportRejectActions(context.chatId, locale, result);
}

async function buildFallbackStatus(
  context: TelegramCommandContext,
  deps: TelegramRouterDependencies,
  locale: SupportedLocale,
): Promise<TelegramOutgoingAction[]> {
  if (deps.stateStore) {
    const state = await deps.stateStore.getUserState(context.userId);
    const resolved = resolveUserLocale(state?.locale ?? locale, context.profile.languageCode ?? null);
    return [send(context.chatId, formatStatus(state, resolved), buildOnboardingKeyboard(resolved))];
  }

  return [send(context.chatId, formatStatus(null, locale), buildOnboardingKeyboard(locale))];
}

function parseTrackedAssetsSelection(value: string | undefined): TelegramTrackedAssetsSelection | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "BTC") {
    return "BTC";
  }
  if (normalized === "ETH") {
    return "ETH";
  }
  if (normalized === "BOTH" || normalized === "BTC,ETH") {
    return "BOTH";
  }
  return null;
}

function parseFreshStartScope(value: string | undefined): StrategyMemoryResetScope | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "BTC" || normalized === "ETH" || normalized === "ALL") {
    return normalized;
  }

  return null;
}

function formatOnboardingSnapshot(snapshot: TelegramOnboardingSnapshot, locale: SupportedLocale): string {
  const messages = getMessages(locale);
  return [
    messages.onboarding.trackedAssets(formatTrackedAssets(snapshot.trackedAssets, locale)),
    messages.onboarding.cashRecord(snapshot.hasCashRecord),
    messages.onboarding.trackedPositions(
      snapshot.trackedPositionAssets.length > 0
        ? formatTrackedAssets(snapshot.trackedPositionAssets, locale)
        : messages.booleans.none,
    ),
    messages.onboarding.readiness(snapshot.isReady),
    messages.onboarding.nextSteps(formatNextSteps(snapshot.missingNextSteps, locale)),
    messages.onboarding.recordOnly,
  ].join("\n");
}

function renderLastDecisionSnapshot(
  snapshot: TelegramLastDecisionSnapshot | null | undefined,
  locale: SupportedLocale,
): string {
  const messages = getMessages(locale);
  if (!snapshot || snapshot.lines.length === 0) {
    return messages.command.noDecisionYet;
  }

  return [
    messages.operator.lastDecisionTitle,
    messages.status.trackedAssets(formatTrackedAssets(snapshot.trackedAssets, locale)),
    ...snapshot.lines.map((line) => formatDecisionLine(line, locale)),
    messages.operator.operationalOnly,
  ].join("\n");
}

function renderHourlyHealthSnapshot(
  snapshot: TelegramHourlyHealthSnapshot | null | undefined,
  locale: SupportedLocale,
): string {
  const messages = getMessages(locale);
  if (!snapshot) {
    return messages.command.noHourlyHealthYet;
  }

  const latestNotification = snapshot.latestNotification
    ? `${snapshot.latestNotification.deliveryStatus}${snapshot.latestNotification.reasonKey ? ` | ${snapshot.latestNotification.reasonKey}` : ""}${snapshot.latestNotification.suppressedBy ? ` | ${snapshot.latestNotification.suppressedBy}` : ""}${snapshot.latestNotification.sentAt ? ` | ${formatCompactTimestampForLocale(locale, snapshot.latestNotification.sentAt)}` : ""}`
    : messages.booleans.none;

  const reminderSummary =
    formatReminderSummary(snapshot, locale);
  const latestDecisionSummary = formatLatestDecisionSummary(snapshot, locale);
  const marketDataLines = formatHourlyMarketDataLines(snapshot, locale);

  return [
    messages.operator.hourlyHealthTitle,
    messages.status.trackedAssets(formatTrackedAssets(snapshot.trackedAssets, locale)),
    locale === "ko"
      ? `\uC900\uBE44\uB3C4: ${snapshot.readiness.isReady ? messages.booleans.ready : messages.booleans.incomplete} | \uD604\uAE08: ${snapshot.readiness.hasCashRecord ? messages.booleans.yes : messages.booleans.no} | \uD3EC\uC9C0\uC158: ${formatTrackedAssets(snapshot.readiness.readyPositionAssets, locale)}`
      : `Readiness: ${snapshot.readiness.isReady ? "ready" : "blocked"} | cash: ${snapshot.readiness.hasCashRecord ? "yes" : "no"} | positions: ${formatTrackedAssets(snapshot.readiness.readyPositionAssets, locale)}`,
    messages.status.missingNextSteps(formatNextSteps(snapshot.readiness.missingItems, locale)),
    latestDecisionSummary,
    ...marketDataLines,
    locale === "ko"
      ? `\uAD6C\uC870: \uB808\uC9D0 ${snapshot.latestRegime ?? messages.booleans.notAvailable} | \uD2B8\uB9AC\uAC70 ${snapshot.latestTriggerState ?? messages.booleans.notAvailable} | \uBB34\uD6A8\uD654 ${snapshot.latestInvalidationState ?? messages.booleans.notAvailable}`
      : `Structure: regime ${snapshot.latestRegime ?? messages.booleans.notAvailable} | trigger ${snapshot.latestTriggerState ?? messages.booleans.notAvailable} | invalidation ${snapshot.latestInvalidationState ?? messages.booleans.notAvailable}`,
    locale === "ko"
      ? `\uB9AC\uB9C8\uC778\uB354: ${reminderSummary}`
      : `Reminder: ${reminderSummary}`,
    locale === "ko"
      ? `\uC5B5\uC81C: cooldown ${snapshot.recentCooldownSkipCount} | sleep ${snapshot.recentSleepSuppressionCount} | setup ${snapshot.recentSetupBlockedCount}`
      : `Suppression: cooldown ${snapshot.recentCooldownSkipCount} | sleep ${snapshot.recentSleepSuppressionCount} | setup ${snapshot.recentSetupBlockedCount}`,
    locale === "ko" ? `\uCD5C\uADFC \uC54C\uB9BC: ${latestNotification}` : `Latest alert: ${latestNotification}`,
    messages.operator.operationalOnly,
  ].join("\n");
}

function formatLatestDecisionSummary(
  snapshot: TelegramHourlyHealthSnapshot,
  locale: SupportedLocale,
): string {
  const messages = getMessages(locale);
  const status = snapshot.lastDecisionStatus ?? messages.booleans.none;
  const when = snapshot.lastRunAt
    ? formatCompactTimestampForLocale(locale, snapshot.lastRunAt)
    : messages.booleans.notAvailable;

  return locale === "ko"
    ? `\uCD5C\uADFC \uACB0\uC815: ${status} | ${when}`
    : `Latest decision: ${status} | ${when}`;
}

function formatHourlyMarketDataLines(
  snapshot: TelegramHourlyHealthSnapshot,
  locale: SupportedLocale,
): string[] {
  const messages = getMessages(locale);
  const currentStatus = snapshot.marketDataStatus ?? messages.booleans.none;
  const lines = [
    locale === "ko"
      ? `\uD604\uC7AC \uC2DC\uC7A5 \uB370\uC774\uD130: ${currentStatus}`
      : `Current market data: ${currentStatus}`,
    locale === "ko"
      ? `\uCD5C\uADFC \uC2DC\uC7A5 \uB370\uC774\uD130 \uC2E4\uD328: ${snapshot.recentMarketFailureCount}\uD68C`
      : `Recent market-data failures: ${snapshot.recentMarketFailureCount}`,
  ];

  if (snapshot.latestMarketFailureMessage) {
    lines.push(
      locale === "ko"
        ? `\uB9C8\uC9C0\uB9C9 \uC2E4\uD328 \uC0AC\uC720: ${truncateText(snapshot.latestMarketFailureMessage, 100)}`
        : `Last failure reason: ${truncateText(snapshot.latestMarketFailureMessage, 100)}`,
    );
  }

  return lines;
}

function formatReminderSummary(
  snapshot: TelegramHourlyHealthSnapshot,
  locale: SupportedLocale,
): string {
  const messages = getMessages(locale);

  if (
    snapshot.latestReminderEligible === false &&
    snapshot.latestReminderSent === false &&
    (snapshot.latestReminderRepeatedSignalCount ?? 0) === 0 &&
    snapshot.latestReminderSuppressedBy === "unsupported_reason"
  ) {
    return locale === "ko" ? "\uD574\uB2F9 \uC5C6\uC74C" : "not applicable";
  }

  const suppressedBy = mapReminderSuppressionReason(
    snapshot.latestReminderSuppressedBy,
    locale,
  );

  return (
    `eligible ${formatAvailability(locale, snapshot.latestReminderEligible === true)} | ` +
    `sent ${formatAvailability(locale, snapshot.latestReminderSent === true)} | ` +
    `repeated ${snapshot.latestReminderRepeatedSignalCount ?? messages.booleans.notAvailable}` +
    `${suppressedBy ? ` | suppressed ${suppressedBy}` : ""}`
  );
}

function mapReminderSuppressionReason(
  value: string | null,
  locale: SupportedLocale,
): string | null {
  if (!value) {
    return null;
  }

  if (value === "unsupported_reason") {
    return locale === "ko" ? "\uD574\uB2F9 \uC5C6\uC74C" : "not applicable";
  }

  if (value === "below_repeat_threshold") {
    return locale === "ko" ? "\uBC18\uBCF5 \uD69F\uC218 \uBD80\uC871" : "below repeat threshold";
  }

  if (value === "state_changed") {
    return locale === "ko" ? "\uC800\uC7A5 \uC0C1\uD0DC \uBCC0\uACBD\uB428" : "state changed";
  }

  if (value === "primary_alert_sent") {
    return locale === "ko" ? "\uC8FC \uC54C\uB9BC \uAE30\uC804\uC1A1" : "primary alert sent";
  }

  if (value === "sleep_mode") {
    return locale === "ko" ? "\uC218\uBA74 \uBAA8\uB4DC" : "sleep mode";
  }

  return value;
}

function formatTrackedAssets(assets: Array<"BTC" | "ETH">, locale: SupportedLocale): string {
  const messages = getMessages(locale);
  if (assets.length === 0) {
    return messages.booleans.notSelected;
  }

  return assets.join(", ");
}

function formatNextSteps(steps: string[], locale: SupportedLocale): string {
  const messages = getMessages(locale);
  if (steps.length === 0) {
    return messages.booleans.none;
  }

  return steps.join("; ");
}

function formatStatus(state: TelegramUserStateSnapshot | null, locale: SupportedLocale): string {
  const messages = getMessages(locale);
  if (!state) {
    return [messages.command.noStoredSetup, messages.command.noStoredSetupHint].join("\n");
  }

  return [
    `User: ${state.telegramUserId}`,
    messages.status.trackedAssets(
      state.trackedAssets === "BTC,ETH" ? "BTC, ETH" : state.trackedAssets,
    ),
    messages.status.sleepMode(state.isSleeping),
    messages.status.availableCash(
      state.cash === null ? messages.booleans.notSet : formatNumberForLocale(locale, state.cash),
    ),
    messages.command.statusPrompt,
  ].join("\n");
}

function formatDecisionLine(line: TelegramLastDecisionSnapshot["lines"][number], locale: SupportedLocale): string {
  return [
    `${line.asset}: ${describeDecisionVerdict(line.status, locale)}`,
    `status ${line.status}`,
    `${line.alertOutcome}${line.suppressedBy ? ` (${line.suppressedBy})` : ""}`,
    `when ${formatCompactTimestampForLocale(locale, line.createdAt)}`,
    `summary ${truncateText(line.summary, 90)}`,
    `regime ${line.regime ?? getMessages(locale).booleans.notAvailable} | trigger ${line.triggerState ?? getMessages(locale).booleans.notAvailable} | invalidation ${line.invalidationState ?? getMessages(locale).booleans.notAvailable}`,
  ].join(" | ");
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function getPreferredImageFile(
  context: TelegramMediaMessageContext,
): { kind: "PHOTO" | "DOCUMENT"; fileId: string; mimeType: string } | null {
  const photo = context.message.photo?.at(-1);
  if (photo?.file_id) {
    return {
      kind: "PHOTO",
      fileId: photo.file_id,
      mimeType: "image/jpeg",
    };
  }

  const document = context.message.document;
  if (!document?.file_id) {
    return null;
  }

  return {
    kind: "DOCUMENT",
    fileId: document.file_id,
    mimeType: document.mime_type ?? "image/jpeg",
  };
}

function buildImageImportProcessingActions(
  chatId: number,
  locale: SupportedLocale,
  result: ImageImportProcessingResult,
): TelegramOutgoingAction[] {
  const messages = getMessages(locale);

  if (result.kind === "UNAVAILABLE") {
    return [send(chatId, messages.importFlow.unavailable, buildOnboardingKeyboard(locale))];
  }

  if (result.kind === "UNSUPPORTED_MEDIA") {
    return [send(chatId, messages.importFlow.unsupportedMedia, buildOnboardingKeyboard(locale))];
  }

  if (result.kind === "FAILED") {
    return [
      send(
        chatId,
        messages.importFlow.failed(result.detail ?? messages.booleans.notAvailable),
        buildOnboardingKeyboard(locale),
      ),
    ];
  }

  if (result.kind === "UNSUPPORTED_KIND") {
    return [send(chatId, messages.importFlow.unsupportedKind, buildOnboardingKeyboard(locale))];
  }

  if (result.kind === "LOW_CONFIDENCE") {
    return [
      send(
        chatId,
        [
          messages.importFlow.lowConfidence,
          result.summary,
          ...result.warnings.map((warning) => `- ${warning}`),
          messages.importFlow.retryPrompt,
        ].join("\n"),
        buildOnboardingKeyboard(locale),
      ),
    ];
  }

  return [
    send(
      chatId,
      formatImageImportConfirmationMessage(result.portfolio, locale, result.summary, result.warnings),
      buildImageImportConfirmationKeyboard(locale, result.importId),
    ),
  ];
}

function buildImageImportConfirmActions(
  chatId: number,
  locale: SupportedLocale,
  result: ImageImportConfirmResult,
): TelegramOutgoingAction[] {
  const messages = getMessages(locale);

  if (result.kind === "NOT_FOUND") {
    return [send(chatId, messages.importFlow.notFound, buildOnboardingKeyboard(locale))];
  }

  if (result.kind === "EXPIRED") {
    return [send(chatId, messages.importFlow.expired, buildOnboardingKeyboard(locale))];
  }

  return [
    send(
      chatId,
      formatImageImportAppliedMessage(result.portfolio, result.applied, locale),
      buildOnboardingKeyboard(locale),
    ),
  ];
}

function buildImageImportRejectActions(
  chatId: number,
  locale: SupportedLocale,
  result: ImageImportRejectResult,
): TelegramOutgoingAction[] {
  const messages = getMessages(locale);

  return [
    send(
      chatId,
      result.kind === "NOT_FOUND" ? messages.importFlow.notFound : messages.importFlow.cancelled,
      buildOnboardingKeyboard(locale),
    ),
  ];
}

function formatImageImportConfirmationMessage(
  portfolio: PortfolioSnapshotImportData,
  locale: SupportedLocale,
  summary: string,
  warnings: string[],
): string {
  const messages = getMessages(locale);
  const lines = [
    messages.importFlow.confirmTitle,
    summary,
  ];

  if (portfolio.hasCash) {
    lines.push(messages.importFlow.confirmCash(formatNumberForLocale(locale, portfolio.cashKrw)));
  }
  if (portfolio.hasBtc) {
    lines.push(
      messages.importFlow.confirmAsset(
        "BTC",
        `${formatNumberForLocale(locale, portfolio.btcQuantity)} @ avg ${formatNumberForLocale(locale, portfolio.btcAverageEntryPrice)} KRW`,
      ),
    );
  }
  if (portfolio.hasEth) {
    lines.push(
      messages.importFlow.confirmAsset(
        "ETH",
        `${formatNumberForLocale(locale, portfolio.ethQuantity)} @ avg ${formatNumberForLocale(locale, portfolio.ethAverageEntryPrice)} KRW`,
      ),
    );
  }

  if (!portfolio.hasCash && !portfolio.hasBtc && !portfolio.hasEth) {
    lines.push(messages.importFlow.noDetectedValues);
  }

  if (warnings.length > 0) {
    lines.push(...warnings.map((warning) => `- ${warning}`));
  }

  lines.push(messages.importFlow.confirmHint);
  return lines.join("\n");
}

function formatImageImportAppliedMessage(
  portfolio: PortfolioSnapshotImportData,
  applied: { cash: boolean; btc: boolean; eth: boolean },
  locale: SupportedLocale,
): string {
  const messages = getMessages(locale);
  const lines = [messages.importFlow.saved];

  if (applied.cash) {
    lines.push(messages.importFlow.confirmCash(formatNumberForLocale(locale, portfolio.cashKrw)));
  }
  if (applied.btc) {
    lines.push(
      messages.importFlow.confirmAsset(
        "BTC",
        `${formatNumberForLocale(locale, portfolio.btcQuantity)} @ avg ${formatNumberForLocale(locale, portfolio.btcAverageEntryPrice)} KRW`,
      ),
    );
  }
  if (applied.eth) {
    lines.push(
      messages.importFlow.confirmAsset(
        "ETH",
        `${formatNumberForLocale(locale, portfolio.ethQuantity)} @ avg ${formatNumberForLocale(locale, portfolio.ethAverageEntryPrice)} KRW`,
      ),
    );
  }

  return lines.join("\n");
}

function buildImageImportConfirmationKeyboard(
  locale: SupportedLocale,
  importId: number,
): TelegramReplyMarkup {
  const messages = getMessages(locale);
  return {
    inline_keyboard: [
      [
        { text: messages.buttons.confirmSave, callback_data: `import:confirm:${importId}` },
        { text: messages.buttons.retryImport, callback_data: `import:retry:${importId}` },
      ],
      [
        { text: messages.buttons.cancelImport, callback_data: `import:cancel:${importId}` },
      ],
    ],
  };
}

export interface TelegramActionNeededAlertInput {
  chatId: number;
  locale?: SupportedLocale | null;
  reason: TelegramActionNeededReason;
  asset: "BTC" | "ETH" | null;
  summary: string;
  nextStep: string;
}

export function buildActionNeededAlertText(input: TelegramActionNeededAlertInput): string {
  const locale = resolveUserLocale(input.locale ?? null);
  const messages = getMessages(locale);
  const assetLabel = input.asset ?? "setup";
  const headline = formatActionNeededHeadline(locale, input.reason, assetLabel);
  return [
    messages.alerts.actionNeededHeadline(headline),
    input.summary,
    input.nextStep,
    messages.alerts.manualRecordOnly,
  ].join("\n");
}

export function buildActionNeededAlertActions(
  input: TelegramActionNeededAlertInput,
): TelegramOutgoingAction[] {
  return [send(input.chatId, buildActionNeededAlertText(input))];
}

function formatActionNeededHeadline(
  locale: SupportedLocale,
  reason: TelegramActionNeededReason,
  assetLabel: string,
): string {
  const messages = getMessages(locale);
  if (reason === "SETUP_INCOMPLETE") {
    return messages.alerts.setupIncomplete(assetLabel);
  }
  if (reason === "MISSING_MARKET_DATA") {
    return messages.alerts.marketDataUnavailable(assetLabel);
  }
  if (reason === "RISK_REVIEW_REQUIRED") {
    return messages.alerts.riskReview(assetLabel);
  }
  if (reason === "ENTRY_REVIEW_REQUIRED") {
    return messages.alerts.entryReview(assetLabel);
  }
  if (reason === "ADD_BUY_REVIEW_REQUIRED") {
    return messages.alerts.addBuyReview(assetLabel);
  }
  if (reason === "REDUCE_REVIEW_REQUIRED") {
    return messages.alerts.reduceReview(assetLabel);
  }
  if (reason === "STATE_UPDATE_REMINDER") {
    return messages.alerts.stateUpdateReminder(assetLabel);
  }

  return locale === "ko"
    ? `${assetLabel} \uAE30\uB85D \uC0C1\uD0DC \uC218\uC815\uC774 \uD544\uC694\uD569\uB2C8\uB2E4`
    : `${assetLabel} stored state needs correction`;
}

function send(chatId: number, text: string, replyMarkup?: TelegramReplyMarkup): TelegramOutgoingAction {
  return replyMarkup ? { kind: "sendMessage", chatId, text, replyMarkup } : { kind: "sendMessage", chatId, text };
}

function answer(callbackQueryId: string, text?: string): TelegramOutgoingAction {
  return text ? { kind: "answerCallbackQuery", callbackQueryId, text } : { kind: "answerCallbackQuery", callbackQueryId };
}
