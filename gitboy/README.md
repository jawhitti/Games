# GITBOY

A 16-bit, Super Meat Boy-flavored side-scroller that turns a **GitHub repo's history into a
playable level**. Point it at a repo and watch a team of little red meat-boys run its entire
issue / PR / commit log as a gauntlet — battling issue-trucks, flinging commit-stars, and
dodging PR airplanes — compressed into about a minute.

Single file, pixel-art, no external assets, all audio synthesized in the browser.

![it's chaos](https://img.shields.io/badge/aesthetic-chaos-e33) &nbsp;
![no build step](https://img.shields.io/badge/build-none-38a34a) &nbsp;
![deps](https://img.shields.io/badge/npm%20deps-0-2f7fd8)

---

## Quick start

You need [`gh`](https://cli.github.com/) authenticated (`gh auth status`) and Node 18+.

### Option A — the loader (recommended)

```bash
node server.mjs
```

Open **http://localhost:8787/**, type a repo (`owner/name` or a full GitHub URL), watch the
progress bar, and it drops you into the run. Works on private repos and big histories because
it uses your local `gh` auth.

### Option B — build a level from the CLI, then open the file

```bash
node build-level.mjs <owner/repo> [--limit 100] [--commits 800]
# then open index.html in a browser
```

This writes `level-data.js`, which `index.html` loads on open. With no `level-data.js` present,
the game runs a tiny built-in demo level.

---

## Controls

| Key | Action |
|-----|--------|
| **ENTER** | take control of the lead meat-boy / hand it back to auto-run |
| **← →** or **A D** | move |
| **SPACE** / **W** | jump |
| **J** | punch |
| **K** | flying kick |
| **M** | mute / unmute (audio starts on your first keypress) |
| **R** | replay |

By default the whole team **auto-runs** the gauntlet hands-free. Press **ENTER** any time to
seize the lead meat-boy and drive it yourself while the crew follows.

---

## How a repo becomes a level

Everything is laid on a shared **project timeline** — position on the track = *when it happened*.
The timeline is driven by the issues (so it's never half-empty), with long quiet gaps compressed
so the run stays lively. The whole history is squeezed into ~one minute.

| Repo thing | In the game |
|------------|-------------|
| **Closed issue** | a **truck** the crew boards and battles, then it **EXPLODES** (resolved) |
| **Open issue, worked on** | a truck the crew battles, then **hops off** — rolls on, still open |
| **Open issue, never touched** | a truck that just **rolls past**, unboarded |
| **Commit** | a **star** flung off the lead runner, trailing its short sha (`ac243bd`) |
| **Pull request** | an **airplane** that flies in from the left, **fires a missile at a truck**, then... |
| &nbsp;&nbsp;→ merged | ...**peels off** to the right (green) |
| &nbsp;&nbsp;→ rejected (closed unmerged) | ...**explodes mid-air** (red) |
| &nbsp;&nbsp;→ still open | ...just **cruises across** (grey) |
| **Issue comment count** | **truck size** — 3 tiers; chatty issues are big trucks |
| **Issue labels** | which **squad** owns it: Bug Squad / Feature Team / Docs Crew / Chores |
| **Reaching the end** | a 5-second **fireworks** finale + a victory jingle, then quiet |

Each meat-boy is a **squad** (one per kind of work, color-coded). The nearest free crew member
boards each truck (preferring the owning squad). Half the crew take the "high road" and run
along brick platforms that form over busy stretches.

Battle length scales with an issue's real lifetime (created → resolved), capped so one long-lived
issue can't tie up a rider for the whole run.

---

## The pipeline

`build-level.mjs` is both a CLI and an importable module:

```js
import { buildLevel, levelToJs } from "./build-level.mjs";
const level = await buildLevel({ repo: "cli/cli", limit: 100, commits: 800, onProgress });
```

- `--limit N` — issues fetched per state (open/closed), default 120
- `--commits N` — commits pulled for stars, default 400
- `--out FILE` — output path, default `level-data.js`

It accepts `owner/name`, a full `https://github.com/owner/name` URL, or `git@github.com:owner/name`.

---

## Architecture

- **`build-level.mjs`** — fetches via `gh`, builds the gap-compressed timeline, transforms
  issues/PRs/commits into level data. No dependencies.
- **`server.mjs`** — a tiny zero-dep Node HTTP server: serves the loader, streams build progress
  over SSE, writes `level-data.js`, and serves the game. Restart it after editing
  `build-level.mjs` (ESM modules are cached at process start).
- **`loader.html`** — the title screen: repo input + live progress bar.
- **`index.html`** — the whole game: HTML5 canvas at 416×234 scaled up with `image-rendering:
  pixelated`. All sound is synthesized with the Web Audio API — engine idle, sparkles,
  explosions, a looping chiptune bed, a victory jingle, and crew grunts/"yeah"/"ooh". No audio
  files.

`level-data.js` is generated output (git-ignored). The game falls back to a built-in demo level
if it's missing.

---

## Putting it online

You don't need an always-on server. The GitHub REST API is CORS-enabled, so:

- **Public repos, zero backend** — port the fetch logic from `gh`-exec to browser `fetch()` and
  host the static files anywhere.
- **Private repos / no rate-limit friction** — one serverless function (Vercel / Cloudflare
  Worker) holding a GitHub token as a secret, running the same `buildLevel`.

The always-on `server.mjs` here is the local-dev / private-demo option.

---

Built collaboratively, one ridiculous idea at a time. Go blow up some rejected PRs.
