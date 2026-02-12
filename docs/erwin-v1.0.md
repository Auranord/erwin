# Erwin v1.0

## MVP Overview
Erwin is a self-hosted Node.js + Express music controller for livestreams.

- SQLite is the database (single-instance writer model).
- Authentication is required for dashboard, player, and protected API access.
- `/player/stream` is the only player page. OBS should capture browser audio from this page.
- Playback sync is timestamp-based using `started_at_ms` and `paused_at_ms` from server state.
- Queue entries include `added_by_user_id` for manual enqueues.
- No “recently played” feature in v1.0.
- `ERWIN_BASE_URL` is reserved for future work and not used in v1.0 behavior.

## Routes

### UI
- `GET /login` – login page.
- `GET /dashboard` – authenticated dashboard.
- `GET /player/stream` – authenticated stream player view for OBS/browser playback.

### Auth and identity
- `POST /api/auth/login` – login and create session.
- `POST /api/auth/logout` – logout and destroy session.
- `GET /api/me` – authenticated user identity `{ id, username, isAdmin }`.

### User management (admin-only)
- `GET /api/users` – list users as `{ id, username, created_at, isAdmin }`.
- `POST /api/users` – create a user with `{ username, password }`.
  - username: required, trimmed, 3-64 chars.
  - password: required, minimum 8 chars.
  - duplicate username: returns `409`.

### Playback / queue / content APIs (authenticated for all users)
All authenticated users can control playback and manage content:

- Session controls (`/api/session/*`)
- Queue controls (`/api/queue/*`)
- Pool (`/api/pool/*`)
- Playlists and playlist tracks (`/api/playlists*`)
- Tracks (`/api/tracks*`)
- Settings (`PUT /api/settings`, `GET /api/settings`)
- Voting (`/api/votes/start`, `/api/votes/active`)
- Downloads (`/api/downloads`, `POST /api/downloads/clear`)

### Health
- `GET /health`
- `GET /ready`
- `GET /api/health`

## Permissions model
- Every protected route requires authentication.
- Feature permissions are not role-sliced in v1.0; all authenticated users can use playback/content features.
- Admin-only access is limited to account management endpoints (`/api/users`).
- Existing `role` data is still used only for “is admin” checks.

## Queue attribution
Queue rows include `added_by_user_id`.

- Manual enqueue (`POST /api/queue/enqueue`) stores `req.session.user.id`.
- Automatic/system enqueue paths store `NULL` (e.g. vote/pool/system-driven flows).

## WebSocket security
- WebSocket endpoint is `/ws`.
- Upgrade requests must include a valid logged-in session.
- If no authenticated session exists, server responds `401 Unauthorized` and closes the socket.
- Existing broadcast event model is unchanged.

## Dashboard user management UI
- The dashboard Settings tab includes a Users section.
- UI calls `/api/me` to determine admin status.
- Admin users can list existing users and create new users.
- Non-admin users receive a “Not permitted” state for this section.

## Environment variables
Primary runtime variables used by v1.0 include:
- `PORT`
- `SESSION_SECRET`
- `DB_URL`
- `ERWIN_AUDIO_DIR`
- `ERWIN_ADMIN_USER`
- `ERWIN_ADMIN_PASSWORD`
- yt-dlp/Twitch related variables already used in server configuration

`ERWIN_BASE_URL` remains reserved for future releases.
