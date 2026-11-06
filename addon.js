// addon.js
// Generates Stremio addon responses for the selected M3U playlists.

const { parseM3U } = require("@iptv/playlist");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const M3U_DIR = path.join(__dirname, "m3u");

// Only plain *.m3u file names inside the m3u directory are allowed.
function safeFiles(files) {
  return files.filter(
    (f) => /^[\w.\- ]+\.m3u$/.test(f) && path.basename(f) === f
  );
}

// Channel ids carry the stream URL, encoded so they are safe inside a URL path.
function encodeId(url) {
  return "iptv:" + Buffer.from(url, "utf8").toString("base64url");
}
function decodeId(id) {
  return Buffer.from(id.slice("iptv:".length), "base64url").toString("utf8");
}

function generateManifestId(files) {
  const hash = crypto.createHash("md5");
  hash.update([...files].sort().join(","));
  return `community.iptv.${hash.digest("hex")}`;
}

// One catalog per playlist file, e.g. morocco.m3u -> "iptv-morocco" / "Morocco".
const catalogId = (file) => "iptv-" + file.replace(/\.m3u$/, "").toLowerCase();
const catalogName = (file) => {
  const base = file.replace(/\.m3u$/, "").replace(/[-_]+/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
};

function getManifest(files) {
  files = safeFiles(files);
  const fileNames = files.map((f) => f.replace(".m3u", "")).join(", ");

  return {
    id: generateManifestId(files),
    version: "1.1.0",
    name: `IPTV (${fileNames})`,
    description: `Provides TV channels from selected M3U playlists: ${fileNames}`,
    resources: ["catalog", "meta", "stream"],
    types: ["tv"],
    catalogs: files.map((file) => ({
      type: "tv",
      id: catalogId(file),
      name: catalogName(file),
      extra: [{ name: "search", isRequired: false }],
    })),
    idPrefixes: ["iptv:"],
  };
}

function loadChannels(files) {
  let allChannels = [];
  for (const file of safeFiles(files)) {
    try {
      const m3uContent = fs.readFileSync(path.join(M3U_DIR, file), "utf8");
      allChannels = allChannels.concat(parseM3U(m3uContent).channels);
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }
  }
  return allChannels;
}

function toMeta(channel) {
  return {
    id: encodeId(channel.url),
    type: "tv",
    name: channel.name,
    poster: channel.tvgLogo || null,
    logo: channel.tvgLogo || null,
    posterShape: "landscape",
    description: `Group: ${channel.groupTitle || "N/A"}`,
  };
}

// Case- and space-insensitive match, so "medi1" finds "Medi 1 TV Arabic".
const normalize = (text) => String(text).toLowerCase().replace(/[\s_.-]+/g, "");

function parseExtra(extra) {
  const out = {};
  for (const part of String(extra || "").split("&")) {
    const i = part.indexOf("=");
    if (i > 0) {
      try {
        out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
      } catch (e) {
        out[part.slice(0, i)] = part.slice(i + 1);
      }
    }
  }
  return out;
}

async function getCatalog(type, id, files, extra) {
  if (type !== "tv") return { metas: [] };
  const selected =
    id === "iptv-channels" // old single-catalog id
      ? files
      : safeFiles(files).filter((f) => catalogId(f) === id);
  let metas = loadChannels(selected).map(toMeta);
  const search = parseExtra(extra).search;
  if (search) {
    const q = normalize(search);
    metas = metas.filter((m) => normalize(m.name).includes(q));
  }
  return { metas };
}

async function getMeta(type, id, files) {
  if (type === "tv" && id.startsWith("iptv:")) {
    const meta = loadChannels(files)
      .map(toMeta)
      .find((m) => m.id === id);
    if (meta) return { meta };
  }
  return { meta: {} };
}

async function getStreams(type, id) {
  if (type === "tv" && id.startsWith("iptv:")) {
    return { streams: [{ url: decodeId(id), title: "Live Stream" }] };
  }
  return { streams: [] };
}

module.exports = { getManifest, getCatalog, getMeta, getStreams, safeFiles };
