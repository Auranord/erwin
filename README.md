# Erwin

Erwin is a self-hosted, Dockerized web application that serves as a long-term Twitch chatbot platform. The MVP ships with a music player, playlist curation tools, and a chat-driven voting system. The architecture is modular so future chat features can be added as feature modules.

## MVP scope

- Curated playlists stored on the server with create/edit/delete flows.
- Tracks stored as YouTube IDs/URLs, with metadata fetched asynchronously.
- Automated vote rounds in Twitch chat to pick the next song.
- Web-based music player with continuous playback and queue.
- Authentication required for dashboard and listening pages.
- OBS-friendly player view for separating music audio from VOD audio.

See the detailed product framing and acceptance criteria in [docs/mvp-spec.md](docs/mvp-spec.md).

For a wide architecture overview and a delivery plan, see [docs/architecture-plan.md](docs/architecture-plan.md).

## Architecture (planned)

- **Backend**: Orchestrator + Twitch bot (IRC), REST + WebSocket APIs.
- **Frontend**: SPA dashboard and dedicated player views.
- **Database**: Postgres (SQLite acceptable for earliest MVP).
- **Modules**: `modules/music`, `modules/chat`, `modules/commands`, `modules/permissions`.

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
3. Install `yt-dlp` so the download worker can fetch audio (it must be in your `PATH`).
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

### Docker watch (optional)

Use Compose file watch to sync changes without opening another terminal:

```bash
docker compose watch
```

## Logs

- Docker: `docker compose logs -f erwin`
- Local file: `./data/logs/erwin.log`

## YouTube download troubleshooting

Downloads use `yt-dlp`. Some videos require authenticated requests to download. If downloads fail with 403 errors, provide cookies:

1. Export your YouTube cookies to a Netscape-format text file (recommended).
   - JSON exports are also accepted and will be converted automatically at runtime.
2. Set either:
   - `ERWIN_YTDL_COOKIE_FILE=/app/data/youtube.cookie` (recommended with Docker volume mount)
   - or `ERWIN_YTDL_COOKIE=YOUR_COOKIE_HEADER_VALUE`

## License

TBD.
