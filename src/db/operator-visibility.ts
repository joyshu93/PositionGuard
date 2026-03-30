import type {
  DecisionLogRecord,
  NotificationEventRecord,
} from "../types/persistence.js";
import type { D1DatabaseLike } from "./db.js";
import { listDecisionLogsForUser } from "./decision-logs.js";
import { listRecentNotificationEventsForUser } from "./notification-events.js";

export interface DecisionLogInspection {
  userId: number;
  asset: DecisionLogRecord["asset"];
  market: DecisionLogRecord["symbol"];
  decisionStatus: DecisionLogRecord["decisionStatus"];
  summary: string;
  actionable: boolean;
  notificationSent: boolean;
  createdAt: string;
}

export interface NotificationEventInspection {
  userId: number;
  eventType: string;
  asset: NotificationEventRecord["asset"];
  reasonKey: string | null;
  deliveryStatus: NotificationEventRecord["deliveryStatus"];
  sentAt: string | null;
  cooldownUntil: string | null;
  suppressedBy: string | null;
  createdAt: string;
}

export interface HourlyHealthInspection {
  userId: number;
  generatedAt: string;
  latestDecisionLog: DecisionLogInspection | null;
  latestNotificationEvent: NotificationEventInspection | null;
  recentDecisionLogs: DecisionLogInspection[];
  recentNotificationEvents: NotificationEventInspection[];
  decisionCount: number;
  notificationCount: number;
}

export async function getLatestDecisionLogInspection(
  db: D1DatabaseLike,
  userId: number,
): Promise<DecisionLogInspection | null> {
  const [latest] = await listDecisionLogsForUser(db, userId, 1);
  return latest ? mapDecisionLogInspection(latest) : null;
}

export async function listRecentDecisionLogInspections(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
): Promise<DecisionLogInspection[]> {
  const records = await listDecisionLogsForUser(db, userId, limit);
  return records.map(mapDecisionLogInspection);
}

export async function getLatestNotificationEventInspection(
  db: D1DatabaseLike,
  userId: number,
): Promise<NotificationEventInspection | null> {
  const [latest] = await listRecentNotificationEventsForUser(db, userId, 1);
  return latest ? mapNotificationEventInspection(latest) : null;
}

export async function listRecentNotificationEventInspections(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
): Promise<NotificationEventInspection[]> {
  const records = await listRecentNotificationEventsForUser(db, userId, limit);
  return records.map(mapNotificationEventInspection);
}

export async function getHourlyHealthInspection(
  db: D1DatabaseLike,
  userId: number,
  limit = 10,
): Promise<HourlyHealthInspection> {
  const [recentDecisionLogs, recentNotificationEvents, latestDecisionLog, latestNotificationEvent] =
    await Promise.all([
      listRecentDecisionLogInspections(db, userId, limit),
      listRecentNotificationEventInspections(db, userId, limit),
      getLatestDecisionLogInspection(db, userId),
      getLatestNotificationEventInspection(db, userId),
    ]);

  return buildHourlyHealthInspection({
    userId,
    recentDecisionLogs,
    recentNotificationEvents,
    latestDecisionLog,
    latestNotificationEvent,
  });
}

export function buildHourlyHealthInspection(input: {
  userId: number;
  recentDecisionLogs: DecisionLogInspection[];
  recentNotificationEvents: NotificationEventInspection[];
  latestDecisionLog?: DecisionLogInspection | null;
  latestNotificationEvent?: NotificationEventInspection | null;
  generatedAt?: string;
}): HourlyHealthInspection {
  return {
    userId: input.userId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    latestDecisionLog: input.latestDecisionLog ?? input.recentDecisionLogs[0] ?? null,
    latestNotificationEvent:
      input.latestNotificationEvent ?? input.recentNotificationEvents[0] ?? null,
    recentDecisionLogs: input.recentDecisionLogs,
    recentNotificationEvents: input.recentNotificationEvents,
    decisionCount: input.recentDecisionLogs.length,
    notificationCount: input.recentNotificationEvents.length,
  };
}

export function mapDecisionLogInspection(
  record: DecisionLogRecord,
): DecisionLogInspection {
  return {
    userId: record.userId,
    asset: record.asset,
    market: record.symbol,
    decisionStatus: record.decisionStatus,
    summary: record.summary,
    actionable: record.actionable,
    notificationSent: record.notificationEmitted,
    createdAt: record.createdAt,
  };
}

export function mapNotificationEventInspection(
  record: NotificationEventRecord,
): NotificationEventInspection {
  return {
    userId: record.userId,
    eventType: record.eventType,
    asset: record.asset,
    reasonKey: record.reasonKey,
    deliveryStatus: record.deliveryStatus,
    sentAt: record.sentAt,
    cooldownUntil: record.cooldownUntil,
    suppressedBy: record.suppressedBy,
    createdAt: record.createdAt,
  };
}
