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

1. Copy `.env.example` to `.env` and adjust credentials.
2. Install dependencies and start the server:
   ```bash
   npm install
   npm start
   ```
3. Visit `http://localhost:3000/login` and use the seeded admin credentials.

## Docker (local)

```bash
cp .env.example .env
docker compose up --build
```

## License

TBD.
