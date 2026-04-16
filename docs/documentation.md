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
- Twitch voting (auto vote option near track end), chat integration, and customizable chat commands
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
- Dedicated custom commands tab for Twitch bot automation
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

### Playlist-track disable semantics

- Disable state is scoped to a playlist-track pair (`playlist_tracks.disabled`), not a global track flag.
- Update disable via `PUT /api/playlists/:playlistId/tracks/:trackId/disable` with body `{ "disabled": true|false }`.
- Playlist play seeding (`POST /api/playlists/:id/play`) excludes rows where `playlist_tracks.disabled = 1`.
- Deprecated global disable endpoints (`PUT /api/library/tracks/:id/disable`, `PUT /api/tracks/:id/disable`) are removed.
- Legacy `tracks.disabled` is ignored by runtime behavior and should be dropped later in a controlled DB migration.


### Import domain boundaries

- Playlist structure I/O is handled by:
  - `GET /api/playlists/:id/export` (exports playlist-owned fields only: playlist metadata + `track_id`, `position`, `disabled`)
  - `POST /api/playlists/import-json` (attaches existing library tracks only by `track_id`; does not create/mutate library tracks)
- Library/source ingest is handled by:
  - `POST /api/library/tracks` (single URL ingest)
  - `POST /api/library/tracks/ingest` (bulk URL ingest; optional `playlistId`)
  - `POST /api/playlists/:id/import-sources` (explicit playlist source-ingest alias)
- Deprecated endpoint:
  - `POST /api/playlists/:id/import` returns `410 Gone`
- Structured results for import/ingest flows include:
  - `added`, `skipped`, `missingTrackIds`, `errors`

### Library import/export JSON schema and dry-run

- `GET /api/library/export` now includes a top-level `schema` object describing the strict export payload shape and allowed ranges.
- `POST /api/library/import-json` validates each row against a strict schema:
  - allowed fields per row: `id`, `title`, `volume_adjust_db`, `intro_sec`, `outro_sec`, `tags`
  - required: `id` plus at least one updatable field
  - ranges: `volume_adjust_db` `[-24, 24]`, `intro_sec` `[0, 86400]`, `outro_sec` `[0, 86400]`
  - `tags`: comma-separated string (`<=2048`) or array (`<=100` items, each `1..64` chars)
- Import response returns per-row outcomes with `status`:
  - `updated`: row valid and track exists (and would be applied)
  - `invalid`: row failed schema validation (`reason` provided)
  - `missing`: row valid but `id` not found
- Dry-run support:
  - query flag: `POST /api/library/import-json?dryRun=1`
  - payload flag: `{ "dryRun": true, "library": { "tracks": [...] } }`
  - dry-run validates and reports outcomes without mutating DB.

Minimal round-trip example for bulk rename/tag updates:

1) Export current library:

```bash
curl -sS -b cookie.txt http://localhost:3000/api/library/export > library-export.json
```

2) Build a minimal import file with selected updates:

```json
{
  "dryRun": true,
  "library": {
    "tracks": [
      {
        "id": "track_123",
        "title": "New Display Title",
        "tags": ["chill", "instrumental"]
      },
      {
        "id": "track_456",
        "tags": "retro, synthwave"
      }
    ]
  }
}
```

3) Preview changes (no write):

```bash
curl -sS -b cookie.txt -H 'Content-Type: application/json' \
  -X POST 'http://localhost:3000/api/library/import-json?dryRun=1' \
  --data @library-import-preview.json
```

4) Apply changes (remove dry-run flag):

```bash
curl -sS -b cookie.txt -H 'Content-Type: application/json' \
  -X POST 'http://localhost:3000/api/library/import-json' \
  --data @library-import-apply.json
```

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
- Execute custom commands managed from the dashboard

Built-in commands:
- `!vote <number>`
- `!song`
- `!skip` (moderator only)
- `!pause` (moderator only)
- `!resume` (moderator only)

Custom commands:
- Managed in the **Custom Commands** dashboard tab
- Each command supports:
  - a primary command (for example `dc` maps to `!dc`)
  - multiple aliases (`discord`, `disc`, etc.)
  - enabled/disabled state
  - response templates with placeholders: `{user}`, `{channel}`, `{track}`, `{command}`


### Twitch custom commands API

All routes require authentication.

- `GET /api/twitch/custom-commands`
  - Returns all custom command definitions.
- `POST /api/twitch/custom-commands`
  - Body: `{ command, aliases, response, enabled }`
  - `aliases` can be a comma-separated string or an array.
- `PUT /api/twitch/custom-commands/:commandId`
  - Partial update of command, aliases, response, or enabled state.
- `DELETE /api/twitch/custom-commands/:commandId`
  - Deletes a command definition.

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
- `ERWIN_NOTIFICATION_UPLOAD_DIR` (default `/app/data/assets/uploads/notifications`)

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


## Optional button icons (PNG)
UI buttons can load PNG icons from `public/icons/*.png`. If an icon file is missing, the UI automatically falls back to text/symbol icons.

Supported icon filenames:
- `play.png`
- `pause.png`
- `skip.png`
- `restart.png`
- `mute.png`
- `unmute.png`
- `enqueue.png`
- `poolAdd.png`
- `poolRemove.png`
- `rename.png`
- `disable.png`
- `enable.png`
- `delete.png`
- `download.png`
