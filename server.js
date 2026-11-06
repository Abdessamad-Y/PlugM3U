// server.js
// Hosts a web UI for configuration and serves the addon dynamically.
// The selected playlists are carried in the URL path (/<files>/manifest.json) so
// that Stremio keeps them for every later catalog/meta/stream request.
const express = require("express");
const fs = require("fs");
const path = require("path");
const addon = require("./addon");

const app = express();
const port = process.env.PORT || 7000;
const M3U_DIR = path.join(__dirname, "m3u");

const CACHE_HEADER = "public, s-maxage=3600, stale-while-revalidate=86400";

// Stremio (especially the web version) needs CORS headers.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const parseFiles = (value) =>
  addon.safeFiles(
    String(value || "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)
  );

// List the available M3U files for the configuration page.
app.get("/api/files", (req, res) => {
  fs.readdir(M3U_DIR, (err, files) => {
    if (err) {
      console.error("Could not list the directory.", err);
      return res.status(500).send("Server error");
    }
    res.json(files.filter((file) => file.endsWith(".m3u")));
  });
});

function sendJson(res, body, cache) {
  if (cache) res.setHeader("Cache-Control", CACHE_HEADER);
  res.setHeader("Content-Type", "application/json");
  res.send(body);
}

// Registers the addon routes under an optional /:config prefix.
// config = comma-separated .m3u file names (path form), or ?files= (query form).
function register(prefix, getFiles) {
  app.get(`${prefix}/manifest.json`, (req, res) => {
    const files = getFiles(req);
    if (files.length === 0) {
      return res
        .status(400)
        .send("No M3U files selected. Please configure the addon via the web interface.");
    }
    sendJson(res, addon.getManifest(files), true);
  });

  app.get(`${prefix}/catalog/:type/:id.json`, async (req, res) => {
    sendJson(res, await addon.getCatalog(req.params.type, req.params.id, getFiles(req)), true);
  });
  // Stremio may append extra args (e.g. /catalog/tv/id/skip=0.json)
  app.get(`${prefix}/catalog/:type/:id/:extra.json`, async (req, res) => {
    sendJson(res, await addon.getCatalog(req.params.type, req.params.id, getFiles(req)), true);
  });

  app.get(`${prefix}/meta/:type/:id.json`, async (req, res) => {
    sendJson(res, await addon.getMeta(req.params.type, req.params.id, getFiles(req)), true);
  });

  app.get(`${prefix}/stream/:type/:id.json`, async (req, res) => {
    sendJson(res, await addon.getStreams(req.params.type, req.params.id), false);
  });
}

register("/:config", (req) => parseFiles(decodeURIComponent(req.params.config)));
register("", (req) => parseFiles(req.query.files));

app.listen(port, () => {
  console.log(`Addon server running. Open http://localhost:${port} to configure.`);
});

module.exports = app;
