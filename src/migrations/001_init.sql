CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  twitch_id TEXT UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  youtube_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  duration_sec INTEGER,
  channel TEXT,
  thumbnail TEXT,
  disabled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE IF NOT EXISTS play_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_track_id TEXT,
  started_at_ms INTEGER,
  paused INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queue (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS play_pool (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_queue (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vote_rounds (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  options_json TEXT NOT NULL,
  winner_track_id TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  vote_round_id TEXT NOT NULL,
  user_twitch_name TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (vote_round_id, user_twitch_name)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS twitch_custom_commands (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL UNIQUE,
  response TEXT NOT NULL
);
