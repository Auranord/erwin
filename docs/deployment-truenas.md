# TrueNAS SCALE deployment workflow

This guide outlines a safe, repeatable way to deploy Erwin on TrueNAS SCALE
25.04.2.4 while development continues. It focuses on data consistency, updates,
and operational practices.

## Recommended deployment topology

- **Single instance**: Erwin uses SQLite by default, which is best suited to a
  single writer. Avoid multiple replicas unless you migrate to Postgres.
- **Dedicated dataset**: Create a dataset (for example `apps/erwin`) and mount it
  into the container at `/app/data`. This directory stores the SQLite database,
  audio cache, and cookies.
- **Snapshots**: Schedule ZFS snapshots on the dataset to capture consistent
  point-in-time backups of the database and state.

## TrueNAS app configuration

### Storage

Mount the dataset into the container at `/app/data`:

```
/mnt/tank/apps/erwin -> /app/data
```

This matches defaults such as `DB_URL=./data/erwin.sqlite` and
`ERWIN_YTDL_COOKIE_FILE=/app/data/youtube.cookie`.

### App settings (environment variables)

Map the `.env.example` values into TrueNAS App settings:

| Setting | Suggested value |
| --- | --- |
| `ERWIN_BASE_URL` | `https://erwin.yourdomain.tld` |
| `DB_URL` | `./data/erwin.sqlite` |
| `SESSION_SECRET` | Strong random string |
| `TWITCH_BOT_USERNAME` | Bot username |
| `TWITCH_OAUTH_TOKEN` | `oauth:...` |
| `TWITCH_CHANNEL` | Channel to join |
| `TWITCH_IRC_HOST` | Twitch IRC host |
| `ERWIN_ADMIN_USER` | Seed admin user |
| `ERWIN_ADMIN_PASSWORD` | Seed admin password |
| `ERWIN_YTDL_COOKIE_FILE` | `/app/data/youtube.cookie` |
| `ERWIN_YTDL_COOKIE` | Optional cookie header |

Store sensitive values in the TrueNAS secrets UI so they are not in plain text.

### Docker Compose example (TrueNAS-friendly)

If you deploy via Docker Compose, keep settings inline and drive them via `.env`
substitution:

```yaml
services:
  erwin:
    image: ghcr.io/auranord/erwin:main
    restart: unless-stopped
    init: true
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      TZ: ${TZ:-UTC}
      ERWIN_BASE_URL: ${ERWIN_BASE_URL:-https://erwin.yourdomain.tld}
      DB_URL: ${DB_URL:-/app/data/erwin.sqlite}
      SESSION_SECRET: ${SESSION_SECRET:-CHANGE_ME_LONG_RANDOM}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      TWITCH_BOT_USERNAME: ${TWITCH_BOT_USERNAME:-your_bot}
      TWITCH_OAUTH_TOKEN: ${TWITCH_OAUTH_TOKEN:-oauth:token}
      TWITCH_CHANNEL: ${TWITCH_CHANNEL:-channel}
      TWITCH_IRC_HOST: ${TWITCH_IRC_HOST:-raw-1.us-west-2.prod.twitchircedge.twitch.a2z.com}
      ERWIN_ADMIN_USER: ${ERWIN_ADMIN_USER:-admin}
      ERWIN_ADMIN_PASSWORD: ${ERWIN_ADMIN_PASSWORD:-CHANGE_ME}
      ERWIN_YTDL_COOKIE_FILE: ${ERWIN_YTDL_COOKIE_FILE:-/app/data/youtube.cookie}
      ERWIN_DOWNLOAD_CONCURRENCY: ${ERWIN_DOWNLOAD_CONCURRENCY:-1}
      ERWIN_AUDIO_RETENTION_DAYS: ${ERWIN_AUDIO_RETENTION_DAYS:-7}
      ERWIN_AUDIO_RETENTION_MAX_GB: ${ERWIN_AUDIO_RETENTION_MAX_GB:-5}
    volumes:
      - /mnt/<POOL>/apps/erwin/data:/app/data
```

## Operational readiness features

### Logs

Erwin logs to stdout/stderr as JSON. Use the TrueNAS Apps UI (or Docker logs) to
inspect output.

Recommended settings:

- `LOG_LEVEL=info` or `LOG_LEVEL=debug` during troubleshooting.
- Avoid logging secrets (tokens and cookies).

### Healthchecks

Erwin exposes:

- `GET /health` for liveness
- `GET /ready` for readiness (DB reachable and Twitch bot connected when enabled)

Wire the compose healthcheck to `/health` as a lightweight liveness probe.

### Graceful shutdown

The server listens for SIGTERM/SIGINT. When TrueNAS restarts the container it:

- Stops new HTTP requests.
- Closes the Twitch socket.
- Flushes background intervals.
- Shuts down the database cleanly.

## Resource guardrails

To avoid runaway growth:

- `ERWIN_DOWNLOAD_CONCURRENCY` controls how many downloads run at once.
- `ERWIN_AUDIO_RETENTION_DAYS` evicts cached audio after N days.
- `ERWIN_AUDIO_RETENTION_MAX_GB` caps the audio cache size (oldest files removed first).

Set these as TrueNAS app settings to keep the dataset under control.

## Update workflow (recommended)

### 1) Build and publish versioned images

Adopt a tagging strategy like:

```
ghcr.io/your-org/erwin:1.2.0
ghcr.io/your-org/erwin:1.2
ghcr.io/your-org/erwin:latest
```

### 2) Use an "update slot"

TrueNAS apps support upgrades. When updating:

1. Snapshot the dataset.
2. Deploy the new image tag.
3. Validate that the UI and playback endpoints load.
4. Keep the previous version available for rollback.

### 3) Automate updates safely

Recommended automation steps:

- CI builds the Docker image and publishes it with a semver tag.
- Use `latest` only for staging or internal testing, not production.
- For production, update the image tag only after validation.
- Consider a weekly/monthly "maintenance window" for upgrades.

## Data consistency guardrails

- Keep SQLite on a local ZFS dataset (no NFS/SMB mount).
- Avoid running multiple app replicas.
- Snapshot before upgrades and before large playlist imports.
- If you need concurrency or HA, plan a future migration to Postgres.

## Suggested changes to the repo

If you want a stronger TrueNAS workflow, consider:

1. Adding a `docker-compose.prod.yml` without the `develop.watch` section.
2. Publishing a versioned image to a registry from CI.
3. Adding a healthcheck to the Dockerfile or compose definition.

These changes are not required for initial deployment, but they help with
reliability and automation.
