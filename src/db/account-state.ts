import { nowIso } from "./db";
import type { D1DatabaseLike } from "./db";
import type { AccountStateInput, AccountStateRecord } from "../types/persistence";

type AccountStateRow = {
  id: number;
  user_id: number;
  currency: string;
  available_cash: number;
  source: "user_reported";
  reported_at: string;
  created_at: string;
  updated_at: string;
};

const mapAccountStateRow = (row: AccountStateRow): AccountStateRecord => ({
  id: row.id,
  userId: row.user_id,
  currency: row.currency,
  availableCash: row.available_cash,
  source: row.source,
  reportedAt: row.reported_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getLatestAccountStateForUser = async (
  db: D1DatabaseLike,
  userId: number,
  currency = "KRW",
): Promise<AccountStateRecord | null> => {
  const row = await db
    .prepare(
      `SELECT id, user_id, currency, available_cash, source, reported_at, created_at, updated_at
       FROM account_state
       WHERE user_id = ? AND currency = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .bind(userId, currency)
    .first<AccountStateRow>();

  return row ? mapAccountStateRow(row) : null;
};

export const saveAccountStateForUser = async (
  db: D1DatabaseLike,
  userId: number,
  input: AccountStateInput,
): Promise<AccountStateRecord> => {
  const currency = input.currency ?? "KRW";
  const reportedAt = input.reportedAt ?? nowIso();
  const timestamp = nowIso();

  await db
    .prepare(
      `INSERT INTO account_state (user_id, currency, available_cash, source, reported_at, created_at, updated_at)
       VALUES (?, ?, ?, 'user_reported', ?, ?, ?)
       ON CONFLICT(user_id, currency) DO UPDATE SET
         available_cash = excluded.available_cash,
         source = excluded.source,
         reported_at = excluded.reported_at,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, currency, input.availableCash, reportedAt, timestamp, timestamp)
    .run();

  const saved = await getLatestAccountStateForUser(db, userId, currency);
  if (!saved) {
    throw new Error("Failed to persist account state");
  }
  return saved;
};
