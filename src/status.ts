import type {
  PositionState,
  SupportedAsset,
  UserStateBundle,
} from "./domain/types.js";
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
): string {
  if (!userState) {
    return [
      "No stored setup yet.",
      "Tracked assets default to BTC and ETH until you choose otherwise.",
      "Record available cash with /setcash <amount>.",
      "Record BTC or ETH spot state with /setposition <BTC|ETH> <quantity> <average-entry-price>.",
      "This bot records manual state only. It does not execute trades.",
    ].join("\n");
  }

  const completeness = assessSetupCompleteness(userState);

  return [
    `Sleep mode: ${userState.user.sleepModeEnabled ? "on" : "off"}`,
    `Tracked assets: ${formatTrackedAssets(completeness.trackedAssets)}`,
    `Setup readiness: ${completeness.isComplete ? "ready" : "incomplete"}`,
    `Available cash: ${
      userState.accountState
        ? `${formatNumber(userState.accountState.availableCash)} KRW`
        : "missing"
    }`,
    `BTC spot record: ${formatPosition(userState.positions.BTC)}`,
    `ETH spot record: ${formatPosition(userState.positions.ETH)}`,
    `Missing next steps: ${formatMissingItems(completeness)}`,
    ...formatRecentNotifications(recentNotifications),
    "State is record-only. No trade execution is performed.",
  ].join("\n");
}

function formatPosition(position: PositionState | undefined): string {
  if (!position) {
    return "missing";
  }

  return `${formatNumber(position.quantity)} @ avg ${formatNumber(
    position.averageEntryPrice,
  )} KRW`;
}

function formatMissingItems(completeness: SetupCompleteness): string {
  return completeness.missingItems.length > 0
    ? completeness.missingItems.join(", ")
    : "none";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}

function formatRecentNotifications(
  recentNotifications: RecentNotificationSummary[],
): string[] {
  if (recentNotifications.length === 0) {
    return ["Recent alerts: none"];
  }

  return [
    "Recent alerts:",
    ...recentNotifications.map((notification) => {
      const reason = notification.reasonKey ?? "unclassified";
      const extra = notification.suppressedBy
        ? ` (${notification.suppressedBy})`
        : "";
      return `- ${notification.deliveryStatus} ${reason}${extra}`;
    }),
  ];
}

function formatTrackedAssets(trackedAssets: SupportedAsset[]): string {
  return trackedAssets.join(", ");
}
