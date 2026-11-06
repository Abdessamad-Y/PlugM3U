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
    catalogs: [{ type: "tv", id: "iptv-channels", name: "IPTV Channels" }],
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

async function getCatalog(type, id, files) {
  if (type === "tv" && id === "iptv-channels") {
    return { metas: loadChannels(files).map(toMeta) };
  }
  return { metas: [] };
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
