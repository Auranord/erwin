# Erwin Documentation

## What is Erwin

Erwin is a self-hosted stream music controller:
- A dashboard to manage playlists, a play pool, and a queue
- A stream player page intended to be used as an OBS Browser Source
- A Twitch bot that can announce things and support chat voting

## MVP scope

- Login-protected dashboard and stream player
- Playlist management and YouTube playlist import
- Track download queue (audio caching on disk)
- Pool + Queue playback model
- Timestamp-based playback sync (server authority)
- Twitch voting (auto vote option near track end) and chat integration
- Multi-user accounts:
  - One admin account creates new accounts and manage existing accounts
  - Every authenticated user can do all other actions

---

## Key concepts

### Track
A Track represents one playable audio item with metadata (title, channel, duration, youtube id, etc.) and a cached audio file path when downloaded.

### Playlist
A named collection of tracks, with an order.

### Pool
The pool is the set of tracks eligible for random playback when the queue is empty.

### Queue
The queue is a prioritized list of tracks to play next.
Queue entries store:
- `track_id`
- `source` (why it was enqueued, for example: “manual”, “vote”, “system”)
- `added_by_user_id` (who added it, NULL for automatic/system adds)

### Play state
The server is authoritative and stores:
- current track id
- started timestamp (ms)
- paused state and paused timestamp

Clients sync to that state.

### Voting
A vote round creates multiple options from the pool and tallies votes from chat (and the dashboard UI).
When the vote ends, the winner is enqueued.

---

## Pages (routes)

### `/login`
Login screen. Creates a session cookie.

### `/dashboard`
The main UI:
- Now playing / session controls
- Queue management
- Pool management
- Playlists and tracks
- Downloads
- Settings
- Vote UI and chat feed
- User management (admin only)

### `/player/stream`
The stream player:
- Uses an HTML audio element to play `/api/audio/:trackId`
- Syncs position using the server play_state timestamps

---

## Authentication and accounts

Erwin uses cookie-based sessions.

### Admin bootstrapping
On each start, Erwin sets an admin user.
You can control the admin credentials via environment variables:
- `ERWIN_ADMIN_USER`
- `ERWIN_ADMIN_PASSWORD`

### Permissions model
- All authenticated users can do all music-related actions (session, queue, pool, playlists, votes, settings).
- Only the admin user can create and manage accounts.

---

## API

All `/api/*` routes require authentication unless explicitly noted.

### Health

#### `GET /health`
Returns `{ "status": "ok" }`

#### `GET /ready`
Readiness check. Returns 200 when ready, 503 when not.

#### `GET /api/health`
Returns `{ "status": "ok" }`

---

## Timestamp sync model (how playback stays in sync)

The server stores:
- `started_at_ms` as the absolute reference for where playback should be
- `paused` and `paused_at_ms` to freeze time while paused

The stream player:
- Calculates target playback time as `(referenceTime - started_at_ms) / 1000`
- Seeks if drift exceeds a small threshold (for example 2 seconds)
- Plays or pauses based on server state

This keeps the player stable without requiring continuous “heartbeat” reports from the player.

---

## Twitch bot

Erwin can connect to Twitch IRC and:
- Broadcast chat messages into the dashboard
- Handle vote commands
- Provide a “now playing” command

Common commands:
- `!vote <number>`
- `!song`

---

## Configuration (environment variables)

### Core
- `ERWIN_BASE_URL`
- `PORT` (default 3000)
- `DB_URL` (default `./data/erwin.sqlite`)
- `SESSION_SECRET` (required in production)

### Admin bootstrap
- `ERWIN_ADMIN_USER` (default `admin`)
- `ERWIN_ADMIN_PASSWORD` (default `admin123`)

### Audio cache and downloader
- `ERWIN_AUDIO_DIR` (default `./data/audio`)
- `ERWIN_DOWNLOAD_CONCURRENCY` (default 1)
- `ERWIN_AUDIO_RETENTION_DAYS` (default 0, disabled)
- `ERWIN_AUDIO_RETENTION_MAX_GB` (default 0, disabled)

### YouTube / yt-dlp integration
- `ERWIN_YTDL_COOKIE` (default empty)
- `ERWIN_YTDL_COOKIE_FILE` (default `/app/data/youtube.cookie`)
- `ERWIN_YTDL_FFMPEG_LOCATION` (default empty)
- `ERWIN_YTDL_JS_RUNTIME` (default `node:<path>`)
- `ERWIN_YTDL_REMOTE_COMPONENTS` (default `ejs:github`)

### Twitch
- `TWITCH_BOT_USERNAME`
- `TWITCH_CHANNEL`
- `TWITCH_OAUTH_TOKEN`
- `TWITCH_REFRESH_TOKEN`
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_COMMAND_PREFIX` (default `!`)
- `TWITCH_IRC_HOST` (default Twitch edge host)

---

## Deployment notes (TrueNAS SCALE)

Recommended:
- Single instance deployment
- Persistent volumes:
  - DB file path (DB_URL)
  - Audio directory (ERWIN_AUDIO_DIR)
  - YouTube cookie file (ERWIN_YTDL_COOKIE_FILE) if needed

---

## Post v1.0 ideas (future)

- ERWIN_BASE_URL support for more robust proxy deployments
- More resilient player telemetry (playback error reporting, buffering info)
- Fine-grained permissions (only if the team needs it)
