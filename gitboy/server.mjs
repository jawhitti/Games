#!/usr/bin/env node
// GITBOY local server: title screen -> type a repo -> progress bar -> run.
//   node server.mjs        then open http://localhost:8787/
// Uses your authed `gh`, so it works on private repos and big histories.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLevel, levelToJs } from "./build-level.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;

const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
async function serveFile(res, file, extraHeaders = {}) {
  try {
    const body = await readFile(path.join(DIR, file));
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "text/plain", ...extraHeaders });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");

  if (u.pathname === "/" || u.pathname === "/index.html") return serveFile(res, "loader.html");
  if (u.pathname === "/game")           return serveFile(res, "index.html");
  if (u.pathname === "/level-data.js")  return serveFile(res, "level-data.js", { "Cache-Control": "no-store" });

  if (u.pathname === "/api/build") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    const push = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const repo = (u.searchParams.get("repo") || "").trim();
    const limit = Math.max(1, Math.min(300, +(u.searchParams.get("limit") || 100)));
    const commits = Math.max(0, Math.min(5000, +(u.searchParams.get("commits") || 800)));
    if (!repo.includes("/")) { push({ error: "enter a repo as owner/name" }); return res.end(); }
    try {
      const level = await buildLevel({ repo, limit, commits, onProgress: (pct, msg) => push({ pct, msg }) });
      writeFileSync(path.join(DIR, "level-data.js"), levelToJs(level));
      push({ done: true, repo: level.repo, counts: level.counts, span: level.span });
      res.end();
    } catch (e) { push({ error: String(e.message || e) }); res.end(); }
    return;
  }

  res.writeHead(404); res.end("not found");
});

server.listen(PORT, () => {
  console.log(`\n  GITBOY  ->  http://localhost:${PORT}/\n  (type a repo, watch it load, and it runs)\n`);
});
