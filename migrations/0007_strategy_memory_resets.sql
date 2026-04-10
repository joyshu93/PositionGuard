PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS strategy_memory_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (scope IN ('BTC', 'ETH', 'ALL'))
);

CREATE INDEX IF NOT EXISTS idx_strategy_memory_resets_user_scope_created_at
  ON strategy_memory_resets(user_id, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_strategy_memory_resets_user_created_at
  ON strategy_memory_resets(user_id, created_at DESC);
