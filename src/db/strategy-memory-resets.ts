import { nowIso } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type {
  AssetSymbol,
  StrategyMemoryResetInput,
  StrategyMemoryResetRecord,
} from "../types/persistence.js";

type StrategyMemoryResetRow = {
  id: number;
  user_id: number;
  scope: "BTC" | "ETH" | "ALL";
  reason: string | null;
  created_at: string;
};

const mapStrategyMemoryResetRow = (
  row: StrategyMemoryResetRow,
): StrategyMemoryResetRecord => ({
  id: row.id,
  userId: row.user_id,
  scope: row.scope,
  reason: row.reason,
  createdAt: row.created_at,
});

export const createStrategyMemoryReset = async (
  db: D1DatabaseLike,
  input: StrategyMemoryResetInput,
): Promise<StrategyMemoryResetRecord> => {
  const createdAt = input.createdAt ?? nowIso();

  const row = await db
    .prepare(
      `INSERT INTO strategy_memory_resets (user_id, scope, reason, created_at)
       VALUES (?, ?, ?, ?)
       RETURNING id, user_id, scope, reason, created_at`,
    )
    .bind(
      input.userId,
      input.scope,
      input.reason ?? null,
      createdAt,
    )
    .first<StrategyMemoryResetRow>();

  if (!row) {
    throw new Error("Failed to persist strategy memory reset");
  }

  return mapStrategyMemoryResetRow(row);
};

export const getLatestStrategyMemoryResetForUserAsset = async (
  db: D1DatabaseLike,
  userId: number,
  asset: AssetSymbol,
): Promise<StrategyMemoryResetRecord | null> => {
  const row = await db
    .prepare(
      `SELECT id, user_id, scope, reason, created_at
       FROM strategy_memory_resets
       WHERE user_id = ?
         AND scope IN (?, 'ALL')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .bind(userId, asset)
    .first<StrategyMemoryResetRow>();

  return row ? mapStrategyMemoryResetRow(row) : null;
};
