import type {
  ActionNeededReason,
  SupportedAsset,
  SupportedMarket,
} from "./domain/types.js";

export const ALERT_NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const SETUP_ALERT_NOTIFICATION_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type AlertSuppressionReason =
  | "sleep_mode"
  | "cooldown"
  | "missing_chat_id";

export interface ActionNeededDecisionLike {
  status: string;
  summary: string;
  reasons: string[];
  alert?: {
    reason: ActionNeededReason;
    cooldownKey: string;
    message: string;
  } | null;
}

export interface AlertPlan {
  shouldSend: boolean;
  suppressionReason: AlertSuppressionReason | null;
  reasonKey: string;
  cooldownUntil: string;
  message: string;
}

export interface AlertMessageInput {
  asset: SupportedAsset;
  market: SupportedMarket;
  summary: string;
  reasons: string[];
}

export function isActionNeededStatus(status: string): boolean {
  return status === "ACTION_NEEDED";
}

export function buildAlertReasonKey(input: AlertMessageInput): string {
  const raw = [input.asset, input.market, input.summary, input.reasons[0] ?? ""]
    .filter(Boolean)
    .join("|");
  return slugifyReasonKey(raw);
}

export function buildActionNeededMessage(input: AlertMessageInput): string {
  const topReasons = input.reasons.slice(0, 3);
  const lines = [
    `ACTION NEEDED: ${input.asset} spot`,
    `${input.market}`,
    input.summary,
    ...topReasons.map((reason) => `- ${reason}`),
    "No trade was executed. This is a manual record-only alert.",
  ];
  return lines.join("\n");
}

export function getAlertCooldownMs(reason: ActionNeededReason): number {
  if (reason === "COMPLETE_SETUP") {
    return SETUP_ALERT_NOTIFICATION_COOLDOWN_MS;
  }

  return ALERT_NOTIFICATION_COOLDOWN_MS;
}

export function computeCooldownUntilIso(
  createdAtIso: string,
  cooldownMs: number = ALERT_NOTIFICATION_COOLDOWN_MS,
): string {
  const createdAt = Date.parse(createdAtIso);
  if (!Number.isFinite(createdAt)) {
    return createdAtIso;
  }

  return new Date(createdAt + cooldownMs).toISOString();
}

export function isWithinCooldown(
  createdAtIso: string,
  nowIso: string,
  cooldownMs: number = ALERT_NOTIFICATION_COOLDOWN_MS,
): boolean {
  const createdAt = Date.parse(createdAtIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(createdAt) || !Number.isFinite(now)) {
    return false;
  }

  return now - createdAt < cooldownMs;
}

export function buildActionNeededAlertPlan(input: {
  decision: ActionNeededDecisionLike;
  asset: SupportedAsset;
  market: SupportedMarket;
  nowIso: string;
  hasChatId: boolean;
  sleepModeEnabled: boolean;
  latestNotification?: {
    createdAt: string;
    reasonKey: string | null;
  } | null;
}): AlertPlan {
  const reasonKey =
    input.decision.alert?.cooldownKey ??
    buildAlertReasonKey({
      asset: input.asset,
      market: input.market,
      summary: input.decision.summary,
      reasons: input.decision.reasons,
    });
  const cooldownMs = input.decision.alert
    ? getAlertCooldownMs(input.decision.alert.reason)
    : ALERT_NOTIFICATION_COOLDOWN_MS;
  const cooldownUntil = computeCooldownUntilIso(input.nowIso, cooldownMs);
  const message =
    input.decision.alert?.message ??
    buildActionNeededMessage({
      asset: input.asset,
      market: input.market,
      summary: input.decision.summary,
      reasons: input.decision.reasons,
    });

  if (input.sleepModeEnabled) {
    return {
      shouldSend: false,
      suppressionReason: "sleep_mode",
      reasonKey,
      cooldownUntil,
      message,
    };
  }

  if (!input.hasChatId) {
    return {
      shouldSend: false,
      suppressionReason: "missing_chat_id",
      reasonKey,
      cooldownUntil,
      message,
    };
  }

  if (
    input.latestNotification &&
    input.latestNotification.reasonKey === reasonKey &&
    isWithinCooldown(input.latestNotification.createdAt, input.nowIso, cooldownMs)
  ) {
    return {
      shouldSend: false,
      suppressionReason: "cooldown",
      reasonKey,
      cooldownUntil,
      message,
    };
  }

  return {
    shouldSend: true,
    suppressionReason: null,
    reasonKey,
    cooldownUntil,
    message,
  };
}

function slugifyReasonKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
