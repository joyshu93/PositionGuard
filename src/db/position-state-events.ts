import { nowIso } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type {
  AssetSymbol,
  PositionStateEventInput,
  PositionStateEventRecord,
  PositionStateEventType,
} from "../types/persistence.js";

type PositionStateEventRow = {
  id: number;
  user_id: number;
  asset: AssetSymbol;
  event_type: PositionStateEventType;
  previous_quantity: number;
  quantity: number;
  previous_average_entry_price: number;
  average_entry_price: number;
  source: "user_reported";
  reported_at: string;
  created_at: string;
};

const mapPositionStateEventRow = (
  row: PositionStateEventRow,
): PositionStateEventRecord => ({
  id: row.id,
  userId: row.user_id,
  asset: row.asset,
  eventType: row.event_type,
  previousQuantity: row.previous_quantity,
  quantity: row.quantity,
  previousAverageEntryPrice: row.previous_average_entry_price,
  averageEntryPrice: row.average_entry_price,
  source: row.source,
  reportedAt: row.reported_at,
  createdAt: row.created_at,
});

export const createPositionStateEvent = async (
  db: D1DatabaseLike,
  input: PositionStateEventInput,
): Promise<PositionStateEventRecord> => {
  const reportedAt = input.reportedAt ?? nowIso();

  const row = await db
    .prepare(
      `INSERT INTO position_state_events (
         user_id, asset, event_type, previous_quantity, quantity,
         previous_average_entry_price, average_entry_price, source, reported_at, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, 'user_reported', ?, CURRENT_TIMESTAMP)
       RETURNING id, user_id, asset, event_type, previous_quantity, quantity,
                 previous_average_entry_price, average_entry_price, source, reported_at, created_at`,
    )
    .bind(
      input.userId,
      input.asset,
      input.eventType,
      input.previousQuantity,
      input.quantity,
      input.previousAverageEntryPrice,
      input.averageEntryPrice,
      reportedAt,
    )
    .first<PositionStateEventRow>();

  if (!row) {
    throw new Error("Failed to persist position state event");
  }

  return mapPositionStateEventRow(row);
};

export const getLatestPositionStateEventForUserAsset = async (
  db: D1DatabaseLike,
  userId: number,
  asset: AssetSymbol,
  eventType?: PositionStateEventType,
): Promise<PositionStateEventRecord | null> => {
  const query = eventType
    ? `SELECT id, user_id, asset, event_type, previous_quantity, quantity,
              previous_average_entry_price, average_entry_price, source, reported_at, created_at
       FROM position_state_events
       WHERE user_id = ? AND asset = ? AND event_type = ?
       ORDER BY created_at DESC
       LIMIT 1`
    : `SELECT id, user_id, asset, event_type, previous_quantity, quantity,
              previous_average_entry_price, average_entry_price, source, reported_at, created_at
       FROM position_state_events
       WHERE user_id = ? AND asset = ?
       ORDER BY created_at DESC
       LIMIT 1`;

  const statement = db.prepare(query);
  const row = eventType
    ? await statement.bind(userId, asset, eventType).first<PositionStateEventRow>()
    : await statement.bind(userId, asset).first<PositionStateEventRow>();

  return row ? mapPositionStateEventRow(row) : null;
};
