PRAGMA foreign_keys = OFF;

ALTER TABLE users ADD COLUMN tracked_assets TEXT NOT NULL DEFAULT 'BTC,ETH' CHECK (tracked_assets IN ('BTC', 'ETH', 'BTC,ETH'));

PRAGMA foreign_keys = ON;
