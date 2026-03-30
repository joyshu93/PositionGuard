PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  username TEXT,
  display_name TEXT,
  sleep_mode INTEGER NOT NULL DEFAULT 0,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  available_cash REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user_reported',
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS position_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  average_entry_price REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user_reported',
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, asset)
);

CREATE TABLE IF NOT EXISTS decision_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decision_status TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasons_json TEXT,
  actionable INTEGER NOT NULL DEFAULT 0,
  notification_emitted INTEGER NOT NULL DEFAULT 0,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  decision_log_id INTEGER,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram',
  payload_json TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decision_log_id) REFERENCES decision_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_account_state_user_id ON account_state(user_id);
CREATE INDEX IF NOT EXISTS idx_position_state_user_id ON position_state(user_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_user_id_created_at ON decision_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_user_id_created_at ON notification_events(user_id, created_at DESC);
