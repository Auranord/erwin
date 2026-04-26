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

### Optional Twitch auth variable

- `TWITCH_REDIRECT_URI` (explicit callback URI override)
- `TWITCH_BOOTSTRAP_ADMIN` (single Twitch login or Twitch ID that is forced to `admin`)

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

- `ERWIN_NOTIFICATION_UPLOAD_DIR` (default: `/app/data/assets/uploads/notifications`)

## Roles

Users are only created through Twitch OAuth login.

Default role behavior:

1. If Twitch login/ID matches `TWITCH_BOOTSTRAP_ADMIN`, role is `admin`.
2. Otherwise, new users default to `viewer`.
3. Existing users keep their role from the DB and are managed in the dashboard admin panel.

`admin` has full access. `channel_member` can access dashboard + user management and can assign only `viewer`, `mods`, and `guest`. New `mods` and `guest` roles currently have no additional privileges.

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
