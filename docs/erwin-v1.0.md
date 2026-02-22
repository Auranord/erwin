# Erwin v1.0

## MVP Overview
Erwin is a self-hosted Node.js + Express music controller for livestreams.

- SQLite is the database (single-instance writer model).
- Authentication is required for dashboard, player, and protected API access.
- `/player/stream` is the only player page. OBS should capture browser audio from this page.
- Playback sync is timestamp-based using `started_at_ms` and `paused_at_ms` from server state.
- Queue entries include `added_by_user_id`.
- No “recently played” feature in v1.0.
- `ERWIN_BASE_URL` is reserved for future work and not used in runtime behavior.

## Routes

### UI
- `GET /login`
- `GET /dashboard`
- `GET /player/stream`

### Auth and identity
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me` → `{ id, username, isAdmin }`

### User management (admin-only)
- `GET /api/users` → list users as `{ id, username, created_at, isAdmin }`
- `POST /api/users` with `{ "username": "...", "password": "..." }`
  - username required, trimmed, length 3-64
  - password required, minimum length 8
  - duplicate username returns `409`

## Request body shapes (v1.0)

### Playlist structure import
- Endpoint: `POST /api/playlists/import-json`
- Body: `{ "name": "...", "tracks": [{ "track_id": "...", "position": 1, "disabled": false }], "mode": "append|replace", "playlistId": "optional" }`
- Only existing library tracks are attached by `track_id`; playlist import never creates or mutates library tracks.
- Response includes explicit counters and diagnostics: `{ added, skipped, missingTrackIds, errors }`.

### Source ingest
- Endpoint: `POST /api/library/tracks` (single URL)
- Optional bulk endpoint: `POST /api/library/tracks/ingest` with `{ "urls": ["..."], "playlistId": "optional" }`.
- Playlist-scoped source ingest endpoint is explicit: `POST /api/playlists/:id/import-sources`.
- Deprecated endpoint: `POST /api/playlists/:id/import` returns `410`.

### Queue enqueue
- Endpoint: `POST /api/queue/enqueue`
- Body: `{ "trackId": "...", "source": "manual" }` (`source` optional)
- Enqueue requires audio availability only (`download_status='ready'` and `audio_path` present).

### Pool enqueue
- Endpoint: `POST /api/pool/enqueue`
- Body: `{ "trackId": "..." }`
- Enqueue to queue requires audio availability only (`download_status='ready'` and `audio_path` present).

## Permissions model
- Every protected route requires authentication.
- Feature permissions are not role-sliced in v1.0; all authenticated users can use playback/content features:
  - `/api/session/*`, `/api/queue/*`, `/api/pool/*`, `/api/playlists*`, `/api/tracks*`, `/api/settings`, `/api/votes/*`, `/api/downloads/*`, `/api/twitch/custom-commands*`
- Admin-only access is limited to account management endpoints (`/api/users`).
- Existing `role` data is used only for admin checks.

## Queue attribution (`added_by_user_id`)
- Manual user actions store the authenticated user id:
  - `POST /api/queue/enqueue`
  - `POST /api/pool/enqueue`
- System actions store `NULL` (for example vote winner enqueue).

## Disabled and unplayable tracks behavior
- A track is **audio-playable** when:
  - `download_status = 'ready'`
  - `audio_path` is not null
- Playlist-scoped disabled tracks can still be:
  - added to pool
  - manually enqueued
  - used for vote options
  - selected from pool/queue for playback if audio-playable
- Disabled is scoped to `playlist_id + track_id` via `playlist_tracks.disabled` (updated with `PUT /api/playlists/:playlistId/tracks/:trackId/disable`).
- Disabled is only enforced when starting playback from a playlist (`POST /api/playlists/:id/play`): disabled playlist-track rows are excluded from that seed set.
- Deprecated global-disable endpoints `PUT /api/library/tracks/:id/disable` and `PUT /api/tracks/:id/disable` were removed.
- Legacy `tracks.disabled` should be ignored by runtime logic and can be dropped in a controlled DB migration.
- Queue advancement removes only audio-unavailable entries so playback does not stall.
- If too few audio-playable pool tracks exist for a vote, vote start returns a clear error.

## WebSocket security
- WebSocket endpoint is `/ws`.
- Upgrade requests must include a valid logged-in session.
- Unauthenticated upgrade requests get `401 Unauthorized` and are closed.
- Existing event broadcasts are unchanged.

## Environment variables
Primary runtime variables include:
- `PORT`
- `SESSION_SECRET`
- `DB_URL`
- `ERWIN_AUDIO_DIR`
- `ERWIN_ADMIN_USER`
- `ERWIN_ADMIN_PASSWORD`
- yt-dlp/Twitch variables already used in server configuration

`ERWIN_BASE_URL` remains reserved for future releases.

## Twitch custom commands
- Dashboard includes a dedicated **Custom Commands** tab.
- Operators can create, edit, enable/disable, and delete commands and aliases.
- Custom commands are persisted in `twitch_custom_commands` and executed after built-in command checks.
- Response templates support `{user}`, `{channel}`, `{track}`, and `{command}` placeholders.
