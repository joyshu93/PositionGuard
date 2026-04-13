import { nowIso, parseJson, stringifyJson } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type {
  PendingImageImportCreateInput,
  PendingImageImportKind,
  PendingImageImportLookup,
  PendingImageImportRecord,
  PendingImageImportStatus,
  PendingImageImportUpdateInput,
} from "../types/persistence.js";

type PendingImageImportRow = {
  id: number;
  user_id: number;
  status: PendingImageImportStatus;
  import_kind: PendingImageImportKind;
  telegram_file_id: string | null;
  telegram_message_id: number | null;
  extracted_payload_json: string | null;
  confidence: number | null;
  error_message: string | null;
  expires_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

const mapPendingImageImportRow = (
  row: PendingImageImportRow,
): PendingImageImportRecord => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  importKind: row.import_kind,
  telegramFileId: row.telegram_file_id,
  telegramMessageId: row.telegram_message_id,
  extractedPayload: parseJson<unknown>(row.extracted_payload_json, null),
  confidence: row.confidence,
  errorMessage: row.error_message,
  expiresAt: row.expires_at,
  confirmedAt: row.confirmed_at,
  rejectedAt: row.rejected_at,
  failedAt: row.failed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPendingImageImportLookupRow = (
  row: Pick<
    PendingImageImportRow,
    "id" | "user_id" | "status" | "import_kind" | "expires_at" | "created_at" | "updated_at"
  >,
): PendingImageImportLookup => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  importKind: row.import_kind,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const selectPendingImageImportColumns = `
  id, user_id, status, import_kind, telegram_file_id, telegram_message_id,
  extracted_payload_json, confidence, error_message, expires_at,
  confirmed_at, rejected_at, failed_at, created_at, updated_at
`;

const selectPendingImageImportLookupColumns = `
  id, user_id, status, import_kind, expires_at, created_at, updated_at
`;

export async function createPendingImageImport(
  db: D1DatabaseLike,
  input: PendingImageImportCreateInput,
): Promise<PendingImageImportRecord> {
  const createdAt = input.createdAt ?? nowIso();
  const updatedAt = input.updatedAt ?? createdAt;

  const row = await db
    .prepare(
      `INSERT INTO pending_image_imports (
         user_id, status, import_kind, telegram_file_id, telegram_message_id,
         extracted_payload_json, confidence, error_message, expires_at,
         confirmed_at, rejected_at, failed_at, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING ${selectPendingImageImportColumns}`,
    )
    .bind(
      input.userId,
      input.status ?? "AWAITING_UPLOAD",
      input.importKind ?? "UNKNOWN",
      input.telegramFileId ?? null,
      input.telegramMessageId ?? null,
      stringifyJson(input.extractedPayload),
      input.confidence ?? null,
      input.errorMessage ?? null,
      input.expiresAt,
      input.confirmedAt ?? null,
      input.rejectedAt ?? null,
      input.failedAt ?? null,
      createdAt,
      updatedAt,
    )
    .first<PendingImageImportRow>();

  if (!row) {
    throw new Error("Failed to persist pending image import");
  }

  return mapPendingImageImportRow(row);
}

export async function updatePendingImageImport(
  db: D1DatabaseLike,
  input: PendingImageImportUpdateInput,
): Promise<PendingImageImportRecord> {
  const updatedAt = input.updatedAt ?? nowIso();
  const sets: string[] = [];
  const values: unknown[] = [];

  const addSet = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };

  if (input.status !== undefined) {
    addSet("status", input.status);
  }
  if (input.importKind !== undefined) {
    addSet("import_kind", input.importKind);
  }
  if (input.telegramFileId !== undefined) {
    addSet("telegram_file_id", input.telegramFileId);
  }
  if (input.telegramMessageId !== undefined) {
    addSet("telegram_message_id", input.telegramMessageId);
  }
  if (input.extractedPayload !== undefined) {
    addSet("extracted_payload_json", stringifyJson(input.extractedPayload));
  }
  if (input.confidence !== undefined) {
    addSet("confidence", input.confidence);
  }
  if (input.errorMessage !== undefined) {
    addSet("error_message", input.errorMessage);
  }
  if (input.expiresAt !== undefined) {
    addSet("expires_at", input.expiresAt);
  }
  if (input.confirmedAt !== undefined) {
    addSet("confirmed_at", input.confirmedAt);
  }
  if (input.rejectedAt !== undefined) {
    addSet("rejected_at", input.rejectedAt);
  }
  if (input.failedAt !== undefined) {
    addSet("failed_at", input.failedAt);
  }

  sets.push("updated_at = ?");
  values.push(updatedAt);
  values.push(input.id);

  const row = await db
    .prepare(
      `UPDATE pending_image_imports
       SET ${sets.join(", ")}
       WHERE id = ?
       RETURNING ${selectPendingImageImportColumns}`,
    )
    .bind(...values)
    .first<PendingImageImportRow>();

  if (!row) {
    throw new Error("Failed to update pending image import");
  }

  return mapPendingImageImportRow(row);
}

export async function getPendingImageImportById(
  db: D1DatabaseLike,
  id: number,
): Promise<PendingImageImportRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${selectPendingImageImportColumns}
       FROM pending_image_imports
       WHERE id = ?`,
    )
    .bind(id)
    .first<PendingImageImportRow>();

  return row ? mapPendingImageImportRow(row) : null;
}

export async function getLatestPendingImageImportForUser(
  db: D1DatabaseLike,
  userId: number,
  statuses: PendingImageImportStatus[] = ["AWAITING_UPLOAD", "PENDING_CONFIRMATION"],
): Promise<PendingImageImportLookup | null> {
  if (statuses.length === 0) {
    return null;
  }

  const placeholders = statuses.map(() => "?").join(", ");
  const row = await db
    .prepare(
      `SELECT ${selectPendingImageImportLookupColumns}
       FROM pending_image_imports
       WHERE user_id = ?
         AND status IN (${placeholders})
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .bind(userId, ...statuses)
    .first<Pick<
      PendingImageImportRow,
      "id" | "user_id" | "status" | "import_kind" | "expires_at" | "created_at" | "updated_at"
    >>();

  return row ? mapPendingImageImportLookupRow(row) : null;
}

export async function listRecentPendingImageImportsForUser(
  db: D1DatabaseLike,
  userId: number,
  limit = 25,
): Promise<PendingImageImportRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${selectPendingImageImportColumns}
       FROM pending_image_imports
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<PendingImageImportRow>();

  return result.results.map(mapPendingImageImportRow);
}

export async function markPendingImageImportAwaitingUpload(
  db: D1DatabaseLike,
  id: number,
  input: {
    expiresAt?: string;
    updatedAt?: string;
  } = {},
): Promise<PendingImageImportRecord> {
  return updatePendingImageImport(db, {
    id,
    status: "AWAITING_UPLOAD",
    expiresAt: input.expiresAt,
    updatedAt: input.updatedAt,
  });
}

export async function markPendingImageImportPendingConfirmation(
  db: D1DatabaseLike,
  id: number,
  input: {
    telegramFileId?: string | null;
    telegramMessageId?: number | null;
    extractedPayload?: unknown;
    confidence?: number | null;
    errorMessage?: string | null;
    expiresAt?: string | null;
    updatedAt?: string;
  } = {},
): Promise<PendingImageImportRecord> {
  return updatePendingImageImport(db, {
    id,
    status: "PENDING_CONFIRMATION",
    telegramFileId: input.telegramFileId,
    telegramMessageId: input.telegramMessageId,
    extractedPayload: input.extractedPayload,
    confidence: input.confidence,
    errorMessage: input.errorMessage,
    expiresAt: input.expiresAt,
    updatedAt: input.updatedAt,
  });
}

export async function markPendingImageImportConfirmed(
  db: D1DatabaseLike,
  id: number,
  input: {
    confirmedAt?: string;
    updatedAt?: string;
  } = {},
): Promise<PendingImageImportRecord> {
  const timestamp = input.confirmedAt ?? input.updatedAt ?? nowIso();
  return updatePendingImageImport(db, {
    id,
    status: "CONFIRMED",
    confirmedAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  });
}

export async function markPendingImageImportRejected(
  db: D1DatabaseLike,
  id: number,
  input: {
    rejectedAt?: string;
    errorMessage?: string | null;
    updatedAt?: string;
  } = {},
): Promise<PendingImageImportRecord> {
  const timestamp = input.rejectedAt ?? input.updatedAt ?? nowIso();
  return updatePendingImageImport(db, {
    id,
    status: "REJECTED",
    rejectedAt: timestamp,
    errorMessage: input.errorMessage,
    updatedAt: input.updatedAt ?? timestamp,
  });
}

export async function markPendingImageImportFailed(
  db: D1DatabaseLike,
  id: number,
  input: {
    failedAt?: string;
    errorMessage?: string | null;
    updatedAt?: string;
  } = {},
): Promise<PendingImageImportRecord> {
  const timestamp = input.failedAt ?? input.updatedAt ?? nowIso();
  return updatePendingImageImport(db, {
    id,
    status: "FAILED",
    failedAt: timestamp,
    errorMessage: input.errorMessage,
    updatedAt: input.updatedAt ?? timestamp,
  });
}
