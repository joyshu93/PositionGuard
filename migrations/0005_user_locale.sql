PRAGMA foreign_keys = OFF;

ALTER TABLE users ADD COLUMN preferred_language TEXT CHECK (preferred_language IN ('ko', 'en'));

PRAGMA foreign_keys = ON;
