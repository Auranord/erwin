ALTER TABLE users ADD COLUMN twitch_id TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_twitch_id ON users(twitch_id);
