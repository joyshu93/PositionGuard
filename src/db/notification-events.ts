import { parseJson, stringifyJson, nowIso } from "./db";
import type { D1DatabaseLike } from "./db";
import type {
  NotificationEventInput,
  NotificationEventRecord,
} from "../types/persistence";

type NotificationEventRow = {
  id: number;
  user_id: number;
  decision_log_id: number | null;
  event_type: string;
  channel: string;
  payload_json: string | null;
  sent_at: string | null;
  created_at: string;
};

const mapNotificationEventRow = (row: NotificationEventRow): NotificationEventRecord => ({
  id: row.id,
  userId: row.user_id,
  decisionLogId: row.decision_log_id,
  eventType: row.event_type,
  channel: row.channel,
  payload: parseJson<unknown>(row.payload_json, null),
  sentAt: row.sent_at,
  createdAt: row.created_at,
});

export const createNotificationEvent = async (
  db: D1DatabaseLike,
  input: NotificationEventInput,
): Promise<NotificationEventRecord> => {
  const payloadJson = stringifyJson(input.payload);
  const sentAt = input.sentAt ?? null;
  const createdAt = nowIso();

  const row = await db
    .prepare(
      `INSERT INTO notification_events (
         user_id, decision_log_id, event_type, channel, payload_json, sent_at, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, user_id, decision_log_id, event_type, channel, payload_json, sent_at, created_at`,
    )
    .bind(
      input.userId,
      input.decisionLogId ?? null,
      input.eventType,
      input.channel ?? "telegram",
      payloadJson,
      sentAt,
      createdAt,
    )
    .first<NotificationEventRow>();

  if (!row) {
    throw new Error("Failed to persist notification event");
  }

  return mapNotificationEventRow(row);
};
