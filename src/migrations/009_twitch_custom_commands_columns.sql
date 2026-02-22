ALTER TABLE twitch_custom_commands ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE twitch_custom_commands ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE twitch_custom_commands ADD COLUMN created_at TEXT;
ALTER TABLE twitch_custom_commands ADD COLUMN updated_at TEXT;

UPDATE twitch_custom_commands
SET created_at = COALESCE(created_at, updated_at, datetime('now'))
WHERE created_at IS NULL;

UPDATE twitch_custom_commands
SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
WHERE updated_at IS NULL;
