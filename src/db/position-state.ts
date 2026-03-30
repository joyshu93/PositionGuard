import { nowIso } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type { PositionStateInput, PositionStateRecord } from "../types/persistence.js";

type PositionStateRow = {
  id: number;
  user_id: number;
  asset: "BTC" | "ETH";
  quantity: number;
  average_entry_price: number;
  source: "user_reported";
  reported_at: string;
  created_at: string;
  updated_at: string;
};

const mapPositionStateRow = (row: PositionStateRow): PositionStateRecord => ({
  id: row.id,
  userId: row.user_id,
  asset: row.asset,
  quantity: row.quantity,
  averageEntryPrice: row.average_entry_price,
  source: row.source,
  reportedAt: row.reported_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listPositionStatesForUser = async (
  db: D1DatabaseLike,
  userId: number,
): Promise<PositionStateRecord[]> => {
  const result = await db
    .prepare(
      `SELECT id, user_id, asset, quantity, average_entry_price, source, reported_at, created_at, updated_at
       FROM position_state
       WHERE user_id = ?
       ORDER BY asset ASC`,
    )
    .bind(userId)
    .all<PositionStateRow>();

  return result.results.map(mapPositionStateRow);
};

export const savePositionStateForUser = async (
  db: D1DatabaseLike,
  userId: number,
  input: PositionStateInput,
): Promise<PositionStateRecord> => {
  const reportedAt = input.reportedAt ?? nowIso();
  const timestamp = nowIso();

  await db
    .prepare(
      `INSERT INTO position_state (user_id, asset, quantity, average_entry_price, source, reported_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'user_reported', ?, ?, ?)
       ON CONFLICT(user_id, asset) DO UPDATE SET
         quantity = excluded.quantity,
         average_entry_price = excluded.average_entry_price,
         source = excluded.source,
         reported_at = excluded.reported_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      input.asset,
      input.quantity,
      input.averageEntryPrice,
      reportedAt,
      timestamp,
      timestamp,
    )
    .run();

  const positions = await listPositionStatesForUser(db, userId);
  const saved = positions.find((position) => position.asset === input.asset);
  if (!saved) {
    throw new Error("Failed to persist position state");
  }
  return saved;
};
