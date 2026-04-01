import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";
const DEFAULT_TEMPLATE = "🔴 LIVE NOW\n{title}\n🎮 {game}\n{url}";
const REQUIRED_ENV = [
  "META_APP_ID",
  "META_APP_SECRET",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "META_LONG_LIVED_ACCESS_TOKEN"
];

function envTrim(name, fallback = "") {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).trim();
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fillTemplate(template, payload) {
  return String(template || DEFAULT_TEMPLATE)
    .replaceAll("{title}", payload.title || "Live stream")
    .replaceAll("{game}", payload.game || "Now playing")
    .replaceAll("{url}", payload.url || "")
    .trim();
}

function chunkLines(text, size = 38) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > size) {
      if (current) lines.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current) lines.push(current);
  return lines.slice(0, 6);
}

function buildStorySvg({ brandName, lines, streamUrl }) {
  const safeBrand = escapeXml(brandName || "Erwin");
  const safeUrl = escapeXml(streamUrl || "");
  const lineTags = lines
    .map(
      (line, index) =>
        `<text x="90" y="${360 + index * 96}" fill="#ffffff" font-size="68" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeXml(line)}</text>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect x="72" y="72" width="936" height="1776" rx="44" fill="rgba(15,23,42,0.35)" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
  <text x="90" y="200" fill="#a5b4fc" font-size="48" font-family="Arial, Helvetica, sans-serif" font-weight="700">${safeBrand}</text>
  <text x="90" y="290" fill="#ffffff" font-size="88" font-family="Arial, Helvetica, sans-serif" font-weight="800">LIVE ON TWITCH</text>
  ${lineTags}
  <text x="90" y="1760" fill="#cbd5e1" font-size="42" font-family="Arial, Helvetica, sans-serif">${safeUrl}</text>
</svg>`;
}

async function graphRequest({ endpoint, params, accessToken, method = "POST" }) {
  const url = new URL(`${META_GRAPH_BASE}${endpoint}`);
  const requestParams = {
    ...params,
    access_token: accessToken
  };

  const options = { method, headers: {} };
  if (method === "GET") {
    for (const [key, value] of Object.entries(requestParams)) {
      url.searchParams.set(key, String(value));
    }
  } else {
    options.headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = new URLSearchParams(requestParams);
  }

  const response = await fetch(url, options);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const errorMessage = payload?.error?.message || `Meta API request failed (${response.status})`;
    const error = new Error(errorMessage);
    error.meta = payload?.error || null;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function createInstagramIntegration({ log, publicBaseUrl, staticDir }) {
  const settings = {
    appId: envTrim("META_APP_ID"),
    appSecret: envTrim("META_APP_SECRET"),
    businessAccountId: envTrim("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
    accessToken: envTrim("META_LONG_LIVED_ACCESS_TOKEN"),
    notifyTemplate: envTrim("NOTIFY_TEMPLATE_INSTAGRAM", DEFAULT_TEMPLATE)
  };

  const missing = REQUIRED_ENV.filter((key) => !envTrim(key));
  const enabled = missing.length === 0 && Boolean(publicBaseUrl);

  if (!enabled) {
    const reasons = [];
    if (missing.length) reasons.push(`missing env: ${missing.join(", ")}`);
    if (!publicBaseUrl) reasons.push("PUBLIC_BASE_URL is required for Meta to fetch generated story media");
    log("warn", "instagram integration disabled", {
      reasons,
      setupSteps: [
        "1) In Meta app, enable Instagram Graph API with instagram_content_publish permission.",
        "2) Connect an Instagram Business account to a Facebook Page and app.",
        "3) Configure META_APP_ID, META_APP_SECRET, INSTAGRAM_BUSINESS_ACCOUNT_ID, META_LONG_LIVED_ACCESS_TOKEN.",
        "4) Ensure PUBLIC_BASE_URL is HTTPS and publicly reachable by Meta crawlers."
      ]
    });
  }

  async function generateStoryAsset(payload) {
    const text = fillTemplate(settings.notifyTemplate, payload);
    const lines = chunkLines(text, 32);
    const hash = crypto.createHash("sha1").update(`${text}|${payload.timestamp || ""}`).digest("hex").slice(0, 12);
    const filename = `instagram-story-${hash}.svg`;
    const outPath = path.join(staticDir, "generated", filename);
    const svg = buildStorySvg({
      brandName: payload.channelDisplayName || payload.channelLogin || "Erwin",
      lines,
      streamUrl: payload.url
    });
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, svg, "utf8");
    const mediaUrl = new URL(`/assets/generated/${filename}`, `${publicBaseUrl.replace(/\/$/, "")}/`).toString();
    return { mediaUrl, outPath, filename };
  }

  async function waitForContainerReady(containerId) {
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await graphRequest({
        endpoint: `/${containerId}`,
        accessToken: settings.accessToken,
        method: "GET",
        params: {
          fields: "id,status_code,status,status_message"
        }
      });

      const statusCode = String(result?.status_code || result?.status || "").toUpperCase();
      if (["FINISHED", "PUBLISHED", "READY"].includes(statusCode)) {
        return result;
      }
      if (["ERROR", "EXPIRED", "FAILED"].includes(statusCode)) {
        throw new Error(`Meta container failed processing (${statusCode}): ${result?.status_message || "unknown reason"}`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000 * attempt, 12000)));
    }
    throw new Error("Meta container did not become ready before timeout");
  }

  async function publishStory(payload) {
    if (!enabled) return { skipped: true, reason: "integration_disabled" };
    const media = await generateStoryAsset(payload);

    const isVideo = Boolean(payload?.videoUrl);
    const createResult = await graphRequest({
      endpoint: `/${settings.businessAccountId}/media`,
      accessToken: settings.accessToken,
      params: {
        media_type: "STORIES",
        ...(isVideo ? { video_url: payload.videoUrl } : { image_url: media.mediaUrl }),
        caption: fillTemplate(settings.notifyTemplate, payload)
      }
    });

    const containerId = String(createResult?.id || "").trim();
    if (!containerId) {
      throw new Error("Meta media container response did not include id");
    }

    await waitForContainerReady(containerId);

    const publishResult = await graphRequest({
      endpoint: `/${settings.businessAccountId}/media_publish`,
      accessToken: settings.accessToken,
      params: {
        creation_id: containerId
      }
    });

    return {
      skipped: false,
      containerId,
      publishedMediaId: publishResult?.id || null,
      mediaUrl: media.mediaUrl
    };
  }

  return {
    enabled,
    publishStory
  };
}
