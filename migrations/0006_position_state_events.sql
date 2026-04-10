PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS position_state_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_quantity REAL NOT NULL,
  quantity REAL NOT NULL,
  previous_average_entry_price REAL NOT NULL,
  average_entry_price REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'user_reported',
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (asset IN ('BTC', 'ETH')),
  CHECK (event_type IN ('ENTRY', 'ADD', 'REDUCE', 'EXIT'))
);

CREATE INDEX IF NOT EXISTS idx_position_state_events_user_asset_created_at
  ON position_state_events(user_id, asset, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_position_state_events_user_asset_type_created_at
  ON position_state_events(user_id, asset, event_type, created_at DESC);
