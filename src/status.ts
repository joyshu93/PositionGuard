import type {
  PositionState,
  SupportedLocale,
  SupportedAsset,
  UserStateBundle,
} from "./domain/types.js";
import { formatNumberForLocale, getMessages, resolveUserLocale } from "./i18n/index.js";
import { assessReadiness } from "./readiness.js";

export interface RecentNotificationSummary {
  deliveryStatus: "SENT" | "SKIPPED";
  reasonKey: string | null;
  eventType: string;
  createdAt: string;
  suppressedBy?: string | null;
}

export interface SetupCompleteness {
  trackedAssets: SupportedAsset[];
  hasCash: boolean;
  readyPositionAssets: SupportedAsset[];
  isComplete: boolean;
  missingItems: string[];
}

export function assessSetupCompleteness(
  userState: Pick<UserStateBundle, "user" | "accountState" | "positions">,
): SetupCompleteness {
  const readiness = assessReadiness(userState);

  return {
    trackedAssets: readiness.trackedAssets,
    hasCash: readiness.hasCashRecord,
    readyPositionAssets: readiness.readyPositionAssets,
    isComplete: readiness.isReady,
    missingItems: readiness.missingItems,
  };
}

export function renderStatusMessage(
  userState: UserStateBundle | null,
  recentNotifications: RecentNotificationSummary[] = [],
  localeInput?: SupportedLocale | null,
): string {
  const locale = resolveUserLocale(localeInput ?? userState?.user.locale ?? null);
  const messages = getMessages(locale);

  if (!userState) {
    return messages.status.empty.join("\n");
  }

  const completeness = assessSetupCompleteness(userState);

  return [
    messages.status.sleepMode(userState.user.sleepModeEnabled),
    messages.status.trackedAssets(formatTrackedAssets(completeness.trackedAssets)),
    messages.status.setupReadiness(completeness.isComplete),
    messages.status.availableCash(
      userState.accountState
        ? `${formatNumber(userState.accountState.availableCash, locale)} KRW`
        : messages.booleans.missing,
    ),
    messages.status.spotRecord("BTC", formatPosition(userState.positions.BTC, locale, messages.booleans.missing)),
    messages.status.spotRecord("ETH", formatPosition(userState.positions.ETH, locale, messages.booleans.missing)),
    messages.status.missingNextSteps(formatMissingItems(completeness, messages.booleans.none)),
    ...formatRecentNotifications(recentNotifications, locale),
    messages.status.recordOnly,
  ].join("\n");
}

function formatPosition(position: PositionState | undefined, locale: SupportedLocale, missingLabel: string): string {
  if (!position) {
    return missingLabel;
  }

  return `${formatNumber(position.quantity, locale)} @ avg ${formatNumber(
    position.averageEntryPrice,
    locale,
    8,
  )} KRW`;
}

function formatMissingItems(completeness: SetupCompleteness, noneLabel: string): string {
  return completeness.missingItems.length > 0
    ? completeness.missingItems.join(", ")
    : noneLabel;
}

function formatNumber(value: number, locale: SupportedLocale, maximumFractionDigits = 8): string {
  return formatNumberForLocale(locale, value, maximumFractionDigits);
}

function formatRecentNotifications(
  recentNotifications: RecentNotificationSummary[],
  locale: SupportedLocale,
): string[] {
  const messages = getMessages(locale);
  if (recentNotifications.length === 0) {
    return [messages.status.recentAlertsNone];
  }

  return [
    messages.status.recentAlertsTitle,
    ...recentNotifications.map((notification) => {
      const reason = notification.reasonKey ?? messages.booleans.notAvailable;
      const extra = notification.suppressedBy
        ? ` (${notification.suppressedBy})`
        : "";
      return messages.status.recentAlertLine(`${notification.deliveryStatus} ${reason}${extra}`);
    }),
  ];
}

function formatTrackedAssets(trackedAssets: SupportedAsset[]): string {
  return trackedAssets.join(", ");
}
