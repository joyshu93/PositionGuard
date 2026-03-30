import { parseJson, stringifyJson } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type {
  DecisionLogInput,
  DecisionLogLookup,
  DecisionLogRecord,
} from "../types/persistence.js";

type DecisionLogRow = {
  id: number;
  user_id: number;
  asset: "BTC" | "ETH";
  symbol: "KRW-BTC" | "KRW-ETH";
  decision_status:
    | "SETUP_INCOMPLETE"
    | "INSUFFICIENT_DATA"
    | "NO_ACTION"
    | "ACTION_NEEDED";
  summary: string;
  reasons_json: string | null;
  actionable: number;
  notification_emitted: number;
  context_json: string | null;
  created_at: string;
};

const mapDecisionLogRow = (row: DecisionLogRow): DecisionLogRecord => ({
  id: row.id,
  userId: row.user_id,
  asset: row.asset,
  symbol: row.symbol,
  decisionStatus: row.decision_status,
  summary: row.summary,
  reasons: parseJson<string[]>(row.reasons_json, []),
  actionable: row.actionable === 1,
  notificationEmitted: row.notification_emitted === 1,
  context: parseJson<unknown>(row.context_json, null),
  createdAt: row.created_at,
});

export const createDecisionLog = async (
  db: D1DatabaseLike,
  input: DecisionLogInput,
): Promise<DecisionLogRecord> => {
  const reasonsJson = stringifyJson(input.reasons);
  const contextJson = stringifyJson(input.context);

  const row = await db
    .prepare(
      `INSERT INTO decision_logs (
         user_id, asset, symbol, decision_status, summary,
         reasons_json, actionable, notification_emitted, context_json, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       RETURNING id, user_id, asset, symbol, decision_status, summary, reasons_json, actionable, notification_emitted, context_json, created_at`,
    )
    .bind(
      input.userId,
      input.asset,
      input.symbol,
      input.decisionStatus,
      input.summary,
      reasonsJson,
      input.actionable ? 1 : 0,
      input.notificationEmitted ? 1 : 0,
      contextJson,
      input.createdAt ?? null,
    )
    .first<DecisionLogRow>();

  if (!row) {
    throw new Error("Failed to persist decision log");
  }
  return mapDecisionLogRow(row);
};

export const listDecisionLogsForUser = async (
  db: D1DatabaseLike,
  userId: number,
  limit = 25,
): Promise<DecisionLogRecord[]> => {
  const result = await db
    .prepare(
      `SELECT id, user_id, asset, symbol, decision_status, summary, reasons_json, actionable, notification_emitted, context_json, created_at
       FROM decision_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<DecisionLogRow>();

  return result.results.map(mapDecisionLogRow);
};

export const listRecentDecisionLogsForUserAsset = async (
  db: D1DatabaseLike,
  userId: number,
  asset: "BTC" | "ETH",
  limit = 10,
): Promise<DecisionLogRecord[]> => {
  const result = await db
    .prepare(
      `SELECT id, user_id, asset, symbol, decision_status, summary, reasons_json, actionable, notification_emitted, context_json, created_at
       FROM decision_logs
       WHERE user_id = ? AND asset = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(userId, asset, limit)
    .all<DecisionLogRow>();

  return result.results.map(mapDecisionLogRow);
};

export const getLatestDecisionLogForUserAsset = async (
  db: D1DatabaseLike,
  userId: number,
  asset: "BTC" | "ETH",
): Promise<DecisionLogLookup | null> => {
  const row = await db
    .prepare(
      `SELECT user_id, asset, decision_status, summary, created_at
       FROM decision_logs
       WHERE user_id = ? AND asset = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(userId, asset)
    .first<{
      user_id: number;
      asset: "BTC" | "ETH";
      decision_status:
        | "SETUP_INCOMPLETE"
        | "INSUFFICIENT_DATA"
        | "NO_ACTION"
        | "ACTION_NEEDED";
      summary: string;
      created_at: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    asset: row.asset,
    decisionStatus: row.decision_status,
    summary: row.summary,
    createdAt: row.created_at,
  };
};
