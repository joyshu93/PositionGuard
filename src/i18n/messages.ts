import type { SupportedAsset, SupportedLocale } from "../domain/types.js";

export interface LocaleMessages {
  localeName: string;
  buttons: {
    recordMenu: string;
    statusView: string;
    inspectMenu: string;
    settingsMenu: string;
    importImage: string;
    directRecord: string;
    trackBtc: string;
    trackEth: string;
    trackBoth: string;
    trackAssets: string;
    setupProgress: string;
    language: string;
    sleepMode: string;
    restart: string;
    recordCash: string;
    recordBtc: string;
    recordEth: string;
    status: string;
    lastDecision: string;
    hourlyHealth: string;
    back: string;
    confirmSave: string;
    retryImport: string;
    cancelImport: string;
  };
  booleans: {
    yes: string;
    no: string;
    on: string;
    off: string;
    none: string;
    notSet: string;
    notSelected: string;
    missing: string;
    present: string;
    ready: string;
    incomplete: string;
    notAvailable: string;
  };
  command: {
    start: string;
    help: string;
    unknown: string;
    unsupportedAction: string;
    invalidTrackUsage: string;
    invalidCashUsage: string;
    invalidPositionUsage: string;
    invalidSleepUsage: string;
    invalidFreshStartUsage: string;
    imageImportUsage: string;
    cashRecorded(amount: string): string;
    sleepUpdated(enabled: boolean): string;
    freshStartRecorded(scope: string): string;
    trackedAssetsRecorded(assets: string, onboarding: string): string;
    trackedAssetsChosen(assets: string, nextSteps: string[]): string;
    recordCashShortcut: string;
    recordCashExample: string;
    recordPositionShortcut(asset: SupportedAsset): string;
    recordPositionExample(asset: SupportedAsset): string;
    noStoredSetup: string;
    noStoredSetupHint: string;
    statusPrompt: string;
    noAlertYet: string;
    lastAlertTitle: string;
    alertReason(reason: string): string;
    alertAsset(asset: string): string;
    alertWhen(when: string): string;
    alertSummary(summary: string): string;
    alertCooldown(until: string): string;
    noDecisionYet: string;
    noHourlyHealthYet: string;
    languageUsage(currentLocaleName: string): string;
    languageSet(localeName: string): string;
    languageInvalid(input: string, currentLocaleName: string): string;
  };
  onboarding: {
    trackedAssets(assets: string): string;
    cashRecord(present: boolean): string;
    trackedPositions(assets: string): string;
    readiness(isReady: boolean): string;
    nextSteps(steps: string): string;
    recordOnly: string;
  };
  status: {
    empty: string[];
    sleepMode(enabled: boolean): string;
    trackedAssets(assets: string): string;
    setupReadiness(ready: boolean): string;
    availableCash(value: string): string;
    spotRecord(asset: SupportedAsset, value: string): string;
    missingNextSteps(value: string): string;
    recentAlertsTitle: string;
    recentAlertLine(line: string): string;
    recentAlertsNone: string;
    recordOnly: string;
  };
  operator: {
    lastDecisionTitle: string;
    asset(value: string): string;
    verdict(value: string): string;
    status(value: string): string;
    when(value: string): string;
    summary(value: string): string;
    alert(value: string): string;
    structure(regime: string, trigger: string, invalidation: string): string;
    note(value: string): string;
    hourlyHealthTitle: string;
    latestDecision(status: string, at: string): string;
    latestVerdict(value: string): string;
    recentMarketDataFailures(count: number): string;
    recentCooldownSkips(count: number): string;
    recentSleepSuppressions(count: number): string;
    recentSetupBlockedCycles(count: number): string;
    latestStructure(regime: string, trigger: string, invalidation: string): string;
    latestReminder(value: string): string;
    latestMarketIssue(value: string): string;
    operationalOnly: string;
    setupIncomplete: string;
    insufficientData: string;
    noAction: string;
    actionNeeded: string;
    unknown: string;
    noteSetupIncomplete: string;
    noteInsufficientData: string;
    noteNoAction: string;
    noteActionNeeded: string;
    noteUnknown: string;
  };
  alerts: {
    actionNeededHeadline(headline: string): string;
    setupIncomplete(asset: string): string;
    marketDataUnavailable(asset: string): string;
    riskReview(asset: string): string;
    entryReview(asset: string): string;
    addBuyReview(asset: string): string;
    reduceReview(asset: string): string;
    stateUpdateReminder(asset: string): string;
    manualRecordOnly: string;
    stateReminder(asset: SupportedAsset, signal: string): string;
    stateReminderPosition: string;
    stateReminderCash: string;
    stateReminderStoredState: string;
    stateReminderRecordOnly: string;
  };
  importFlow: {
    startPrompt: string;
    unavailable: string;
    unsupportedMedia: string;
    unsupportedKind: string;
    lowConfidence: string;
    failed(detail: string): string;
    confirmTitle: string;
    confirmCash(value: string): string;
    confirmAsset(asset: SupportedAsset, value: string): string;
    noDetectedValues: string;
    confirmHint: string;
    saved: string;
    cancelled: string;
    retryPrompt: string;
    notFound: string;
    expired: string;
  };
  temporaryPolicy: {
    recordedStateNeedsCorrection: string;
    manualSetupIncomplete: string;
    completeSetupAlert(missing: string): string;
    completeSetupNext: string;
    marketDataUnavailableSummary(asset: SupportedAsset): string;
    marketDataUnavailableAlert(asset: SupportedAsset): string;
    marketDataUnavailableNext: string;
    invalidSpotRecord(asset: SupportedAsset): string;
    quantityZeroAverageNonZero: string;
  };
}

const en: LocaleMessages = {
  localeName: "English",
  buttons: {
    recordMenu: "Record",
    statusView: "Status",
    inspectMenu: "Judgment",
    settingsMenu: "Settings",
    importImage: "Import image",
    directRecord: "Manual record",
    trackBtc: "Track BTC",
    trackEth: "Track ETH",
    trackBoth: "Track both",
    trackAssets: "Tracked assets",
    setupProgress: "Setup progress",
    language: "Language",
    sleepMode: "Sleep mode",
    restart: "Restart",
    recordCash: "Record cash",
    recordBtc: "Record BTC",
    recordEth: "Record ETH",
    status: "Status",
    lastDecision: "Recent judgment",
    hourlyHealth: "Judgment history",
    back: "Back",
    confirmSave: "Confirm save",
    retryImport: "Try again",
    cancelImport: "Cancel",
  },
  booleans: {
    yes: "yes",
    no: "no",
    on: "on",
    off: "off",
    none: "none",
    notSet: "not set",
    notSelected: "not selected",
    missing: "missing",
    present: "present",
    ready: "ready",
    incomplete: "incomplete",
    notAvailable: "n/a",
  },
  command: {
    start: [
      "PositionGuard is a BTC/ETH spot position coach.",
      "It is not an auto-trading bot.",
      "",
      "The easiest path is to import a portfolio screenshot with the button below.",
      "You can still record cash and spot inventory manually if needed.",
      "Use /help to see the available commands.",
    ].join("\n"),
    help: [
      "Commands:",
      "/start - intro and setup boundary",
      "/help - command list",
      "/language <ko|en> - choose your bot language",
      "/status - view stored state summary",
      "/track <BTC|ETH|BOTH> - choose which spot assets to track",
      "/importimage - import a portfolio screenshot and confirm before saving",
      "/setcash <amount> - record available cash",
      "/setposition <BTC|ETH> <quantity> <average-entry-price> - record spot inventory only",
      "/lastdecision - inspect the latest hourly decision",
      "/hourlyhealth - inspect recent hourly processing health",
      "/lastalert - inspect the last recorded alert state",
      "/freshstart <BTC|ETH|ALL> confirm - clear recent strategy memory for a fresh start",
      "/sleep on - pause alerts",
      "/sleep off - resume alerts",
      "",
      "This bot records user-reported state only and does not execute trades.",
    ].join("\n"),
    unknown: "Unknown command. Use /help to see supported commands.",
    unsupportedAction: "Unsupported action.",
    invalidTrackUsage: [
      "Usage: /track <BTC|ETH|BOTH>",
      "Example: /track BTC",
      "This only changes which spot assets PositionGuard expects in setup readiness.",
    ].join("\n"),
    invalidCashUsage: "Usage: /setcash <amount>\nExample: /setcash 1000000",
    invalidPositionUsage:
      "Usage: /setposition <BTC|ETH> <quantity> <average-entry-price>\nExample: /setposition BTC 0.25 95000000",
    invalidSleepUsage: "Usage: /sleep on or /sleep off",
    invalidFreshStartUsage: [
      "Usage: /freshstart <BTC|ETH|ALL> confirm",
      "Example: /freshstart BTC confirm",
      "This clears recent deferred confirmation, recent exit, and alert/reminder memory for the chosen scope only.",
      "Stored cash and spot records are kept.",
    ].join("\n"),
    imageImportUsage: "Use /importimage or the Import image button, then send a screenshot as a photo or document.",
    cashRecorded: (amount) => `Cash recorded: ${amount}.`,
    sleepUpdated: (enabled) => `Sleep mode is now ${enabled ? "on" : "off"}.`,
    freshStartRecorded: (scope) => [
      `Fresh-start marker recorded for ${scope}.`,
      "Stored cash and spot records were kept.",
      "Recent deferred confirmation, recent exit, and alert/reminder memory will restart from now.",
      "This is record-only guidance.",
    ].join("\n"),
    trackedAssetsRecorded: (assets, onboarding) =>
      [`Tracked assets recorded: ${assets}.`, onboarding].join("\n"),
    trackedAssetsChosen: (assets, nextSteps) =>
      [`Tracked assets chosen: ${assets}.`, "Next steps:", ...nextSteps, "This is record-only guidance."].join("\n"),
    recordCashShortcut: "Record available cash with /setcash <amount>.",
    recordCashExample: "Example: /setcash 1000000",
    recordPositionShortcut: (asset) =>
      `Record ${asset} spot state with /setposition ${asset} <quantity> <average-entry-price>.`,
    recordPositionExample: (asset) =>
      asset === "BTC" ? "Example: /setposition BTC 0.25 95000000" : "Example: /setposition ETH 1.2 3500000",
    noStoredSetup: "No stored setup yet.",
    noStoredSetupHint: "Use Import image to pull values from a portfolio screenshot, or record cash and spot inventory manually.",
    statusPrompt: "Use Import image for a portfolio screenshot, or update cash and spot inventory manually if needed.",
    noAlertYet: "No alert record is available yet. ACTION_NEEDED alerts are only sent when the hourly loop records one.",
    lastAlertTitle: "Last alert:",
    alertReason: (reason) => `Reason: ${reason}`,
    alertAsset: (asset) => `Asset: ${asset}`,
    alertWhen: (when) => `When: ${when}`,
    alertSummary: (summary) => `Summary: ${summary}`,
    alertCooldown: (until) => `Cooldown until: ${until}`,
    noDecisionYet: "No decision record is available yet.",
    noHourlyHealthYet: "No hourly health summary is available yet.",
    languageUsage: (currentLocaleName) =>
      [`Current language: ${currentLocaleName}.`, "Usage: /language <ko|en>", "Example: /language ko"].join("\n"),
    languageSet: (localeName) => `Language saved: ${localeName}.`,
    languageInvalid: (input, currentLocaleName) =>
      [`Unsupported language: ${input}.`, `Current language: ${currentLocaleName}.`, "Usage: /language <ko|en>"].join("\n"),
  },
  onboarding: {
    trackedAssets: (assets) => `Tracked assets: ${assets}`,
    cashRecord: (present) => `Cash record: ${present ? "present" : "missing"}`,
    trackedPositions: (assets) => `Tracked positions: ${assets}`,
    readiness: (isReady) => `Readiness: ${isReady ? "ready for coaching" : "needs setup"}`,
    nextSteps: (steps) => `Next steps: ${steps}`,
    recordOnly: "State is record-only. No trade execution is performed.",
  },
  status: {
    empty: [
      "No stored setup yet.",
      "Tracked assets default to BTC and ETH until you choose otherwise.",
      "Record available cash with /setcash <amount>.",
      "Record BTC or ETH spot state with /setposition <BTC|ETH> <quantity> <average-entry-price>.",
      "This bot records manual state only. It does not execute trades.",
    ],
    sleepMode: (enabled) => `Sleep mode: ${enabled ? "on" : "off"}`,
    trackedAssets: (assets) => `Tracked assets: ${assets}`,
    setupReadiness: (ready) => `Setup readiness: ${ready ? "ready" : "incomplete"}`,
    availableCash: (value) => `Available cash: ${value}`,
    spotRecord: (asset, value) => `${asset} spot record: ${value}`,
    missingNextSteps: (value) => `Missing next steps: ${value}`,
    recentAlertsTitle: "Recent alerts:",
    recentAlertLine: (line) => `- ${line}`,
    recentAlertsNone: "Recent alerts: none",
    recordOnly: "State is record-only. No trade execution is performed.",
  },
  operator: {
    lastDecisionTitle: "Last decision:",
    asset: (value) => `Asset: ${value}`,
    verdict: (value) => `Verdict: ${value}`,
    status: (value) => `Status: ${value}`,
    when: (value) => `When: ${value}`,
    summary: (value) => `Summary: ${value}`,
    alert: (value) => `Alert: ${value}`,
    structure: (regime, trigger, invalidation) => `Regime: ${regime} | Trigger: ${trigger} | Invalidation: ${invalidation}`,
    note: (value) => `Note: ${value}`,
    hourlyHealthTitle: "Hourly health:",
    latestDecision: (status, at) => `Latest decision: ${status}${at ? ` @ ${at}` : ""}`,
    latestVerdict: (value) => `Latest verdict: ${value}`,
    recentMarketDataFailures: (count) => `Recent market-data failures: ${count}`,
    recentCooldownSkips: (count) => `Recent cooldown skips: ${count}`,
    recentSleepSuppressions: (count) => `Recent sleep suppressions: ${count}`,
    recentSetupBlockedCycles: (count) => `Recent setup-blocked cycles: ${count}`,
    latestStructure: (regime, trigger, invalidation) =>
      `Latest structure: regime ${regime} | trigger ${trigger} | invalidation ${invalidation}`,
    latestReminder: (value) => `Latest reminder: ${value}`,
    latestMarketIssue: (value) => `Latest market issue: ${value}`,
    operationalOnly: "Operational only.",
    setupIncomplete: "setup incomplete",
    insufficientData: "insufficient data",
    noAction: "no action",
    actionNeeded: "action needed",
    unknown: "unknown",
    noteSetupIncomplete: "waiting for missing manual inputs",
    noteInsufficientData: "hourly market context was not complete",
    noteNoAction: "current rules do not require action",
    noteActionNeeded: "operator follow-up is required",
    noteUnknown: "status is not recognized",
  },
  alerts: {
    actionNeededHeadline: (headline) => `ACTION NEEDED: ${headline}`,
    setupIncomplete: (asset) => `${asset} setup is incomplete`,
    marketDataUnavailable: (asset) => `${asset} market snapshot is unavailable`,
    riskReview: (asset) => `${asset} risk review is needed`,
    entryReview: (asset) => `${asset} entry review is needed`,
    addBuyReview: (asset) => `${asset} add-buy review is needed`,
    reduceReview: (asset) => `${asset} reduce review is needed`,
    stateUpdateReminder: (asset) => `${asset} state update reminder is needed`,
    manualRecordOnly: "This is record-only guidance.",
    stateReminder: (asset, signal) =>
      `PositionGuard is still seeing the same ${asset} ${signal} signal and the same stored manual state.`,
    stateReminderPosition: "If you already bought or sold, update your recorded position with /setposition.",
    stateReminderCash: "If your available cash changed, update it with /setcash.",
    stateReminderStoredState: "PositionGuard only sees your stored manual state.",
    stateReminderRecordOnly: "This is record-only guidance.",
  },
  importFlow: {
    startPrompt: [
      "Send a portfolio screenshot as a photo or document.",
      "This first pass supports current asset/cash snapshots.",
      "PositionGuard will extract values, ask for confirmation, and only then update your record.",
    ].join("\n"),
    unavailable: "Image import is not configured yet. Use /setcash and /setposition for now.",
    unsupportedMedia: "Please send an image screenshot as a Telegram photo or image document.",
    unsupportedKind: "That image looks like trade history or an unsupported screen. For now, import a portfolio snapshot screen.",
    lowConfidence: "I could not read that screenshot confidently enough.",
    failed: (detail) => `Image import failed: ${detail}`,
    confirmTitle: "I read this as a portfolio snapshot:",
    confirmCash: (value) => `Cash: ${value} KRW`,
    confirmAsset: (asset, value) => `${asset}: ${value}`,
    noDetectedValues: "No cash or BTC/ETH holdings were detected confidently.",
    confirmHint: "If this looks correct, confirm save. Otherwise, try again with a clearer screenshot.",
    saved: "Imported values were saved to your manual record.",
    cancelled: "Image import was cancelled.",
    retryPrompt: "Please send the portfolio screenshot again. A clearer full-screen image works best.",
    notFound: "That pending image import could not be found anymore.",
    expired: "That pending image import has expired. Please send the screenshot again.",
  },
  temporaryPolicy: {
    recordedStateNeedsCorrection: "Recorded state needs manual correction.",
    manualSetupIncomplete: "Manual setup is incomplete.",
    completeSetupAlert: (missing) => `Action needed: complete manual setup for ${missing}.`,
    completeSetupNext: "Use tracked assets, /setcash, and /setposition to update your record.",
    marketDataUnavailableSummary: (asset) => `${asset} market data has been unavailable for repeated hourly checks.`,
    marketDataUnavailableAlert: (asset) => `Action needed: ${asset} market data has been unavailable for several checks.`,
    marketDataUnavailableNext: "Review your spot record and retry later.",
    invalidSpotRecord: (asset) => `Action needed: fix your ${asset} spot record.`,
    quantityZeroAverageNonZero: "Quantity is 0 but average entry price is not 0.",
  },
};

const ko: LocaleMessages = {
  localeName: "\uD55C\uAD6D\uC5B4",
  buttons: {
    recordMenu: "\uAE30\uB85D\uD558\uAE30",
    statusView: "\uC0C1\uD0DC \uBCF4\uAE30",
    inspectMenu: "\uD310\uB2E8 \uBCF4\uAE30",
    settingsMenu: "\uC124\uC815",
    importImage: "이미지로 기록",
    directRecord: "\uC9C1\uC811 \uAE30\uB85D",
    trackBtc: "BTC \uCD94\uC801",
    trackEth: "ETH \uCD94\uC801",
    trackBoth: "\uB458 \uB2E4 \uCD94\uC801",
    trackAssets: "\uCD94\uC801 \uC790\uC0B0",
    setupProgress: "\uC124\uC815 \uC9C4\uD589\uC0C1\uD669",
    language: "\uC5B8\uC5B4",
    sleepMode: "\uC218\uBA74 \uBAA8\uB4DC",
    restart: "\uB2E4\uC2DC \uC2DC\uC791",
    recordCash: "\uD604\uAE08 \uAE30\uB85D",
    recordBtc: "BTC \uAE30\uB85D",
    recordEth: "ETH \uAE30\uB85D",
    status: "\uC0C1\uD0DC",
    lastDecision: "\uCD5C\uADFC \uD310\uB2E8",
    hourlyHealth: "\uD310\uB2E8 \uAE30\uB85D",
    back: "\uB4A4\uB85C",
    confirmSave: "확인 저장",
    retryImport: "다시 보내기",
    cancelImport: "취소",
  },
  booleans: {
    yes: "\uC608",
    no: "\uC544\uB2C8\uC624",
    on: "\uCF1C\uC9D0",
    off: "\uAEBC\uC9D0",
    none: "\uC5C6\uC74C",
    notSet: "\uBBF8\uC124\uC815",
    notSelected: "\uC120\uD0DD \uC548 \uB428",
    missing: "\uC5C6\uC74C",
    present: "\uC788\uC74C",
    ready: "\uC900\uBE44 \uC644\uB8CC",
    incomplete: "\uBBF8\uC644\uB8CC",
    notAvailable: "\uD574\uB2F9 \uC5C6\uC74C",
  },
  command: {
    start: [
      "PositionGuard\uB294 BTC/ETH \uD604\uBB3C \uD3EC\uC9C0\uC158 \uCF54\uCE58 \uBD07\uC785\uB2C8\uB2E4.",
      "\uC790\uB3D9\uB9E4\uB9E4 \uBD07\uC774 \uC544\uB2D9\uB2C8\uB2E4.",
      "",
      "가장 쉬운 방법은 아래 버튼으로 자산현황 이미지를 가져오는 것입니다.",
      "필요하면 현금과 현물 보유 상태를 직접 기록할 수도 있습니다.",
      "\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uBA85\uB839\uC740 /help \uC5D0\uC11C \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    ].join("\n"),
    help: [
      "\uBA85\uB839\uC5B4:",
      "/start - \uC18C\uAC1C\uC640 \uC81C\uD488 \uACBD\uACC4 \uC548\uB0B4",
      "/help - \uBA85\uB839\uC5B4 \uBAA9\uB85D",
      "/language <ko|en> - \uBD07 \uC5B8\uC5B4 \uC120\uD0DD",
      "/status - \uC800\uC7A5\uB41C \uC0C1\uD0DC \uC694\uC57D \uBCF4\uAE30",
      "/track <BTC|ETH|BOTH> - \uCD94\uC801\uD560 \uD604\uBB3C \uC790\uC0B0 \uC120\uD0DD",
      "/importimage - 자산현황 이미지를 읽고 확인 후 저장",
      "/setcash <amount> - \uC0AC\uC6A9 \uAC00\uB2A5 \uD604\uAE08 \uAE30\uB85D",
      "/setposition <BTC|ETH> <quantity> <average-entry-price> - \uD604\uBB3C \uBCF4\uC720 \uC0C1\uD0DC\uB9CC \uAE30\uB85D",
      "/lastdecision - \uCD5C\uADFC \uC2DC\uAC04\uBCC4 \uACB0\uC815 \uD655\uC778",
      "/hourlyhealth - \uCD5C\uADFC \uC2DC\uAC04\uBCC4 \uCC98\uB9AC \uC0C1\uD0DC \uD655\uC778",
      "/lastalert - \uB9C8\uC9C0\uB9C9 \uC54C\uB9BC \uC0C1\uD0DC \uD655\uC778",
      "/freshstart <BTC|ETH|ALL> confirm - \uCD5C\uADFC \uC804\uB7B5 \uBA54\uBAA8\uB9AC \uCD08\uAE30\uD654",
      "/sleep on - \uC54C\uB9BC \uC77C\uC2DC\uC815\uC9C0",
      "/sleep off - \uC54C\uB9BC \uC7AC\uAC1C",
      "",
      "\uC774 \uBD07\uC740 \uC0AC\uC6A9\uC790\uAC00 \uC9C1\uC811 \uC785\uB825\uD55C \uC0C1\uD0DC\uB9CC \uAE30\uB85D\uD558\uBA70 \uC8FC\uBB38\uC744 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    ].join("\n"),
    unknown: "\uC54C \uC218 \uC5C6\uB294 \uBA85\uB839\uC785\uB2C8\uB2E4. \uC9C0\uC6D0\uB418\uB294 \uBA85\uB839\uC740 /help \uC5D0\uC11C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    unsupportedAction: "\uC9C0\uC6D0\uB418\uC9C0 \uC54A\uB294 \uB3D9\uC791\uC785\uB2C8\uB2E4.",
    invalidTrackUsage: [
      "\uC0AC\uC6A9\uBC95: /track <BTC|ETH|BOTH>",
      "\uC608\uC2DC: /track BTC",
      "\uC774 \uBA85\uB839\uC740 setup readiness \uC5D0\uC11C \uC5B4\uB5A4 \uD604\uBB3C \uC790\uC0B0\uC744 \uD655\uC778\uD560\uC9C0\uB9CC \uBC14\uAFC9\uB2C8\uB2E4.",
    ].join("\n"),
    invalidCashUsage: "\uC0AC\uC6A9\uBC95: /setcash <amount>\n\uC608\uC2DC: /setcash 1000000",
    invalidPositionUsage:
      "\uC0AC\uC6A9\uBC95: /setposition <BTC|ETH> <quantity> <average-entry-price>\n\uC608\uC2DC: /setposition BTC 0.25 95000000",
    invalidSleepUsage: "\uC0AC\uC6A9\uBC95: /sleep on \uB610\uB294 /sleep off",
    invalidFreshStartUsage: [
      "\uC0AC\uC6A9\uBC95: /freshstart <BTC|ETH|ALL> confirm",
      "\uC608\uC2DC: /freshstart BTC confirm",
      "\uC120\uD0DD\uD55C \uBC94\uC704\uC758 recent exit, deferred confirmation, \uC54C\uB9BC/\uB9AC\uB9C8\uC778\uB354 \uBA54\uBAA8\uB9AC\uB9CC \uCD08\uAE30\uD654\uD569\uB2C8\uB2E4.",
      "\uD604\uAE08\uACFC \uD604\uBB3C \uAE30\uB85D\uC740 \uC720\uC9C0\uB429\uB2C8\uB2E4.",
    ].join("\n"),
    imageImportUsage: "이미지로 기록 버튼 또는 /importimage를 보낸 뒤, 자산현황 이미지를 photo 또는 document로 보내주세요.",
    cashRecorded: (amount) => `\uD604\uAE08 \uAE30\uB85D \uC644\uB8CC: ${amount}.`,
    sleepUpdated: (enabled) => `\uC218\uBA74 \uBAA8\uB4DC\uB294 \uC774\uC81C ${enabled ? "\uCF1C\uC9D0" : "\uAEBC\uC9D0"} \uC0C1\uD0DC\uC785\uB2C8\uB2E4.`,
    freshStartRecorded: (scope) => [
      `${scope} \uBC94\uC704\uC5D0 \uB300\uD55C fresh-start marker\uB97C \uAE30\uB85D\uD588\uC2B5\uB2C8\uB2E4.`,
      "\uD604\uAE08\uACFC \uD604\uBB3C \uAE30\uB85D\uC740 \uADF8\uB300\uB85C \uC720\uC9C0\uB429\uB2C8\uB2E4.",
      "\uC774\uC81C\uBD80\uD130 recent exit, deferred confirmation, \uC54C\uB9BC/\uB9AC\uB9C8\uC778\uB354 \uBA54\uBAA8\uB9AC\uB294 \uC0C8\uB85C \uACC4\uC0B0\uB429\uB2C8\uB2E4.",
      "\uC774 \uC548\uB0B4\uB294 \uAE30\uB85D \uC804\uC6A9\uC785\uB2C8\uB2E4.",
    ].join("\n"),
    trackedAssetsRecorded: (assets, onboarding) =>
      [`\uCD94\uC801 \uC790\uC0B0 \uC800\uC7A5 \uC644\uB8CC: ${assets}.`, onboarding, "\uC8FC\uBB38\uC740 \uC2E4\uD589\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."].join("\n"),
    trackedAssetsChosen: (assets, nextSteps) =>
      [`\uCD94\uC801 \uC790\uC0B0 \uC120\uD0DD \uC644\uB8CC: ${assets}.`, "\uB2E4\uC74C \uB2E8\uACC4:", ...nextSteps, "\uC774 \uC548\uB0B4\uB294 \uAE30\uB85D \uC804\uC6A9\uC785\uB2C8\uB2E4. \uC8FC\uBB38\uC740 \uC2E4\uD589\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."].join("\n"),
    recordCashShortcut: "/setcash <amount> \uBA85\uB839\uC73C\uB85C \uC0AC\uC6A9 \uAC00\uB2A5 \uD604\uAE08\uC744 \uAE30\uB85D\uD574 \uC8FC\uC138\uC694.",
    recordCashExample: "\uC608\uC2DC: /setcash 1000000",
    recordPositionShortcut: (asset) =>
      `/setposition ${asset} <quantity> <average-entry-price> \uBA85\uB839\uC73C\uB85C ${asset} \uD604\uBB3C \uC0C1\uD0DC\uB97C \uAE30\uB85D\uD574 \uC8FC\uC138\uC694.`,
    recordPositionExample: (asset) =>
      asset === "BTC" ? "\uC608\uC2DC: /setposition BTC 0.25 95000000" : "\uC608\uC2DC: /setposition ETH 1.2 3500000",
    noStoredSetup: "\uC544\uC9C1 \uC800\uC7A5\uB41C \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    noStoredSetupHint: "이미지로 기록 버튼으로 자산현황 값을 가져오거나, 현금과 현물 상태를 직접 기록해 주세요.",
    statusPrompt: "자산현황 이미지를 가져오거나 필요하면 현금과 BTC/ETH 상태를 직접 수정해 주세요.",
    noAlertYet: "\uC544\uC9C1 \uC54C\uB9BC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. ACTION_NEEDED \uC54C\uB9BC\uC740 \uC2DC\uAC04\uBCC4 \uB8E8\uD504\uC5D0\uC11C \uC2E4\uC81C\uB85C \uAE30\uB85D\uB420 \uB54C\uB9CC \uC804\uC1A1\uB429\uB2C8\uB2E4.",
    lastAlertTitle: "\uB9C8\uC9C0\uB9C9 \uC54C\uB9BC:",
    alertReason: (reason) => `\uC0AC\uC720: ${reason}`,
    alertAsset: (asset) => `\uC790\uC0B0: ${asset}`,
    alertWhen: (when) => `\uC2DC\uAC01: ${when}`,
    alertSummary: (summary) => `\uC694\uC57D: ${summary}`,
    alertCooldown: (until) => `\uCFFC\uB2E4\uC6B4 \uC885\uB8CC: ${until}`,
    noDecisionYet: "\uC544\uC9C1 \uACB0\uC815 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    noHourlyHealthYet: "\uC544\uC9C1 \uC2DC\uAC04\uBCC4 \uC0C1\uD0DC \uC694\uC57D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    languageUsage: (currentLocaleName) =>
      [`\uD604\uC7AC \uC5B8\uC5B4: ${currentLocaleName}.`, "\uC0AC\uC6A9\uBC95: /language <ko|en>", "\uC608\uC2DC: /language ko"].join("\n"),
    languageSet: (localeName) => `\uC5B8\uC5B4\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${localeName}.`,
    languageInvalid: (input, currentLocaleName) =>
      [`\uC9C0\uC6D0\uB418\uC9C0 \uC54A\uB294 \uC5B8\uC5B4\uC785\uB2C8\uB2E4: ${input}.`, `\uD604\uC7AC \uC5B8\uC5B4: ${currentLocaleName}.`, "\uC0AC\uC6A9\uBC95: /language <ko|en>"].join("\n"),
  },
  onboarding: {
    trackedAssets: (assets) => `\uCD94\uC801 \uC790\uC0B0: ${assets}`,
    cashRecord: (present) => `\uD604\uAE08 \uAE30\uB85D: ${present ? "\uC788\uC74C" : "\uC5C6\uC74C"}`,
    trackedPositions: (assets) => `\uCD94\uC801 \uD3EC\uC9C0\uC158: ${assets}`,
    readiness: (isReady) => `\uC900\uBE44 \uC0C1\uD0DC: ${isReady ? "\uCF54\uCE6D \uAC00\uB2A5" : "\uC124\uC815 \uD544\uC694"}`,
    nextSteps: (steps) => `\uB2E4\uC74C \uB2E8\uACC4: ${steps}`,
    recordOnly: "\uC0C1\uD0DC \uAE30\uB85D \uC804\uC6A9\uC785\uB2C8\uB2E4. \uC8FC\uBB38 \uC2E4\uD589\uC740 \uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  },
  status: {
    empty: [
      "\uC544\uC9C1 \uC800\uC7A5\uB41C \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
      "\uBCC4\uB3C4 \uC120\uD0DD \uC804\uAE4C\uC9C0 \uCD94\uC801 \uC790\uC0B0\uC740 \uAE30\uBCF8\uC801\uC73C\uB85C BTC\uC640 ETH\uC785\uB2C8\uB2E4.",
      "/setcash <amount> \uB85C \uC0AC\uC6A9 \uAC00\uB2A5 \uD604\uAE08\uC744 \uAE30\uB85D\uD574 \uC8FC\uC138\uC694.",
      "/setposition <BTC|ETH> <quantity> <average-entry-price> \uB85C BTC \uB610\uB294 ETH \uD604\uBB3C \uC0C1\uD0DC\uB97C \uAE30\uB85D\uD574 \uC8FC\uC138\uC694.",
      "\uC774 \uBD07\uC740 \uC218\uB3D9 \uAE30\uB85D\uB9CC \uB2E4\uB8E8\uBA70 \uC8FC\uBB38\uC744 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    ],
    sleepMode: (enabled) => `\uC218\uBA74 \uBAA8\uB4DC: ${enabled ? "\uCF1C\uC9D0" : "\uAEBC\uC9D0"}`,
    trackedAssets: (assets) => `\uCD94\uC801 \uC790\uC0B0: ${assets}`,
    setupReadiness: (ready) => `\uC124\uC815 \uC900\uBE44\uB3C4: ${ready ? "\uC900\uBE44 \uC644\uB8CC" : "\uBBF8\uC644\uB8CC"}`,
    availableCash: (value) => `\uC0AC\uC6A9 \uAC00\uB2A5 \uD604\uAE08: ${value}`,
    spotRecord: (asset, value) => `${asset} \uD604\uBB3C \uAE30\uB85D: ${value}`,
    missingNextSteps: (value) => `\uB0A8\uC740 \uC124\uC815 \uD56D\uBAA9: ${value}`,
    recentAlertsTitle: "\uCD5C\uADFC \uC54C\uB9BC:",
    recentAlertLine: (line) => `- ${line}`,
    recentAlertsNone: "\uCD5C\uADFC \uC54C\uB9BC: \uC5C6\uC74C",
    recordOnly: "\uC0C1\uD0DC \uAE30\uB85D \uC804\uC6A9\uC785\uB2C8\uB2E4. \uC8FC\uBB38 \uC2E4\uD589\uC740 \uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  },
  operator: {
    lastDecisionTitle: "\uCD5C\uADFC \uACB0\uC815:",
    asset: (value) => `\uC790\uC0B0: ${value}`,
    verdict: (value) => `\uD310\uC815: ${value}`,
    status: (value) => `\uC0C1\uD0DC: ${value}`,
    when: (value) => `\uC2DC\uAC01: ${value}`,
    summary: (value) => `\uC694\uC57D: ${value}`,
    alert: (value) => `\uC54C\uB9BC: ${value}`,
    structure: (regime, trigger, invalidation) => `\uB808\uC9D0: ${regime} | \uD2B8\uB9AC\uAC70: ${trigger} | \uBB34\uD6A8\uD654: ${invalidation}`,
    note: (value) => `\uBA54\uBAA8: ${value}`,
    hourlyHealthTitle: "\uC2DC\uAC04\uBCC4 \uC0C1\uD0DC:",
    latestDecision: (status, at) => `\uCD5C\uADFC \uACB0\uC815: ${status}${at ? ` @ ${at}` : ""}`,
    latestVerdict: (value) => `\uCD5C\uADFC \uD310\uC815: ${value}`,
    recentMarketDataFailures: (count) => `\uCD5C\uADFC \uC2DC\uC7A5 \uB370\uC774\uD130 \uC2E4\uD328: ${count}`,
    recentCooldownSkips: (count) => `\uCD5C\uADFC \uCFFC\uB2E4\uC6B4 \uC2A4\uD0B5: ${count}`,
    recentSleepSuppressions: (count) => `\uCD5C\uADFC \uC218\uBA74 \uBAA8\uB4DC \uC5B5\uC81C: ${count}`,
    recentSetupBlockedCycles: (count) => `\uCD5C\uADFC setup \uCC28\uB2E8 \uD69F\uC218: ${count}`,
    latestStructure: (regime, trigger, invalidation) =>
      `\uCD5C\uADFC \uAD6C\uC870: \uB808\uC9D0 ${regime} | \uD2B8\uB9AC\uAC70 ${trigger} | \uBB34\uD6A8\uD654 ${invalidation}`,
    latestReminder: (value) => `\uCD5C\uADFC \uB9AC\uB9C8\uC778\uB354: ${value}`,
    latestMarketIssue: (value) => `\uCD5C\uADFC \uC2DC\uC7A5 \uC774\uC288: ${value}`,
    operationalOnly: "\uC6B4\uC601\uC0C1 \uCC38\uACE0\uC6A9\uC785\uB2C8\uB2E4.",
    setupIncomplete: "\uC124\uC815 \uBBF8\uC644\uB8CC",
    insufficientData: "\uB370\uC774\uD130 \uBD80\uC871",
    noAction: "\uC870\uCE58 \uC5C6\uC74C",
    actionNeeded: "\uC870\uCE58 \uD544\uC694",
    unknown: "\uC54C \uC218 \uC5C6\uC74C",
    noteSetupIncomplete: "\uB204\uB77D\uB41C \uC218\uB3D9 \uC785\uB825\uC744 \uAE30\uB2E4\uB9AC\uB294 \uC911\uC785\uB2C8\uB2E4",
    noteInsufficientData: "\uC2DC\uAC04\uBCC4 \uC2DC\uC7A5 \uCEE8\uD14D\uC2A4\uD2B8\uAC00 \uCDA9\uBD84\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4",
    noteNoAction: "\uD604\uC7AC \uADDC\uCE59\uC0C1 \uBCC4\uB3C4 \uC870\uCE58\uAC00 \uD544\uC694\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4",
    noteActionNeeded: "\uCD94\uAC00 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4",
    noteUnknown: "\uC778\uC2DD\uB418\uC9C0 \uC54A\uB294 \uC0C1\uD0DC\uC785\uB2C8\uB2E4",
  },
  alerts: {
    actionNeededHeadline: (headline) => `조치 필요: ${headline}`,
    setupIncomplete: (asset) => `${asset} \uC124\uC815\uC774 \uBBF8\uC644\uB8CC\uC785\uB2C8\uB2E4`,
    marketDataUnavailable: (asset) => `${asset} \uC2DC\uC7A5 \uC2A4\uB0C5\uC0F7\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4`,
    riskReview: (asset) => `${asset} \uB9AC\uC2A4\uD06C \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4`,
    entryReview: (asset) => `${asset} \uC9C4\uC785 \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4`,
    addBuyReview: (asset) => `${asset} \uCD94\uAC00\uB9E4\uC218 \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4`,
    reduceReview: (asset) => `${asset} \uCD95\uC18C \uAC80\uD1A0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4`,
    stateUpdateReminder: (asset) => `${asset} \uC0C1\uD0DC \uC5C5\uB370\uC774\uD2B8\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4`,
    manualRecordOnly: "\uC774 \uC548\uB0B4\uB294 \uAE30\uB85D \uC804\uC6A9\uC785\uB2C8\uB2E4.",
    stateReminder: (asset, signal) =>
      `PositionGuard\uB294 \uC544\uC9C1\uB3C4 ${asset} ${signal} \uC2E0\uD638\uC640 \uB3D9\uC77C\uD55C \uC800\uC7A5 \uC0C1\uD0DC\uB97C \uBCF4\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`,
    stateReminderPosition: "\uC774\uBBF8 \uB9E4\uC218\uB098 \uB9E4\uB3C4\uB97C \uD588\uB2E4\uBA74 /setposition \uC73C\uB85C \uAE30\uB85D\uC744 \uAC31\uC2E0\uD574 \uC8FC\uC138\uC694.",
    stateReminderCash: "\uC0AC\uC6A9 \uAC00\uB2A5 \uD604\uAE08\uC774 \uBC14\uB00C\uC5C8\uB2E4\uBA74 /setcash \uB85C \uAC31\uC2E0\uD574 \uC8FC\uC138\uC694.",
    stateReminderStoredState: "PositionGuard\uB294 \uC800\uC7A5\uB41C \uC218\uB3D9 \uC0C1\uD0DC\uB9CC \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    stateReminderRecordOnly: "\uC774 \uC548\uB0B4\uB294 \uAE30\uB85D \uC804\uC6A9\uC785\uB2C8\uB2E4.",
  },
  importFlow: {
    startPrompt: [
      "자산현황 이미지를 photo 또는 document로 보내주세요.",
      "1차 구현에서는 현재 자산/현금 스냅샷 화면만 지원합니다.",
      "PositionGuard가 값을 읽은 뒤 저장 전에 먼저 확인을 받습니다.",
    ].join("\n"),
    unavailable: "이미지 가져오기 기능이 아직 설정되지 않았습니다. 지금은 /setcash 와 /setposition 을 사용해 주세요.",
    unsupportedMedia: "이미지 스크린샷을 Telegram photo 또는 image document 형식으로 보내주세요.",
    unsupportedKind: "거래내역 화면이거나 아직 지원하지 않는 화면으로 보입니다. 지금은 자산현황 화면만 지원합니다.",
    lowConfidence: "이미지를 충분히 자신 있게 읽지 못했습니다.",
    failed: (detail) => `이미지 가져오기에 실패했습니다: ${detail}`,
    confirmTitle: "다음과 같이 자산현황으로 읽었습니다:",
    confirmCash: (value) => `현금: ${value} KRW`,
    confirmAsset: (asset, value) => `${asset}: ${value}`,
    noDetectedValues: "현금 또는 BTC/ETH 보유값을 확실하게 읽지 못했습니다.",
    confirmHint: "맞다면 확인 저장을 눌러 주세요. 아니면 더 선명한 이미지로 다시 보내 주세요.",
    saved: "가져온 값이 수동 기록에 저장되었습니다.",
    cancelled: "이미지 가져오기를 취소했습니다.",
    retryPrompt: "자산현황 이미지를 다시 보내주세요. 전체 화면이 선명할수록 더 잘 읽습니다.",
    notFound: "확인 대기 중인 이미지 기록을 찾지 못했습니다.",
    expired: "확인 대기 중이던 이미지 기록이 만료되었습니다. 이미지를 다시 보내주세요.",
  },
  temporaryPolicy: {
    recordedStateNeedsCorrection: "\uAE30\uB85D\uB41C \uC0C1\uD0DC\uB97C \uC218\uB3D9\uC73C\uB85C \uC218\uC815\uD574\uC57C \uD569\uB2C8\uB2E4.",
    manualSetupIncomplete: "\uC218\uB3D9 \uC124\uC815\uC774 \uC544\uC9C1 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
    completeSetupAlert: (missing) => `\uC870\uCE58 \uD544\uC694: ${missing} \uD56D\uBAA9\uC758 \uC218\uB3D9 \uC124\uC815\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.`,
    completeSetupNext: "\uCD94\uC801 \uC790\uC0B0, /setcash, /setposition \uBA85\uB839\uC73C\uB85C \uAE30\uB85D\uC744 \uAC31\uC2E0\uD574 \uC8FC\uC138\uC694.",
    marketDataUnavailableSummary: (asset) => `${asset} \uC2DC\uC7A5 \uB370\uC774\uD130\uAC00 \uC5EC\uB7EC \uC2DC\uAC04\uBCC4 \uC810\uAC80\uC5D0\uC11C \uC5F0\uC18D\uC73C\uB85C \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`,
    marketDataUnavailableAlert: (asset) => `\uC870\uCE58 \uD544\uC694: ${asset} \uC2DC\uC7A5 \uB370\uC774\uD130\uB97C \uC5EC\uB7EC \uCC28\uB840 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`,
    marketDataUnavailableNext: "\uD604\uBB3C \uAE30\uB85D\uC744 \uB2E4\uC2DC \uD655\uC778\uD558\uACE0, \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    invalidSpotRecord: (asset) => `\uC870\uCE58 \uD544\uC694: ${asset} \uD604\uBB3C \uAE30\uB85D\uC744 \uC218\uC815\uD574 \uC8FC\uC138\uC694.`,
    quantityZeroAverageNonZero: "\uC218\uB7C9\uC774 0\uC778\uB370 \uD3C9\uADE0\uB2E8\uAC00\uAC00 0\uC774 \uC544\uB2D9\uB2C8\uB2E4.",
  },
};

const MESSAGES: Record<SupportedLocale, LocaleMessages> = { en, ko };

export function getMessages(locale: SupportedLocale): LocaleMessages {
  return MESSAGES[locale];
}
