PRAGMA foreign_keys = OFF;

CREATE TABLE users_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  username TEXT,
  display_name TEXT,
  sleep_mode INTEGER NOT NULL DEFAULT 0 CHECK (sleep_mode IN (0, 1)),
  onboarding_complete INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_complete IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_v2 (
  id,
  telegram_user_id,
  telegram_chat_id,
  username,
  display_name,
  sleep_mode,
  onboarding_complete,
  created_at,
  updated_at
)
SELECT
  id,
  telegram_user_id,
  telegram_chat_id,
  username,
  display_name,
  CASE WHEN sleep_mode = 1 THEN 1 ELSE 0 END,
  CASE WHEN onboarding_complete = 1 THEN 1 ELSE 0 END,
  created_at,
  updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;

CREATE TABLE account_state_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  available_cash REAL NOT NULL DEFAULT 0 CHECK (available_cash >= 0),
  source TEXT NOT NULL DEFAULT 'user_reported' CHECK (source = 'user_reported'),
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, currency)
);

INSERT INTO account_state_v2 (
  id,
  user_id,
  currency,
  available_cash,
  source,
  reported_at,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  currency,
  CASE WHEN available_cash < 0 THEN 0 ELSE available_cash END,
  source,
  reported_at,
  created_at,
  updated_at
FROM account_state;

DROP TABLE account_state;
ALTER TABLE account_state_v2 RENAME TO account_state;

CREATE TABLE position_state_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH')),
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  average_entry_price REAL NOT NULL DEFAULT 0 CHECK (average_entry_price >= 0),
  source TEXT NOT NULL DEFAULT 'user_reported' CHECK (source = 'user_reported'),
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, asset),
  CHECK (quantity > 0 OR average_entry_price = 0)
);

INSERT INTO position_state_v2 (
  id,
  user_id,
  asset,
  quantity,
  average_entry_price,
  source,
  reported_at,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  CASE WHEN asset IN ('BTC', 'ETH') THEN asset ELSE 'BTC' END,
  CASE WHEN quantity < 0 THEN 0 ELSE quantity END,
  CASE
    WHEN quantity <= 0 THEN 0
    WHEN average_entry_price < 0 THEN 0
    ELSE average_entry_price
  END,
  source,
  reported_at,
  created_at,
  updated_at
FROM position_state;

DROP TABLE position_state;
ALTER TABLE position_state_v2 RENAME TO position_state;

CREATE INDEX IF NOT EXISTS idx_account_state_user_id ON account_state(user_id);
CREATE INDEX IF NOT EXISTS idx_position_state_user_id ON position_state(user_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_user_id_created_at ON decision_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_user_id_created_at ON notification_events(user_id, created_at DESC);

PRAGMA foreign_keys = ON;
