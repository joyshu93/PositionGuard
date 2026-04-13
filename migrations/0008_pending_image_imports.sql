PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pending_image_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'AWAITING_UPLOAD',
  import_kind TEXT NOT NULL DEFAULT 'UNKNOWN',
  telegram_file_id TEXT,
  telegram_message_id INTEGER,
  extracted_payload_json TEXT,
  confidence REAL,
  error_message TEXT,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  rejected_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (status IN ('AWAITING_UPLOAD', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'FAILED')),
  CHECK (import_kind IN ('PORTFOLIO_SNAPSHOT', 'TRADE_HISTORY_ROW', 'UNKNOWN')),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX IF NOT EXISTS idx_pending_image_imports_user_status_created_at
  ON pending_image_imports(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_image_imports_user_expires_at
  ON pending_image_imports(user_id, expires_at ASC);

CREATE INDEX IF NOT EXISTS idx_pending_image_imports_user_updated_at
  ON pending_image_imports(user_id, updated_at DESC);
