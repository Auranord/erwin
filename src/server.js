import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "erwin-dev-secret";
const DB_URL = process.env.DB_URL || "./data/erwin.sqlite";

const app = express();
const db = new Database(DB_URL);

app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

const wss = new WebSocketServer({ noServer: true });

function broadcast(event, payload) {
  const message = JSON.stringify({ event, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      youtube_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      duration_sec INTEGER,
      channel TEXT,
      thumbnail TEXT,
      disabled INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id),
      FOREIGN KEY (track_id) REFERENCES tracks(id)
    );

    CREATE TABLE IF NOT EXISTS play_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_track_id TEXT,
      started_at_ms INTEGER,
      paused INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      source TEXT NOT NULL,
      added_by_user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vote_rounds (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      options_json TEXT NOT NULL,
      winner_track_id TEXT
    );

    CREATE TABLE IF NOT EXISTS votes (
      vote_round_id TEXT NOT NULL,
      user_twitch_name TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (vote_round_id, user_twitch_name)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const existing = db.prepare("SELECT COUNT(*) as count FROM users").get();
  if (existing.count === 0) {
    const username = process.env.ERWIN_ADMIN_USER || "admin";
    const password = process.env.ERWIN_ADMIN_PASSWORD || "admin123";
    const password_hash = bcrypt.hashSync(password, 10);
    db.prepare(
      "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(nanoid(), username, password_hash, "admin", new Date().toISOString());
    console.log(
      `Seeded admin user: ${username}. Set ERWIN_ADMIN_USER/ERWIN_ADMIN_PASSWORD to change.`
    );
  }

  const state = db.prepare("SELECT id FROM play_state WHERE id = 1").get();
  if (!state) {
    db.prepare(
      "INSERT INTO play_state (id, current_track_id, started_at_ms, paused, updated_at) VALUES (1, NULL, NULL, 1, ?)"
    ).run(new Date().toISOString());
  }
}

initDb();

function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }
  if (req.accepts("html")) {
    return res.redirect("/login");
  }
  res.status(401).json({ error: "Unauthorized" });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session?.user && roles.includes(req.session.user.role)) {
      return next();
    }
    res.status(403).json({ error: "Forbidden" });
  };
}

function parseYouTubeId(input) {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "");
    }
    if (url.searchParams.get("v")) {
      return url.searchParams.get("v");
    }
    if (url.pathname.includes("/embed/")) {
      return url.pathname.split("/embed/")[1];
    }
  } catch {
    return null;
  }
  return null;
}

function normalizePlaylistPositions(playlistId) {
  const tracks = db
    .prepare(
      "SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC"
    )
    .all(playlistId);
  const update = db.prepare(
    "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?"
  );
  const transaction = db.transaction((rows) => {
    rows.forEach((row, index) => {
      update.run(index + 1, playlistId, row.track_id);
    });
  });
  transaction(tracks);
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const user = db
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ id: user.id, username: user.username, role: user.role });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/state", requireAuth, (req, res) => {
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  const queue = db
    .prepare(
      "SELECT queue.id, queue.track_id, queue.source, queue.created_at, tracks.title, tracks.channel FROM queue JOIN tracks ON tracks.id = queue.track_id ORDER BY queue.created_at ASC"
    )
    .all();
  res.json({ playState, queue });
});

app.post("/api/session/start", requireAuth, requireRole("admin", "mod"), (req, res) => {
  const { trackId } = req.body || {};
  const track = trackId
    ? db.prepare("SELECT id FROM tracks WHERE id = ?").get(trackId)
    : null;
  db.prepare(
    "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused = 0, updated_at = ? WHERE id = 1"
  ).run(track ? track.id : null, Date.now(), new Date().toISOString());
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  broadcast("STATE_UPDATE", { playState });
  res.json({ playState });
});

app.post("/api/session/stop", requireAuth, requireRole("admin", "mod"), (req, res) => {
  db.prepare(
    "UPDATE play_state SET current_track_id = NULL, started_at_ms = NULL, paused = 1, updated_at = ? WHERE id = 1"
  ).run(new Date().toISOString());
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  broadcast("STATE_UPDATE", { playState });
  res.json({ playState });
});

app.post("/api/queue/skip", requireAuth, requireRole("admin", "mod"), (req, res) => {
  const next = db
    .prepare(
      "SELECT queue.id, queue.track_id FROM queue ORDER BY queue.created_at ASC LIMIT 1"
    )
    .get();
  if (next) {
    db.prepare("DELETE FROM queue WHERE id = ?").run(next.id);
    db.prepare(
      "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused = 0, updated_at = ? WHERE id = 1"
    ).run(next.track_id, Date.now(), new Date().toISOString());
  }
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  const queue = db
    .prepare(
      "SELECT queue.id, queue.track_id, queue.source, queue.created_at, tracks.title, tracks.channel FROM queue JOIN tracks ON tracks.id = queue.track_id ORDER BY queue.created_at ASC"
    )
    .all();
  broadcast("STATE_UPDATE", { playState, queue });
  res.json({ playState, queue });
});

app.post("/api/queue/enqueue", requireAuth, requireRole("admin"), (req, res) => {
  const { trackId, source } = req.body || {};
  const track = db.prepare("SELECT id FROM tracks WHERE id = ?").get(trackId);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }
  const entry = {
    id: nanoid(),
    track_id: track.id,
    source: source || "admin",
    added_by_user_id: req.session.user.id,
    created_at: new Date().toISOString()
  };
  db.prepare(
    "INSERT INTO queue (id, track_id, source, added_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(entry.id, entry.track_id, entry.source, entry.added_by_user_id, entry.created_at);
  broadcast("QUEUE_UPDATE", { entry });
  res.json(entry);
});

app.get("/api/playlists", requireAuth, (req, res) => {
  const playlists = db.prepare("SELECT * FROM playlists ORDER BY created_at DESC").all();
  const playlistTracks = db
    .prepare(
      "SELECT playlist_tracks.playlist_id, tracks.id, tracks.title, tracks.youtube_id, tracks.url, tracks.disabled, playlist_tracks.position FROM playlist_tracks JOIN tracks ON tracks.id = playlist_tracks.track_id ORDER BY playlist_tracks.position ASC"
    )
    .all();
  const byPlaylist = playlistTracks.reduce((acc, row) => {
    acc[row.playlist_id] ||= [];
    acc[row.playlist_id].push(row);
    return acc;
  }, {});
  res.json(
    playlists.map((playlist) => ({
      ...playlist,
      tracks: byPlaylist[playlist.id] || []
    }))
  );
});

app.post("/api/playlists", requireAuth, requireRole("admin"), (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: "Playlist name required" });
  }
  const playlist = {
    id: nanoid(),
    name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.prepare(
    "INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run(playlist.id, playlist.name, playlist.created_at, playlist.updated_at);
  res.status(201).json(playlist);
});

app.put("/api/playlists/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: "Playlist name required" });
  }
  const updated_at = new Date().toISOString();
  const result = db
    .prepare("UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?")
    .run(name, updated_at, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  res.json({ id: req.params.id, name, updated_at });
});

app.delete("/api/playlists/:id", requireAuth, requireRole("admin"), (req, res) => {
  const result = db.prepare("DELETE FROM playlists WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/playlists/:id/import", requireAuth, requireRole("admin"), (req, res) => {
  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "URLs array required" });
  }
  const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  const currentPosition =
    db
      .prepare("SELECT MAX(position) as maxPosition FROM playlist_tracks WHERE playlist_id = ?")
      .get(req.params.id).maxPosition || 0;
  const insertTrack = db.prepare(
    "INSERT INTO tracks (id, youtube_id, url, title, duration_sec, channel, thumbnail, disabled, fail_count, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 0, 0, ?)"
  );
  const insertPlaylistTrack = db.prepare(
    "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
  );
  const now = new Date().toISOString();
  let position = currentPosition + 1;
  const imported = [];
  const transaction = db.transaction((items) => {
    for (const url of items) {
      const youtubeId = parseYouTubeId(url);
      if (!youtubeId) {
        continue;
      }
      const trackId = nanoid();
      insertTrack.run(trackId, youtubeId, url, now);
      insertPlaylistTrack.run(req.params.id, trackId, position++);
      imported.push({ id: trackId, youtubeId, url });
    }
  });
  transaction(urls);
  res.json({ importedCount: imported.length, imported });
});

app.post("/api/tracks", requireAuth, requireRole("admin"), (req, res) => {
  const { playlistId, url } = req.body || {};
  if (!playlistId || !url) {
    return res.status(400).json({ error: "playlistId and url required" });
  }
  const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(playlistId);
  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  const youtubeId = parseYouTubeId(url);
  if (!youtubeId) {
    return res.status(400).json({ error: "Invalid YouTube URL or ID" });
  }
  const trackId = nanoid();
  const now = new Date().toISOString();
  const position =
    (db
      .prepare("SELECT MAX(position) as maxPosition FROM playlist_tracks WHERE playlist_id = ?")
      .get(playlistId).maxPosition || 0) + 1;
  db.prepare(
    "INSERT INTO tracks (id, youtube_id, url, title, duration_sec, channel, thumbnail, disabled, fail_count, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 0, 0, ?)"
  ).run(trackId, youtubeId, url, now);
  db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)").run(
    playlistId,
    trackId,
    position
  );
  res.status(201).json({ id: trackId, youtubeId, url, position });
});

app.put("/api/tracks/:id/disable", requireAuth, requireRole("admin"), (req, res) => {
  const { disabled } = req.body || {};
  const value = disabled ? 1 : 0;
  const result = db
    .prepare("UPDATE tracks SET disabled = ? WHERE id = ?")
    .run(value, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Track not found" });
  }
  res.json({ id: req.params.id, disabled: Boolean(value) });
});

app.delete(
  "/api/playlists/:playlistId/tracks/:trackId",
  requireAuth,
  requireRole("admin"),
  (req, res) => {
    const result = db
      .prepare(
        "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?"
      )
      .run(req.params.playlistId, req.params.trackId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Track not found in playlist" });
    }
    normalizePlaylistPositions(req.params.playlistId);
    res.json({ ok: true });
  }
);

app.post(
  "/api/playlists/:playlistId/tracks/:trackId/move",
  requireAuth,
  requireRole("admin"),
  (req, res) => {
    const { direction } = req.body || {};
    if (!["up", "down"].includes(direction)) {
      return res.status(400).json({ error: "direction must be up or down" });
    }
    const current = db
      .prepare(
        "SELECT position FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?"
      )
      .get(req.params.playlistId, req.params.trackId);
    if (!current) {
      return res.status(404).json({ error: "Track not found in playlist" });
    }
    const targetPosition = direction === "up" ? current.position - 1 : current.position + 1;
    const target = db
      .prepare(
        "SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ? AND position = ?"
      )
      .get(req.params.playlistId, targetPosition);
    if (!target) {
      return res.json({ ok: true });
    }
    const swap = db.transaction(() => {
      db.prepare(
        "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?"
      ).run(target.position, req.params.playlistId, req.params.trackId);
      db.prepare(
        "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?"
      ).run(current.position, req.params.playlistId, target.track_id);
    });
    swap();
    res.json({ ok: true });
  }
);

app.put("/api/settings", requireAuth, requireRole("admin"), (req, res) => {
  const settings = req.body || {};
  const insert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const transaction = db.transaction((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      insert.run(key, String(value));
    }
  });
  transaction(settings);
  res.json({ ok: true });
});

app.use("/assets", express.static(path.join(__dirname, "..", "public")));

app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/player/stream", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "stream.html"));
});

app.get("/player/listen", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "listen.html"));
});

app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

const server = app.listen(PORT, () => {
  console.log(`Erwin server listening on port ${PORT}`);
});

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ event: "CONNECTED", payload: {} }));
});
