import { parseJson, stringifyJson, nowIso } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type {
  NotificationEventLookup,
  NotificationEventInput,
  NotificationEventRecord,
} from "../types/persistence.js";

type NotificationEventRow = {
  id: number;
  user_id: number;
  decision_log_id: number | null;
  asset: "BTC" | "ETH" | null;
  reason_key: string | null;
  delivery_status: "SENT" | "SKIPPED";
  event_type: string;
  channel: string;
  payload_json: string | null;
  sent_at: string | null;
  cooldown_until: string | null;
  suppressed_by: string | null;
  created_at: string;
};

const mapNotificationEventRow = (row: NotificationEventRow): NotificationEventRecord => ({
  id: row.id,
  userId: row.user_id,
  decisionLogId: row.decision_log_id,
  asset: row.asset,
  reasonKey: row.reason_key,
  deliveryStatus: row.delivery_status,
  eventType: row.event_type,
  channel: row.channel,
  payload: parseJson<unknown>(row.payload_json, null),
  sentAt: row.sent_at,
  cooldownUntil: row.cooldown_until,
  suppressedBy: row.suppressed_by,
  createdAt: row.created_at,
});

export const createNotificationEvent = async (
  db: D1DatabaseLike,
  input: NotificationEventInput,
): Promise<NotificationEventRecord> => {
  const payloadJson = stringifyJson(input.payload);
  const sentAt = input.sentAt ?? null;
  const createdAt = nowIso();
  const deliveryStatus = input.deliveryStatus ?? "SENT";

  const row = await db
    .prepare(
      `INSERT INTO notification_events (
         user_id, decision_log_id, asset, reason_key, delivery_status,
         event_type, channel, payload_json, sent_at, cooldown_until, suppressed_by, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, user_id, decision_log_id, asset, reason_key, delivery_status,
         event_type, channel, payload_json, sent_at, cooldown_until, suppressed_by, created_at`,
    )
    .bind(
      input.userId,
      input.decisionLogId ?? null,
      input.asset ?? null,
      input.reasonKey ?? null,
      deliveryStatus,
      input.eventType,
      input.channel ?? "telegram",
      payloadJson,
      sentAt,
      input.cooldownUntil ?? null,
      input.suppressedBy ?? null,
      createdAt,
    )
    .first<NotificationEventRow>();

  if (!row) {
    throw new Error("Failed to persist notification event");
  }

  return mapNotificationEventRow(row);
};

export const getLatestNotificationEventForUserAssetReason = async (
  db: D1DatabaseLike,
  userId: number,
  asset: "BTC" | "ETH" | null,
  reasonKey: string,
): Promise<NotificationEventLookup | null> => {
  const row = await db
    .prepare(
      `SELECT id, user_id, asset, reason_key, delivery_status, event_type, sent_at, cooldown_until, created_at
       FROM notification_events
       WHERE user_id = ?
         AND ((asset IS NULL AND ? IS NULL) OR asset = ?)
         AND reason_key = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(userId, asset, asset, reasonKey)
    .first<{
      id: number;
      user_id: number;
      asset: "BTC" | "ETH" | null;
      reason_key: string | null;
      delivery_status: "SENT" | "SKIPPED";
      event_type: string;
      sent_at: string | null;
      cooldown_until: string | null;
      created_at: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    asset: row.asset,
    reasonKey: row.reason_key,
    deliveryStatus: row.delivery_status,
    eventType: row.event_type,
    sentAt: row.sent_at,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,
  };
};

export const listRecentNotificationEventsForUser = async (
  db: D1DatabaseLike,
  userId: number,
  limit = 25,
): Promise<NotificationEventRecord[]> => {
  const result = await db
    .prepare(
      `SELECT id, user_id, decision_log_id, asset, reason_key, delivery_status,
              event_type, channel, payload_json, sent_at, cooldown_until, suppressed_by, created_at
       FROM notification_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<NotificationEventRow>();

  return result.results.map(mapNotificationEventRow);
};
