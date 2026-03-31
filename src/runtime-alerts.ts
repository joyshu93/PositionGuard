import type {
  ActionNeededReason,
  DecisionContext,
  SupportedAsset,
  SupportedMarket,
} from "./domain/types.js";

export const ALERT_NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const SETUP_ALERT_NOTIFICATION_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const STATE_UPDATE_REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const STATE_UPDATE_REMINDER_REPEAT_THRESHOLD = 2;

export type AlertSuppressionReason =
  | "sleep_mode"
  | "cooldown"
  | "missing_chat_id";

export type ReminderSuppressionReason =
  | AlertSuppressionReason
  | "primary_alert_sent"
  | "below_repeat_threshold"
  | "state_changed"
  | "unsupported_reason";

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

export interface ManualStateSnapshot {
  availableCash: number | null;
  quantity: number | null;
  averageEntryPrice: number | null;
  accountReportedAt: string | null;
  accountUpdatedAt: string | null;
  positionReportedAt: string | null;
  positionUpdatedAt: string | null;
}

export interface ReminderAssessment {
  repeatedSignalCount: number;
  stateChangedSinceLastSignal: boolean | null;
  reminderEligible: boolean;
  reasonKey: string | null;
  signalReason: ActionNeededReason | null;
}

export interface ReminderPlan {
  shouldSend: boolean;
  eligible: boolean;
  suppressionReason: ReminderSuppressionReason | null;
  reasonKey: string | null;
  cooldownUntil: string | null;
  message: string | null;
  repeatedSignalCount: number;
  stateChangedSinceLastSignal: boolean | null;
  signalReason: ActionNeededReason | null;
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

export function buildManualStateSnapshot(
  context: Pick<DecisionContext, "accountState" | "positionState">,
): ManualStateSnapshot {
  return {
    availableCash: context.accountState?.availableCash ?? null,
    quantity: context.positionState?.quantity ?? null,
    averageEntryPrice: context.positionState?.averageEntryPrice ?? null,
    accountReportedAt: context.accountState?.reportedAt ?? null,
    accountUpdatedAt: context.accountState?.updatedAt ?? null,
    positionReportedAt: context.positionState?.reportedAt ?? null,
    positionUpdatedAt: context.positionState?.updatedAt ?? null,
  };
}

export function areManualStateSnapshotsEqual(
  left: ManualStateSnapshot | null,
  right: ManualStateSnapshot | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.availableCash === right.availableCash &&
    left.quantity === right.quantity &&
    left.averageEntryPrice === right.averageEntryPrice &&
    left.accountReportedAt === right.accountReportedAt &&
    left.accountUpdatedAt === right.accountUpdatedAt &&
    left.positionReportedAt === right.positionReportedAt &&
    left.positionUpdatedAt === right.positionUpdatedAt
  );
}

export function assessStateUpdateReminder(input: {
  decision: ActionNeededDecisionLike;
  context: DecisionContext;
  asset: SupportedAsset;
  recentDecisionLogs: Array<{ decisionStatus: string; context: unknown }>;
}): ReminderAssessment {
  const signalReason = input.decision.alert?.reason ?? null;

  if (
    input.decision.status !== "ACTION_NEEDED" ||
    !signalReason ||
    !isReminderSignalReason(signalReason)
  ) {
    return {
      repeatedSignalCount: 0,
      stateChangedSinceLastSignal: null,
      reminderEligible: false,
      reasonKey: null,
      signalReason: null,
    };
  }

  const currentSnapshot = buildManualStateSnapshot(input.context);
  let repeatedSignalCount = 1;
  let stateChangedSinceLastSignal: boolean | null = null;

  for (const log of input.recentDecisionLogs) {
    if (extractAlertReasonFromDecisionLog(log.context) !== signalReason) {
      break;
    }

    const historicalSnapshot = extractManualStateSnapshotFromDecisionLogContext(log.context);
    if (!areManualStateSnapshotsEqual(currentSnapshot, historicalSnapshot)) {
      stateChangedSinceLastSignal = true;
      break;
    }

    stateChangedSinceLastSignal = false;
    repeatedSignalCount += 1;
  }

  return {
    repeatedSignalCount,
    stateChangedSinceLastSignal,
    reminderEligible:
      repeatedSignalCount >= STATE_UPDATE_REMINDER_REPEAT_THRESHOLD &&
      stateChangedSinceLastSignal === false,
    reasonKey: buildStateUpdateReminderReasonKey(
      input.context.user.id,
      input.asset,
      signalReason,
    ),
    signalReason,
  };
}

export function buildStateUpdateReminderPlan(input: {
  assessment: ReminderAssessment;
  asset: SupportedAsset;
  nowIso: string;
  hasChatId: boolean;
  sleepModeEnabled: boolean;
  primaryAlertSent: boolean;
  latestReminderNotification?: {
    createdAt: string;
    reasonKey: string | null;
  } | null;
}): ReminderPlan {
  if (!input.assessment.signalReason || !input.assessment.reasonKey) {
    return {
      shouldSend: false,
      eligible: false,
      suppressionReason: "unsupported_reason",
      reasonKey: null,
      cooldownUntil: null,
      message: null,
      repeatedSignalCount: input.assessment.repeatedSignalCount,
      stateChangedSinceLastSignal: input.assessment.stateChangedSinceLastSignal,
      signalReason: null,
    };
  }

  const cooldownUntil = computeCooldownUntilIso(
    input.nowIso,
    STATE_UPDATE_REMINDER_COOLDOWN_MS,
  );
  const message = buildStateUpdateReminderMessage({
    asset: input.asset,
    signalReason: input.assessment.signalReason,
  });

  if (input.assessment.stateChangedSinceLastSignal === true) {
    return {
      shouldSend: false,
      eligible: false,
      suppressionReason: "state_changed",
      reasonKey: input.assessment.reasonKey,
      cooldownUntil,
      message,
      repeatedSignalCount: input.assessment.repeatedSignalCount,
      stateChangedSinceLastSignal: true,
      signalReason: input.assessment.signalReason,
    };
  }

  if (!input.assessment.reminderEligible) {
    return {
      shouldSend: false,
      eligible: false,
      suppressionReason: "below_repeat_threshold",
      reasonKey: input.assessment.reasonKey,
      cooldownUntil,
      message,
      repeatedSignalCount: input.assessment.repeatedSignalCount,
      stateChangedSinceLastSignal: input.assessment.stateChangedSinceLastSignal,
      signalReason: input.assessment.signalReason,
    };
  }

  if (input.primaryAlertSent) {
    return {
      shouldSend: false,
      eligible: true,
      suppressionReason: "primary_alert_sent",
      reasonKey: input.assessment.reasonKey,
      cooldownUntil,
      message,
      repeatedSignalCount: input.assessment.repeatedSignalCount,
      stateChangedSinceLastSignal: input.assessment.stateChangedSinceLastSignal,
      signalReason: input.assessment.signalReason,
    };
  }

  if (input.sleepModeEnabled) {
    return {
      shouldSend: false,
      eligible: true,
      suppressionReason: "sleep_mode",
      reasonKey: input.assessment.reasonKey,
      cooldownUntil,
      message,
      repeatedSignalCount: input.assessment.repeatedSignalCount,
      stateChangedSinceLastSignal: input.assessment.stateChangedSinceLastSignal,
      signalReason: input.assessment.signalReason,
    };
  }

  if (!input.hasChatId) {
    return {
      shouldSend: false,
      eligible: true,
      suppressionReason: "missing_chat_id",
      reasonKey: input.assessment.reasonKey,
      cooldownUntil,
      message,
      repeatedSignalCount: input.assessment.repeatedSignalCount,
      stateChangedSinceLastSignal: input.assessment.stateChangedSinceLastSignal,
      signalReason: input.assessment.signalReason,
    };
  }

  if (
    input.latestReminderNotification &&
    input.latestReminderNotification.reasonKey === input.assessment.reasonKey &&
    isWithinCooldown(
      input.latestReminderNotification.createdAt,
      input.nowIso,
      STATE_UPDATE_REMINDER_COOLDOWN_MS,
    )
  ) {
    return {
      shouldSend: false,
      eligible: true,
      suppressionReason: "cooldown",
      reasonKey: input.assessment.reasonKey,
      cooldownUntil,
      message,
      repeatedSignalCount: input.assessment.repeatedSignalCount,
      stateChangedSinceLastSignal: input.assessment.stateChangedSinceLastSignal,
      signalReason: input.assessment.signalReason,
    };
  }

  return {
    shouldSend: true,
    eligible: true,
    suppressionReason: null,
    reasonKey: input.assessment.reasonKey,
    cooldownUntil,
    message,
    repeatedSignalCount: input.assessment.repeatedSignalCount,
    stateChangedSinceLastSignal: input.assessment.stateChangedSinceLastSignal,
    signalReason: input.assessment.signalReason,
  };
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

function isReminderSignalReason(reason: ActionNeededReason): boolean {
  return (
    reason === "ENTRY_REVIEW_REQUIRED" ||
    reason === "ADD_BUY_REVIEW_REQUIRED" ||
    reason === "REDUCE_REVIEW_REQUIRED"
  );
}

function buildStateUpdateReminderReasonKey(
  userId: number,
  asset: SupportedAsset,
  signalReason: ActionNeededReason,
): string {
  return slugifyReasonKey(
    `state-update-reminder:${userId}:${asset}:${signalReason}`,
  );
}

function buildStateUpdateReminderMessage(input: {
  asset: SupportedAsset;
  signalReason: ActionNeededReason;
}): string {
  return [
    `ACTION NEEDED: ${input.asset} state update reminder`,
    `PositionGuard is still seeing the same ${describeSignalReason(input.signalReason)} and the same stored manual state.`,
    "If you already bought or sold, update your recorded position with /setposition.",
    "If your available cash changed, update it with /setcash.",
    "PositionGuard only sees your stored manual state.",
    "No trade was executed.",
    "This is record-only guidance.",
  ].join("\n");
}

function describeSignalReason(reason: ActionNeededReason): string {
  if (reason === "ENTRY_REVIEW_REQUIRED") {
    return "entry review";
  }

  if (reason === "ADD_BUY_REVIEW_REQUIRED") {
    return "add-buy review";
  }

  if (reason === "REDUCE_REVIEW_REQUIRED") {
    return "reduce review";
  }

  return "coaching signal";
}

function extractAlertReasonFromDecisionLog(
  context: unknown,
): ActionNeededReason | null {
  if (!context || typeof context !== "object") {
    return null;
  }

  const diagnostics = (context as { diagnostics?: unknown }).diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }

  const alertReason = (diagnostics as { alertReason?: unknown }).alertReason;
  return typeof alertReason === "string" ? (alertReason as ActionNeededReason) : null;
}

function extractManualStateSnapshotFromDecisionLogContext(
  context: unknown,
): ManualStateSnapshot | null {
  if (!context || typeof context !== "object") {
    return null;
  }

  const storedContext = (context as { context?: unknown }).context;
  if (!storedContext || typeof storedContext !== "object") {
    return null;
  }

  const accountState = (storedContext as { accountState?: unknown }).accountState;
  const positionState = (storedContext as { positionState?: unknown }).positionState;

  return {
    availableCash:
      accountState &&
      typeof accountState === "object" &&
      typeof (accountState as { availableCash?: unknown }).availableCash === "number"
        ? (accountState as { availableCash: number }).availableCash
        : null,
    quantity:
      positionState &&
      typeof positionState === "object" &&
      typeof (positionState as { quantity?: unknown }).quantity === "number"
        ? (positionState as { quantity: number }).quantity
        : null,
    averageEntryPrice:
      positionState &&
      typeof positionState === "object" &&
      typeof (positionState as { averageEntryPrice?: unknown }).averageEntryPrice === "number"
        ? (positionState as { averageEntryPrice: number }).averageEntryPrice
        : null,
    accountReportedAt:
      accountState &&
      typeof accountState === "object" &&
      typeof (accountState as { reportedAt?: unknown }).reportedAt === "string"
        ? (accountState as { reportedAt: string }).reportedAt
        : null,
    accountUpdatedAt:
      accountState &&
      typeof accountState === "object" &&
      typeof (accountState as { updatedAt?: unknown }).updatedAt === "string"
        ? (accountState as { updatedAt: string }).updatedAt
        : null,
    positionReportedAt:
      positionState &&
      typeof positionState === "object" &&
      typeof (positionState as { reportedAt?: unknown }).reportedAt === "string"
        ? (positionState as { reportedAt: string }).reportedAt
        : null,
    positionUpdatedAt:
      positionState &&
      typeof positionState === "object" &&
      typeof (positionState as { updatedAt?: unknown }).updatedAt === "string"
        ? (positionState as { updatedAt: string }).updatedAt
        : null,
  };
}
