# Erwin

Erwin is a self-hosted Twitch-integrated music dashboard with playlist management, queue control, and chat-driven voting.

## Authentication model

Erwin now uses **Twitch OAuth only** for dashboard access.

- Login flow: `GET /auth/twitch`
- Admin broadcaster connect flow: `GET /auth/twitch/channel`
- Shared callback: `GET /auth/twitch/callback`

OAuth callback errors are redirected to `/login?error=<code>`.

## Environment variables

### Required for Twitch login

- `PUBLIC_BASE_URL` (recommended; used for callback URL resolution)
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_CHANNEL`

### Optional Twitch auth/role variables

- `TWITCH_REDIRECT_URI` (explicit callback URI override)
- `TWITCH_ADMINS` (comma-separated Twitch logins and/or IDs)
- `TWITCH_CHANNEL_MEMBERS` (comma-separated Twitch logins and/or IDs)
- `TWITCH_CHANNEL_MEMBERS_ROLE` (default: `channel_member`)

### Existing Twitch bot variables

- `TWITCH_BOT_USERNAME`
- `TWITCH_OAUTH_TOKEN`
- `TWITCH_REFRESH_TOKEN`
- `TWITCH_IRC_HOST`
- `TWITCH_COMMAND_PREFIX`

### App/runtime variables

- `SESSION_SECRET`
- `DB_URL`
- `LOG_LEVEL`
- `PORT`

### Meta / Instagram OAuth variables

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` (optional callback override for `/auth/meta/callback`)

### yt-dlp / download variables

- `ERWIN_YTDL_COOKIE_FILE`
- `ERWIN_YTDL_COOKIE`
- `ERWIN_YTDL_JS_RUNTIME`
- `ERWIN_YTDL_REMOTE_COMPONENTS`
- `ERWIN_YTDL_FFMPEG_LOCATION`
- `ERWIN_DOWNLOAD_CONCURRENCY`

### Audio retention variables

- `ERWIN_AUDIO_RETENTION_DAYS`
- `ERWIN_AUDIO_RETENTION_MAX_GB`

### Notification assets

- `ERWIN_NOTIFICATION_UPLOAD_DIR` (default: `/app/data`)

## Roles

Resolved in this order:

1. `admin` (from `TWITCH_ADMINS`)
2. `channel_member` (from `TWITCH_CHANNEL_MEMBERS`)
3. `mod` (Twitch moderator lookup)
4. `vip` (Twitch VIP lookup)
5. `viewer` (default)

`admin` has full access. `channel_member` has broad dashboard access. `mod`/`vip`/`viewer` are currently routed to `/dashboard/public`.

## OAuth callback troubleshooting (`/login?error=...`)

- `invalid_oauth_state`: session/state mismatch; restart login from `/login`.
- `missing_oauth_code`: Twitch callback missing `code`.
- `token_exchange_failed`: token exchange with Twitch failed.
- `twitch_user_fetch_failed`: Twitch user lookup failed.
- `channel_scope_missing`: broadcaster connect flow missing required scopes.
- `db_schema_compat_error`: DB schema missing Twitch-compatible user columns.
- `twitch_login_failed`: fallback generic login failure.

## Local quickstart

```bash
npm install
npm start
```

Open `http://localhost:3000/login` and click **Login with Twitch**.
