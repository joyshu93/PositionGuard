import type { PositionState, UserStateBundle } from "./domain/types.js";

export interface RecentNotificationSummary {
  deliveryStatus: "SENT" | "SKIPPED";
  reasonKey: string | null;
  eventType: string;
  createdAt: string;
  suppressedBy?: string | null;
}

export interface SetupCompleteness {
  hasCash: boolean;
  hasBtcPosition: boolean;
  hasEthPosition: boolean;
  isComplete: boolean;
}

export function assessSetupCompleteness(
  userState: Pick<UserStateBundle, "accountState" | "positions">,
): SetupCompleteness {
  const hasCash = userState.accountState !== null;
  const hasBtcPosition = userState.positions.BTC !== undefined;
  const hasEthPosition = userState.positions.ETH !== undefined;

  return {
    hasCash,
    hasBtcPosition,
    hasEthPosition,
    isComplete: hasCash && hasBtcPosition && hasEthPosition,
  };
}

export function renderStatusMessage(
  userState: UserStateBundle | null,
  recentNotifications: RecentNotificationSummary[] = [],
): string {
  if (!userState) {
    return [
      "No stored setup yet.",
      "Record available cash with /setcash <amount>.",
      "Record BTC or ETH spot state with /setposition <BTC|ETH> <quantity> <average-entry-price>.",
      "This bot records manual state only. It does not execute trades.",
    ].join("\n");
  }

  const completeness = assessSetupCompleteness(userState);

  return [
    `Sleep mode: ${userState.user.sleepModeEnabled ? "on" : "off"}`,
    `Setup completeness: ${completeness.isComplete ? "complete" : "incomplete"}`,
    `Available cash: ${
      userState.accountState
        ? `${formatNumber(userState.accountState.availableCash)} KRW`
        : "missing"
    }`,
    `BTC spot record: ${formatPosition(userState.positions.BTC)}`,
    `ETH spot record: ${formatPosition(userState.positions.ETH)}`,
    `Missing setup items: ${formatMissingItems(completeness)}`,
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
  const missing: string[] = [];
  if (!completeness.hasCash) {
    missing.push("cash");
  }
  if (!completeness.hasBtcPosition) {
    missing.push("BTC position");
  }
  if (!completeness.hasEthPosition) {
    missing.push("ETH position");
  }

  return missing.length > 0 ? missing.join(", ") : "none";
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
