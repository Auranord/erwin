# Erwin

Erwin is a self-hosted, Dockerized web application that serves as a long-term Twitch chatbot platform. The MVP ships with a music player, playlist curation tools, and a chat-driven voting system.

## MVP scope

- Curated playlists stored on the server with create/edit/delete flows.
- Tracks stored as YouTube IDs/URLs, with metadata fetched asynchronously and audio downloaded to MP3 for playback.
- Automated vote rounds in Twitch chat to pick the next song.
- Web-based music player with continuous playback and queue.
- Authentication required for dashboard and listening pages.
- OBS-friendly player view for separating music audio from VOD audio.

See the detailed product framing and acceptance criteria in [docs/mvp-spec.md](docs/mvp-spec.md).

For a wide architecture overview and a delivery plan, see [docs/architecture-plan.md](docs/architecture-plan.md).

For deployment guidance on TrueNAS SCALE, including update workflows, see
[docs/deployment-truenas.md](docs/deployment-truenas.md).

## Architecture (planned)

- **Backend**: Orchestrator + Twitch bot (IRC), REST + WebSocket APIs.
- **Frontend**: SPA dashboard and dedicated player views.
- **Database**: Postgres (SQLite acceptable for earliest MVP).

## Views

- `/player/stream` (OBS browser source, audio on)
- `/player/listen` (team listening, audio on)
- `/dashboard` (tabs, audio off by default)

## OBS audio split (recommended MVP approach)

1. Add the Erwin `/player/stream` page as an OBS **Browser Source**.
2. Enable **Control audio via OBS** on that source.
3. In **Advanced Audio Properties**, route the browser source to Track 1 only (live), and exclude it from the VOD track.

## Next steps

- Implement the MVP data model and API surface described in the spec.
- Add Docker Compose, `.env.example`, and persistent volumes.
- Build the tabbed dashboard and the stream player view.

## Quickstart (local)

1. Use Node.js LTS (20 or 22). This project depends on native SQLite bindings.
2. Copy `.env.example` to `.env` and adjust credentials.
3. Install `yt-dlp` and `ffmpeg` so the download worker can fetch and transcode audio (both must be in your `PATH`).
4. Install dependencies and start the server:
   ```bash
   npm install
   npm start
   ```
5. Visit `http://localhost:3000/login` and use the seeded admin credentials.

## Docker (local)

```bash
cp .env.example .env
docker compose up --build
```

Docker Compose reads `.env` for variable substitution in `docker-compose.yml`.

### Docker watch (optional)

Use Compose file watch to sync changes without opening another terminal:

```bash
docker compose watch
```

## Logs

- Docker: `docker compose logs -f erwin`
- Set `LOG_LEVEL=debug` for verbose output.

## YouTube download troubleshooting

Downloads use `yt-dlp`. Some videos require authenticated requests to download. If downloads fail with 403 errors, provide cookies:

1. Export your YouTube cookies to a Netscape-format text file (recommended).
   - JSON exports are also accepted and will be converted automatically at runtime.
2. Set either:
   - `ERWIN_YTDL_COOKIE_FILE=/app/data/youtube.cookie` (recommended with Docker volume mount)
   - or `ERWIN_YTDL_COOKIE=YOUR_COOKIE_HEADER_VALUE`

If you see errors about a missing JavaScript runtime or `ffprobe`/`ffmpeg`, ensure `node` and `ffmpeg` are installed and available. You can override detection with:

- `ERWIN_YTDL_JS_RUNTIME=node:/path/to/node`
- `ERWIN_YTDL_FFMPEG_LOCATION=/path/to/ffmpeg`

Recent YouTube downloads may require yt-dlp's remote component solver. Erwin enables it by default. You can override with:

- `ERWIN_YTDL_REMOTE_COMPONENTS=ejs:github` (default)
- Set `ERWIN_YTDL_REMOTE_COMPONENTS=` to disable remote components.

If you see errors like `Error solving challenge requests`, `Signature solving failed`, or `Only images are available`, try the following:

1. Update to the latest `yt-dlp` release (Docker users should rebuild the image).
2. Ensure `node` is available (Node 18+ recommended), or set `ERWIN_YTDL_JS_RUNTIME=node:/path/to/node`.
3. Clear the `yt-dlp` cache: `yt-dlp --rm-cache-dir`.
4. Re-enable remote components explicitly: `ERWIN_YTDL_REMOTE_COMPONENTS=ejs:github`.

## License

TBD.
