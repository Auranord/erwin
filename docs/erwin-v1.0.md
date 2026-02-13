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

### Playlist import
- Endpoint: `POST /api/playlists/:id/import`
- Body: `{ "urls": ["..."] }`
- `urls` accepts YouTube video URLs/IDs and playlist URLs.
- Playlist URLs are expanded into track URLs before import.

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
  - `/api/session/*`, `/api/queue/*`, `/api/pool/*`, `/api/playlists*`, `/api/tracks*`, `/api/settings`, `/api/votes/*`, `/api/downloads/*`
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
- Disabled tracks can still be:
  - added to pool
  - manually enqueued
  - used for vote options
  - selected from pool/queue for playback if audio-playable
- Disabled is only enforced when starting playback from a playlist (`POST /api/playlists/:id/play`): disabled tracks are excluded from that seed set.
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
