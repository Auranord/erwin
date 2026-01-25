# Erwin Architecture & Delivery Plan

This document provides a wide (end-to-end) architecture view plus a phased plan to deliver a finished MVP aligned with `README.md` and `docs/mvp-spec.md`.

## Wide architecture overview

### Core domains

- **Playback & queue**: current track state, queue ordering, playback control, fail/skip handling.
- **Voting**: vote rounds, option generation, tallying, and selecting the winning track.
- **Playlists**: playlists, tracks, metadata enrichment, import/export, and track state (disabled/failed).
- **Chat orchestration**: Twitch IRC connection, command routing, and message output.
- **Auth & permissions**: local accounts, role-based access, and session security.

### System components

#### Backend (Erwin Orchestrator)

- **API layer**: REST for CRUD actions + WebSocket for live state and events.
- **Feature modules**:
  - `modules/music` (playlists, tracks, playback, queue)
  - `modules/voting` (vote rounds, options, tally)
  - `modules/chat` (Twitch IRC integration)
  - `modules/commands` (command router)
  - `modules/permissions` (role checks)
- **Scheduler**: triggers vote rounds based on playback time and configured thresholds.
- **Persistence**: Postgres (primary), background jobs for metadata enrichment.

#### Frontend (Web App)

- **SPA dashboard** with tabs: Music Player, Playlist Editor, Live Chat Feed, Settings.
- **Player views**:
  - `/player/stream` for OBS (audio on)
  - `/player/listen` for team listeners (audio on)
  - `/dashboard` for management (audio off by default)
- **WebSocket client** for real-time updates.
- **Player engine** using YouTube IFrame Player API for playback.

#### Twitch integration

- **IRC client**: connects using bot username + OAuth token.
- **Command parsing**: `!vote`, `!song`, `!skip`, `!pause`, `!resume`.
- **Permissions**: mod/admin gate for moderation commands.

#### Deployment

- **Docker Compose**: app + database, persistent volumes.
- **Configuration**: environment variables for Twitch, database, and app settings.
- **Reverse proxy** (optional): HTTPS and routing.

## Runtime flow (high level)

1. **Playback session starts** from the dashboard → backend sets play state + player loads track.
2. **Scheduler** monitors remaining time → starts vote round with options.
3. **Twitch chat** receives vote message → users vote via `!vote`.
4. **Vote round ends** → backend enqueues winning track.
5. **Player completes track** → backend advances queue, updates state, repeats.

## Delivery plan (MVP)

### Phase 0: Foundations

- Establish repository structure for backend + frontend.
- Add Docker Compose + `.env.example`.
- Choose stack (e.g., Node/TypeScript or Go for backend; React/Vite for frontend).
- Define API contracts and data model migrations.

### Phase 1: Core backend data model

- Implement tables: users, playlists, tracks, playlist_tracks, play_state, queue, vote_rounds, votes, settings.
- Add CRUD endpoints for playlists and tracks.
- Add metadata enrichment job (YouTube oEmbed / API fallback).

### Phase 2: Playback + queue engine

- Implement playback session start/stop and queue progression.
- Add YouTube player state sync via WebSocket heartbeat.
- Basic error handling (auto-skip, fail count).

### Phase 3: Voting system

- Implement vote round scheduling (lead time + duration).
- Generate candidate options with exclusion rules.
- Record votes and compute winner with tie-break logic.
- Enqueue winner after vote end.

### Phase 4: Twitch bot integration

- Connect to Twitch IRC and emit vote prompts.
- Parse commands and enforce permissions.
- Broadcast state changes to the dashboard.

### Phase 5: Frontend UI

- Build dashboard tabs with live updates.
- Playlist editor with import/export + drag/drop ordering.
- Voting panel with countdown and option list.
- Chat feed with Erwin action highlights.

### Phase 6: Auth & permissions

- Implement local accounts + session cookies.
- Protect dashboard and listener pages.
- Add role-based guards for admin/mod actions.

### Phase 7: OBS-friendly player view

- Implement `/player/stream` view with audio on.
- Document OBS routing steps.
- Add `/player/listen` for team listening.

### Phase 8: Hardening & acceptance

- Run 60+ minute playback test.
- Validate voting under concurrent chat messages.
- Confirm OBS audio isolation using Browser Source settings.

## MVP acceptance checklist (summary)

- Create playlist, import 50+ URLs, reorder, disable tracks.
- Start playback in `/player/stream` with continuous queue.
- Automated vote rounds in Twitch chat near track end.
- `!vote` picks next track (2–5 options).
- Stream runs 60+ minutes without manual intervention.
- OBS captures music as separate source and excludes from VOD track.
- Unauthorized users cannot access dashboard/player.
