import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import { WebSocketServer } from "ws";
import fs from "fs";
import { promises as fsPromises } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import tls from "tls";
import { createInstagramIntegration } from "./integrations/instagram.js";

dotenv.config();

function writeFatalLogSync(message, errorLike) {
  const errorMessage = String(errorLike?.message || errorLike);
  const entry = {
    time: new Date().toISOString(),
    level: "error",
    message,
    error: errorMessage,
    stack: errorLike?.stack || null
  };
  try {
    fs.writeSync(process.stderr.fd, `${JSON.stringify(entry)}\n`);
  } catch {
    // no-op; best-effort fallback only
  }
}

process.on("uncaughtException", (error) => {
  writeFatalLogSync("uncaught exception", error);
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  writeFatalLogSync("unhandled rejection", reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

function envTrim(name, fallback = "") {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).trim();
}

function parseCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = envTrim("SESSION_SECRET", "erwin-dev-secret");
const DB_URL = envTrim("DB_URL", "./data/erwin.sqlite");
const AUDIO_DIR = envTrim("ERWIN_AUDIO_DIR", "./data/audio");
const LOG_LEVEL = envTrim("LOG_LEVEL", "info");
const YTDL_COOKIE_FILE = envTrim("ERWIN_YTDL_COOKIE_FILE", "/app/data/youtube.cookie");
const YTDL_COOKIE = envTrim("ERWIN_YTDL_COOKIE", "");
const YTDL_JS_RUNTIME = envTrim("ERWIN_YTDL_JS_RUNTIME", `node:${process.execPath}`);
const YTDL_REMOTE_COMPONENTS = envTrim("ERWIN_YTDL_REMOTE_COMPONENTS", "ejs:github");
const YTDL_FFMPEG_LOCATION = envTrim("ERWIN_YTDL_FFMPEG_LOCATION", "");
const PUBLIC_BASE_URL = envTrim("PUBLIC_BASE_URL", "");
const TWITCH_BOT_USERNAME = envTrim("TWITCH_BOT_USERNAME", "");
const TWITCH_OAUTH_TOKEN = envTrim("TWITCH_OAUTH_TOKEN", "");
const TWITCH_REFRESH_TOKEN = envTrim("TWITCH_REFRESH_TOKEN", "");
const TWITCH_CLIENT_ID = envTrim("TWITCH_CLIENT_ID", "");
const TWITCH_CLIENT_SECRET = envTrim("TWITCH_CLIENT_SECRET", "");
const TWITCH_REDIRECT_URI = envTrim("TWITCH_REDIRECT_URI", "");
const META_APP_ID = envTrim("META_APP_ID", "");
const META_APP_SECRET = envTrim("META_APP_SECRET", "");
const META_REDIRECT_URI = envTrim("META_REDIRECT_URI", "");
const META_OAUTH_CONFIGURED = Boolean(META_APP_ID && META_APP_SECRET);
const TWITCH_CHANNEL = envTrim("TWITCH_CHANNEL", "");
const TWITCH_COMMAND_PREFIX = envTrim("TWITCH_COMMAND_PREFIX", "!");
const DISCORD_STREAM_LIVE_WEBHOOK_URL = envTrim(
  "DISCORD_STREAM_LIVE_WEBHOOK_URL",
  envTrim("DISCORD_WEBHOOK_URL", "")
);
const DISCORD_MENTION_ROLE_ID = envTrim("DISCORD_MENTION_ROLE_ID", "");
const NOTIFY_TEMPLATE_DISCORD = envTrim(
  "NOTIFY_TEMPLATE_DISCORD",
  "🔴 {channel} is live!\n{title}\n{game}\n{url}"
);
const NOTIF_DISCORD_USERNAME = envTrim("NOTIF_DISCORD_USERNAME", "");
const NOTIF_DISCORD_AVATAR_URL = envTrim("NOTIF_DISCORD_AVATAR_URL", "");
const TWITCH_ADMINS = parseCsvSet(envTrim("TWITCH_ADMINS", ""));
const TWITCH_CHANNEL_MEMBERS = parseCsvSet(envTrim("TWITCH_CHANNEL_MEMBERS", ""));
const TWITCH_CHANNEL_MEMBERS_ROLE = envTrim("TWITCH_CHANNEL_MEMBERS_ROLE", "channel_member");
const TWITCH_IRC_HOST =
  envTrim("TWITCH_IRC_HOST", "raw-1.us-west-2.prod.twitchircedge.twitch.a2z.com");
const DOWNLOAD_CONCURRENCY = Math.max(
  1,
  Number(process.env.ERWIN_DOWNLOAD_CONCURRENCY || 1)
);
const AUDIO_RETENTION_DAYS = Number(process.env.ERWIN_AUDIO_RETENTION_DAYS || 0);
const AUDIO_RETENTION_MAX_GB = Number(process.env.ERWIN_AUDIO_RETENTION_MAX_GB || 0);
const LIBRARY_QUEUE_ID = "__library__";
const TRACK_SCORE_MIN = -100;
const TRACK_SCORE_MAX = 100;

const OVERLAY_CANVAS_WIDTH = 1920;
const OVERLAY_CANVAS_HEIGHT = 1080;
const OVERLAY_TEST_DURATION_MS = 8000;

const HYPE_DEFAULTS = {
  emotes: ["PogChamp", "Kappa", "HYPERS"],
  thresholdPercent: 20,
  durationSeconds: 12,
  extensionRatio: 0.35,
  userCooldownSeconds: 8,
  enabled: true
};

const overlayState = {
  activeUntil: 0,
  lastTriggeredAt: 0,
  hypeUntil: 0,
  hypeLastTriggeredAt: 0
};

const hypeRuntime = {
  participants: new Set(),
  userLastCountedAt: new Map()
};

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};
const LOG_LEVEL_THRESHOLD =
  LOG_LEVELS[LOG_LEVEL?.toLowerCase?.()] ?? LOG_LEVELS.info;

function log(level, message, meta = {}) {
  const numericLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  if (numericLevel > LOG_LEVEL_THRESHOLD) {
    return;
  }
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
}

const app = express();
app.set("trust proxy", 1);

const instagramIntegration = createInstagramIntegration({
  log,
  publicBaseUrl: PUBLIC_BASE_URL,
  staticDir: PUBLIC_DIR
});

function ensureDbDirectory(dbUrl) {
  if (!dbUrl || dbUrl === ":memory:") return;
  if (/^[a-zA-Z]+:\/\//.test(dbUrl) || dbUrl.startsWith("file:")) return;
  const dbDir = path.dirname(path.resolve(dbUrl));
  fs.mkdirSync(dbDir, { recursive: true });
}

ensureDbDirectory(DB_URL);
const db = new Database(DB_URL);


app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: envTrim("NODE_ENV", "development") === "production"
  }
});

app.use(sessionMiddleware);

app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || nanoid();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    const requestPath = req.path || req.originalUrl;
    const isHealthCheckRequest =
      requestPath === "/health" || requestPath === "/api/health";
    log(isHealthCheckRequest ? "debug" : "info", "request", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start
    });
  });
  next();
});

const wss = new WebSocketServer({ noServer: true });
const wsTelemetry = new Map();
let lastAutoSkipAt = 0;

const DRIFT_THRESHOLD_SECONDS = 1.5;
const HEARTBEAT_TIMEOUT_MS = 15000;
const AUTO_SKIP_ERROR_WINDOW_MS = 30000;
const AUTO_SKIP_STUCK_MS = 10000;
const AUTO_SKIP_COOLDOWN_MS = 30000;

function sendWsMessage(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(event, payload) {
  const message = JSON.stringify({ event, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  log("info", "broadcast", { event });
}

function broadcastType(type, payload = {}) {
  const message = JSON.stringify({ type, ...payload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function clampTrackScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(TRACK_SCORE_MIN, Math.min(TRACK_SCORE_MAX, numeric));
}

function calculateTrackScoreDelta(currentScore, signalStrength) {
  const score = clampTrackScore(currentScore);
  const strength = Number(signalStrength);
  if (!Number.isFinite(strength) || strength === 0) return 0;
  const influence = Math.max(0.1, (100 - Math.abs(score)) / 100);
  return strength * influence;
}

function applyTrackScoreSignal(trackId, signalStrength, source = "unknown") {
  const row = db.prepare("SELECT id, score FROM tracks WHERE id = ?").get(trackId);
  if (!row) return null;
  const currentScore = clampTrackScore(row.score ?? 0);
  const delta = calculateTrackScoreDelta(currentScore, signalStrength);
  const nextScore = clampTrackScore(Math.round(currentScore + delta));
  if (nextScore === currentScore) {
    return { trackId, score: currentScore, delta: 0, source };
  }
  db.prepare("UPDATE tracks SET score = ? WHERE id = ?").run(nextScore, trackId);
  log("info", "track score updated", { trackId, source, signalStrength, delta, previousScore: currentScore, nextScore });
  broadcast("PLAYLIST_UPDATE", { action: "track_score_updated", trackId, score: nextScore, source, delta: Math.round(delta) });
  return { trackId, score: nextScore, delta: Math.round(delta), source };
}

function computeExpectedSeconds(playState, serverNow, durationSec = null) {
  if (!playState?.started_at_ms) return 0;
  const referenceMs =
    playState.paused && playState.paused_at_ms ? playState.paused_at_ms : serverNow;
  let expected = Math.max(0, (referenceMs - playState.started_at_ms) / 1000);
  if (Number.isFinite(durationSec) && durationSec > 0) {
    expected = Math.min(durationSec, expected);
  }
  return expected;
}

function getActiveStreamClients() {
  return [...wsTelemetry.values()].filter(
    (client) => client.page === "stream" && Date.now() - (client.lastHeartbeatAt || 0) < HEARTBEAT_TIMEOUT_MS
  );
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const runtimeArgs = ["--js-runtimes", YTDL_JS_RUNTIME];
    const remoteComponentsArgs = YTDL_REMOTE_COMPONENTS
      ? ["--remote-components", YTDL_REMOTE_COMPONENTS]
      : [];
    const ffmpegArgs = YTDL_FFMPEG_LOCATION
      ? ["--ffmpeg-location", YTDL_FFMPEG_LOCATION]
      : [];
    execFile(
      "yt-dlp",
      [...runtimeArgs, ...remoteComponentsArgs, ...ffmpegArgs, ...args],
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
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  db.exec(SCHEMA_SQL);


  const usersColumns = db.prepare("PRAGMA table_info(users)").all();
  const userColumnNames = new Set(usersColumns.map((column) => column.name));
  if (!userColumnNames.has("twitch_id")) {
    db.prepare("ALTER TABLE users ADD COLUMN twitch_id TEXT").run();
  }
  if (!userColumnNames.has("display_name")) {
    db.prepare("ALTER TABLE users ADD COLUMN display_name TEXT").run();
  }
  db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_twitch_id ON users(twitch_id)").run();

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
  if (!trackColumnNames.has("volume_adjust_db")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN volume_adjust_db REAL DEFAULT 0").run();
  }
  if (!trackColumnNames.has("intro_sec")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN intro_sec REAL DEFAULT 0").run();
  }
  if (!trackColumnNames.has("outro_sec")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN outro_sec REAL DEFAULT 0").run();
  }
  if (!trackColumnNames.has("tags")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN tags TEXT DEFAULT ''").run();
  }
  if (!trackColumnNames.has("added_by_user_id")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN added_by_user_id TEXT").run();
  }
  if (!trackColumnNames.has("score")) {
    db.prepare("ALTER TABLE tracks ADD COLUMN score INTEGER NOT NULL DEFAULT 0").run();
  }
  db.prepare("UPDATE tracks SET score = 0 WHERE score IS NULL").run();
  db.prepare("UPDATE tracks SET score = ? WHERE score < ?").run(TRACK_SCORE_MIN, TRACK_SCORE_MIN);
  db.prepare("UPDATE tracks SET score = ? WHERE score > ?").run(TRACK_SCORE_MAX, TRACK_SCORE_MAX);
  const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get();
  if (adminUser?.id) {
    db.prepare("UPDATE tracks SET added_by_user_id = ? WHERE added_by_user_id IS NULL OR TRIM(added_by_user_id) = ''").run(adminUser.id);
  }
  db.prepare("UPDATE tracks SET created_at = COALESCE(created_at, ?) WHERE created_at IS NULL OR TRIM(created_at) = ''").run(new Date().toISOString());

  const playlistTrackColumns = db.prepare("PRAGMA table_info(playlist_tracks)").all();
  const playlistTrackColumnNames = new Set(playlistTrackColumns.map((column) => column.name));
  if (!playlistTrackColumnNames.has("disabled")) {
    db.prepare("ALTER TABLE playlist_tracks ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0").run();
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
  if (!downloadQueueColumnNames.has("attach_to_playlist")) {
    db.prepare("ALTER TABLE download_queue ADD COLUMN attach_to_playlist INTEGER NOT NULL DEFAULT 1").run();
    db.prepare("UPDATE download_queue SET attach_to_playlist = 1 WHERE attach_to_playlist IS NULL").run();
  }

  const queueColumns = db.prepare("PRAGMA table_info(queue)").all();
  const queueColumnNames = new Set(queueColumns.map((column) => column.name));
  if (!queueColumnNames.has("position")) {
    db.prepare("ALTER TABLE queue ADD COLUMN position INTEGER NOT NULL DEFAULT 0").run();
    const queueEntries = db
      .prepare("SELECT id FROM queue ORDER BY created_at ASC")
      .all()
      .map((entry, index) => ({ id: entry.id, position: index + 1 }));
    const updatePosition = db.prepare("UPDATE queue SET position = ? WHERE id = ?");
    const transaction = db.transaction((entries) => {
      entries.forEach((entry) => updatePosition.run(entry.position, entry.id));
    });
    transaction(queueEntries);
  }
  if (!queueColumnNames.has("added_by_user_id")) {
    try {
      db.prepare("ALTER TABLE queue ADD COLUMN added_by_user_id TEXT").run();
    } catch (error) {
      const message = String(error?.message || error).toLowerCase();
      if (!message.includes("duplicate column")) {
        throw error;
      }
    }
  }

  db.exec(`
      CREATE TABLE IF NOT EXISTS track_score_feedback (
        track_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        feedback_date TEXT NOT NULL,
        signal INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (track_id, user_id, feedback_date)
      );
    `);

  const poolColumns = db.prepare("PRAGMA table_info(play_pool)").all();
  if (poolColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS play_pool (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  const customCommandColumns = db.prepare("PRAGMA table_info(twitch_custom_commands)").all();
  if (customCommandColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS twitch_custom_commands (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL UNIQUE,
        aliases_json TEXT NOT NULL,
        response TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
  const customCommandColumnNames = new Set(
    customCommandColumns.map((column) => column.name)
  );
  if (!customCommandColumnNames.has("aliases_json")) {
    db.prepare("ALTER TABLE twitch_custom_commands ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]'").run();
  }
  if (!customCommandColumnNames.has("enabled")) {
    db.prepare("ALTER TABLE twitch_custom_commands ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1").run();
  }
  if (!customCommandColumnNames.has("created_at")) {
    db.prepare("ALTER TABLE twitch_custom_commands ADD COLUMN created_at TEXT").run();
    db.prepare("UPDATE twitch_custom_commands SET created_at = COALESCE(created_at, updated_at, ?)").run(
      new Date().toISOString()
    );
  }
  if (!customCommandColumnNames.has("updated_at")) {
    db.prepare("ALTER TABLE twitch_custom_commands ADD COLUMN updated_at TEXT").run();
    db.prepare("UPDATE twitch_custom_commands SET updated_at = COALESCE(updated_at, created_at, ?)").run(
      new Date().toISOString()
    );
  }

  const state = db.prepare("SELECT id FROM play_state WHERE id = 1").get();
  if (!state) {
    db.prepare(
      "INSERT INTO play_state (id, current_track_id, started_at_ms, paused_at_ms, paused, updated_at) VALUES (1, NULL, NULL, NULL, 1, ?)"
    ).run(new Date().toISOString());
  }
}

try {
  initDb();
} catch (error) {
  log("error", "database initialization failed", {
    error: String(error?.message || error),
    stack: error?.stack || null
  });
  throw error;
}

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

async function claimNextDownload() {
  const pending = db
    .prepare(
      "SELECT download_queue.id as queue_id, download_queue.playlist_id, download_queue.track_id, download_queue.attempts, download_queue.retry_after, tracks.youtube_id FROM download_queue JOIN tracks ON tracks.id = download_queue.track_id WHERE download_queue.status IN ('pending', 'failed') ORDER BY download_queue.created_at ASC LIMIT 1"
    )
    .get();
  if (!pending) return null;
  if (pending.retry_after && new Date(pending.retry_after) > new Date()) {
    return null;
  }
  db.prepare(
    "UPDATE download_queue SET status = 'downloading', error = NULL, attempts = attempts + 1, updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), pending.queue_id);
  db.prepare("UPDATE tracks SET download_status = 'downloading', download_error = NULL WHERE id = ?").run(
    pending.track_id
  );
  return pending;
}

async function processDownload(pending) {
  log("info", "download start", { trackId: pending.track_id });
  try {
    await downloadTrackAudio({ id: pending.track_id, youtube_id: pending.youtube_id });
    const entries = db
      .prepare(
        "SELECT id, playlist_id, attach_to_playlist FROM download_queue WHERE track_id = ? AND status IN ('pending', 'waiting', 'downloading')"
      )
      .all(pending.track_id);
    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      entries.forEach((entry) => {
        if (entry.attach_to_playlist && entry.playlist_id !== LIBRARY_QUEUE_ID) {
          addTrackToPlaylist(entry.playlist_id, pending.track_id);
        }
        db.prepare(
          "UPDATE download_queue SET status = 'ready', updated_at = ? WHERE id = ?"
        ).run(now, entry.id);
      });
    });
    transaction();
    log("info", "download ready", { trackId: pending.track_id });
    broadcast("DOWNLOAD_UPDATE", {
      trackId: pending.track_id,
      playlistId: pending.playlist_id,
      status: "ready"
    });
  } catch (error) {
    log("error", "download failed", {
      trackId: pending.track_id,
      error: String(error?.message || error)
    });
    const statusCode = error?.statusCode || error?.status;
    const isBlocked = statusCode === 403 || String(error?.message || "").includes("403");
    const backoffMinutes = Math.min(30, 2 ** Math.min(5, (pending.attempts || 0) + 1));
    const retryAfter = isBlocked
      ? null
      : new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    db.prepare(
      "UPDATE tracks SET download_status = 'failed', download_error = ? WHERE id = ?"
    ).run(String(error?.message || error), pending.track_id);
    const entries = db
      .prepare(
        "SELECT id FROM download_queue WHERE track_id = ? AND status IN ('pending', 'waiting', 'downloading')"
      )
      .all(pending.track_id);
    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      entries.forEach((entry) => {
        db.prepare(
          "UPDATE download_queue SET status = ?, error = ?, retry_after = ?, updated_at = ? WHERE id = ?"
        ).run(
          isBlocked ? "blocked" : "failed",
          String(error?.message || error),
          retryAfter,
          now,
          entry.id
        );
      });
    });
    transaction();
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

const activeDownloads = new Set();

async function scheduleDownloads() {
  while (activeDownloads.size < DOWNLOAD_CONCURRENCY) {
    const pending = await claimNextDownload();
    if (!pending) {
      break;
    }
    activeDownloads.add(pending.queue_id);
    processDownload(pending)
      .catch((error) => {
        log("error", "download worker error", {
          queueId: pending.queue_id,
          error: String(error?.message || error)
        });
      })
      .finally(() => {
        activeDownloads.delete(pending.queue_id);
      });
  }
}

const downloadInterval = setInterval(() => {
  scheduleDownloads();
}, 5000);

const voteInterval = setInterval(() => {
  tickVoting();
}, 1000);

function isAdminUser(user) {
  return user?.role === "admin";
}

function isChannelMemberUser(user) {
  return user?.role === "channel_member";
}

function hasDashboardAccess(user) {
  return isAdminUser(user) || isChannelMemberUser(user);
}

function requireAuth(req, res, next) {
  const user = req.session?.user;
  if (!user) {
    const isApiRequest = req.path?.startsWith("/api/");
    if (isApiRequest) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.accepts("html")) {
      return res.redirect("/login");
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!hasDashboardAccess(user)) {
    const allowedApi = new Set(["/api/me", "/api/auth/logout"]);
    if (req.path?.startsWith("/api/") && !allowedApi.has(req.path)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!req.path?.startsWith("/api/") && req.path !== "/dashboard/public") {
      return res.redirect("/dashboard/public");
    }
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (isAdminUser(req.session?.user)) {
    return next();
  }
  res.status(403).json({ error: "Forbidden" });
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

function parseYouTubePlaylistId(input) {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const listId = url.searchParams.get("list");
    if (listId) {
      return listId;
    }
  } catch {
    return null;
  }
  return null;
}

function playlistEntryToUrl(entry) {
  if (!entry) return null;
  if (typeof entry.url === "string" && entry.url.startsWith("http")) {
    return entry.url;
  }
  const id = entry.id || entry.url;
  if (typeof id === "string" && id.trim()) {
    return `https://www.youtube.com/watch?v=${id.trim()}`;
  }
  return null;
}

async function fetchPlaylistTrackUrls(playlistUrl) {
  const { args: cookieArgs, cleanup } = await buildYtDlpCookieArgs();
  try {
    const playlistRaw = await runYtDlp([
      "--flat-playlist",
      "--dump-single-json",
      ...cookieArgs,
      playlistUrl
    ]);
    const playlistData = JSON.parse(playlistRaw);
    const entries = Array.isArray(playlistData?.entries) ? playlistData.entries : [];
    return entries.map(playlistEntryToUrl).filter(Boolean);
  } finally {
    await cleanup();
  }
}


async function ingestLibrarySourceUrls({ urls = [], playlistId = null, addedByUserId = null } = {}) {
  const normalized = Array.isArray(urls)
    ? urls.map((url) => String(url || "").trim()).filter(Boolean)
    : [];
  if (!normalized.length) {
    return { importedCount: 0, imported: [], errors: [{ error: "No URLs provided" }] };
  }

  const insertTrack = db.prepare(
    "INSERT INTO tracks (id, youtube_id, url, title, duration_sec, channel, thumbnail, audio_path, download_status, download_error, downloaded_at, volume_adjust_db, intro_sec, outro_sec, tags, disabled, added_by_user_id, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL, 0, 0, 0, 'new', 0, ?, ?)"
  );
  const findTrack = db.prepare("SELECT id FROM tracks WHERE youtube_id = ?");
  const now = new Date().toISOString();
  const imported = [];
  const errors = [];

  for (const url of normalized) {
    const youtubeId = parseYouTubeId(url);
    if (!youtubeId) {
      errors.push({ url, error: "Invalid YouTube URL or ID" });
      continue;
    }
    const existing = findTrack.get(youtubeId);
    const trackId = existing ? existing.id : nanoid();
    if (!existing) {
      insertTrack.run(trackId, youtubeId, url, addedByUserId, now);
    }
    if (playlistId) {
      enqueueDownload(playlistId, trackId, { attachToPlaylist: true, addedByUserId });
    } else {
      enqueueDownload(LIBRARY_QUEUE_ID, trackId, { attachToPlaylist: false, addedByUserId });
    }
    imported.push({ id: trackId, youtubeId, url, reused: Boolean(existing) });
  }

  return { importedCount: imported.length, imported, errors };
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

function addTrackToPlaylist(playlistId, trackId) {
  const existing = db
    .prepare("SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?")
    .get(playlistId, trackId);
  if (existing) {
    return false;
  }
  const position =
    (db
      .prepare("SELECT MAX(position) as maxPosition FROM playlist_tracks WHERE playlist_id = ?")
      .get(playlistId).maxPosition || 0) + 1;
  db.prepare(
    "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
  ).run(playlistId, trackId, position);
  return true;
}

function enqueueDownload(playlistId, trackId, options = {}) {
  const attachToPlaylist = options.attachToPlaylist !== false;
  const addedByUserId = options.addedByUserId || null;
  const targetPlaylistId = playlistId || LIBRARY_QUEUE_ID;
  const track = db
    .prepare("SELECT download_status FROM tracks WHERE id = ?")
    .get(trackId);
  if (track?.download_status === "ready") {
    if (attachToPlaylist && playlistId && playlistId !== LIBRARY_QUEUE_ID) {
      addTrackToPlaylist(playlistId, trackId);
    }
    return;
  }
  const active = db
    .prepare(
      "SELECT 1 FROM download_queue WHERE track_id = ? AND status IN ('pending', 'downloading', 'waiting') LIMIT 1"
    )
    .get(trackId);
  const status = active ? "waiting" : "pending";
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO download_queue (id, playlist_id, track_id, attach_to_playlist, status, error, attempts, retry_after, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)"
  ).run(nanoid(), targetPlaylistId, trackId, attachToPlaylist ? 1 : 0, status, now, now);
  if (!active) {
    db.prepare(
      "UPDATE tracks SET download_status = 'pending', download_error = NULL WHERE id = ?"
    ).run(trackId);
  }
  if (addedByUserId) {
    db.prepare("UPDATE tracks SET added_by_user_id = ? WHERE id = ?").run(addedByUserId, trackId);
  }
  console.log(`Queued download for track ${trackId} (playlist ${targetPlaylistId}).`);
  broadcast("DOWNLOAD_UPDATE", { trackId, playlistId: targetPlaylistId, status });
}

function getPlayState() {
  return db.prepare("SELECT * FROM play_state WHERE id = 1").get();
}

function getCurrentTrack(playState) {
  if (!playState?.current_track_id) {
    return null;
  }
  return db
    .prepare(
      "SELECT id, youtube_id, url, title, duration_sec, channel, thumbnail, audio_path, download_status, volume_adjust_db, intro_sec, outro_sec, tags FROM tracks WHERE id = ?"
    )
    .get(playState.current_track_id);
}

function getQueue() {
  return db
    .prepare(
      "SELECT queue.id, queue.track_id, queue.source, queue.position, queue.created_at, queue.added_by_user_id, users.username AS added_by_username, tracks.title, tracks.channel FROM queue JOIN tracks ON tracks.id = queue.track_id LEFT JOIN users ON users.id = queue.added_by_user_id ORDER BY queue.position ASC, queue.created_at ASC"
    )
    .all();
}

function getPlaylistTrackRows() {
  return db
    .prepare(
      "SELECT playlist_tracks.playlist_id, tracks.id, tracks.title, tracks.youtube_id, tracks.url, playlist_tracks.disabled, tracks.download_status, tracks.audio_path, tracks.volume_adjust_db, tracks.intro_sec, tracks.outro_sec, tracks.tags, tracks.score, playlist_tracks.position FROM playlist_tracks JOIN tracks ON tracks.id = playlist_tracks.track_id ORDER BY playlist_tracks.position ASC"
    )
    .all();
}

function isTrackPlayable(track) {
  return Boolean(track && track.download_status === "ready" && track.audio_path);
}


function getEligiblePoolTracks({ excludedTrackIds = new Set() } = {}) {
  const poolTracks = db
    .prepare(
      "SELECT play_pool.id as pool_id, play_pool.track_id, play_pool.created_at, tracks.title, tracks.channel, tracks.score, tracks.download_status, tracks.audio_path FROM play_pool JOIN tracks ON tracks.id = play_pool.track_id ORDER BY play_pool.created_at ASC"
    )
    .all();
  return poolTracks.filter(
    (track) => !excludedTrackIds.has(track.track_id) && isTrackPlayable(track)
  );
}

function popNextPlayableQueueEntry() {
  const queueEntries = db
    .prepare(
      "SELECT queue.id, queue.track_id, queue.source, queue.position, queue.created_at, tracks.download_status, tracks.audio_path FROM queue JOIN tracks ON tracks.id = queue.track_id ORDER BY queue.position ASC, queue.created_at ASC"
    )
    .all();

  let removedCount = 0;
  for (const entry of queueEntries) {
    if (isTrackPlayable(entry)) {
      if (removedCount > 0) {
        normalizeQueuePositions();
        broadcast("QUEUE_UPDATE", { action: "cleaned", removedCount });
      }
      return entry;
    }

    const reason = "audio_unavailable";
    db.prepare("DELETE FROM queue WHERE id = ?").run(entry.id);
    removedCount += 1;
    log("warn", "queue entry removed", {
      queueId: entry.id,
      trackId: entry.track_id,
      reason
    });
    broadcast("QUEUE_UPDATE", { action: "removed_unplayable", queueId: entry.id, trackId: entry.track_id, reason });
  }

  if (removedCount > 0) {
    normalizeQueuePositions();
    broadcast("QUEUE_UPDATE", { action: "cleaned", removedCount });
  }

  return null;
}
function getPoolTracks() {
  return db
    .prepare(
      "SELECT play_pool.id, play_pool.track_id, play_pool.created_at, tracks.title, tracks.channel FROM play_pool JOIN tracks ON tracks.id = play_pool.track_id ORDER BY play_pool.created_at ASC"
    )
    .all();
}

function removeFromPool(trackId) {
  const result = db.prepare("DELETE FROM play_pool WHERE track_id = ?").run(trackId);
  if (result.changes > 0) {
    broadcast("POOL_UPDATE", { action: "removed", trackId });
  }
  return result.changes > 0;
}

function seedPool(trackIds) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO play_pool (id, track_id, created_at) VALUES (?, ?, ?)"
  );
  const transaction = db.transaction((ids) => {
    ids.forEach((trackId) => {
      insert.run(nanoid(), trackId, now);
    });
  });
  transaction(trackIds);
  broadcast("POOL_UPDATE", { action: "seeded", count: trackIds.length });
}

function insertPoolEntries(trackIds) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO play_pool (id, track_id, created_at) VALUES (?, ?, ?)"
  );
  trackIds.forEach((trackId) => {
    insert.run(nanoid(), trackId, now);
  });
}

function addToPool(trackId) {
  const existing = db
    .prepare("SELECT id FROM play_pool WHERE track_id = ? LIMIT 1")
    .get(trackId);
  if (existing) {
    return { added: false };
  }
  const now = new Date().toISOString();
  db.prepare("INSERT INTO play_pool (id, track_id, created_at) VALUES (?, ?, ?)").run(
    nanoid(),
    trackId,
    now
  );
  broadcast("POOL_UPDATE", { action: "added", trackId });
  return { added: true };
}

function getQueueNextPosition() {
  return (
    db.prepare("SELECT MAX(position) as maxPosition FROM queue").get().maxPosition || 0
  ) + 1;
}

function normalizeQueuePositions() {
  const entries = db
    .prepare("SELECT id FROM queue ORDER BY position ASC, created_at ASC")
    .all();
  const update = db.prepare("UPDATE queue SET position = ? WHERE id = ?");
  const transaction = db.transaction((items) => {
    items.forEach((item, index) => {
      update.run(index + 1, item.id);
    });
  });
  transaction(entries);
}

function broadcastStateUpdate({ includeQueue = false } = {}) {
  const playState = getPlayState();
  const currentTrack = getCurrentTrack(playState);
  const serverNow = Date.now();
  const queue = includeQueue ? getQueue() : undefined;
  const payload = queue
    ? { playState, currentTrack, queue, serverNow }
    : { playState, currentTrack, serverNow };
  broadcast("STATE_UPDATE", payload);
  broadcastType("STATE_UPDATE", payload);
  return { playState, currentTrack, queue, serverNow };
}

const VOTE_SETTINGS_DEFAULTS = {
  vote_options: 5,
  vote_duration: 30,
  vote_lead_time: 20
};

const TWITCH_MESSAGE_DEFAULTS = {
  vote_start: "Vote time! Choose the next track with {command}vote <number>.",
  vote_option: "{number}. {title}{channel}",
  vote_end: "Vote ended! Winner: {winner}",
  now_playing: "Now playing: {track}",
  no_active_vote: "No active vote right now.",
  vote_closed: "Voting is closed.",
  invalid_vote: "Invalid vote. Choose 1-{max}.",
  skip: "Skipped to the next track.",
  pause: "Playback paused.",
  resume: "Playback resumed."
};
const NOTIFICATION_SETTINGS_DEFAULTS = {
  discordEnabled: false,
  discordTemplate: "🔴 {channel} is live!\n{title}\n{game}\n{url}",
  discordEmbedEnabled: true,
  discordEmbedColor: "#5865F2",
  discordEmbedFooter: "",
  discordEmbedShowChannel: true,
  discordEmbedShowViewers: true,
  discordEmbedShowGame: true,
  discordEmbedImageUrlTemplate: "",
  discordEmbedThumbnailUrlTemplate: "",
  instagramEnabled: false,
  instagramTemplate: "🔴 LIVE NOW\n{title}\n🎮 {game}\n{url}"
};

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getSettingValue(key, fallback) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return fallback;
  if (typeof row.value === "number") return row.value;
  const rawValue = String(row.value ?? "");
  const trimmed = rawValue.trim();
  if (trimmed !== "" && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  return rawValue;
}

function getSettingBoolean(key, fallback) {
  const value = getSettingValue(key, undefined);
  if (value === undefined) return fallback;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return Boolean(value);
}

function getSettingString(key, fallback) {
  const value = getSettingValue(key, undefined);
  if (value === undefined) return fallback;
  return String(value);
}

function setSettingValue(key, value) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
}

function maskSecret(value, { visibleStart = 3, visibleEnd = 2 } = {}) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= visibleStart + visibleEnd) {
    return `${raw.slice(0, 1)}***`;
  }
  return `${raw.slice(0, visibleStart)}***${raw.slice(-visibleEnd)}`;
}

function getNotificationSettings({ includeSecrets = false } = {}) {
  const discordWebhook = getSettingString("notif_discord_webhook", "");
  const discordUsername = getSettingString("notif_discord_username", NOTIF_DISCORD_USERNAME);
  const discordAvatarUrl = getSettingString("notif_discord_avatar_url", NOTIF_DISCORD_AVATAR_URL);
  const instagramAccountId = getSettingString("notif_instagram_account_id", "");
  const instagramToken = getSettingString("notif_instagram_token", "");
  const settings = {
    discord: {
      enabled: getSettingBoolean("notif_discord_enabled", NOTIFICATION_SETTINGS_DEFAULTS.discordEnabled),
      template: getSettingString("notif_discord_template", NOTIFICATION_SETTINGS_DEFAULTS.discordTemplate),
      webhookMasked: maskSecret(discordWebhook, { visibleStart: 15, visibleEnd: 6 }),
      username: discordUsername,
      avatarUrl: discordAvatarUrl,
      embed: {
        enabled: getSettingBoolean("notif_discord_embed_enabled", NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedEnabled),
        color: getSettingString("notif_discord_embed_color", NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedColor),
        footerText: getSettingString("notif_discord_embed_footer", NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedFooter),
        showChannel: getSettingBoolean(
          "notif_discord_embed_show_channel",
          NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedShowChannel
        ),
        showViewers: getSettingBoolean(
          "notif_discord_embed_show_viewers",
          NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedShowViewers
        ),
        showGame: getSettingBoolean("notif_discord_embed_show_game", NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedShowGame),
        imageUrlTemplate: getSettingString(
          "notif_discord_embed_image_url_template",
          NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedImageUrlTemplate
        ),
        thumbnailUrlTemplate: getSettingString(
          "notif_discord_embed_thumbnail_url_template",
          NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedThumbnailUrlTemplate
        )
      }
    },
    instagram: {
      enabled: getSettingBoolean("notif_instagram_enabled", NOTIFICATION_SETTINGS_DEFAULTS.instagramEnabled),
      template: getSettingString("notif_instagram_template", NOTIFICATION_SETTINGS_DEFAULTS.instagramTemplate),
      accountIdMasked: maskSecret(instagramAccountId, { visibleStart: 4, visibleEnd: 2 }),
      tokenMasked: maskSecret(instagramToken, { visibleStart: 5, visibleEnd: 4 })
    }
  };
  if (includeSecrets) {
    settings.discord.webhook = discordWebhook;
    settings.instagram.accountId = instagramAccountId;
    settings.instagram.token = instagramToken;
  }
  return settings;
}

function normalizeEmoteList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getHypeSettings() {
  const emotes = normalizeEmoteList(getSettingString("overlay_hype_emotes", HYPE_DEFAULTS.emotes.join(",")));
  return {
    enabled: getSettingBoolean("overlay_hype_enabled", HYPE_DEFAULTS.enabled),
    emotes: emotes.length ? emotes : [...HYPE_DEFAULTS.emotes],
    thresholdPercent: clampNumber(
      Number(getSettingValue("overlay_hype_threshold_percent", HYPE_DEFAULTS.thresholdPercent)),
      1,
      100,
      HYPE_DEFAULTS.thresholdPercent
    ),
    durationSeconds: clampNumber(
      Number(getSettingValue("overlay_hype_duration_seconds", HYPE_DEFAULTS.durationSeconds)),
      3,
      120,
      HYPE_DEFAULTS.durationSeconds
    ),
    extensionRatio: clampNumber(
      Number(getSettingValue("overlay_hype_extension_ratio", HYPE_DEFAULTS.extensionRatio)),
      0.05,
      1,
      HYPE_DEFAULTS.extensionRatio
    ),
    userCooldownSeconds: clampNumber(
      Number(getSettingValue("overlay_hype_user_cooldown_seconds", HYPE_DEFAULTS.userCooldownSeconds)),
      0,
      60,
      HYPE_DEFAULTS.userCooldownSeconds
    )
  };
}

function messageContainsHypeEmote(message, emotes) {
  const normalized = String(message || "").toLowerCase();
  if (!normalized) return false;
  return emotes.some((emote) => normalized.includes(String(emote).toLowerCase()));
}

function triggerHype(durationMs) {
  const now = Date.now();
  overlayState.hypeLastTriggeredAt = now;
  overlayState.hypeUntil = Math.max(overlayState.hypeUntil, now) + durationMs;
}

function handleHypeChatMessage({ user, message }) {
  const settings = getHypeSettings();
  if (!settings.enabled) return;
  if (!messageContainsHypeEmote(message, settings.emotes)) return;

  const now = Date.now();
  const active = overlayState.hypeUntil > now;
  if (!active) {
    hypeRuntime.participants.clear();
  }

  const userKey = String(user || "").trim().toLowerCase();
  if (!userKey) return;

  const cooldownMs = settings.userCooldownSeconds * 1000;
  const lastCounted = hypeRuntime.userLastCountedAt.get(userKey) || 0;
  if (cooldownMs > 0 && now - lastCounted < cooldownMs) {
    return;
  }
  if (hypeRuntime.participants.has(userKey)) {
    return;
  }

  hypeRuntime.userLastCountedAt.set(userKey, now);
  hypeRuntime.participants.add(userKey);

  if (active) {
    const extensionMs = Math.max(1000, Math.round(settings.durationSeconds * settings.extensionRatio * 1000));
    triggerHype(extensionMs);
    return;
  }

  const liveViewers = Number(twitchChannelStatusCache.viewerCount || 0);
  const requiredParticipants = Math.max(
    1,
    Math.ceil((Math.max(1, liveViewers) * settings.thresholdPercent) / 100)
  );
  if (hypeRuntime.participants.size >= requiredParticipants) {
    hypeRuntime.participants.clear();
    triggerHype(Math.round(settings.durationSeconds * 1000));
  }
}


function formatTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });
}

function getVotingSettings() {
  const options = clampNumber(
    Number(getSettingValue("vote_options", VOTE_SETTINGS_DEFAULTS.vote_options)),
    2,
    5,
    VOTE_SETTINGS_DEFAULTS.vote_options
  );
  const duration = clampNumber(
    Number(getSettingValue("vote_duration", VOTE_SETTINGS_DEFAULTS.vote_duration)),
    5,
    300,
    VOTE_SETTINGS_DEFAULTS.vote_duration
  );
  const leadTime = clampNumber(
    Number(getSettingValue("vote_lead_time", VOTE_SETTINGS_DEFAULTS.vote_lead_time)),
    0,
    300,
    VOTE_SETTINGS_DEFAULTS.vote_lead_time
  );
  return { options, duration, leadTime };
}

function parseVoteRound(row) {
  if (!row) return null;
  let options = [];
  try {
    options = JSON.parse(row.options_json) || [];
  } catch {
    options = [];
  }
  return {
    id: row.id,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    options,
    winnerTrackId: row.winner_track_id || null
  };
}

function getLatestOpenVoteRound() {
  const row = db
    .prepare(
      "SELECT * FROM vote_rounds WHERE winner_track_id IS NULL ORDER BY started_at DESC LIMIT 1"
    )
    .get();
  return parseVoteRound(row);
}

function getVoteTallies(voteRoundId) {
  const rows = db
    .prepare(
      "SELECT option_index, COUNT(*) as count FROM votes WHERE vote_round_id = ? GROUP BY option_index"
    )
    .all(voteRoundId);
  return rows.reduce((acc, row) => {
    acc[row.option_index] = row.count;
    return acc;
  }, {});
}

function broadcastVoteUpdate(round) {
  if (!round) return;
  const counts = getVoteTallies(round.id);
  broadcast("VOTE_UPDATE", {
    roundId: round.id,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    options: round.options,
    counts
  });
}

function buildVoteSummary(options) {
  return options
    .map((option, index) => `${index + 1}. ${formatOptionLabel(option)}`)
    .join(" | ");
}

function enqueueTrack(trackId, source, addedByUserId = null) {
  const entry = {
    id: nanoid(),
    track_id: trackId,
    source,
    position: getQueueNextPosition(),
    created_at: new Date().toISOString(),
    added_by_user_id: addedByUserId
  };
  db.prepare(
    "INSERT INTO queue (id, track_id, source, position, created_at, added_by_user_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(entry.id, entry.track_id, entry.source, entry.position, entry.created_at, entry.added_by_user_id);
  broadcast("QUEUE_UPDATE", { entry });
  removeFromPool(trackId);
  return entry;
}

function pauseSession() {
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  if (!playState?.current_track_id || playState.paused) {
    return { playState };
  }
  db.prepare(
    "UPDATE play_state SET paused = 1, paused_at_ms = ?, updated_at = ? WHERE id = 1"
  ).run(Date.now(), new Date().toISOString());
  log("info", "session pause", { trackId: playState.current_track_id });
  const { playState: updated } = broadcastStateUpdate();
  return { playState: updated };
}

function resumeSession() {
  const playState = db.prepare("SELECT * FROM play_state WHERE id = 1").get();
  if (!playState?.current_track_id || !playState.paused) {
    return { playState };
  }
  const elapsed = playState.started_at_ms
    ? playState.paused_at_ms - playState.started_at_ms
    : 0;
  const startedAt = Date.now() - Math.max(0, elapsed);
  db.prepare(
    "UPDATE play_state SET paused = 0, paused_at_ms = NULL, started_at_ms = ?, updated_at = ? WHERE id = 1"
  ).run(startedAt, new Date().toISOString());
  log("info", "session resume", { trackId: playState.current_track_id });
  const { playState: updated } = broadcastStateUpdate();
  return { playState: updated };
}

function skipQueue() {
  const next = popNextPlayableQueueEntry();
  if (next) {
    db.prepare("DELETE FROM queue WHERE id = ?").run(next.id);
    normalizeQueuePositions();
    db.prepare(
      "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused_at_ms = NULL, paused = 0, updated_at = ? WHERE id = 1"
    ).run(next.track_id, Date.now(), new Date().toISOString());
  } else {
    const activeVote = getLatestOpenVoteRound();
    const excludedVoteTrackIds = new Set(
      activeVote?.options?.map((option) => option.trackId) || []
    );
    const eligiblePool = getEligiblePoolTracks({ excludedTrackIds: excludedVoteTrackIds });
    if (eligiblePool.length > 0) {
      const nextTrack = pickRandom(eligiblePool);
      if (nextTrack) {
        removeFromPool(nextTrack.track_id);
        db.prepare(
          "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused_at_ms = NULL, paused = 0, updated_at = ? WHERE id = 1"
        ).run(nextTrack.track_id, Date.now(), new Date().toISOString());
      }
    } else {
      db.prepare(
        "UPDATE play_state SET current_track_id = NULL, started_at_ms = NULL, paused_at_ms = NULL, paused = 1, updated_at = ? WHERE id = 1"
      ).run(new Date().toISOString());
    }
  }
  log("info", "queue skip", { nextTrackId: next?.track_id || null });
  const { playState, queue } = broadcastStateUpdate({ includeQueue: true });
  return { playState, queue };
}


function skipQueueIfCurrentTrack(expectedTrackId = null) {
  if (!expectedTrackId) {
    return { skipped: true, ...skipQueue() };
  }
  const playState = getPlayState();
  if (!playState?.current_track_id || playState.current_track_id !== expectedTrackId) {
    const queue = getQueue();
    return { skipped: false, playState, queue };
  }
  return { skipped: true, ...skipQueue() };
}

function maybeAutoSkipFromTelemetry(clientMeta) {
  const now = Date.now();
  if (now - lastAutoSkipAt < AUTO_SKIP_COOLDOWN_MS) return;
  const playState = getPlayState();
  const currentTrack = getCurrentTrack(playState);
  if (!playState?.current_track_id || playState.paused || !currentTrack) return;

  const activeStreamClients = getActiveStreamClients();
  if (activeStreamClients.length === 0) return;
  if (!clientMeta?.fatalErrorTimes || clientMeta.fatalErrorTimes.length < 3) return;

  const recentErrors = clientMeta.fatalErrorTimes.filter((ts) => now - ts <= AUTO_SKIP_ERROR_WINDOW_MS);
  clientMeta.fatalErrorTimes = recentErrors;
  if (recentErrors.length < 3) return;
  if (!Number.isFinite(clientMeta.progressMarkTime) || !Number.isFinite(clientMeta.lastProgressAt)) return;
  if (now - clientMeta.lastProgressAt < AUTO_SKIP_STUCK_MS) return;
  if (Math.abs((clientMeta.lastProgressSeconds || 0) - (clientMeta.progressMarkTime || 0)) > 0.5) return;

  if (activeStreamClients.length > 1) {
    log("warn", "auto-skip prevented due to multiple stream clients", {
      clients: activeStreamClients.length,
      userId: clientMeta.userId,
      clientId: clientMeta.clientId
    });
    return;
  }

  lastAutoSkipAt = now;
  log("warn", "auto-skip triggered from telemetry", {
    userId: clientMeta.userId,
    clientId: clientMeta.clientId,
    trackId: playState.current_track_id
  });
  skipQueue();
}

function broadcastChatMessage({
  user,
  message,
  isSystem = false,
  isCommand = false,
  role = "viewer"
}) {
  broadcast("CHAT_MESSAGE", {
    user,
    message,
    isSystem,
    isCommand,
    role,
    timestamp: new Date().toISOString()
  });
}

function sendBotMessage(message) {
  broadcastChatMessage({ user: "Erwin", message, isSystem: true, role: "bot" });
  sendTwitchMessage(message);
}

function parseTags(raw) {
  return raw.split(";").reduce((acc, pair) => {
    const [key, value] = pair.split("=");
    acc[key] = value ?? "";
    return acc;
  }, {});
}

function parseIrcMessage(line) {
  let rest = line;
  let tags = {};
  let prefix = "";
  if (rest.startsWith("@")) {
    const spaceIndex = rest.indexOf(" ");
    if (spaceIndex !== -1) {
      tags = parseTags(rest.slice(1, spaceIndex));
      rest = rest.slice(spaceIndex + 1);
    }
  }
  if (rest.startsWith(":")) {
    const spaceIndex = rest.indexOf(" ");
    if (spaceIndex !== -1) {
      prefix = rest.slice(1, spaceIndex);
      rest = rest.slice(spaceIndex + 1);
    }
  }
  const trailingIndex = rest.indexOf(" :");
  const middle = trailingIndex === -1 ? rest : rest.slice(0, trailingIndex);
  const trailing = trailingIndex === -1 ? "" : rest.slice(trailingIndex + 2);
  const parts = middle.split(" ").filter(Boolean);
  const command = parts.shift() || "";
  return {
    tags,
    prefix,
    command,
    params: parts,
    trailing
  };
}

function getIrcUsername(prefix) {
  if (!prefix) return "";
  return prefix.split("!")[0] || prefix;
}

function isModerator(tags) {
  const badges = tags.badges || "";
  return tags.mod === "1" || badges.includes("broadcaster") || badges.includes("moderator");
}

function formatTrackLabel(track) {
  if (!track) return "Nothing is playing.";
  const title = track.title || track.youtube_id || "Untitled track";
  const channel = track.channel ? ` by ${track.channel}` : "";
  return `${title}${channel}`;
}

function formatOptionLabel(option) {
  if (!option) return "Untitled track";
  const title = option.title || option.trackId || "Untitled track";
  const channel = option.channel ? ` by ${option.channel}` : "";
  return `${title}${channel}`;
}

function getTwitchMessage(key, fallback, values = {}) {
  const template = getSettingString(key, fallback);
  const message = formatTemplate(template, values).trim();
  if (!message) return "";
  if (key.startsWith("twitch_") && message === "0") {
    return "";
  }
  return message;
}

function sendTwitchMessageLines(lines) {
  lines.forEach((line) => {
    const message = String(line ?? "").trim();
    if (!message) return;
    sendBotMessage(message);
  });
}

function normalizeCustomCommandName(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^!+/, "")
    .replace(/\s+/g, "");
}

function parseCustomCommandAliases(rawAliases) {
  let aliases = [];
  if (Array.isArray(rawAliases)) {
    aliases = rawAliases;
  } else if (typeof rawAliases === "string") {
    aliases = rawAliases
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [...new Set(aliases.map((alias) => normalizeCustomCommandName(alias)).filter(Boolean))];
}

function parseCustomCommandRow(row) {
  if (!row) return null;
  let aliases = [];
  try {
    const parsed = JSON.parse(row.aliases_json || "[]");
    if (Array.isArray(parsed)) {
      aliases = parseCustomCommandAliases(parsed);
    }
  } catch {
    aliases = [];
  }
  return {
    id: row.id,
    command: row.command,
    aliases,
    response: row.response,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getCustomCommands() {
  const rows = db
    .prepare(
      "SELECT id, command, aliases_json, response, enabled, created_at, updated_at FROM twitch_custom_commands ORDER BY command ASC"
    )
    .all();
  return rows.map(parseCustomCommandRow);
}

function getCustomCommandLookupMap() {
  const map = new Map();
  const commands = getCustomCommands();
  commands.forEach((entry) => {
    if (!entry?.enabled) return;
    map.set(entry.command, entry);
    entry.aliases.forEach((alias) => {
      if (!map.has(alias)) {
        map.set(alias, entry);
      }
    });
  });
  return map;
}

function validateCustomCommandInput(payload, options = {}) {
  const allowPartial = Boolean(options.allowPartial);
  const errors = [];

  const hasCommand = Object.prototype.hasOwnProperty.call(payload, "command");
  const hasResponse = Object.prototype.hasOwnProperty.call(payload, "response");
  const hasAliases = Object.prototype.hasOwnProperty.call(payload, "aliases");
  const hasEnabled = Object.prototype.hasOwnProperty.call(payload, "enabled");

  const normalizedCommand = hasCommand ? normalizeCustomCommandName(payload.command) : null;
  if (!allowPartial || hasCommand) {
    if (!normalizedCommand) {
      errors.push("command is required");
    } else if (!/^[a-z0-9_\-]{1,32}$/.test(normalizedCommand)) {
      errors.push("command must be 1-32 chars of a-z, 0-9, _ or -");
    }
  }

  const response = hasResponse ? String(payload.response ?? "").trim() : null;
  if (!allowPartial || hasResponse) {
    if (!response) {
      errors.push("response is required");
    } else if (response.length > 500) {
      errors.push("response must be 500 characters or fewer");
    }
  }

  const aliases = hasAliases ? parseCustomCommandAliases(payload.aliases) : null;
  if (hasAliases) {
    if (aliases.some((alias) => !/^[a-z0-9_\-]{1,32}$/.test(alias))) {
      errors.push("aliases must be 1-32 chars of a-z, 0-9, _ or -");
    }
    if (normalizedCommand && aliases.includes(normalizedCommand)) {
      errors.push("aliases cannot include the main command");
    }
    if (aliases.length > 25) {
      errors.push("maximum 25 aliases allowed");
    }
  }

  const enabled = hasEnabled ? (payload.enabled ? 1 : 0) : null;

  return {
    errors,
    value: {
      command: normalizedCommand,
      response,
      aliases,
      enabled
    }
  };
}

function detectCustomCommandConflicts({ command, aliases, excludeId = null }) {
  const reservedCommands = new Set(["vote", "song", "skip", "pause", "resume"]);
  const existing = getCustomCommands().filter((entry) => !excludeId || entry.id !== excludeId);
  const lookup = new Map();
  existing.forEach((entry) => {
    lookup.set(entry.command, entry.command);
    entry.aliases.forEach((alias) => lookup.set(alias, entry.command));
  });
  const duplicates = [];
  if (command && reservedCommands.has(command)) {
    duplicates.push(`command '${command}' is reserved by a built-in bot action`);
  }
  if (command && lookup.has(command)) {
    duplicates.push(`command '${command}' conflicts with existing '${lookup.get(command)}'`);
  }
  (aliases || []).forEach((alias) => {
    if (reservedCommands.has(alias)) {
      duplicates.push(`alias '${alias}' is reserved by a built-in bot action`);
      return;
    }
    if (lookup.has(alias)) {
      duplicates.push(`alias '${alias}' conflicts with existing '${lookup.get(alias)}'`);
    }
  });
  return [...new Set(duplicates)];
}

function pickRandom(array) {
  if (!array.length) return null;
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getVoteCandidates() {
  const playState = getPlayState();
  const currentTrackId = playState?.current_track_id;
  const queuedIds = new Set(getQueue().map((entry) => entry.track_id));
  return getEligiblePoolTracks().filter(
    (track) => track.track_id !== currentTrackId && !queuedIds.has(track.track_id)
  ).map((track) => ({
    id: track.track_id,
    title: track.title,
    channel: track.channel,
    score: track.score
  }));
}

function startVoteRound() {
  const settings = getVotingSettings();
  const candidates = getVoteCandidates();
  if (candidates.length < 2) {
    log("warn", "not enough vote candidates", { candidates: candidates.length });
    return null;
  }
  const selectedCount = Math.max(2, Math.min(settings.options, candidates.length));
  const selected = shuffleArray(candidates).slice(0, selectedCount);
  const options = selected.map((track) => ({
    trackId: track.id,
    title: track.title,
    channel: track.channel,
    score: track.score
  }));
  const now = new Date();
  const endsAt = new Date(now.getTime() + settings.duration * 1000);
  const round = {
    id: nanoid(),
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    options_json: JSON.stringify(options),
    winner_track_id: null
  };
  db.prepare(
    "INSERT INTO vote_rounds (id, started_at, ends_at, options_json, winner_track_id) VALUES (?, ?, ?, ?, NULL)"
  ).run(round.id, round.started_at, round.ends_at, round.options_json);
  const parsed = parseVoteRound(round);
  broadcast("VOTE_START", {
    roundId: parsed.id,
    startedAt: parsed.startedAt,
    endsAt: parsed.endsAt,
    options: parsed.options,
    counts: {}
  });
  const headerMessage = getTwitchMessage(
    "twitch_vote_start_message",
    TWITCH_MESSAGE_DEFAULTS.vote_start,
    {
      command: TWITCH_COMMAND_PREFIX,
      summary: buildVoteSummary(options)
    }
  );
  const optionTemplate = getSettingString(
    "twitch_vote_option_message",
    TWITCH_MESSAGE_DEFAULTS.vote_option
  );
  const optionLines = options.map((option, index) => {
    return formatTemplate(optionTemplate, {
      number: index + 1,
      title: option.title || option.trackId,
      channel: option.channel ? ` — ${option.channel}` : "",
      track: formatOptionLabel(option)
    });
  });
  sendTwitchMessageLines([headerMessage, ...optionLines]);
  return parsed;
}

function calculateVoteEloSignals(voteEntries, totalVotes) {
  const baseK = 18;
  const ratings = new Map();
  voteEntries.forEach((entry) => {
    ratings.set(entry.option.trackId, 1000 + clampTrackScore(entry.option.score ?? 0) * 6);
  });
  const signals = new Map();
  voteEntries.forEach((aEntry, index) => {
    for (let j = index + 1; j < voteEntries.length; j += 1) {
      const bEntry = voteEntries[j];
      const aVotes = aEntry.count;
      const bVotes = bEntry.count;
      const pairVotes = aVotes + bVotes;
      if (pairVotes <= 0) continue;
      const aRating = ratings.get(aEntry.option.trackId) || 1000;
      const bRating = ratings.get(bEntry.option.trackId) || 1000;
      const expectedA = 1 / (1 + 10 ** ((bRating - aRating) / 400));
      const expectedB = 1 - expectedA;
      let actualA = 0.5;
      if (aVotes > bVotes) actualA = 1;
      if (aVotes < bVotes) actualA = 0;
      const actualB = 1 - actualA;
      const participationFactor = pairVotes / Math.max(1, totalVotes);
      const marginFactor = 1 + Math.abs(aVotes - bVotes) / Math.max(1, totalVotes);
      const pairScale = baseK * participationFactor * marginFactor;
      const deltaA = (actualA - expectedA) * pairScale;
      const deltaB = (actualB - expectedB) * pairScale;
      signals.set(aEntry.option.trackId, (signals.get(aEntry.option.trackId) || 0) + deltaA);
      signals.set(bEntry.option.trackId, (signals.get(bEntry.option.trackId) || 0) + deltaB);
    }
  });
  return signals;
}

function endVoteRound(round) {
  const counts = getVoteTallies(round.id);
  const options = round.options || [];
  const voteEntries = options.map((option, index) => ({
    index: index + 1,
    count: counts[index + 1] || 0,
    option
  }));
  const totalVotes = voteEntries.reduce((sum, entry) => sum + entry.count, 0);
  const maxVotes = Math.max(...voteEntries.map((entry) => entry.count));
  const topEntries = voteEntries.filter((entry) => entry.count === maxVotes);
  const winnerEntry =
    maxVotes > 0 ? pickRandom(topEntries) : pickRandom(voteEntries);
  if (totalVotes >= options.length && options.length > 1) {
    const scoreSignals = calculateVoteEloSignals(voteEntries, totalVotes);
    scoreSignals.forEach((signal, trackId) => {
      applyTrackScoreSignal(trackId, signal, "vote_result_elo");
    });
  }
  if (!winnerEntry) {
    return null;
  }
  db.prepare("UPDATE vote_rounds SET winner_track_id = ? WHERE id = ?").run(
    winnerEntry.option.trackId,
    round.id
  );
  const queueEntry = enqueueTrack(winnerEntry.option.trackId, "vote", null);
  broadcast("VOTE_END", {
    roundId: round.id,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    options,
    counts,
    winner: winnerEntry.option
  });
  const winnerLabel = formatOptionLabel(winnerEntry.option);
  const voteEndMessage = getTwitchMessage(
    "twitch_vote_end_message",
    TWITCH_MESSAGE_DEFAULTS.vote_end,
    { winner: winnerLabel }
  );
  sendTwitchMessageLines([voteEndMessage]);
  return { winner: winnerEntry.option, queueEntry };
}

let lastVoteTrackId = null;

function tickVoting() {
  const active = getLatestOpenVoteRound();
  if (active) {
    if (new Date(active.endsAt).getTime() <= Date.now()) {
      endVoteRound(active);
    }
    return;
  }
  const autoEnabled = getSettingBoolean("vote_auto_enabled", true);
  if (!autoEnabled) {
    return;
  }
  if (getQueue().length > 0) {
    return;
  }
  const playState = getPlayState();
  if (!playState?.current_track_id) {
    lastVoteTrackId = null;
    return;
  }
  if (playState.paused) {
    return;
  }
  if (lastVoteTrackId === playState.current_track_id) {
    return;
  }
  const currentTrack = getCurrentTrack(playState);
  if (!currentTrack?.duration_sec || !playState.started_at_ms) {
    return;
  }
  const elapsedSec = Math.max(0, (Date.now() - playState.started_at_ms) / 1000);
  const remainingSec = currentTrack.duration_sec - elapsedSec;
  const { leadTime } = getVotingSettings();
  if (remainingSec <= leadTime && remainingSec > 0) {
    const round = startVoteRound();
    if (round) {
      lastVoteTrackId = playState.current_track_id;
    }
  }
}

let twitchSocket = null;
let twitchConnected = false;
let twitchOauthToken = TWITCH_OAUTH_TOKEN;
let twitchRefreshToken = TWITCH_REFRESH_TOKEN;
let twitchTokenRefreshTimer = null;
let twitchRefreshInFlight = null;

const TWITCH_CHANNEL_STATUS_TTL_MS = 10_000;
const STREAM_NOTIFICATION_WATCH_INTERVAL_MS = 30_000;
const STREAM_NOTIFICATION_COOLDOWN_MS = 3 * 60 * 1000;
const twitchChannelStatusCache = {
  fetchedAt: 0,
  channel: TWITCH_CHANNEL || "",
  live: false,
  viewerCount: 0,
  startedAt: "",
  gameName: "",
  title: "",
  error: ""
};
let previousLive = null;

function getTwitchHelixAccessToken() {
  const channelToken = getSettingString("twitch_channel_auth_access_token", "");
  const raw = channelToken || twitchOauthToken || "";
  return String(raw).replace(/^oauth:/, "").trim();
}

async function fetchTwitchChannelStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - twitchChannelStatusCache.fetchedAt < TWITCH_CHANNEL_STATUS_TTL_MS) {
    return twitchChannelStatusCache;
  }
  const channelLogin = String(TWITCH_CHANNEL || getSettingString("twitch_channel_auth_login", "")).trim();
  if (!channelLogin) {
    twitchChannelStatusCache.fetchedAt = now;
    twitchChannelStatusCache.channel = "";
    twitchChannelStatusCache.live = false;
    twitchChannelStatusCache.viewerCount = 0;
    twitchChannelStatusCache.startedAt = "";
    twitchChannelStatusCache.error = "channel_not_linked";
    return twitchChannelStatusCache;
  }
  const token = getTwitchHelixAccessToken();
  if (!TWITCH_CLIENT_ID || !token) {
    twitchChannelStatusCache.fetchedAt = now;
    twitchChannelStatusCache.channel = channelLogin;
    twitchChannelStatusCache.live = false;
    twitchChannelStatusCache.viewerCount = 0;
    twitchChannelStatusCache.startedAt = "";
    twitchChannelStatusCache.error = "missing_twitch_api_credentials";
    return twitchChannelStatusCache;
  }

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelLogin)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": TWITCH_CLIENT_ID
        }
      }
    );
    if (!response.ok) {
      const text = await response.text();
      twitchChannelStatusCache.fetchedAt = now;
      twitchChannelStatusCache.channel = channelLogin;
      twitchChannelStatusCache.live = false;
      twitchChannelStatusCache.viewerCount = 0;
      twitchChannelStatusCache.startedAt = "";
      twitchChannelStatusCache.error = `helix_stream_error_${response.status}`;
      log("warn", "twitch channel status request failed", { status: response.status, body: text.slice(0, 300) });
      return twitchChannelStatusCache;
    }
    const payload = await response.json();
    const stream = Array.isArray(payload?.data) ? payload.data[0] : null;
    twitchChannelStatusCache.fetchedAt = now;
    twitchChannelStatusCache.channel = channelLogin;
    twitchChannelStatusCache.live = Boolean(stream);
    twitchChannelStatusCache.viewerCount = Number(stream?.viewer_count || 0);
    twitchChannelStatusCache.startedAt = String(stream?.started_at || "");
    twitchChannelStatusCache.gameName = String(stream?.game_name || "");
    twitchChannelStatusCache.title = String(stream?.title || "");
    twitchChannelStatusCache.error = "";
    return twitchChannelStatusCache;
  } catch (error) {
    twitchChannelStatusCache.fetchedAt = now;
    twitchChannelStatusCache.channel = channelLogin;
    twitchChannelStatusCache.live = false;
    twitchChannelStatusCache.viewerCount = 0;
    twitchChannelStatusCache.startedAt = "";
    twitchChannelStatusCache.error = "network_error";
    log("warn", "twitch channel status network error", { error: String(error?.message || error) });
    return twitchChannelStatusCache;
  }
}

function dispatchStreamLiveNotification(payload) {
  log("info", "stream live notification dispatch", {
    channelLogin: payload.channelLogin,
    channelDisplayName: payload.channelDisplayName,
    title: payload.title,
    game: payload.game,
    viewerCount: payload.viewerCount,
    url: payload.url,
    timestamp: payload.timestamp
  });

  const notificationSettings = getNotificationSettings({ includeSecrets: true });

  sendDiscordStreamStartNotification(payload, {
    webhookUrl: notificationSettings.discord.webhook || DISCORD_STREAM_LIVE_WEBHOOK_URL,
    mentionRoleId: DISCORD_MENTION_ROLE_ID,
    template: notificationSettings.discord.template || NOTIFY_TEMPLATE_DISCORD,
    username: notificationSettings.discord.username,
    avatarUrl: notificationSettings.discord.avatarUrl,
    enabled: notificationSettings.discord.enabled,
    embedEnabled: notificationSettings.discord.embed?.enabled,
    embedColor: notificationSettings.discord.embed?.color,
    embedFooterText: notificationSettings.discord.embed?.footerText,
    embedShowChannel: notificationSettings.discord.embed?.showChannel,
    embedShowViewers: notificationSettings.discord.embed?.showViewers,
    embedShowGame: notificationSettings.discord.embed?.showGame,
    embedImageUrlTemplate: notificationSettings.discord.embed?.imageUrlTemplate,
    embedThumbnailUrlTemplate: notificationSettings.discord.embed?.thumbnailUrlTemplate
  })
    .then((result) => {
      if (result?.skipped) {
        log("info", "discord stream notification skipped", { reason: result.reason });
        return;
      }
      log("info", "discord stream notification sent", {
        channelLogin: payload.channelLogin,
        status: result?.status || null
      });
    })
    .catch((error) => {
      log("error", "discord stream notification failed", {
        error: String(error?.message || error),
        channelLogin: payload.channelLogin
      });
    });

  if (!notificationSettings.instagram.enabled) {
    return;
  }

  instagramIntegration
    .publishStory(payload, {
      businessAccountId: notificationSettings.instagram.accountId,
      accessToken: notificationSettings.instagram.token,
      template: notificationSettings.instagram.template || NOTIFICATION_SETTINGS_DEFAULTS.instagramTemplate
    })
    .then((result) => {
      if (result?.skipped) {
        log("info", "instagram story publish skipped", { reason: result.reason });
        return;
      }
      log("info", "instagram story published", {
        containerId: result?.containerId || null,
        mediaId: result?.publishedMediaId || null,
        mediaUrl: result?.mediaUrl || null
      });
    })
    .catch((error) => {
      log("error", "instagram story publish failed", {
        error: String(error?.message || error),
        meta: error?.meta || null,
        status: error?.status || null
      });
    });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDiscordEmbedColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalizedHex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(normalizedHex)) {
    return Number.parseInt(normalizedHex, 16);
  }
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 16777215) {
      return Math.trunc(numeric);
    }
  }
  return null;
}

async function sendDiscordStreamStartNotification(payload, options = {}) {
  const webhookUrl = String(options.webhookUrl || "").trim() || DISCORD_STREAM_LIVE_WEBHOOK_URL;
  const mentionRoleId = String(options.mentionRoleId || "").trim() || DISCORD_MENTION_ROLE_ID;
  const template = String(options.template || "").trim() || NOTIFY_TEMPLATE_DISCORD;
  const username = String(options.username || "").trim();
  const avatarUrl = String(options.avatarUrl || "").trim();
  const enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
  const embedEnabled = options.embedEnabled !== undefined ? Boolean(options.embedEnabled) : true;
  const embedColor = parseDiscordEmbedColor(options.embedColor);
  const embedFooterText = String(options.embedFooterText || "").trim();
  const embedShowChannel = options.embedShowChannel !== undefined ? Boolean(options.embedShowChannel) : true;
  const embedShowViewers = options.embedShowViewers !== undefined ? Boolean(options.embedShowViewers) : true;
  const embedShowGame = options.embedShowGame !== undefined ? Boolean(options.embedShowGame) : true;
  const embedImageUrlTemplate = String(options.embedImageUrlTemplate || "").trim();
  const embedThumbnailUrlTemplate = String(options.embedThumbnailUrlTemplate || "").trim();

  if (!enabled) {
    return { skipped: true, reason: "disabled" };
  }

  if (!webhookUrl) {
    return { skipped: true, reason: "webhook_not_configured" };
  }

  const templateValues = {
    channel: payload.channelDisplayName || payload.channelLogin || "",
    title: payload.title || "",
    game: payload.game || "",
    url: payload.url || "",
    startedAt: payload.startedAt || payload.timestamp || ""
  };
  const formattedContent = formatTemplate(template, templateValues).trim();
  const mentionPrefix = mentionRoleId ? `<@&${mentionRoleId}>` : "";
  const content = [mentionPrefix, formattedContent].filter(Boolean).join("\n");

  const requestBody = { content };
  if (embedEnabled) {
    const fields = [];
    if (embedShowChannel) {
      fields.push({
        name: "Channel",
        value: payload.channelDisplayName || payload.channelLogin || "Unknown",
        inline: true
      });
    }
    if (embedShowViewers) {
      fields.push({
        name: "Viewers",
        value: String(Math.max(0, Number(payload.viewerCount || 0))),
        inline: true
      });
    }
    if (embedShowGame) {
      fields.push({
        name: "Game",
        value: payload.game || "Unknown",
        inline: true
      });
    }

    const embed = {
      title: payload.title || "Stream is live",
      url: payload.url || "https://twitch.tv",
      description: payload.game ? `Category: ${payload.game}` : "Category: Unknown",
      timestamp: payload.startedAt || payload.timestamp || new Date().toISOString()
    };
    if (fields.length) {
      embed.fields = fields;
    }
    if (embedColor !== null) {
      embed.color = embedColor;
    }
    if (embedFooterText) {
      embed.footer = { text: embedFooterText };
    }
    const imageUrl = formatTemplate(embedImageUrlTemplate, templateValues).trim();
    if (imageUrl) {
      embed.image = { url: imageUrl };
    }
    const thumbnailUrl = formatTemplate(embedThumbnailUrlTemplate, templateValues).trim();
    if (thumbnailUrl) {
      embed.thumbnail = { url: thumbnailUrl };
    }
    requestBody.embeds = [embed];
  }
  if (username) requestBody.username = username;
  if (avatarUrl) requestBody.avatar_url = avatarUrl;

  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      const bodyText = await response.text();
      if (response.ok) {
        return { ok: true, status: response.status };
      }

      const snippet = bodyText.slice(0, 300);
      lastError = new Error(`discord webhook responded with status ${response.status}`);
      log("warn", "discord webhook request failed", {
        attempt,
        status: response.status,
        body: snippet
      });
    } catch (error) {
      lastError = error;
      log("warn", "discord webhook network error", {
        attempt,
        error: String(error?.message || error)
      });
    }

    if (attempt < maxAttempts) {
      await delay(attempt * 500);
    }
  }

  throw lastError || new Error("discord webhook request failed");
}

function maybeDispatchStreamLiveNotification(status) {
  const currentLive = Boolean(status?.live);
  if (previousLive === null) {
    previousLive = currentLive;
    return;
  }
  const isRisingEdge = previousLive === false && currentLive === true;
  if (!isRisingEdge) {
    previousLive = currentLive;
    return;
  }
  const now = Date.now();
  const startedAt = String(status?.startedAt || "");
  const title = String(status?.title || "").trim();
  const game = String(status?.gameName || "").trim();
  const lastStartedAt = getSettingString("notif_last_stream_started_at", "");
  const lastTitle = getSettingString("notif_last_stream_title", "");
  const lastGame = getSettingString("notif_last_stream_game", "");
  const lastTriggeredRaw = Number(getSettingValue("notif_last_triggered_at", 0));
  const lastTriggeredAt = Number.isFinite(lastTriggeredRaw) ? lastTriggeredRaw : 0;
  const inCooldown = now - lastTriggeredAt < STREAM_NOTIFICATION_COOLDOWN_MS;
  const sameStreamFingerprint =
    startedAt !== "" &&
    startedAt === lastStartedAt &&
    title === lastTitle &&
    game === lastGame;
  if (inCooldown || sameStreamFingerprint) {
    log("info", "stream transition notification suppressed", {
      reason: inCooldown ? "cooldown" : "duplicate_stream",
      cooldownMsRemaining: inCooldown ? STREAM_NOTIFICATION_COOLDOWN_MS - (now - lastTriggeredAt) : 0,
      startedAt,
      title,
      game
    });
    previousLive = currentLive;
    return;
  }

  const channelLogin = String(status?.channel || TWITCH_CHANNEL || getSettingString("twitch_channel_auth_login", "")).trim();
  const channelDisplayName = String(
    getSettingString("twitch_channel_auth_display_name", channelLogin || status?.channel || "")
  ).trim();
  const payload = {
    channelLogin,
    channelDisplayName: channelDisplayName || channelLogin,
    title,
    game,
    viewerCount: Number(status?.viewerCount || 0),
    url: channelLogin ? `https://twitch.tv/${channelLogin}` : "https://twitch.tv",
    startedAt: startedAt || "",
    timestamp: new Date(now).toISOString()
  };
  try {
    dispatchStreamLiveNotification(payload);
    setSettingValue("notif_last_stream_started_at", startedAt);
    setSettingValue("notif_last_stream_title", title);
    setSettingValue("notif_last_stream_game", game);
    setSettingValue("notif_last_triggered_at", String(now));
  } catch (error) {
    log("error", "stream live notification dispatch failed", {
      error: String(error?.message || error),
      channelLogin,
      startedAt,
      title,
      game
    });
  }
  previousLive = currentLive;
}

async function runStreamNotificationWatcher() {
  try {
    const status = await fetchTwitchChannelStatus({ force: true });
    log("info", "stream transition", {
      previousLive,
      currentLive: Boolean(status?.live),
      channel: status?.channel || "",
      viewerCount: Number(status?.viewerCount || 0),
      startedAt: status?.startedAt || "",
      title: status?.title || "",
      game: status?.gameName || ""
    });
    maybeDispatchStreamLiveNotification(status);
  } catch (error) {
    log("warn", "stream transition watcher failed", {
      error: String(error?.message || error)
    });
  }
}

function normalizeOauthToken(token) {
  if (!token) return "";
  return token.startsWith("oauth:") ? token : `oauth:${token}`;
}

function normalizeRefreshToken(token) {
  if (!token) return "";
  const withoutOauthPrefix = token.startsWith("oauth:") ? token.slice(6) : token;
  if (!withoutOauthPrefix.includes("%")) {
    return withoutOauthPrefix;
  }
  try {
    return decodeURIComponent(withoutOauthPrefix);
  } catch {
    return withoutOauthPrefix;
  }
}

function scheduleTwitchTokenRefresh(expiresInSeconds) {
  if (twitchTokenRefreshTimer) {
    clearTimeout(twitchTokenRefreshTimer);
    twitchTokenRefreshTimer = null;
  }
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return;
  }
  const refreshInMs = Math.max(30_000, (expiresInSeconds - 300) * 1000);
  twitchTokenRefreshTimer = setTimeout(() => {
    refreshTwitchAccessToken("scheduled");
  }, refreshInMs);
  twitchTokenRefreshTimer.unref?.();
  log("info", "twitch token refresh scheduled", {
    refreshInSeconds: Math.round(refreshInMs / 1000)
  });
}

async function refreshTwitchAccessToken(reason = "manual") {
  if (!twitchRefreshToken || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    log("warn", "twitch token refresh unavailable - missing credentials", {
      reason,
      hasRefreshToken: Boolean(twitchRefreshToken),
      hasClientId: Boolean(TWITCH_CLIENT_ID),
      hasClientSecret: Boolean(TWITCH_CLIENT_SECRET)
    });
    return false;
  }
  if (twitchRefreshInFlight) {
    return twitchRefreshInFlight;
  }
  twitchRefreshInFlight = (async () => {
    try {
      const body = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: normalizeRefreshToken(twitchRefreshToken)
      });
      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });
      if (!response.ok) {
        const text = await response.text();
        log("error", "twitch token refresh failed", {
          reason,
          status: response.status,
          body: text.slice(0, 500)
        });
        return false;
      }
      const payload = await response.json();
      if (!payload?.access_token) {
        log("error", "twitch token refresh missing access token", { reason });
        return false;
      }
      twitchOauthToken = normalizeOauthToken(payload.access_token);
      if (payload.refresh_token) {
        twitchRefreshToken = payload.refresh_token;
      }
      scheduleTwitchTokenRefresh(Number(payload.expires_in));
      log("info", "twitch token refreshed", {
        reason,
        expiresInSeconds: Number(payload.expires_in) || null,
        hasNewRefreshToken: Boolean(payload.refresh_token)
      });
      return true;
    } catch (error) {
      log("error", "twitch token refresh request error", {
        reason,
        error: String(error?.message || error)
      });
      return false;
    }
  })();
  const refreshed = await twitchRefreshInFlight;
  twitchRefreshInFlight = null;
  return refreshed;
}

function closeTwitchConnection() {
  if (!twitchSocket) {
    return;
  }
  try {
    twitchSocket.removeAllListeners();
    twitchSocket.write("QUIT\r\n");
    twitchSocket.end();
  } catch (error) {
    log("warn", "twitch bot close error", {
      error: String(error?.message || error)
    });
  }
  twitchSocket = null;
  twitchConnected = false;
}

function sendTwitchMessage(message) {
  if (!twitchConnected || !twitchSocket) return;
  twitchSocket.write(`PRIVMSG #${TWITCH_CHANNEL} :${message}\r\n`);
}

function handleVoteCommand({ user, optionIndex }) {
  const round = getLatestOpenVoteRound();
  if (!round) {
    sendTwitchMessageLines([
      getTwitchMessage(
        "twitch_no_active_vote_message",
        TWITCH_MESSAGE_DEFAULTS.no_active_vote
      )
    ]);
    return;
  }
  if (new Date(round.endsAt).getTime() <= Date.now()) {
    sendTwitchMessageLines([
      getTwitchMessage(
        "twitch_vote_closed_message",
        TWITCH_MESSAGE_DEFAULTS.vote_closed
      )
    ]);
    return;
  }
  if (
    !Number.isInteger(optionIndex) ||
    optionIndex < 1 ||
    optionIndex > round.options.length
  ) {
    sendTwitchMessageLines([
      getTwitchMessage(
        "twitch_invalid_vote_message",
        TWITCH_MESSAGE_DEFAULTS.invalid_vote,
        { max: round.options.length }
      )
    ]);
    return;
  }
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO votes (vote_round_id, user_twitch_name, option_index, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (vote_round_id, user_twitch_name) DO UPDATE SET option_index = excluded.option_index, updated_at = excluded.updated_at"
  ).run(round.id, user, optionIndex, now);
  broadcastVoteUpdate(round);
}

function connectTwitchBot() {
  if (!TWITCH_BOT_USERNAME || !twitchOauthToken || !TWITCH_CHANNEL) {
    log("warn", "twitch bot disabled - missing credentials", {
      TWITCH_BOT_USERNAME,
      TWITCH_CHANNEL
    });
    return;
  }
  const welcomeMessage = getTwitchMessage("twitch_welcome_message", "", {
    channel: TWITCH_CHANNEL,
    bot: TWITCH_BOT_USERNAME
  });
  twitchSocket = tls.connect(
    {
      host: TWITCH_IRC_HOST,
      servername: TWITCH_IRC_HOST,
      port: 6697
    },
    () => {
      twitchConnected = true;
      twitchSocket.write(`PASS ${normalizeOauthToken(twitchOauthToken)}\r\n`);
      twitchSocket.write(`NICK ${TWITCH_BOT_USERNAME}\r\n`);
      twitchSocket.write(
        "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership\r\n"
      );
      twitchSocket.write(`JOIN #${TWITCH_CHANNEL}\r\n`);
      log("info", "twitch bot connected", { channel: TWITCH_CHANNEL });
      if (welcomeMessage) {
        sendTwitchMessageLines([welcomeMessage]);
      }
    }
  );

  twitchSocket.on("data", (data) => {
    const messages = data.toString().split("\r\n").filter(Boolean);
    messages.forEach((line) => {
      if (line.startsWith("PING")) {
        twitchSocket.write(`PONG ${line.slice(5)}\r\n`);
        return;
      }
      if (line.includes("Login authentication failed")) {
        log("warn", "twitch authentication failed; attempting token refresh");
        closeTwitchConnection();
        refreshTwitchAccessToken("irc-auth-failed").then((refreshed) => {
          if (refreshed) {
            connectTwitchBot();
          }
        });
        return;
      }
      const parsed = parseIrcMessage(line);
      if (parsed.command === "001") {
        return;
      }
      if (parsed.command !== "PRIVMSG") {
        return;
      }
      const user = parsed.tags["display-name"] || getIrcUsername(parsed.prefix);
      if (!user) return;
      const message = parsed.trailing || "";
      const lower = message.toLowerCase();
      const isCommand = lower.startsWith(TWITCH_COMMAND_PREFIX);
      const mod = isModerator(parsed.tags);
      const role = mod ? "mod" : "viewer";
      broadcastChatMessage({ user, message, isCommand, role });
      if (user.toLowerCase() === TWITCH_BOT_USERNAME.toLowerCase()) {
        return;
      }
      if (!isCommand) {
        handleHypeChatMessage({ user, message });
        return;
      }
      const [command, ...restArgs] = lower.slice(TWITCH_COMMAND_PREFIX.length).split(" ");
      const arg = restArgs[0];
      if (command === "vote") {
        handleVoteCommand({ user, optionIndex: Number(arg) });
      } else if (command === "song") {
        const track = getCurrentTrack(getPlayState());
        sendTwitchMessageLines([
          getTwitchMessage(
            "twitch_now_playing_message",
            TWITCH_MESSAGE_DEFAULTS.now_playing,
            { track: formatTrackLabel(track) }
          )
        ]);
      } else if (command === "skip" && mod) {
        skipQueue();
        sendTwitchMessageLines([
          getTwitchMessage("twitch_skip_message", TWITCH_MESSAGE_DEFAULTS.skip)
        ]);
      } else if (command === "pause" && mod) {
        pauseSession();
        sendTwitchMessageLines([
          getTwitchMessage("twitch_pause_message", TWITCH_MESSAGE_DEFAULTS.pause)
        ]);
      } else if (command === "resume" && mod) {
        resumeSession();
        sendTwitchMessageLines([
          getTwitchMessage("twitch_resume_message", TWITCH_MESSAGE_DEFAULTS.resume)
        ]);
      } else {
        const lookup = getCustomCommandLookupMap();
        const custom = lookup.get(command);
        if (custom?.response) {
          const track = getCurrentTrack(getPlayState());
          const response = formatTemplate(custom.response, {
            command: TWITCH_COMMAND_PREFIX,
            channel: TWITCH_CHANNEL,
            user,
            track: formatTrackLabel(track)
          }).trim();
          if (response) {
            sendTwitchMessageLines([response]);
          }
        }
      }
    });
  });

  twitchSocket.on("error", (error) => {
    twitchConnected = false;
    log("error", "twitch bot error", { error: String(error?.message || error) });
  });

  twitchSocket.on("end", () => {
    twitchConnected = false;
    log("warn", "twitch bot disconnected");
  });
}

function checkDbReady() {
  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch (error) {
    log("error", "database readiness check failed", {
      error: String(error?.message || error)
    });
    return false;
  }
}

function checkTwitchReady() {
  if (!TWITCH_BOT_USERNAME || !twitchOauthToken || !TWITCH_CHANNEL) {
    return true;
  }
  return twitchConnected;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", (req, res) => {
  const dbReady = checkDbReady();
  const twitchReady = checkTwitchReady();
  const ready = dbReady && twitchReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    db: dbReady,
    twitch: twitchReady
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const CALLBACK_ERROR_MESSAGES = {
  invalid_oauth_state: "Your Twitch login session expired or was invalid. Please try again.",
  missing_oauth_code: "Twitch did not return an authorization code. Please try again.",
  token_exchange_failed: "Unable to complete Twitch token exchange. Please try again.",
  twitch_user_fetch_failed: "Unable to fetch your Twitch profile. Please try again.",
  channel_scope_missing: "The broadcaster connection is missing required Twitch scopes.",
  db_schema_compat_error: "Database schema is missing required Twitch user columns.",
  twitch_login_failed: "Twitch login failed. Please try again."
};

const META_CALLBACK_ERROR_MESSAGES = {
  meta_config_missing: "Meta OAuth is not configured on this server.",
  invalid_oauth_state: "Your Meta login session expired or was invalid. Please try again.",
  missing_oauth_code: "Meta did not return an authorization code. Please try again.",
  token_exchange_failed: "Unable to complete Meta token exchange. Please try again.",
  instagram_account_missing: "No Instagram business account was found in the connected Meta account.",
  meta_login_failed: "Meta login failed. Please try again."
};

function getUserRole({ login, twitchId, isModerator = false, isVip = false }) {
  const normalizedLogin = String(login || "").trim().toLowerCase();
  const normalizedId = String(twitchId || "").trim().toLowerCase();
  const inAdmins = TWITCH_ADMINS.has(normalizedLogin) || TWITCH_ADMINS.has(normalizedId);
  const inMembers =
    TWITCH_CHANNEL_MEMBERS.has(normalizedLogin) || TWITCH_CHANNEL_MEMBERS.has(normalizedId);
  if (inAdmins) return "admin";
  if (inMembers) {
    return TWITCH_CHANNEL_MEMBERS_ROLE === "admin" ? "admin" : "channel_member";
  }
  if (isModerator) return "mod";
  if (isVip) return "vip";
  return "viewer";
}

function resolveTwitchRedirectUri(req) {
  if (TWITCH_REDIRECT_URI) return TWITCH_REDIRECT_URI;
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/auth/twitch/callback`;
  }
  return `${req.protocol}://${req.get("host")}/auth/twitch/callback`;
}

function redirectLoginError(res, reason, context = {}) {
  const safeReason = CALLBACK_ERROR_MESSAGES[reason] ? reason : "twitch_login_failed";
  log("error", "twitch callback failed", {
    reason: safeReason,
    rawError: context.rawError || null,
    redirectUri: context.redirectUri || null,
    host: context.host || null,
    protocol: context.protocol || null
  });
  return res.redirect(`/login?error=${encodeURIComponent(safeReason)}`);
}

function resolveMetaRedirectUri(req) {
  if (META_REDIRECT_URI) return META_REDIRECT_URI;
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/auth/meta/callback`;
  }
  return `${req.protocol}://${req.get("host")}/auth/meta/callback`;
}

function redirectDashboardOAuthError(res, reason, context = {}) {
  const safeReason = META_CALLBACK_ERROR_MESSAGES[reason] ? reason : "meta_login_failed";
  log("error", "meta callback failed", {
    reason: safeReason,
    rawError: context.rawError || null
  });
  return res.redirect(`/dashboard?oauth_error=${encodeURIComponent(safeReason)}`);
}

async function fetchMetaJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || `Meta API request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

async function fetchTwitchToken({ code, redirectUri }) {
  const payload = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`token exchange failed (${response.status}): ${bodyText}`);
  }
  return response.json();
}

async function fetchTwitchUser(accessToken) {
  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": TWITCH_CLIENT_ID
    }
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`user fetch failed (${response.status}): ${bodyText}`);
  }
  const payload = await response.json();
  return payload?.data?.[0] || null;
}

async function fetchMembershipFlags({ accessToken, channelLogin, userId }) {
  if (!channelLogin || !userId) return { isModerator: false, isVip: false };
  try {
    const broadcasterResponse = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelLogin)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": TWITCH_CLIENT_ID
        }
      }
    );
    if (!broadcasterResponse.ok) return { isModerator: false, isVip: false };
    const broadcasterPayload = await broadcasterResponse.json();
    const broadcasterId = broadcasterPayload?.data?.[0]?.id;
    if (!broadcasterId) return { isModerator: false, isVip: false };

    const [modsResponse, vipsResponse] = await Promise.all([
      fetch(
        `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${encodeURIComponent(
          broadcasterId
        )}&user_id=${encodeURIComponent(userId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Client-Id": TWITCH_CLIENT_ID
          }
        }
      ),
      fetch(
        `https://api.twitch.tv/helix/channels/vips?broadcaster_id=${encodeURIComponent(
          broadcasterId
        )}&user_id=${encodeURIComponent(userId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Client-Id": TWITCH_CLIENT_ID
          }
        }
      )
    ]);

    const modsPayload = modsResponse.ok ? await modsResponse.json() : { data: [] };
    const vipsPayload = vipsResponse.ok ? await vipsResponse.json() : { data: [] };
    return {
      isModerator: Array.isArray(modsPayload?.data) && modsPayload.data.length > 0,
      isVip: Array.isArray(vipsPayload?.data) && vipsPayload.data.length > 0
    };
  } catch {
    return { isModerator: false, isVip: false };
  }
}

function beginTwitchAuth(req, res, mode = "login") {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return redirectLoginError(res, "twitch_login_failed", {
      rawError: "TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET missing",
      redirectUri: resolveTwitchRedirectUri(req),
      host: req.get("host"),
      protocol: req.protocol
    });
  }
  const redirectUri = resolveTwitchRedirectUri(req);
  const state = nanoid();
  const scopes =
    mode === "channel"
      ? ["user:read:email", "moderation:read", "channel:read:vips"]
      : ["user:read:email"];
  req.session.oauthState = state;
  req.session.oauthRedirectUri = redirectUri;
  req.session.oauthMode = mode;
  req.session.save(() => {
    const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
    authUrl.searchParams.set("client_id", TWITCH_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("state", state);
    res.redirect(authUrl.toString());
  });
}

app.get("/auth/twitch", (req, res) => {
  beginTwitchAuth(req, res, "login");
});

app.get("/auth/twitch/channel", requireAuth, requireAdmin, (req, res) => {
  beginTwitchAuth(req, res, "channel");
});

app.get("/auth/meta/instagram", requireAuth, requireAdmin, (req, res) => {
  if (!META_OAUTH_CONFIGURED) {
    return redirectDashboardOAuthError(res, "meta_config_missing", {
      rawError: "META_APP_ID/META_APP_SECRET missing"
    });
  }
  const redirectUri = resolveMetaRedirectUri(req);
  const state = nanoid();
  req.session.metaOauthState = state;
  req.session.metaOauthRedirectUri = redirectUri;
  req.session.save(() => {
    const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    authUrl.searchParams.set("client_id", META_APP_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set(
      "scope",
      "instagram_basic,instagram_content_publish,pages_show_list,business_management"
    );
    res.redirect(authUrl.toString());
  });
});

app.get("/auth/twitch/callback", async (req, res) => {
  const redirectUri = req.session?.oauthRedirectUri || resolveTwitchRedirectUri(req);
  const host = req.get("host");
  const protocol = req.protocol;
  const { state, code } = req.query || {};
  if (!req.session?.oauthState || state !== req.session.oauthState) {
    return redirectLoginError(res, "invalid_oauth_state", { redirectUri, host, protocol });
  }
  if (!code) {
    return redirectLoginError(res, "missing_oauth_code", { redirectUri, host, protocol });
  }

  try {
    const tokenPayload = await fetchTwitchToken({ code: String(code), redirectUri });
    const accessToken = tokenPayload?.access_token;
    if (!accessToken) {
      throw new Error("missing access token in Twitch response");
    }
    const scopeList = Array.isArray(tokenPayload?.scope)
      ? tokenPayload.scope
      : String(tokenPayload?.scope || "").split(" ").filter(Boolean);
    const oauthMode = req.session?.oauthMode || "login";
    if (oauthMode === "channel") {
      const hasChannelScopes =
        scopeList.includes("moderation:read") && scopeList.includes("channel:read:vips");
      if (!hasChannelScopes) {
        return redirectLoginError(res, "channel_scope_missing", {
          rawError: `scopes: ${scopeList.join(",")}`,
          redirectUri,
          host,
          protocol
        });
      }
    }

    let twitchUser;
    try {
      twitchUser = await fetchTwitchUser(accessToken);
    } catch (error) {
      return redirectLoginError(res, "twitch_user_fetch_failed", {
        rawError: String(error?.message || error),
        redirectUri,
        host,
        protocol
      });
    }
    if (!twitchUser?.id || !twitchUser?.login) {
      return redirectLoginError(res, "twitch_user_fetch_failed", {
        rawError: "missing id/login",
        redirectUri,
        host,
        protocol
      });
    }

    if (oauthMode === "channel" && TWITCH_CHANNEL) {
      const normalizedExpected = TWITCH_CHANNEL.trim().toLowerCase();
      const normalizedActual = String(twitchUser.login || "").trim().toLowerCase();
      if (normalizedActual !== normalizedExpected) {
        return redirectLoginError(res, "twitch_login_failed", {
          rawError: `channel mismatch expected=${normalizedExpected} actual=${normalizedActual}`,
          redirectUri,
          host,
          protocol
        });
      }
      setSettingValue("twitch_channel_auth_connected", "1");
      setSettingValue("twitch_channel_auth_login", twitchUser.login || "");
      setSettingValue("twitch_channel_auth_display_name", twitchUser.display_name || twitchUser.login || "");
      setSettingValue("twitch_channel_auth_updated_at", new Date().toISOString());
      setSettingValue("twitch_channel_auth_access_token", accessToken);
      setSettingValue("twitch_channel_auth_scope", scopeList.join(" "));
    }

    const membership = await fetchMembershipFlags({
      accessToken: getSettingString("twitch_channel_auth_access_token", accessToken),
      channelLogin: TWITCH_CHANNEL,
      userId: twitchUser.id
    });
    const role = getUserRole({
      login: twitchUser.login,
      twitchId: twitchUser.id,
      isModerator: membership.isModerator,
      isVip: membership.isVip
    });

    const now = new Date().toISOString();
    const existing = db
      .prepare("SELECT id, password_hash FROM users WHERE twitch_id = ? OR username = ?")
      .get(twitchUser.id, twitchUser.login);
    const userId = existing?.id || nanoid();
    const passwordHashValue = existing?.password_hash ?? "";
    try {
      if (existing) {
        db.prepare(
          "UPDATE users SET username = ?, display_name = ?, twitch_id = ?, role = ? WHERE id = ?"
        ).run(twitchUser.login, twitchUser.display_name || twitchUser.login, twitchUser.id, role, userId);
      } else {
        db.prepare(
          "INSERT INTO users (id, username, password_hash, role, created_at, twitch_id, display_name) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(
          userId,
          twitchUser.login,
          passwordHashValue,
          role,
          now,
          twitchUser.id,
          twitchUser.display_name || twitchUser.login
        );
      }
    } catch (error) {
      const msg = String(error?.message || error).toLowerCase();
      if (msg.includes("no such column") || msg.includes("has no column")) {
        return redirectLoginError(res, "db_schema_compat_error", {
          rawError: String(error?.message || error),
          redirectUri,
          host,
          protocol
        });
      }
      throw error;
    }

    req.session.oauthState = null;
    req.session.oauthRedirectUri = null;
    req.session.oauthMode = null;
    req.session.user = {
      id: userId,
      username: twitchUser.login,
      login: twitchUser.login,
      displayName: twitchUser.display_name || twitchUser.login,
      twitchId: twitchUser.id,
      role,
      isAdmin: role === "admin",
      isChannelMember: role === "channel_member"
    };
    req.session.save(() => {
      res.redirect(role === "admin" || role === "channel_member" ? "/dashboard" : "/dashboard/public");
    });
  } catch (error) {
    return redirectLoginError(res, "token_exchange_failed", {
      rawError: String(error?.message || error),
      redirectUri,
      host,
      protocol
    });
  }
});

app.get("/auth/meta/callback", requireAuth, requireAdmin, async (req, res) => {
  const redirectUri = req.session?.metaOauthRedirectUri || resolveMetaRedirectUri(req);
  const { state, code } = req.query || {};
  if (!req.session?.metaOauthState || state !== req.session.metaOauthState) {
    return redirectDashboardOAuthError(res, "invalid_oauth_state");
  }
  if (!code) {
    return redirectDashboardOAuthError(res, "missing_oauth_code");
  }

  try {
    const shortTokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    shortTokenUrl.searchParams.set("client_id", META_APP_ID);
    shortTokenUrl.searchParams.set("client_secret", META_APP_SECRET);
    shortTokenUrl.searchParams.set("redirect_uri", redirectUri);
    shortTokenUrl.searchParams.set("code", String(code));
    const shortTokenPayload = await fetchMetaJson(shortTokenUrl.toString());
    const shortToken = String(shortTokenPayload?.access_token || "").trim();
    if (!shortToken) throw new Error("missing short-lived access token");

    const longTokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", META_APP_ID);
    longTokenUrl.searchParams.set("client_secret", META_APP_SECRET);
    longTokenUrl.searchParams.set("fb_exchange_token", shortToken);
    const longTokenPayload = await fetchMetaJson(longTokenUrl.toString());
    const longLivedToken = String(longTokenPayload?.access_token || "").trim();
    if (!longLivedToken) throw new Error("missing long-lived access token");

    const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
    pagesUrl.searchParams.set("fields", "id,name,instagram_business_account{id,username,name}");
    pagesUrl.searchParams.set("access_token", longLivedToken);
    const pagesPayload = await fetchMetaJson(pagesUrl.toString());
    const pageWithInstagram = (pagesPayload?.data || []).find((page) => page?.instagram_business_account?.id);
    const instagramAccount = pageWithInstagram?.instagram_business_account;
    if (!instagramAccount?.id) {
      return redirectDashboardOAuthError(res, "instagram_account_missing");
    }

    const tx = db.transaction(() => {
      setSettingValue("notif_instagram_account_id", instagramAccount.id);
      setSettingValue("notif_instagram_token", longLivedToken);
      setSettingValue("meta_instagram_auth_connected", "1");
      setSettingValue("meta_instagram_auth_account_id", instagramAccount.id);
      setSettingValue("meta_instagram_auth_username", instagramAccount.username || "");
      setSettingValue("meta_instagram_auth_name", instagramAccount.name || "");
      setSettingValue("meta_instagram_auth_updated_at", new Date().toISOString());
    });
    tx();
    req.session.metaOauthState = null;
    req.session.metaOauthRedirectUri = null;
    req.session.save(() => {
      res.redirect("/dashboard?oauth=meta_connected");
    });
  } catch (error) {
    return redirectDashboardOAuthError(res, "token_exchange_failed", {
      rawError: String(error?.message || error)
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    log("info", "logout", { userId: req.session?.user?.id || null });
    res.json({ ok: true });
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = req.session.user;
  res.json({
    id: user.id,
    username: user.username || user.login,
    login: user.login || user.username,
    role: user.role || "viewer",
    isAdmin: isAdminUser(user),
    isChannelMember: isChannelMemberUser(user)
  });
});

app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  const users = db
    .prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at ASC")
    .all();
  res.json(users);
});

app.get("/api/channel-auth/status", requireAuth, requireAdmin, (req, res) => {
  const connected = getSettingBoolean("twitch_channel_auth_connected", false);
  const login = getSettingString("twitch_channel_auth_login", "");
  const displayName = getSettingString("twitch_channel_auth_display_name", "");
  const updatedAt = getSettingString("twitch_channel_auth_updated_at", "");
  res.json({ connected, login, displayName, updatedAt });
});

app.get("/api/meta-auth/status", requireAuth, requireAdmin, (req, res) => {
  const connected =
    getSettingBoolean("meta_instagram_auth_connected", false) &&
    Boolean(getSettingString("notif_instagram_account_id", "")) &&
    Boolean(getSettingString("notif_instagram_token", ""));
  const accountId = getSettingString("meta_instagram_auth_account_id", "");
  const username = getSettingString("meta_instagram_auth_username", "");
  const name = getSettingString("meta_instagram_auth_name", "");
  const updatedAt = getSettingString("meta_instagram_auth_updated_at", "");
  res.json({
    available: META_OAUTH_CONFIGURED,
    connected,
    accountIdMasked: maskSecret(accountId, { visibleStart: 4, visibleEnd: 2 }),
    username,
    name,
    updatedAt
  });
});

app.get("/api/twitch/channel-status", requireAuth, async (req, res) => {
  const status = await fetchTwitchChannelStatus();
  res.json({
    channel: status.channel,
    live: status.live,
    viewerCount: status.viewerCount,
    gameName: status.gameName,
    title: status.title,
    fetchedAt: status.fetchedAt,
    error: status.error || null
  });
});

app.post("/api/users", requireAuth, requireAdmin, (req, res) => {
  res.status(410).json({ error: "User creation is disabled in Twitch auth mode" });
});

app.put("/api/users/:id", requireAuth, requireAdmin, (req, res) => {
  res.status(410).json({ error: "User updates are disabled in Twitch auth mode" });
});

app.delete("/api/users/:id", requireAuth, requireAdmin, (req, res) => {
  const userId = req.params.id;
  if (!userId) {
    return res.status(400).json({ error: "user id required" });
  }
  if (req.session?.user?.id === userId) {
    return res.status(400).json({ error: "You cannot delete your own user" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return res.json({ ok: true });
});

app.get("/api/state", requireAuth, (req, res) => {
  const playState = getPlayState();
  const currentTrack = getCurrentTrack(playState);
  const queue = getQueue();
  res.json({ playState, currentTrack, queue });
});

app.post("/api/session/start", requireAuth, (req, res) => {
  const { trackId } = req.body || {};
  const track = trackId
    ? db.prepare("SELECT id FROM tracks WHERE id = ?").get(trackId)
    : null;
  db.prepare(
    "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused_at_ms = NULL, paused = 0, updated_at = ? WHERE id = 1"
  ).run(track ? track.id : null, Date.now(), new Date().toISOString());
  log("info", "session start", { trackId: track?.id || null });
  const { playState } = broadcastStateUpdate();
  res.json({ playState });
});

app.post("/api/session/pause", requireAuth, (req, res) => {
  const { playState } = pauseSession();
  res.json({ playState });
});

app.post("/api/session/resume", requireAuth, (req, res) => {
  const { playState } = resumeSession();
  res.json({ playState });
});

app.post("/api/session/seek", requireAuth, (req, res) => {
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
  const { playState: updated } = broadcastStateUpdate();
  res.json({ playState: updated });
});

app.post("/api/session/stop", requireAuth, (req, res) => {
  db.prepare(
    "UPDATE play_state SET current_track_id = NULL, started_at_ms = NULL, paused_at_ms = NULL, paused = 1, updated_at = ? WHERE id = 1"
  ).run(new Date().toISOString());
  log("info", "session stop");
  const { playState } = broadcastStateUpdate();
  res.json({ playState });
});

app.post("/api/queue/skip", requireAuth, (req, res) => {
  const expectedTrackId = typeof req.body?.currentTrackId === "string" ? req.body.currentTrackId : null;
  const { playState, queue, skipped } = skipQueueIfCurrentTrack(expectedTrackId);
  res.json({ playState, queue, skipped });
});

function streamTrackAudioById(trackId, req, res) {
  const track = db
    .prepare("SELECT audio_path FROM tracks WHERE id = ?")
    .get(trackId);
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
}

app.get("/api/audio/:trackId", requireAuth, (req, res) => {
  return streamTrackAudioById(req.params.trackId, req, res);
});

app.get("/api/overlay/audio/:trackId", (req, res) => {
  const playState = getPlayState();
  if (!playState?.current_track_id || playState.current_track_id !== req.params.trackId) {
    return res.status(404).json({ error: "Audio not available" });
  }
  return streamTrackAudioById(req.params.trackId, req, res);
});

app.post("/api/queue/enqueue", requireAuth, (req, res) => {
  const { trackId, source } = req.body || {};
  const track = db
    .prepare("SELECT id, download_status, audio_path FROM tracks WHERE id = ?")
    .get(trackId);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }
  if (!isTrackPlayable(track)) {
    return res.status(409).json({
      error: "Track is not playable yet (audio must be downloaded)."
    });
  }
  const entry = enqueueTrack(track.id, source || "manual", req.session.user.id);
  res.json(entry);
});

app.post("/api/queue/:id/move", requireAuth, (req, res) => {
  const { direction } = req.body || {};
  if (!["up", "down"].includes(direction)) {
    return res.status(400).json({ error: "direction must be up or down" });
  }
  const current = db
    .prepare("SELECT id, position FROM queue WHERE id = ?")
    .get(req.params.id);
  if (!current) {
    return res.status(404).json({ error: "Queue item not found" });
  }
  const targetPosition = direction === "up" ? current.position - 1 : current.position + 1;
  const target = db
    .prepare("SELECT id, position FROM queue WHERE position = ?")
    .get(targetPosition);
  if (!target) {
    return res.json({ ok: true });
  }
  const swap = db.transaction(() => {
    db.prepare("UPDATE queue SET position = ? WHERE id = ?").run(
      target.position,
      current.id
    );
    db.prepare("UPDATE queue SET position = ? WHERE id = ?").run(
      current.position,
      target.id
    );
  });
  swap();
  broadcast("QUEUE_UPDATE", { action: "reordered" });
  res.json({ ok: true });
});

app.delete("/api/queue/:id", requireAuth, (req, res) => {
  const result = db.prepare("DELETE FROM queue WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Queue item not found" });
  }
  normalizeQueuePositions();
  broadcast("QUEUE_UPDATE", { action: "removed", queueId: req.params.id });
  const { queue } = broadcastStateUpdate({ includeQueue: true });
  res.json({ ok: true, queue });
});

app.get("/api/pool", requireAuth, (req, res) => {
  res.json(getPoolTracks());
});

app.post("/api/pool/enqueue", requireAuth, (req, res) => {
  const { trackId } = req.body || {};
  if (!trackId) {
    return res.status(400).json({ error: "trackId required" });
  }
  const track = db
    .prepare("SELECT id, download_status, audio_path FROM tracks WHERE id = ?")
    .get(trackId);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }
  if (!isTrackPlayable(track)) {
    return res.status(409).json({
      error: "Track is not playable yet (audio must be downloaded)."
    });
  }
  const entry = enqueueTrack(trackId, "pool", req.session.user.id);
  res.json(entry);
});

app.post("/api/pool/add", requireAuth, (req, res) => {
  const { trackId } = req.body || {};
  if (!trackId) {
    return res.status(400).json({ error: "trackId required" });
  }
  const track = db.prepare("SELECT id FROM tracks WHERE id = ?").get(trackId);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }
  const result = addToPool(trackId);
  res.json(result);
});

app.delete("/api/pool/:trackId", requireAuth, (req, res) => {
  const removed = removeFromPool(req.params.trackId);
  res.json({ removed });
});

app.get("/api/playlists", requireAuth, (req, res) => {
  const playlists = db.prepare("SELECT * FROM playlists ORDER BY created_at DESC").all();
  const playlistTracks = getPlaylistTrackRows();
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
      "SELECT download_queue.id, download_queue.status, download_queue.error, download_queue.retry_after, download_queue.attempts, download_queue.created_at, download_queue.playlist_id, download_queue.attach_to_playlist, playlists.name as playlist_name, tracks.title, tracks.youtube_id FROM download_queue LEFT JOIN playlists ON playlists.id = download_queue.playlist_id JOIN tracks ON tracks.id = download_queue.track_id ORDER BY download_queue.created_at DESC"
    )
    .all();
  res.json(downloads);
});

app.post("/api/downloads/clear", requireAuth, (req, res) => {
  const result = db
    .prepare("DELETE FROM download_queue WHERE status IN ('ready', 'failed', 'blocked')")
    .run();
  log("info", "download queue cleared", { cleared: result.changes });
  broadcast("DOWNLOAD_UPDATE", { action: "cleared", cleared: result.changes });
  res.json({ cleared: result.changes });
});

app.post("/api/playlists", requireAuth, (req, res) => {
  const { name } = req.body || {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return res.status(400).json({ error: "Playlist name required" });
  }
  const existing = db
    .prepare("SELECT id FROM playlists WHERE lower(name) = lower(?) LIMIT 1")
    .get(trimmedName);
  if (existing) {
    return res.status(409).json({ error: "playlist name already exists" });
  }
  const playlist = {
    id: nanoid(),
    name: trimmedName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.prepare(
    "INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run(playlist.id, playlist.name, playlist.created_at, playlist.updated_at);
  log("info", "playlist created", { playlistId: playlist.id, name: playlist.name });
  broadcast("PLAYLIST_UPDATE", { playlistId: playlist.id, action: "created" });
  res.status(201).json(playlist);
});

app.put("/api/playlists/:id", requireAuth, (req, res) => {
  const { name } = req.body || {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return res.status(400).json({ error: "Playlist name required" });
  }
  const conflict = db
    .prepare("SELECT id FROM playlists WHERE lower(name) = lower(?) AND id <> ? LIMIT 1")
    .get(trimmedName, req.params.id);
  if (conflict) {
    return res.status(409).json({ error: "playlist name already exists" });
  }
  const updated_at = new Date().toISOString();
  const result = db
    .prepare("UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?")
    .run(trimmedName, updated_at, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  broadcast("PLAYLIST_UPDATE", { playlistId: req.params.id, action: "updated" });
  res.json({ id: req.params.id, name: trimmedName, updated_at });
});

app.delete("/api/playlists/:id", requireAuth, (req, res) => {
  const playlistId = req.params.id;
  const transaction = db.transaction((id) => {
    const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(id);
    if (!playlist) {
      return { found: false };
    }
    db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(id);
    db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
    return { found: true };
  });

  const result = transaction(playlistId);
  if (!result.found) {
    return res.status(404).json({ error: "Playlist not found" });
  }

  log("info", "playlist deleted", { playlistId });
  broadcast("PLAYLIST_UPDATE", { playlistId, action: "deleted" });
  res.json({ ok: true });
});

app.post("/api/playlists/:id/add-to-pool", requireAuth, (req, res) => {
  const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  const tracks = db
    .prepare(
      "SELECT tracks.id, tracks.download_status, tracks.audio_path FROM playlist_tracks JOIN tracks ON tracks.id = playlist_tracks.track_id WHERE playlist_tracks.playlist_id = ? AND playlist_tracks.disabled = 0"
    )
    .all(req.params.id);
  let added = 0;
  for (const track of tracks) {
    if (!isTrackPlayable(track)) continue;
    if (addToPool(track.id).added) added += 1;
  }
  res.json({ added, total: tracks.length });
});

app.get("/api/playlists/:id/export", requireAuth, (req, res) => {
  const playlist = db.prepare("SELECT * FROM playlists WHERE id = ?").get(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  const tracks = db
    .prepare(
      "SELECT tracks.id as track_id, tracks.title, tracks.youtube_id, playlist_tracks.disabled FROM playlist_tracks JOIN tracks ON tracks.id = playlist_tracks.track_id WHERE playlist_tracks.playlist_id = ? ORDER BY playlist_tracks.position ASC"
    )
    .all(req.params.id);
  const payload = {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      exported_at: new Date().toISOString(),
      tracks: tracks.map((track) => ({
        track_id: track.track_id,
        title: track.title || null,
        youtube_id: track.youtube_id || null,
        disabled: Boolean(track.disabled)
      }))
    }
  };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${playlist.name.replace(/[^a-z0-9-_]+/gi, "_") || "playlist"}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

app.post("/api/playlists/import-json", requireAuth, (req, res) => {
  const { name, tracks, mode, playlistId } = req.body || {};
  const modeValue = mode === "replace" ? "replace" : "append";
  const trackList = Array.isArray(tracks) ? tracks : [];
  if (!name || typeof name !== "string" || trackList.length === 0) {
    return res.status(400).json({ error: "name and tracks array are required" });
  }

  let targetPlaylistId = playlistId;
  let playlist = null;
  if (targetPlaylistId) {
    playlist = db.prepare("SELECT id, name FROM playlists WHERE id = ?").get(targetPlaylistId);
  }
  if (!playlist) {
    const byName = db.prepare("SELECT id, name FROM playlists WHERE lower(name) = lower(?)").get(name.trim());
    playlist = byName || null;
  }
  if (!playlist) {
    const now = new Date().toISOString();
    targetPlaylistId = nanoid();
    db.prepare("INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(targetPlaylistId, name.trim(), now, now);
    playlist = { id: targetPlaylistId, name: name.trim() };
  } else {
    targetPlaylistId = playlist.id;
  }

  if (modeValue === "replace") {
    db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(targetPlaylistId);
  }

  const findTrackById = db.prepare("SELECT id FROM tracks WHERE id = ?");
  const existingInPlaylist = db.prepare("SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?");
  const insertMembership = db.prepare(
    "INSERT INTO playlist_tracks (playlist_id, track_id, position, disabled) VALUES (?, ?, ?, ?)"
  );

  const existingPosition =
    db.prepare("SELECT MAX(position) as maxPosition FROM playlist_tracks WHERE playlist_id = ?").get(targetPlaylistId)
      .maxPosition || 0;
  let position = modeValue === "replace" ? 1 : existingPosition + 1;
  let addedTracks = 0;
  const missingTrackIds = [];

  for (const [index, rawTrack] of trackList.entries()) {
    const track = rawTrack || {};
    const trackId = typeof track.track_id === "string" ? track.track_id.trim() : "";
    if (!trackId) continue;
    const existingLibraryTrack = findTrackById.get(trackId);
    if (!existingLibraryTrack) {
      missingTrackIds.push(trackId);
      continue;
    }
    const exists = existingInPlaylist.get(targetPlaylistId, trackId);
    if (exists) continue;
    insertMembership.run(targetPlaylistId, trackId, position, track.disabled ? 1 : 0);
    position += 1;
    addedTracks += 1;
  }

  db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), targetPlaylistId);
  broadcast("PLAYLIST_UPDATE", { playlistId: targetPlaylistId, action: "imported_json" });
  res.json({
    playlistId: targetPlaylistId,
    addedTracks,
    missingTrackIds,
    mode: modeValue
  });
});

async function ingestLibrarySources({ urls, playlistId = null, addedByUserId = null }) {
  const insertTrack = db.prepare(
    "INSERT INTO tracks (id, youtube_id, url, title, duration_sec, channel, thumbnail, audio_path, download_status, download_error, downloaded_at, tags, added_by_user_id, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL, 'new', ?, ?)"
  );
  const findTrack = db.prepare("SELECT id FROM tracks WHERE youtube_id = ?");
  const now = new Date().toISOString();
  const added = [];
  const errors = [];
  const skipped = [];
  const seenYoutubeIds = new Set();
  const expandedUrls = [];

  for (const rawUrl of urls) {
    const url = String(rawUrl || "").trim();
    if (!url) {
      skipped.push({ url: rawUrl, reason: "empty" });
      continue;
    }
    if (parseYouTubePlaylistId(url)) {
      try {
        const playlistUrls = await fetchPlaylistTrackUrls(url);
        if (playlistUrls.length === 0) {
          errors.push({ url, error: "Playlist returned no entries" });
          continue;
        }
        expandedUrls.push(...playlistUrls);
      } catch (error) {
        errors.push({ url, error: error.message });
      }
      continue;
    }
    const youtubeId = parseYouTubeId(url);
    if (!youtubeId) {
      errors.push({ url, error: "Invalid YouTube URL or ID" });
      continue;
    }
    expandedUrls.push(url);
  }

  const items = expandedUrls
    .map((url) => ({ url, youtubeId: parseYouTubeId(url) }))
    .filter((item) => item.youtubeId);

  const transaction = db.transaction((rows) => {
    for (const item of rows) {
      if (seenYoutubeIds.has(item.youtubeId)) {
        skipped.push({ url: item.url, reason: "duplicate" });
        continue;
      }
      seenYoutubeIds.add(item.youtubeId);
      const existing = findTrack.get(item.youtubeId);
      const trackId = existing ? existing.id : nanoid();
      if (!existing) {
        insertTrack.run(trackId, item.youtubeId, item.url, addedByUserId, now);
      }
      enqueueDownload(playlistId || LIBRARY_QUEUE_ID, trackId, { attachToPlaylist: Boolean(playlistId), addedByUserId });
      added.push({
        id: trackId,
        youtubeId: item.youtubeId,
        url: item.url,
        reused: Boolean(existing)
      });
    }
  });

  transaction(items);
  return {
    added,
    skipped,
    missingTrackIds: [],
    errors,
    expandedCount: expandedUrls.length
  };
}

app.post("/api/playlists/:id/import", requireAuth, async (req, res) => {
  res.status(410).json({
    error:
      "Deprecated endpoint. Source ingest is handled by POST /api/library/tracks or POST /api/library/tracks/ingest with playlistId."
  });
});

app.get("/api/library/tracks", requireAuth, requireAdmin, (req, res) => {
  const tracks = db
    .prepare(
      "SELECT tracks.id, tracks.youtube_id, tracks.url, tracks.title, tracks.duration_sec, tracks.channel, tracks.thumbnail, tracks.audio_path, tracks.download_status, tracks.download_error, tracks.downloaded_at, tracks.volume_adjust_db, tracks.intro_sec, tracks.outro_sec, tracks.tags, tracks.disabled, tracks.added_by_user_id, tracks.created_at, users.username AS added_by_username FROM tracks LEFT JOIN users ON users.id = tracks.added_by_user_id ORDER BY COALESCE(tracks.title, tracks.youtube_id) ASC"
    )
    .all();
  res.json(
    tracks.map((track) => ({
      ...track,
      tags: String(track.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    }))
  );
});

app.get("/api/library/export", requireAuth, requireAdmin, (req, res) => {
  const tracks = db
    .prepare(
      "SELECT id, youtube_id, url, title, duration_sec, channel, thumbnail, volume_adjust_db, intro_sec, outro_sec, tags, created_at FROM tracks ORDER BY COALESCE(title, youtube_id) ASC"
    )
    .all();
  const payload = {
    library: {
      exported_at: new Date().toISOString(),
      tracks: tracks.map((track) => ({
        id: track.id,
        youtube_id: track.youtube_id,
        url: track.url,
        title: track.title,
        duration_sec: track.duration_sec,
        channel: track.channel,
        thumbnail: track.thumbnail,
        volume_adjust_db: track.volume_adjust_db,
        intro_sec: track.intro_sec,
        outro_sec: track.outro_sec,
        tags: String(track.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        created_at: track.created_at
      }))
    }
  };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="erwin-library.json"');
  res.send(JSON.stringify(payload, null, 2));
});

app.post("/api/library/import", requireAuth, requireAdmin, (req, res) => {
  const { urls, playlistId } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls array is required" });
  }
  if (playlistId) {
    const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }
  }

  ingestLibrarySourceUrls({ urls, playlistId: playlistId || null, addedByUserId: req.session?.user?.id || null })
    .then((result) => {
      const importedCount = Number(result?.importedCount || 0);
      broadcast("PLAYLIST_UPDATE", {
        action: "library_imported_urls",
        importedCount,
        playlistId: playlistId || null
      });
      res.json({
        importedCount,
        imported: Array.isArray(result?.imported) ? result.imported : [],
        errors: Array.isArray(result?.errors) ? result.errors : []
      });
    })
    .catch((error) => {
      log("error", "library url import failed", {
        error: String(error?.message || error),
        stack: error?.stack || null,
        playlistId: playlistId || null
      });
      res.status(500).json({ error: "Unable to import library URLs" });
    });
});

app.post("/api/library/import-json", requireAuth, requireAdmin, (req, res) => {
  const payload = req.body || {};
  const data = payload.library || payload;
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  if (!tracks.length) {
    return res.status(400).json({ error: "tracks array is required" });
  }
  const findById = db.prepare("SELECT id FROM tracks WHERE id = ?");
  const updateTrack = db.prepare(
    "UPDATE tracks SET title = COALESCE(?, title), volume_adjust_db = COALESCE(?, volume_adjust_db), intro_sec = COALESCE(?, intro_sec), outro_sec = COALESCE(?, outro_sec), tags = COALESCE(?, tags) WHERE id = ?"
  );
  let updated = 0;
  const missing = [];
  for (const raw of tracks) {
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!id) continue;
    const existing = findById.get(id);
    if (!existing) {
      missing.push(id);
      continue;
    }
    const title = typeof raw.title === "string" ? raw.title.trim() || null : null;
    const volumeAdjustDb = Number.isFinite(Number(raw.volume_adjust_db)) ? Number(raw.volume_adjust_db) : null;
    const introSec = Number.isFinite(Number(raw.intro_sec)) ? Number(raw.intro_sec) : null;
    const outroSec = Number.isFinite(Number(raw.outro_sec)) ? Number(raw.outro_sec) : null;
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean).join(",")
      : typeof raw.tags === "string"
        ? raw.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .join(",")
        : null;
    updateTrack.run(title, volumeAdjustDb, introSec, outroSec, tags, id);
    updated += 1;
  }
  broadcast("PLAYLIST_UPDATE", { action: "library_imported", updated });
  res.json({ updated, missing });
});

app.post("/api/library/tracks", requireAuth, requireAdmin, async (req, res) => {
  const { url, playlistId } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: "url required" });
  }
  if (playlistId) {
    const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }
  }

  const trimmedUrl = String(url).trim();
  if (parseYouTubePlaylistId(trimmedUrl)) {
    try {
      const result = await ingestLibrarySources({ urls: [trimmedUrl], playlistId: playlistId || null, addedByUserId: req.session?.user?.id || null });
      if (!result.added.length) {
        return res.status(400).json({ error: result.errors?.[0]?.error || "Unable to queue playlist" });
      }
      return res.status(201).json({ status: "pending", added: result.added, errors: result.errors, skipped: result.skipped });
    } catch (error) {
      return res.status(500).json({ error: "Unable to queue playlist" });
    }
  }

  const youtubeId = parseYouTubeId(trimmedUrl);
  if (!youtubeId) {
    return res.status(400).json({ error: "Invalid YouTube URL or ID" });
  }
  let attachToPlaylist = false;
  if (playlistId) {
    attachToPlaylist = true;
  }
  const existing = db.prepare("SELECT id FROM tracks WHERE youtube_id = ?").get(youtubeId);
  const trackId = existing ? existing.id : nanoid();
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO tracks (id, youtube_id, url, title, duration_sec, channel, thumbnail, audio_path, download_status, download_error, downloaded_at, volume_adjust_db, intro_sec, outro_sec, tags, disabled, added_by_user_id, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL, 0, 0, 0, 'new', 0, ?, ?)"
    ).run(trackId, youtubeId, trimmedUrl, req.session?.user?.id || null, now);
  }
  enqueueDownload(attachToPlaylist ? playlistId : LIBRARY_QUEUE_ID, trackId, { attachToPlaylist, addedByUserId: req.session?.user?.id || null });
  return res.status(201).json({ id: trackId, youtubeId, url: trimmedUrl, status: "pending" });
});

app.put("/api/library/tracks/:id", requireAuth, requireAdmin, (req, res) => {
  const payload = req.body || {};
  const updates = [];
  const values = [];
  if (typeof payload.title === "string") {
    const title = payload.title.trim();
    if (!title) {
      return res.status(400).json({ error: "title cannot be empty" });
    }
    updates.push("title = ?");
    values.push(title);
  }
  if (payload.volumeAdjustDb !== undefined) {
    const v = Number(payload.volumeAdjustDb);
    if (!Number.isFinite(v) || v < -24 || v > 24) {
      return res.status(400).json({ error: "volumeAdjustDb must be between -24 and 24" });
    }
    updates.push("volume_adjust_db = ?");
    values.push(v);
  }
  if (payload.introSec !== undefined) {
    const v = Number(payload.introSec);
    if (!Number.isFinite(v) || v < 0) {
      return res.status(400).json({ error: "introSec must be >= 0" });
    }
    updates.push("intro_sec = ?");
    values.push(v);
  }
  if (payload.outroSec !== undefined) {
    const v = Number(payload.outroSec);
    if (!Number.isFinite(v) || v < 0) {
      return res.status(400).json({ error: "outroSec must be >= 0" });
    }
    updates.push("outro_sec = ?");
    values.push(v);
  }
  if (payload.tags !== undefined) {
    const tags = Array.isArray(payload.tags)
      ? payload.tags
      : String(payload.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
    updates.push("tags = ?");
    values.push(tags.join(","));
  }
  if (!updates.length) {
    return res.status(400).json({ error: "No valid updates" });
  }
  values.push(req.params.id);
  const result = db.prepare(`UPDATE tracks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Track not found" });
  }
  broadcast("PLAYLIST_UPDATE", { trackId: req.params.id, action: "track_updated" });
  res.json({ ok: true, id: req.params.id });
});

app.delete("/api/library/tracks/:id", requireAuth, requireAdmin, (req, res) => {
  const track = db.prepare("SELECT id, audio_path FROM tracks WHERE id = ?").get(req.params.id);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM playlist_tracks WHERE track_id = ?").run(track.id);
    db.prepare("DELETE FROM queue WHERE track_id = ?").run(track.id);
    db.prepare("DELETE FROM play_pool WHERE track_id = ?").run(track.id);
    db.prepare("DELETE FROM download_queue WHERE track_id = ?").run(track.id);
    db.prepare("UPDATE play_state SET current_track_id = NULL, started_at_ms = NULL, paused_at_ms = NULL, paused = 1, updated_at = ? WHERE current_track_id = ?").run(new Date().toISOString(), track.id);
    db.prepare("DELETE FROM tracks WHERE id = ?").run(track.id);
  });
  tx();
  if (track.audio_path) {
    fsPromises.unlink(track.audio_path).catch(() => {});
  }
  broadcast("PLAYLIST_UPDATE", { trackId: track.id, action: "track_deleted" });
  res.json({ ok: true });
});

app.post("/api/tracks", requireAuth, requireAdmin, (req, res) => {
  const { playlistId, url } = req.body || {};
  if (!playlistId || !url) {
    return res.status(400).json({ error: "playlistId and url required" });
  }
  const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(playlistId);
  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" });
  }

  ingestLibrarySourceUrls({ urls: [url], playlistId, addedByUserId: req.session?.user?.id || null })
    .then((result) => {
      const first = result.imported[0];
      if (!first) {
        return res.status(400).json({ error: result.errors?.[0]?.error || "Unable to queue track" });
      }
      log("info", "track queued", {
        trackId: first.id,
        playlistId,
        youtubeId: first.youtubeId,
        reused: first.reused
      });
      broadcast("PLAYLIST_UPDATE", { playlistId, action: "track_added", trackId: first.id });
      res.status(201).json({ id: first.id, youtubeId: first.youtubeId, url: first.url, status: "pending" });
    })
    .catch((error) => {
      log("error", "track queue failed", {
        playlistId,
        error: String(error?.message || error),
        stack: error?.stack || null
      });
      res.status(500).json({ error: "Unable to queue track" });
    });
});

app.put("/api/library/tracks/:id/rename", requireAuth, requireAdmin, (req, res) => {

  const { title } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "title required" });
  }
  const trimmed = title.trim();
  const result = db.prepare("UPDATE tracks SET title = ? WHERE id = ?").run(trimmed, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Track not found" });
  }
  broadcast("PLAYLIST_UPDATE", { trackId: req.params.id, action: "track_renamed" });
  res.json({ id: req.params.id, title: trimmed });
});

app.put("/api/library/tracks/:id/disable", requireAuth, requireAdmin, (req, res) => {
  res.status(410).json({ error: "Track disable is playlist-specific. Use /api/playlists/:playlistId/tracks/:trackId/disable" });
});



app.post("/api/tracks/:id/score-feedback", requireAuth, (req, res) => {
  const signal = Number(req.body?.signal);
  if (![1, -1].includes(signal)) {
    return res.status(400).json({ error: "signal must be 1 or -1" });
  }
  const track = db.prepare("SELECT id, score FROM tracks WHERE id = ?").get(req.params.id);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }
  const now = new Date();
  const feedbackDate = now.toISOString().slice(0, 10);
  try {
    db.prepare(
      "INSERT INTO track_score_feedback (track_id, user_id, feedback_date, signal, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(track.id, req.session.user.id, feedbackDate, signal, now.toISOString());
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (message.includes("unique") || message.includes("constraint")) {
      return res.status(409).json({ error: "already rated today" });
    }
    throw error;
  }
  const updated = applyTrackScoreSignal(track.id, signal * 10, "stream_feedback");
  res.json({ ok: true, trackId: track.id, score: updated?.score ?? clampTrackScore(track.score ?? 0) });
});

app.put("/api/tracks/:id/score", requireAuth, requireAdmin, (req, res) => {
  const track = db.prepare("SELECT id FROM tracks WHERE id = ?").get(req.params.id);
  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }
  const nextScore = clampTrackScore(Math.round(Number(req.body?.score)));
  db.prepare("UPDATE tracks SET score = ? WHERE id = ?").run(nextScore, track.id);
  broadcast("PLAYLIST_UPDATE", { action: "track_score_calibrated", trackId: track.id, score: nextScore });
  res.json({ ok: true, trackId: track.id, score: nextScore });
});

app.put("/api/tracks/:id", requireAuth, requireAdmin, (req, res) => {
  const { title } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "title required" });
  }
  const trimmed = title.trim();
  const result = db.prepare("UPDATE tracks SET title = ? WHERE id = ?").run(trimmed, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Track not found" });
  }
  broadcast("PLAYLIST_UPDATE", { trackId: req.params.id, action: "track_renamed" });
  res.json({ id: req.params.id, title: trimmed });
});

app.put("/api/tracks/:id/disable", requireAuth, requireAdmin, (req, res) => {
  res.status(410).json({ error: "Track disable is playlist-specific. Use /api/playlists/:playlistId/tracks/:trackId/disable" });
});

app.post("/api/playlists/:playlistId/tracks", requireAuth, (req, res) => {
  const { trackId } = req.body || {};
  if (!trackId) {
    return res.status(400).json({ error: "trackId required" });
  }
  const playlist = db.prepare("SELECT id FROM playlists WHERE id = ?").get(req.params.playlistId);
  if (!playlist) {
    return res.status(404).json({ error: "Playlist not found" });
  }
  const track = db.prepare("SELECT id FROM tracks WHERE id = ?").get(trackId);
  if (!track) {
    return res.status(404).json({ error: "Track not found in library" });
  }
  const added = addTrackToPlaylist(req.params.playlistId, trackId);
  if (!added) {
    return res.status(409).json({ error: "Track already exists in playlist" });
  }
  broadcast("PLAYLIST_UPDATE", {
    playlistId: req.params.playlistId,
    trackId,
    action: "track_added_from_library"
  });
  res.status(201).json({ ok: true, playlistId: req.params.playlistId, trackId });
});

app.post("/api/playlists/:id/play", requireAuth, (req, res) => {
  const tracks = db
    .prepare(
      "SELECT tracks.id FROM playlist_tracks JOIN tracks ON tracks.id = playlist_tracks.track_id WHERE playlist_tracks.playlist_id = ? AND playlist_tracks.disabled = 0 AND tracks.download_status = 'ready' AND tracks.audio_path IS NOT NULL ORDER BY playlist_tracks.position ASC"
    )
    .all(req.params.id);
  if (tracks.length === 0) {
    return res.status(404).json({ error: "Playlist has no enabled, playable tracks" });
  }

  const now = new Date().toISOString();
  const shuffled = shuffleArray(tracks);
  const [firstTrack, ...remaining] = shuffled;

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM queue").run();
    db.prepare("DELETE FROM play_pool").run();
    if (remaining.length > 0) {
      insertPoolEntries(remaining.map((track) => track.id));
    }
    db.prepare(
      "UPDATE play_state SET current_track_id = ?, started_at_ms = ?, paused_at_ms = NULL, paused = 0, updated_at = ? WHERE id = 1"
    ).run(firstTrack.id, Date.now(), now);
  });

  transaction();
  broadcast("POOL_UPDATE", { action: "seeded", count: remaining.length });

  const { playState, queue } = broadcastStateUpdate({ includeQueue: true });
  res.json({ playState, queue });
});

app.delete(
  "/api/playlists/:playlistId/tracks/:trackId",
  requireAuth,
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
    broadcast("PLAYLIST_UPDATE", {
      playlistId: req.params.playlistId,
      trackId: req.params.trackId,
      action: "track_removed"
    });
    res.json({ ok: true });
  }
);

app.put(
  "/api/playlists/:playlistId/tracks/:trackId/disable",
  requireAuth,
  (req, res) => {
    const { disabled } = req.body || {};
    const value = disabled ? 1 : 0;
    const result = db
      .prepare(
        "UPDATE playlist_tracks SET disabled = ? WHERE playlist_id = ? AND track_id = ?"
      )
      .run(value, req.params.playlistId, req.params.trackId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Track not found in playlist" });
    }
    broadcast("PLAYLIST_UPDATE", {
      playlistId: req.params.playlistId,
      trackId: req.params.trackId,
      action: "track_disabled_toggled"
    });
    res.json({
      playlistId: req.params.playlistId,
      trackId: req.params.trackId,
      disabled: Boolean(value)
    });
  }
);

app.post(
  "/api/playlists/:playlistId/tracks/:trackId/move",
  requireAuth,
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
    broadcast("PLAYLIST_UPDATE", {
      playlistId: req.params.playlistId,
      trackId: req.params.trackId,
      action: "track_moved"
    });
    res.json({ ok: true });
  }
);

app.put("/api/settings", requireAuth, (req, res) => {
  const settings = req.body || {};
  const insert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const transaction = db.transaction((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      insert.run(key, String(value));
    }
  });
  transaction(settings);
  broadcast("SETTINGS_UPDATE", { keys: Object.keys(settings) });
  res.json({ ok: true });
});

app.get("/api/settings", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  res.json(settings);
});

app.get("/api/notifications/settings", requireAuth, requireAdmin, (req, res) => {
  res.json(getNotificationSettings({ includeSecrets: false }));
});

app.put("/api/notifications/settings", requireAuth, requireAdmin, (req, res) => {
  const payload = req.body || {};
  const discord = payload.discord || {};
  const instagram = payload.instagram || {};

  const nextDiscordEnabled = discord.enabled ? 1 : 0;
  const nextInstagramEnabled = instagram.enabled ? 1 : 0;
  const nextDiscordTemplate =
    String(discord.template || "").trim() || NOTIFICATION_SETTINGS_DEFAULTS.discordTemplate;
  const nextInstagramTemplate =
    String(instagram.template || "").trim() || NOTIFICATION_SETTINGS_DEFAULTS.instagramTemplate;
  const nextDiscordUsername = String(discord.username || "").trim();
  const nextDiscordAvatarUrl = String(discord.avatarUrl || "").trim();
  const discordEmbed = discord.embed || {};
  const nextDiscordEmbedEnabled =
    discordEmbed.enabled !== undefined
      ? (discordEmbed.enabled ? 1 : 0)
      : (NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedEnabled ? 1 : 0);
  const nextDiscordEmbedColor =
    String(discordEmbed.color || "").trim() || NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedColor;
  const nextDiscordEmbedFooter = String(discordEmbed.footerText || "").trim();
  const nextDiscordEmbedShowChannel =
    discordEmbed.showChannel !== undefined
      ? (discordEmbed.showChannel ? 1 : 0)
      : (NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedShowChannel ? 1 : 0);
  const nextDiscordEmbedShowViewers =
    discordEmbed.showViewers !== undefined
      ? (discordEmbed.showViewers ? 1 : 0)
      : (NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedShowViewers ? 1 : 0);
  const nextDiscordEmbedShowGame =
    discordEmbed.showGame !== undefined
      ? (discordEmbed.showGame ? 1 : 0)
      : (NOTIFICATION_SETTINGS_DEFAULTS.discordEmbedShowGame ? 1 : 0);
  const nextDiscordEmbedImageUrlTemplate = String(discordEmbed.imageUrlTemplate || "").trim();
  const nextDiscordEmbedThumbnailUrlTemplate = String(discordEmbed.thumbnailUrlTemplate || "").trim();

  const current = getNotificationSettings({ includeSecrets: true });
  const nextDiscordWebhook = String(discord.webhook || "").trim() || current.discord.webhook || "";
  const nextInstagramAccountId = String(instagram.accountId || "").trim() || current.instagram.accountId || "";
  const nextInstagramToken = String(instagram.token || "").trim() || current.instagram.token || "";

  const tx = db.transaction(() => {
    setSettingValue("notif_discord_enabled", nextDiscordEnabled);
    setSettingValue("notif_discord_template", nextDiscordTemplate);
    setSettingValue("notif_discord_webhook", nextDiscordWebhook);
    setSettingValue("notif_discord_username", nextDiscordUsername);
    setSettingValue("notif_discord_avatar_url", nextDiscordAvatarUrl);
    setSettingValue("notif_discord_embed_enabled", nextDiscordEmbedEnabled);
    setSettingValue("notif_discord_embed_color", nextDiscordEmbedColor);
    setSettingValue("notif_discord_embed_footer", nextDiscordEmbedFooter);
    setSettingValue("notif_discord_embed_show_channel", nextDiscordEmbedShowChannel);
    setSettingValue("notif_discord_embed_show_viewers", nextDiscordEmbedShowViewers);
    setSettingValue("notif_discord_embed_show_game", nextDiscordEmbedShowGame);
    setSettingValue("notif_discord_embed_image_url_template", nextDiscordEmbedImageUrlTemplate);
    setSettingValue("notif_discord_embed_thumbnail_url_template", nextDiscordEmbedThumbnailUrlTemplate);
    setSettingValue("notif_instagram_enabled", nextInstagramEnabled);
    setSettingValue("notif_instagram_template", nextInstagramTemplate);
    setSettingValue("notif_instagram_account_id", nextInstagramAccountId);
    setSettingValue("notif_instagram_token", nextInstagramToken);
  });
  tx();

  broadcast("SETTINGS_UPDATE", {
    keys: [
      "notif_discord_enabled",
      "notif_discord_template",
      "notif_discord_webhook",
      "notif_discord_username",
      "notif_discord_avatar_url",
      "notif_discord_embed_enabled",
      "notif_discord_embed_color",
      "notif_discord_embed_footer",
      "notif_discord_embed_show_channel",
      "notif_discord_embed_show_viewers",
      "notif_discord_embed_show_game",
      "notif_discord_embed_image_url_template",
      "notif_discord_embed_thumbnail_url_template",
      "notif_instagram_enabled",
      "notif_instagram_template",
      "notif_instagram_account_id",
      "notif_instagram_token"
    ]
  });
  res.json({ ok: true, settings: getNotificationSettings({ includeSecrets: false }) });
});

app.post("/api/notifications/test", requireAuth, requireAdmin, async (req, res) => {
  const notificationSettings = getNotificationSettings({ includeSecrets: true });
  const now = new Date().toISOString();
  const payload = {
    channelLogin: TWITCH_CHANNEL || "test_channel",
    channelDisplayName: TWITCH_CHANNEL || "Test Channel",
    title: "Test Stream Notification",
    game: "Just Testing",
    viewerCount: 42,
    url: `https://twitch.tv/${TWITCH_CHANNEL || "test_channel"}`,
    timestamp: now,
    startedAt: now
  };

  const discordResult = await sendDiscordStreamStartNotification(payload, {
    webhookUrl: notificationSettings.discord.webhook || DISCORD_STREAM_LIVE_WEBHOOK_URL,
    mentionRoleId: DISCORD_MENTION_ROLE_ID,
    template: notificationSettings.discord.template || NOTIFY_TEMPLATE_DISCORD,
    username: notificationSettings.discord.username,
    avatarUrl: notificationSettings.discord.avatarUrl,
    enabled: notificationSettings.discord.enabled,
    embedEnabled: notificationSettings.discord.embed?.enabled,
    embedColor: notificationSettings.discord.embed?.color,
    embedFooterText: notificationSettings.discord.embed?.footerText,
    embedShowChannel: notificationSettings.discord.embed?.showChannel,
    embedShowViewers: notificationSettings.discord.embed?.showViewers,
    embedShowGame: notificationSettings.discord.embed?.showGame,
    embedImageUrlTemplate: notificationSettings.discord.embed?.imageUrlTemplate,
    embedThumbnailUrlTemplate: notificationSettings.discord.embed?.thumbnailUrlTemplate
  }).catch((error) => ({ error: String(error?.message || error) }));

  let instagramResult = { skipped: true, reason: "disabled" };
  if (notificationSettings.instagram.enabled) {
    instagramResult = await instagramIntegration
      .publishStory(payload, {
        businessAccountId: notificationSettings.instagram.accountId,
        accessToken: notificationSettings.instagram.token,
        template: notificationSettings.instagram.template || NOTIFICATION_SETTINGS_DEFAULTS.instagramTemplate
      })
      .catch((error) => ({ error: String(error?.message || error) }));
  }

  const responseBody = {
    ok: !discordResult?.error && !instagramResult?.error,
    discord: {
      sent: Boolean(discordResult?.ok),
      reason: discordResult?.reason || null,
      error: discordResult?.error || null
    },
    instagram: {
      sent: Boolean(instagramResult && instagramResult.skipped === false),
      reason: instagramResult?.reason || null,
      error: instagramResult?.error || null
    }
  };
  const status = responseBody.ok ? 200 : 502;
  res.status(status).json(responseBody);
});

app.get("/api/twitch/custom-commands", requireAuth, (req, res) => {
  res.json(getCustomCommands());
});

app.post("/api/twitch/custom-commands", requireAuth, (req, res) => {
  const payload = req.body || {};
  const validated = validateCustomCommandInput(payload);
  if (validated.errors.length > 0) {
    return res.status(400).json({ error: validated.errors.join(", ") });
  }
  const conflicts = detectCustomCommandConflicts({
    command: validated.value.command,
    aliases: validated.value.aliases || []
  });
  if (conflicts.length > 0) {
    return res.status(409).json({ error: conflicts.join(", ") });
  }
  const now = new Date().toISOString();
  const id = nanoid();
  db.prepare(
    "INSERT INTO twitch_custom_commands (id, command, aliases_json, response, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    validated.value.command,
    JSON.stringify(validated.value.aliases || []),
    validated.value.response,
    validated.value.enabled ?? 1,
    now,
    now
  );
  broadcast("TWITCH_COMMANDS_UPDATE", { action: "created", id });
  return res.status(201).json({
    id,
    command: validated.value.command,
    aliases: validated.value.aliases || [],
    response: validated.value.response,
    enabled: (validated.value.enabled ?? 1) === 1,
    createdAt: now,
    updatedAt: now
  });
});

app.put("/api/twitch/custom-commands/:commandId", requireAuth, (req, res) => {
  const existing = db
    .prepare(
      "SELECT id, command, aliases_json, response, enabled, created_at, updated_at FROM twitch_custom_commands WHERE id = ?"
    )
    .get(req.params.commandId);
  if (!existing) {
    return res.status(404).json({ error: "Custom command not found" });
  }
  const existingParsed = parseCustomCommandRow(existing);
  const payload = req.body || {};
  const validated = validateCustomCommandInput(payload, { allowPartial: true });
  if (validated.errors.length > 0) {
    return res.status(400).json({ error: validated.errors.join(", ") });
  }
  const nextCommand = validated.value.command ?? existingParsed.command;
  const nextAliases = validated.value.aliases ?? existingParsed.aliases;
  const conflicts = detectCustomCommandConflicts({
    command: nextCommand,
    aliases: nextAliases,
    excludeId: existingParsed.id
  });
  if (conflicts.length > 0) {
    return res.status(409).json({ error: conflicts.join(", ") });
  }
  const now = new Date().toISOString();
  const nextResponse = validated.value.response ?? existingParsed.response;
  const nextEnabled = validated.value.enabled ?? (existingParsed.enabled ? 1 : 0);
  db.prepare(
    "UPDATE twitch_custom_commands SET command = ?, aliases_json = ?, response = ?, enabled = ?, updated_at = ? WHERE id = ?"
  ).run(
    nextCommand,
    JSON.stringify(nextAliases),
    nextResponse,
    nextEnabled,
    now,
    existingParsed.id
  );
  broadcast("TWITCH_COMMANDS_UPDATE", { action: "updated", id: existingParsed.id });
  return res.json({
    id: existingParsed.id,
    command: nextCommand,
    aliases: nextAliases,
    response: nextResponse,
    enabled: nextEnabled === 1,
    createdAt: existingParsed.createdAt,
    updatedAt: now
  });
});

app.delete("/api/twitch/custom-commands/:commandId", requireAuth, (req, res) => {
  const result = db
    .prepare("DELETE FROM twitch_custom_commands WHERE id = ?")
    .run(req.params.commandId);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Custom command not found" });
  }
  broadcast("TWITCH_COMMANDS_UPDATE", { action: "deleted", id: req.params.commandId });
  return res.json({ ok: true });
});

app.get("/api/votes/active", requireAuth, (req, res) => {
  const round = getLatestOpenVoteRound();
  if (!round || new Date(round.endsAt).getTime() <= Date.now()) {
    return res.json({ active: false });
  }
  const counts = getVoteTallies(round.id);
  res.json({
    active: true,
    round: {
      roundId: round.id,
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      options: round.options,
      counts
    }
  });
});

app.post("/api/votes/start", requireAuth, (req, res) => {
  const active = getLatestOpenVoteRound();
  if (active && new Date(active.endsAt).getTime() > Date.now()) {
    return res.status(409).json({ error: "Vote already active" });
  }
  const round = startVoteRound();
  if (!round) {
    return res.status(409).json({ error: "Not enough eligible tracks in pool for voting" });
  }
  res.json({
    roundId: round.id,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    options: round.options
  });
});

app.get("/api/overlay/state", async (req, res) => {
  const status = await fetchTwitchChannelStatus();
  const hypeSettings = getHypeSettings();
  const playState = getPlayState();
  const currentTrack = getCurrentTrack(playState);
  res.json({
    width: OVERLAY_CANVAS_WIDTH,
    height: OVERLAY_CANVAS_HEIGHT,
    activeUntil: overlayState.activeUntil,
    lastTriggeredAt: overlayState.lastTriggeredAt,
    hypeUntil: overlayState.hypeUntil,
    hypeLastTriggeredAt: overlayState.hypeLastTriggeredAt,
    hypeEnabled: hypeSettings.enabled,
    hypeEmotes: hypeSettings.emotes,
    twitch: {
      channel: status.channel,
      live: status.live,
      viewerCount: status.viewerCount
    },
    playback: {
      trackId: currentTrack?.id || null,
      durationSec: Number(currentTrack?.duration_sec || 0),
      startedAtMs: Number(playState?.started_at_ms || 0),
      paused: Boolean(playState?.paused),
      pausedAtMs: Number(playState?.paused_at_ms || 0)
    }
  });
});

app.post("/api/overlay/test", requireAuth, (req, res) => {
  overlayState.lastTriggeredAt = Date.now();
  overlayState.activeUntil = overlayState.lastTriggeredAt + OVERLAY_TEST_DURATION_MS;
  res.json({
    ok: true,
    activeUntil: overlayState.activeUntil,
    width: OVERLAY_CANVAS_WIDTH,
    height: OVERLAY_CANVAS_HEIGHT
  });
});

app.post("/api/overlay/hype/test", requireAuth, (req, res) => {
  const settings = getHypeSettings();
  hypeRuntime.participants.clear();
  triggerHype(Math.round(settings.durationSeconds * 1000));
  res.json({
    ok: true,
    hypeUntil: overlayState.hypeUntil,
    durationSeconds: settings.durationSeconds
  });
});

app.use("/assets", express.static(PUBLIC_DIR));

app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
});

app.get("/dashboard/public", requireAuth, (req, res) => {
  const user = req.session?.user || {};
  res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"/><title>Erwin Public Dashboard</title><link rel="stylesheet" href="/assets/styles.css"></head><body class="login"><main class="card login-card"><h1>Dashboard Access Limited</h1><p class="notice">Hi ${String(user.displayName || user.username || "viewer")}. Your role is <strong>${String(user.role || "viewer")}</strong>.</p><p class="notice">This placeholder is currently the only dashboard surface for viewer/mod/vip users.</p><p><a href="/login">Back to login</a></p></main></body></html>`);
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/player/stream", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "stream.html"));
});

app.get("/overlay/canvas", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "overlay.html"));
});

app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

const server = app.listen(PORT, () => {
  log("info", "server listening", { port: PORT });
});

server.on("error", (error) => {
  writeFatalLogSync("http server error", error);
  log("error", "http server error", {
    error: String(error?.message || error),
    stack: error?.stack || null,
    code: error?.code || null,
    port: PORT
  });
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});

server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/ws") {
    socket.destroy();
    return;
  }

  sessionMiddleware(request, {}, () => {
    if (!request.session?.user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
});

wss.on("connection", (ws, request) => {
  const user = request.session?.user || {};
  const meta = {
    userId: user.id || null,
    username: user.username || null,
    clientId: null,
    page: null,
    lastHeartbeatAt: 0,
    lastReported: null,
    timeSync: { rttMs: null, offsetMs: null },
    stallScore: 0,
    errorScore: 0,
    fatalErrorTimes: [],
    lastProgressSeconds: null,
    lastProgressAt: 0,
    progressMarkTime: null
  };
  wsTelemetry.set(ws, meta);
  sendWsMessage(ws, { event: "CONNECTED", payload: {} });
  sendWsMessage(ws, { type: "CONNECTED" });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    const type = message?.type;
    if (!type) return;

    if (type === "HELLO") {
      meta.clientId = message.clientId || meta.clientId;
      meta.page = message.page || null;
      return;
    }

    if (type === "TIME_SYNC_PING") {
      sendWsMessage(ws, {
        type: "TIME_SYNC_PONG",
        t0: Number(message.t0) || 0,
        t1: Date.now(),
        clientId: message.clientId || meta.clientId || null
      });
      return;
    }

    if (type === "PLAYER_EVENT") {
      if (message.event === "error") {
        meta.errorScore += 1;
      }
      if (message.event === "stalled" || message.event === "waiting") {
        meta.stallScore += 1;
      }
      return;
    }

    if (type !== "PLAYER_HEARTBEAT") {
      return;
    }

    const now = Date.now();
    const reportedTime = Number(message.currentTime);
    meta.clientId = message.clientId || meta.clientId;
    meta.lastHeartbeatAt = now;
    meta.lastReported = {
      trackId: message.trackId ?? null,
      currentTime: Number.isFinite(reportedTime) ? reportedTime : 0,
      paused: Boolean(message.paused),
      readyState: Number(message.readyState),
      networkState: Number(message.networkState),
      bufferedEnd: Number.isFinite(Number(message.bufferedEnd)) ? Number(message.bufferedEnd) : null,
      lastError: message.lastError || null
    };

    if (meta.lastProgressSeconds === null || !Number.isFinite(meta.lastProgressSeconds)) {
      meta.lastProgressSeconds = meta.lastReported.currentTime;
      meta.progressMarkTime = meta.lastReported.currentTime;
      meta.lastProgressAt = now;
    } else if (meta.lastReported.currentTime > meta.lastProgressSeconds + 0.5) {
      meta.lastProgressSeconds = meta.lastReported.currentTime;
      meta.progressMarkTime = meta.lastReported.currentTime;
      meta.lastProgressAt = now;
    }

    if (meta.lastReported.lastError) {
      meta.errorScore += 1;
      meta.fatalErrorTimes.push(now);
      meta.fatalErrorTimes = meta.fatalErrorTimes.filter((ts) => now - ts <= AUTO_SKIP_ERROR_WINDOW_MS);
    }

    const playState = getPlayState();
    const currentTrack = getCurrentTrack(playState);
    const expectedSeconds = computeExpectedSeconds(playState, now, currentTrack?.duration_sec ?? null);
    const drift = Math.abs(meta.lastReported.currentTime - expectedSeconds);
    const wrongTrack = (meta.lastReported.trackId || null) !== (playState?.current_track_id || null);
    const likelyStalled =
      !playState?.paused &&
      (meta.lastReported.readyState < 3 ||
        meta.lastReported.networkState === 2 ||
        meta.lastReported.networkState === 3 ||
        (Number.isFinite(meta.lastReported.bufferedEnd) &&
          meta.lastReported.bufferedEnd < meta.lastReported.currentTime + 0.1));

    if (wrongTrack || drift > DRIFT_THRESHOLD_SECONDS || likelyStalled) {
      sendWsMessage(ws, {
        type: "CLIENT_ADJUST",
        targetTrackId: playState?.current_track_id || null,
        targetTime: expectedSeconds,
        shouldBePaused: Boolean(playState?.paused),
        reason: wrongTrack ? "state-change" : drift > DRIFT_THRESHOLD_SECONDS ? "drift" : "recover"
      });
    }

    maybeAutoSkipFromTelemetry(meta);
  });

  ws.on("close", () => {
    wsTelemetry.delete(ws);
  });

  ws.on("error", () => {
    wsTelemetry.delete(ws);
  });
});

const stateBroadcastInterval = setInterval(() => {
  broadcastStateUpdate();
}, 10000);

const streamNotificationWatchInterval = setInterval(() => {
  runStreamNotificationWatcher();
}, STREAM_NOTIFICATION_WATCH_INTERVAL_MS);
streamNotificationWatchInterval.unref?.();
runStreamNotificationWatcher();

async function startTwitchBot() {
  if (!twitchOauthToken && twitchRefreshToken && TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    await refreshTwitchAccessToken("startup");
  }
  if (twitchRefreshToken && TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    scheduleTwitchTokenRefresh(3600);
  }
  connectTwitchBot();
}

startTwitchBot();

function cleanupAudioCache() {
  if (!Number.isFinite(AUDIO_RETENTION_DAYS) || AUDIO_RETENTION_DAYS <= 0) {
    return;
  }
  const cutoff = new Date(Date.now() - AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const candidates = db
    .prepare(
      "SELECT id, audio_path, downloaded_at FROM tracks WHERE audio_path IS NOT NULL AND downloaded_at IS NOT NULL"
    )
    .all();
  const toRemove = candidates.filter((track) => {
    const downloadedAt = new Date(track.downloaded_at);
    return Number.isFinite(downloadedAt.getTime()) && downloadedAt < cutoff;
  });
  if (toRemove.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  toRemove.forEach((track) => {
    try {
      if (track.audio_path && fs.existsSync(track.audio_path)) {
        fs.unlinkSync(track.audio_path);
      }
    } catch (error) {
      log("warn", "audio retention cleanup failed", {
        trackId: track.id,
        error: String(error?.message || error)
      });
      return;
    }
    db.prepare(
      "UPDATE tracks SET audio_path = NULL, download_status = 'pending', download_error = NULL, downloaded_at = NULL WHERE id = ?"
    ).run(track.id);
    log("info", "audio retention removed", { trackId: track.id });
  });
  log("info", "audio retention completed", { removed: toRemove.length, now });
}

function cleanupAudioCacheBySize() {
  if (!Number.isFinite(AUDIO_RETENTION_MAX_GB) || AUDIO_RETENTION_MAX_GB <= 0) {
    return;
  }
  const maxBytes = AUDIO_RETENTION_MAX_GB * 1024 * 1024 * 1024;
  let entries = [];
  try {
    entries = fs
      .readdirSync(AUDIO_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const filePath = path.join(AUDIO_DIR, entry.name);
        const stat = fs.statSync(filePath);
        return { path: filePath, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime);
  } catch (error) {
    log("warn", "audio retention size scan failed", {
      error: String(error?.message || error)
    });
    return;
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes <= maxBytes) {
    return;
  }
  let bytesToFree = totalBytes - maxBytes;
  const removed = [];
  for (const entry of entries) {
    if (bytesToFree <= 0) break;
    try {
      fs.unlinkSync(entry.path);
      bytesToFree -= entry.size;
      removed.push(entry.path);
    } catch (error) {
      log("warn", "audio retention size cleanup failed", {
        path: entry.path,
        error: String(error?.message || error)
      });
    }
  }
  if (removed.length > 0) {
    removed.forEach((filePath) => {
      db.prepare(
        "UPDATE tracks SET audio_path = NULL, download_status = 'pending', download_error = NULL, downloaded_at = NULL WHERE audio_path = ?"
      ).run(filePath);
    });
    log("info", "audio retention size cleanup", {
      removed: removed.length,
      freedBytes: totalBytes - maxBytes - Math.max(0, bytesToFree)
    });
  }
}

const retentionInterval = setInterval(() => {
  cleanupAudioCache();
  cleanupAudioCacheBySize();
}, 60 * 60 * 1000);

function shutdown(signal) {
  log("info", "shutdown start", { signal });
  clearInterval(downloadInterval);
  clearInterval(voteInterval);
  clearInterval(retentionInterval);
  clearInterval(stateBroadcastInterval);
  clearInterval(streamNotificationWatchInterval);
  if (twitchTokenRefreshTimer) {
    clearTimeout(twitchTokenRefreshTimer);
    twitchTokenRefreshTimer = null;
  }
  if (twitchSocket) {
    try {
      twitchSocket.write("QUIT\r\n");
      twitchSocket.end();
    } catch (error) {
      log("warn", "twitch bot shutdown error", {
        error: String(error?.message || error)
      });
    }
  }
  server.close(() => {
    log("info", "http server closed");
  });
  wss.close(() => {
    log("info", "websocket server closed");
  });
  try {
    db.close();
  } catch (error) {
    log("warn", "database close error", { error: String(error?.message || error) });
  }
  setTimeout(() => {
    log("info", "shutdown complete");
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
