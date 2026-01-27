# Erwin MVP Product Spec

## Product framing

Erwin is a self-hosted, Dockerized web application that serves as a long-term Twitch chatbot platform. The MVP ships as a music player + playlist curation + chat-driven voting system.

## Core requirements (MVP)

### Must-haves

- Curated playlists stored on the server.
- Create/edit/delete playlists.
- Add/remove/reorder tracks.
- Store tracks as YouTube IDs/URLs.
- Persist metadata (title, duration, channel, thumbnail) via background fetch while downloading audio to MP3.
- Fully automated voting in chat.
  - Erwin posts a “Vote next song” message with 2–5 random options (configurable, default 5).
  - Viewers vote with `!vote 1` … `!vote 5`.
  - One vote per user per round (last vote counts).
  - Tie-break randomly among top options.
  - If no votes, pick a random option.
  - Winning track is queued as next automatically.
- Web-based music player.
  - Plays current track + queued next tracks.
  - Autoplay continuous playback.
  - Dedicated “stream player” view for OBS.
- OBS integration guidance: exclude music from Twitch VOD.
  - Music should be capturable as its own OBS audio source.
- Authorization: login required for dashboard and team listening pages (unless a listener link is enabled later).
- Tabbed UI:
  - Music Player
  - Playlist Editor
  - Live Chat Feed
  - Settings

### Strong should-haves

- Team can manage queue/playlists from any device (browser).
- Basic mod/admin chat commands: `!skip`, `!pause`, `!resume`, `!song`.
- Audit log for admin actions.

## UX layout (tabs)

### Tab 1: Music Player

- Current track display (title, channel, remaining time).
- “Next up” queue.
- Voting panel:
  - Active vote options (1–5).
  - Live vote counts (optional).
  - Vote status + countdown timer.
- Admin controls (permission gated):
  - Start/stop playback session.
  - Skip track.
  - Force next from queue.
  - Enable/disable voting.
- “Now playing” shareable text for overlays (`/overlay/nowplaying`).

### Tab 2: Playlist Editor

- Playlist list (create, rename, delete).
- Track list per playlist:
  - add by YouTube URL or ID.
  - remove.
  - reorder (drag/drop or button-based controls).
  - disable/blacklist track.
- Import/export:
  - import by pasting a YouTube playlist URL or single track URL.
  - export via the playlist data in the API/database (UI can be added later).

### Tab 3: Live Chat Feed

- Real-time chat messages.
- Highlight Erwin actions (vote start/end, winner).
- Optional MVP:
  - show detected commands.
  - show who voted for what (admin only).

### Tab 4: Settings

- Twitch bot connection status.
- Voting settings:
  - number of options (2–5).
  - vote duration seconds.
  - how early to start vote before song ends.
  - cooldown between votes (optional).
- Playlist selection:
  - active playlist(s).
  - repeat avoidance window (don’t repeat last N songs).
- Permissions:
  - roles.
  - which commands are mod-only/admin-only.

## Audio capture requirement (split music from normal browser audio)

### Target behavior

Music audio should come from a dedicated source that OBS can route to Track 1 only (live), and exclude from Track 2 (VOD).

### Recommended MVP approach

- Add Erwin’s Music Player page as an OBS Browser Source with “Control audio via OBS” enabled.
- Open the rest of the dashboard (playlist editor/chat/settings) in a normal browser and do not capture it.
- In OBS Advanced Audio Properties, route the Erwin Browser Source to Track 1 only.

### Optional later upgrade

Add a “silent dashboard mode” toggle where the dashboard never plays audio even if a track is running.

## System architecture

### High-level components

- **Backend (Orchestrator + Bot)**
  - Maintains playlists and tracks, queue, playback state, vote rounds, and votes.
  - Connects to Twitch chat via IRC to read commands and post messages.
  - Provides REST + WebSocket API to frontend clients.
- **Frontend (Web App)**
  - Single Page App with tabs.
  - Real-time updates via WebSocket.
  - Player view variants:
    - `/player/stream` (OBS browser source, audio on)
    - `/player/listen` (team listening, audio on)
    - `/dashboard` (tabs, audio off by default)
- **Database**
  - Postgres recommended (multi-user, stable in Docker).
  - SQLite acceptable for earliest MVP but less ideal for concurrency.
- **Optional: Redis**
  - Not required for MVP.
  - Useful later for rate limiting and ephemeral vote state.

## Twitch integration (chat commands)

### Connection

- Twitch IRC for chat read/write.
- Bot uses OAuth token stored in env.

### Commands (MVP)

- Viewer: `!vote 1..5`
- Everyone: `!song` → “Now playing: …”
- Mods/Admin: `!skip`, `!pause`, `!resume`
- Optional: `!votes` for standings

### Permissions

- Role system: Admin, Mod, Viewer.
- Mods can skip/pause/resume; Admin can also change settings via dashboard.
- Command prefix configurable (`!` default).

## Voting & queue logic

### Random selection rules

When starting a vote round, candidate tracks are selected from the active playlist using:

- Exclude:
  - current track
  - already queued “next” track(s)
  - blacklisted/disabled tracks
  - recently played window (last N songs)
- If not enough candidates, relax “recently played” constraint (never include disabled tracks).

### Timing

- Start vote when remaining time <= `voteLeadSeconds`.
- Vote lasts `voteDurationSeconds`.
- Winner is enqueued as “next” using priority:
  - If a track is already queued next by admin, winner is queued after it (configurable).

### Edge cases

- If track ends before vote completes, keep playing backup/random until vote ends.
- If audio playback fails, auto-skip and mark track as “failed”; optionally auto-disable after X fails.

## Web player design

### Playback engine

- Download YouTube audio to MP3 files for playback.
- Player runs “audio-first” using the downloaded audio.
- Player reports state to backend:
  - loaded
  - playing
  - currentTime
  - error events

### Sync model (MVP)

- Only one “authoritative” player: the Stream Player (OBS source).
- Team listeners “follow along” by loading the same track and seeking when backend state updates.
- Backend state fields:
  - `currentTrackId`
  - `startedAtEpochMs`
  - `paused`
  - `seekOffsetMs` (if needed)

## Authorization & access control

### Requirements

- Random users must not access the app.
- Team members can log in from Windows/Linux browsers.

### MVP auth options

- **Option A (fastest)**: Local accounts
  - Username/password stored in DB (bcrypt).
  - Session cookie (HttpOnly).
  - Role assigned per account.
- **Option B (clean for team)**: Invite links
  - Admin generates a time-limited invite token.
  - User sets password on first login.

### WebSocket auth

WebSocket connections must require a valid session token/cookie.

## Data model (suggested)

- `users(id, username, password_hash, role, created_at)`
- `playlists(id, name, created_at, updated_at)`
- `tracks(id, youtube_id, url, title, duration_sec, channel, thumbnail, disabled, fail_count, created_at)`
- `playlist_tracks(playlist_id, track_id, position)`
- `play_state(id=1, current_track_id, started_at_ms, paused, updated_at)`
- `queue(id, track_id, source, added_by_user_id, created_at)`
- `vote_rounds(id, started_at, ends_at, options_json, winner_track_id)`
- `votes(vote_round_id, user_twitch_name, option_index, updated_at)`
- `settings(key, value)`

## API surface (MVP)

### REST

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/state`
- `POST /api/session/start`
- `POST /api/session/stop`
- `POST /api/queue/skip`
- `POST /api/queue/enqueue` (admin)
- `GET /api/playlists`
- `POST /api/playlists`
- `PUT /api/playlists/:id`
- `DELETE /api/playlists/:id`
- `POST /api/playlists/:id/import`
- `POST /api/tracks` (add single)
- `PUT /api/tracks/:id/disable`
- `PUT /api/settings`

### WebSocket events

Server → client:

- `STATE_UPDATE`
- `QUEUE_UPDATE`
- `VOTE_START`
- `VOTE_UPDATE`
- `VOTE_END`
- `CHAT_MESSAGE` (for live feed)

Client → server:

- `PLAYER_HEARTBEAT` (player currentTime)
- `ADMIN_ACTION` (optional if dashboard uses WS)

## Docker requirements

### Deliverables

- `docker-compose.yml`
- `.env.example`
- Persistent volumes for:
  - database
  - app data (optional)

### Environment variables

- `ERWIN_BASE_URL`
- `DB_URL`
- `SESSION_SECRET`
- `TWITCH_BOT_USERNAME`
- `TWITCH_OAUTH_TOKEN`
- `TWITCH_CHANNEL`

## Extensibility (Erwin as “main bot” later)

Future phases can break the backend into domain-focused modules once the MVP is stable.

## Acceptance criteria (MVP)

- Admin can create playlist, import 50+ YouTube links, reorder tracks, disable a track.
- Starting session begins playback in `/player/stream`.
- Erwin posts vote options in Twitch chat automatically near track end.
- Chat `!vote` decides next track (up to 5 options).
- Stream continues with no manual intervention for 60+ minutes.
- OBS captures music as a separate source and it can be excluded from VOD track using Track routing.
- Unauthorized users cannot access dashboard/player without login.
