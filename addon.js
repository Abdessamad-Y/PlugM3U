// addon.js
// This file now contains functions to dynamically generate addon responses.

const { parseM3U } = require("@iptv/playlist");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const M3U_DIR = path.join(__dirname, "m3u");

// Generates a unique ID based on the selected files to keep the manifest consistent
function generateManifestId(files) {
  const hash = crypto.createHash("md5");
  hash.update(files.sort().join(","));
  return `community.iptv.${hash.digest("hex")}`;
}

function getManifest(files) {
  const manifestId = generateManifestId(files);
  const fileNames = files.map((f) => f.replace(".m3u", "")).join(", ");

  return {
    id: manifestId,
    version: "1.0.0",
    name: `IPTV (${fileNames})`,
    description: `Provides TV channels from selected M3U playlists: ${fileNames}`,
    resources: ["catalog", "stream"],
    types: ["tv"],
    catalogs: [
      {
        type: "tv",
        id: "iptv-channels",
        name: "IPTV Channels",
        // Pass the selected files to the catalog handler via query params
        extra: [{ name: "files", isRequired: true }],
      },
    ],
    idPrefixes: ["iptv:"],
  };
}

async function getCatalog(type, id, files) {
  if (type === "tv" && id === "iptv-channels") {
    let allChannels = [];

    for (const file of files) {
      try {
        const filePath = path.join(M3U_DIR, file);
        const m3uContent = fs.readFileSync(filePath, "utf8");
        const playlist = parseM3U(m3uContent);
        allChannels = allChannels.concat(playlist.channels);
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
        // Skip this file and continue with others
      }
    }

    const metas = allChannels.map((channel) => {
      return {
        id: `iptv:${channel.url}`,
        type: "tv",
        name: channel.name,
        poster: channel.tvgLogo || null,
        posterShape: "landscape",
        description: `Group: ${channel.groupTitle || "N/A"}`,
      };
    });

    return { metas };
  }
  return { metas: [] };
}

async function getStreams(type, id) {
  if (type === "tv" && id.startsWith("iptv:")) {
    const streamUrl = id.replace("iptv:", "");
    const streams = [
      {
        url: streamUrl,
        title: "Live Stream",
      },
    ];
    return { streams };
  }
  return { streams: [] };
}

module.exports = { getManifest, getCatalog, getStreams };
