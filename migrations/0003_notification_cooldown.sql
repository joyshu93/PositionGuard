PRAGMA foreign_keys = OFF;

ALTER TABLE notification_events ADD COLUMN asset TEXT CHECK (asset IN ('BTC', 'ETH'));
ALTER TABLE notification_events ADD COLUMN reason_key TEXT CHECK (reason_key IS NULL OR length(reason_key) > 0);
ALTER TABLE notification_events ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'SENT' CHECK (delivery_status IN ('SENT', 'SKIPPED'));
ALTER TABLE notification_events ADD COLUMN cooldown_until TEXT;
ALTER TABLE notification_events ADD COLUMN suppressed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_notification_events_user_asset_reason_created_at
  ON notification_events(user_id, asset, reason_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_events_user_delivery_status_created_at
  ON notification_events(user_id, delivery_status, created_at DESC);

PRAGMA foreign_keys = ON;
