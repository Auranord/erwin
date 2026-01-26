import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { WebSocketServer } from "ws";
import fs from "fs";
import { promises as fsPromises } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "erwin-dev-secret";
const DB_URL = process.env.DB_URL || "./data/erwin.sqlite";
const AUDIO_DIR = process.env.ERWIN_AUDIO_DIR || "./data/audio";
const LOG_DIR = process.env.ERWIN_LOG_DIR || "./data/logs";
const LOG_FILE = path.join(LOG_DIR, "erwin.log");
const YTDL_COOKIE_FILE = process.env.ERWIN_YTDL_COOKIE_FILE || "/app/data/youtube.cookie";
const YTDL_COOKIE = process.env.ERWIN_YTDL_COOKIE || "";
const YTDL_JS_RUNTIME = process.env.ERWIN_YTDL_JS_RUNTIME || `node:${process.execPath}`;
const YTDL_FFMPEG_LOCATION = process.env.ERWIN_YTDL_FFMPEG_LOCATION || "";

const app = express();
const db = new Database(DB_URL);

function ensureLogs() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(level, message, meta = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
  fs.appendFile(LOG_FILE, `${line}\n`, () => {});
}

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

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    log("info", "request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start
    });
  });
  next();
});

const wss = new WebSocketServer({ noServer: true });

function broadcast(event, payload) {
  const message = JSON.stringify({ event, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  log("info", "broadcast", { event });
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const runtimeArgs = ["--js-runtimes", YTDL_JS_RUNTIME];
    const ffmpegArgs = YTDL_FFMPEG_LOCATION
      ? ["--ffmpeg-location", YTDL_FFMPEG_LOCATION]
      : [];
    execFile(
      "yt-dlp",
      [...runtimeArgs, ...ffmpegArgs, ...args],
      { maxBuffer: 1024 * 1024 * 10 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `yt-dlp failed (code ${error.code ?? "unknown"}): ${stderr || error.message}`
            )
          );
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function toNetscapeCookieLine(cookie) {
  const domain = cookie.domain || "";
  const includeSubdomains = domain.startsWith(".");
  const pathValue = cookie.path || "/";
  const secure = Boolean(cookie.secure);
  const expires =
    Number.isFinite(cookie.expirationDate) && cookie.expirationDate > 0
      ? Math.floor(cookie.expirationDate)
      : 0;
  return [
    domain,
    includeSubdomains ? "TRUE" : "FALSE",
    pathValue,
    secure ? "TRUE" : "FALSE",
    expires,
    cookie.name || "",
    cookie.value || ""
  ].join("\t");
}

async function buildYtDlpCookieArgs() {
  if (YTDL_COOKIE) {
    return {
      args: ["--add-header", `Cookie: ${YTDL_COOKIE}`],
      cleanup: async () => {}
    };
  }

  if (!YTDL_COOKIE_FILE || !fs.existsSync(YTDL_COOKIE_FILE)) {
    return { args: [], cleanup: async () => {} };
  }

  const raw = fs.readFileSync(YTDL_COOKIE_FILE, "utf8").trim();
  if (!raw) {
    log("warn", "yt-dlp cookies file is empty", { path: YTDL_COOKIE_FILE });
    return { args: [], cleanup: async () => {} };
  }

  const firstChar = raw[0];
  if (firstChar !== "[" && firstChar !== "{") {
    return { args: ["--cookies", YTDL_COOKIE_FILE], cleanup: async () => {} };
  }

  try {
    const parsed = JSON.parse(raw);
    const cookieList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.cookies)
        ? parsed.cookies
        : null;
    if (!cookieList) {
      log("warn", "yt-dlp cookies JSON is not an array", { path: YTDL_COOKIE_FILE });
      return { args: [], cleanup: async () => {} };
    }
    const lines = cookieList
      .map((cookie) => toNetscapeCookieLine(cookie))
      .filter((line) => line.trim().length > 0);
    if (!lines.length) {
      log("warn", "yt-dlp cookies JSON has no entries", { path: YTDL_COOKIE_FILE });
      return { args: [], cleanup: async () => {} };
    }
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "erwin-ytcookies-"));
    const tempPath = path.join(tempDir, "cookies.txt");
    await fsPromises.writeFile(
      tempPath,
      `# Netscape HTTP Cookie File\n${lines.join("\n")}\n`
    );
    log("info", "yt-dlp cookies JSON converted to Netscape format", {
      source: YTDL_COOKIE_FILE,
      tempPath
    });
    return {
      args: ["--cookies", tempPath],
      cleanup: async () => {
        try {
          await fsPromises.unlink(tempPath);
          await fsPromises.rmdir(tempDir);
        } catch (error) {
          log("warn", "unable to cleanup temporary cookie file", {
            error: String(error?.message || error),
            tempPath
          });
        }
      }
    };
  } catch (error) {
    log("warn", "yt-dlp cookies file looks like JSON but failed to parse", {
      path: YTDL_COOKIE_FILE,
      error: String(error?.message || error)
    });
    return { args: [], cleanup: async () => {} };
  }
}

function initDb() {
  ensureLogs();
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
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
      audio_path TEXT,
      download_status TEXT,
      download_error TEXT,
      downloaded_at TEXT,
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
      paused_at_ms INTEGER,
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

    CREATE TABLE IF NOT EXISTS download_queue (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      attempts INTEGER DEFAULT 0,
      retry_after TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
    log("info", "seeded admin user", { username });
  }

  const playStateColumns = db.prepare("PRAGMA table_info(play_state)").all();
  const hasPausedAt = playStateColumns.some((column) => column.name === "paused_at_ms");
  if (!hasPausedAt) {
    db.prepare("ALTER TABLE play_state ADD COLUMN paused_at_ms INTEGER").run();
  }

  const trackColumns = db.prepare("PRAGMA table_info(tracks)").all();
  const trackColumnNames = new Set(trackColumns.map((column) => column.name));
  if (!trackColumnNames.has("audio_path")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN audio_path TEXT").run();
  }
  if (!trackColumnNames.has("download_status")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN download_status TEXT").run();
  }
  if (!trackColumnNames.has("download_error")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN download_error TEXT").run();
  }
  if (!trackColumnNames.has("downloaded_at")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN downloaded_at TEXT").run();
  }

  const downloadQueueColumns = db.prepare("PRAGMA table_info(download_queue)").all();
  if (downloadQueueColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS download_queue (
        id TEXT PRIMARY KEY,
        playlist_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        attempts INTEGER DEFAULT 0,
        retry_after TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
  const downloadQueueColumnNames = new Set(downloadQueueColumns.map((column) => column.name));
  if (!downloadQueueColumnNames.has("attempts")) {
    db.prepare("ALTER TABLE download_queue ADD COLUMN attempts INTEGER DEFAULT 0").run();
  }
  if (!downloadQueueColumnNames.has("retry_after")) {
    db.prepare("ALTER TABLE download_queue ADD COLUMN retry_after TEXT").run();
  }

  const state = db.prepare("SELECT id FROM play_state WHERE id = 1").get();
  if (!state) {
    db.prepare(
      "INSERT INTO play_state (id, current_track_id, started_at_ms, paused_at_ms, paused, updated_at) VALUES (1, NULL, NULL, NULL, 1, ?)"
    ).run(new Date().toISOString());
  }
}

initDb();

async function downloadTrackAudio(track) {
  const getSafeTitle = (rawTitle) =>
    (rawTitle || track.youtube_id)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

  const videoUrl = `https://www.youtube.com/watch?v=${track.youtube_id}`;
  const { args: cookieArgs, cleanup } = await buildYtDlpCookieArgs();
  try {
    const metadataRaw = await runYtDlp([
      "--dump-single-json",
      "--no-playlist",
      ...cookieArgs,
      videoUrl
    ]);
    const metadata = JSON.parse(metadataRaw);
    const title = metadata?.title || null;
    const channel = metadata?.uploader || null;
    const durationSec = Number.isFinite(metadata?.duration) ? metadata.duration : null;
    const thumbnail = metadata?.thumbnail || null;

    const safeTitle = getSafeTitle(title);
    const outputBase = path.join(AUDIO_DIR, `${safeTitle}-${track.id}`);
    const outputPath = `${outputBase}.mp3`;

    await runYtDlp([
      "--no-playlist",
      ...cookieArgs,
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      `${outputBase}.%(ext)s`,
      videoUrl
    ]);

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE tracks SET title = COALESCE(title, ?), channel = COALESCE(channel, ?), thumbnail = COALESCE(thumbnail, ?), duration_sec = COALESCE(duration_sec, ?), audio_path = ?, download_status = 'ready', download_error = NULL, downloaded_at = ? WHERE id = ?"
    ).run(title, channel, thumbnail, durationSec, outputPath, now, track.id);
  } finally {
    await cleanup();
  }
}

async function downloadWorker() {
  const pending = db
    .prepare(
      "SELECT download_queue.id as queue_id, download_queue.playlist_id, download_queue.track_id, download_queue.attempts, download_queue.retry_after, tracks.youtube_id FROM download_queue JOIN tracks ON tracks.id = download_queue.track_id WHERE download_queue.status IN ('pending', 'failed') ORDER BY download_queue.created_at ASC LIMIT 1"
    )
    .get();
  if (!pending) return;
  if (pending.retry_after && new Date(pending.retry_after) > new Date()) {
    return;
  }
  db.prepare(
    "UPDATE download_queue SET status = 'downloading', error = NULL, attempts = attempts + 1, updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), pending.queue_id);
  db.prepare("UPDATE tracks SET download_status = 'downloading', download_error = NULL WHERE id = ?").run(
    pending.track_id
  );
  console.log(`Downloading audio for track ${pending.track_id}...`);
  try {
    await downloadTrackAudio({ id: pending.track_id, youtube_id: pending.youtube_id });
    const position =
      (db
        .prepare("SELECT MAX(position) as maxPosition FROM playlist_tracks WHERE playlist_id = ?")
        .get(pending.playlist_id).maxPosition || 0) + 1;
    db.prepare(
      "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
    ).run(pending.playlist_id, pending.track_id, position);
    db.prepare(
      "UPDATE download_queue SET status = 'ready', updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), pending.queue_id);
    console.log(`Download ready for track ${pending.track_id}.`);
    broadcast("DOWNLOAD_UPDATE", {
      trackId: pending.track_id,
      playlistId: pending.playlist_id,
      status: "ready"
    });
  } catch (error) {
    console.error(`Download failed for track ${pending.track_id}:`, error);
    const statusCode = error?.statusCode || error?.status;
    const isBlocked = statusCode === 403 || String(error?.message || "").includes("403");
    const backoffMinutes = Math.min(30, 2 ** Math.min(5, (pending.attempts || 0) + 1));
    const retryAfter = isBlocked
      ? null
      : new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    db.prepare(
      "UPDATE tracks SET download_status = 'failed', download_error = ? WHERE id = ?"
    ).run(String(error?.message || error), pending.track_id);
    db.prepare(
      "UPDATE download_queue SET status = ?, error = ?, retry_after = ?, updated_at = ? WHERE id = ?"
    ).run(
      isBlocked ? "blocked" : "failed",
      String(error?.message || error),
      retryAfter,
      new Date().toISOString(),
      pending.queue_id
    );
    broadcast("DOWNLOAD_UPDATE", {
      trackId: pending.track_id,
      playlistId: pending.playlist_id,
      status: isBlocked ? "blocked" : "failed"
    });
    if (isBlocked) {
      log("error", "download blocked", {
        trackId: pending.track_id,
        note: "Set ERWIN_YTDL_COOKIE_FILE or ERWIN_YTDL_COOKIE to enable authenticated downloads."
      });
    }
  }
}

setInterval(() => {
  downloadWorker();
}, 5000);

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

function enqueueDownload(playlistId, trackId) {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO download_queue (id, playlist_id, track_id, status, error, attempts, retry_after, created_at, updated_at) VALUES (?, ?, ?, 'pending', NULL, 0, NULL, ?, ?)"
  ).run(nanoid(), playlistId, trackId, now, now);
  db.prepare(
    "UPDATE tracks SET download_status = 'pending', download_error = NULL WHERE id = ?"
  ).run(trackId);
  console.log(`Queued download for track ${trackId} (playlist ${playlistId}).`);
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
    log("warn", "login failed", { username });
    return res.status(401).json({ error: "Invalid credentials" });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  log("info", "login success", { username: user.username, role: user.role });
  res.json({ id: user.id, username: user.username, role: user.role });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    log("info", "logout", { userId: req.session?.user?.id || null });
    res.json({ ok: true });
  });
});

app.get("/api/state", requireAuth, (req, res) => {
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  const currentTrack = playState?.current_track_id
    ? db
        .prepare(
          "SELECT id, youtube_id, url, title, duration_sec, channel, thumbnail, audio_path, download_status FROM tracks WHERE id = ?"
        )
        .get(playState.current_track_id)
    : null;
  const queue = db
    .prepare(
      "SELECT queue.id, queue.track_id, queue.source, queue.created_at, tracks.title, tracks.channel FROM queue JOIN tracks ON tracks.id = queue.track_id ORDER BY queue.created_at ASC"
    )
    .all();
  res.json({ playState, currentTrack, queue });
});

app.post("/api/session/start", requireAuth, requireRole("admin", "mod"), (req, res) => {
  const { trackId } = req.body || {};
  const track = trackId
    ? db.prepare("SELECT id FROM tracks WHERE id = ?").get(trackId)
    : null;
  db.prepare(
    "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused_at_ms = NULL, paused = 0, updated_at = ? WHERE id = 1"
  ).run(track ? track.id : null, Date.now(), new Date().toISOString());
  log("info", "session start", { trackId: track?.id || null });
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  broadcast("STATE_UPDATE", { playState });
  res.json({ playState });
});

app.post("/api/session/pause", requireAuth, requireRole("admin", "mod"), (req, res) => {
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  if (!playState?.current_track_id || playState.paused) {
    return res.json({ playState });
  }
  db.prepare(
    "UPDATE play_state SET paused = 1, paused_at_ms = ?, updated_at = ? WHERE id = 1"
  ).run(Date.now(), new Date().toISOString());
  log("info", "session pause", { trackId: playState.current_track_id });
  const updated = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  broadcast("STATE_UPDATE", { playState: updated });
  res.json({ playState: updated });
});

app.post("/api/session/resume", requireAuth, requireRole("admin", "mod"), (req, res) => {
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  if (!playState?.current_track_id || !playState.paused) {
    return res.json({ playState });
  }
  const elapsed = playState.started_at_ms
    ? playState.paused_at_ms - playState.started_at_ms
    : 0;
  const startedAt = Date.now() - Math.max(0, elapsed);
  db.prepare(
    "UPDATE play_state SET paused = 0, paused_at_ms = NULL, started_at_ms = ?, updated_at = ? WHERE id = 1"
  ).run(startedAt, new Date().toISOString());
  log("info", "session resume", { trackId: playState.current_track_id });
  const updated = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  broadcast("STATE_UPDATE", { playState: updated });
  res.json({ playState: updated });
});

app.post("/api/session/seek", requireAuth, requireRole("admin", "mod"), (req, res) => {
  const { positionSeconds } = req.body || {};
  if (typeof positionSeconds !== "number" || Number.isNaN(positionSeconds)) {
    return res.status(400).json({ error: "positionSeconds must be a number" });
  }
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  if (!playState?.current_track_id) {
    return res.status(400).json({ error: "No active track" });
  }
  const now = Date.now();
  const startedAt = now - Math.max(0, positionSeconds * 1000);
  const pausedAt = playState.paused ? now : null;
  db.prepare(
    "UPDATE play_state SET started_at_ms = ?, paused_at_ms = ?, updated_at = ? WHERE id = 1"
  ).run(startedAt, pausedAt, new Date().toISOString());
  log("info", "session seek", { positionSeconds, trackId: playState.current_track_id });
  const updated = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  broadcast("STATE_UPDATE", { playState: updated });
  res.json({ playState: updated });
});

app.post("/api/session/stop", requireAuth, requireRole("admin", "mod"), (req, res) => {
  db.prepare(
    "UPDATE play_state SET current_track_id = NULL, started_at_ms = NULL, paused_at_ms = NULL, paused = 1, updated_at = ? WHERE id = 1"
  ).run(new Date().toISOString());
  log("info", "session stop");
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
      "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused_at_ms = NULL, paused = 0, updated_at = ? WHERE id = 1"
    ).run(next.track_id, Date.now(), new Date().toISOString());
  }
  log("info", "queue skip", { nextTrackId: next?.track_id || null });
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  const queue = db
    .prepare(
      "SELECT queue.id, queue.track_id, queue.source, queue.created_at, tracks.title, tracks.channel FROM queue JOIN tracks ON tracks.id = queue.track_id ORDER BY queue.created_at ASC"
    )
    .all();
  broadcast("STATE_UPDATE", { playState, queue });
  res.json({ playState, queue });
});

app.get("/api/audio/:trackId", requireAuth, (req, res) => {
  const track = db
    .prepare("SELECT audio_path FROM tracks WHERE id = ?")
    .get(req.params.trackId);
  if (!track?.audio_path) {
    return res.status(404).json({ error: "Audio not available" });
  }
  fsPromises
    .access(track.audio_path)
    .then(() => {
      const stat = fs.statSync(track.audio_path);
      const range = req.headers.range;
      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
        if (start >= stat.size) {
          res.status(416).send("Requested range not satisfiable");
          return;
        }
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
          "Content-Type": "audio/mpeg"
        });
        fs.createReadStream(track.audio_path, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": stat.size,
          "Content-Type": "audio/mpeg"
        });
        fs.createReadStream(track.audio_path).pipe(res);
      }
    })
    .catch(() => {
      res.status(404).json({ error: "Audio not available" });
    });
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

app.get("/api/downloads", requireAuth, (req, res) => {
  const downloads = db
    .prepare(
      "SELECT download_queue.id, download_queue.status, download_queue.error, download_queue.retry_after, download_queue.attempts, download_queue.created_at, playlists.name as playlist_name, tracks.title, tracks.youtube_id FROM download_queue JOIN playlists ON playlists.id = download_queue.playlist_id JOIN tracks ON tracks.id = download_queue.track_id ORDER BY download_queue.created_at DESC"
    )
    .all();
  res.json(downloads);
});

app.post("/api/downloads/clear", requireAuth, requireRole("admin"), (req, res) => {
  const result = db
    .prepare("DELETE FROM download_queue WHERE status IN ('ready', 'failed', 'blocked')")
    .run();
  log("info", "download queue cleared", { cleared: result.changes });
  res.json({ cleared: result.changes });
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
  log("info", "playlist created", { playlistId: playlist.id, name: playlist.name });
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
  log("info", "playlist deleted", { playlistId: req.params.id });
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
  const insertTrack = db.prepare(
    "INSERT INTO tracks (id, youtube_id, url, title, duration_sec, channel, thumbnail, audio_path, download_status, download_error, downloaded_at, disabled, fail_count, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL, 0, 0, ?)"
  );
  const now = new Date().toISOString();
  const imported = [];
  const transaction = db.transaction((items) => {
    for (const url of items) {
      const youtubeId = parseYouTubeId(url);
      if (!youtubeId) {
        continue;
      }
      const trackId = nanoid();
      insertTrack.run(trackId, youtubeId, url, now);
      enqueueDownload(req.params.id, trackId);
      imported.push({ id: trackId, youtubeId, url });
    }
  });
  transaction(urls);
  log("info", "playlist import queued", {
    playlistId: req.params.id,
    requested: urls.length,
    queued: imported.length
  });
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
  db.prepare(
    "INSERT INTO tracks (id, youtube_id, url, title, duration_sec, channel, thumbnail, audio_path, download_status, download_error, downloaded_at, disabled, fail_count, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL, 0, 0, ?)"
  ).run(trackId, youtubeId, url, now);
  enqueueDownload(playlistId, trackId);
  log("info", "track queued", { trackId, playlistId, youtubeId });
  res.status(201).json({ id: trackId, youtubeId, url, status: "pending" });
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

app.post(
  "/api/playlists/:id/play",
  requireAuth,
  requireRole("admin", "mod"),
  (req, res) => {
    const tracks = db
      .prepare(
        "SELECT tracks.id FROM playlist_tracks JOIN tracks ON tracks.id = playlist_tracks.track_id WHERE playlist_tracks.playlist_id = ? AND tracks.disabled = 0 ORDER BY playlist_tracks.position ASC"
      )
      .all(req.params.id);
    if (tracks.length === 0) {
      return res.status(404).json({ error: "Playlist has no playable tracks" });
    }
    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM queue").run();
      tracks.slice(1).forEach((track) => {
        db.prepare(
          "INSERT INTO queue (id, track_id, source, added_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(nanoid(), track.id, "playlist", req.session.user.id, now);
      });
      db.prepare(
        "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused_at_ms = NULL, paused = 0, updated_at = ? WHERE id = 1"
      ).run(tracks[0].id, Date.now(), now);
    });
    transaction();
    const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
    const queue = db
      .prepare(
        "SELECT queue.id, queue.track_id, queue.source, queue.created_at, tracks.title, tracks.channel FROM queue JOIN tracks ON tracks.id = queue.track_id ORDER BY queue.created_at ASC"
      )
      .all();
    broadcast("STATE_UPDATE", { playState, queue });
    res.json({ playState, queue });
  }
);

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
