ALTER TABLE users ADD COLUMN twitch_id TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_twitch_id_idx ON users(twitch_id);
