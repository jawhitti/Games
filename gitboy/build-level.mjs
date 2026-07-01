#!/usr/bin/env node
// GITBOY level builder -- importable module + CLI.
//
//   import { buildLevel, levelToJs } from "./build-level.mjs"
//   const level = await buildLevel({ repo, limit, commits, onProgress })
//
//   CLI:  node build-level.mjs <owner/repo> [--limit N] [--commits N] [--out FILE]
//
// Reads a repo's issues + commits via `gh`, lays them on a gap-compressed project
// timeline, and turns them into a truck gauntlet for a team of squad meat-boys.
//   closed issue          -> truck the crew battles until it resolves, then EXPLODES
//   open + worked on       -> truck the crew battles, then hops off (still open)
//   open + never addressed -> truck that just rolls past
//   commit                 -> a star flung off the runners, timed to the timeline
// The trucks (issues) drive the timeline axis so the run is never half-empty.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pexec = promisify(execFile);
const DAY = 86400000, HOUR = 3600000;

const BUG_RE  = /(bug|defect|crash|regression|broken|error|fix|cors|leak|security|vuln|fail)/i;
const FEAT_RE = /(enhanc|feature|feat|improv|perf|ux|ui|design|support|add )/i;
const DOCS_RE = /(doc|readme|guide|spec|wording|reconcile)/i;
const SQUADS = {
  bug:  { name: "Bug Squad",    color: "#c92b2b" },
  feat: { name: "Feature Team", color: "#2f7fd8" },
  docs: { name: "Docs Crew",    color: "#159c9c" },
  task: { name: "Chores",       color: "#d9a021" },
};
function categorize(labels, title) {
  const L = labels.map(l => l.name.toLowerCase());
  if (L.some(x => /bug|defect|regression|crash|security/.test(x))) return "bug";
  if (L.some(x => /enhanc|feature|feat/.test(x)))                   return "feat";
  if (L.some(x => /doc/.test(x)))                                   return "docs";
  const t = title || "";
  if (BUG_RE.test(t))  return "bug";
  if (DOCS_RE.test(t)) return "docs";
  if (FEAT_RE.test(t)) return "feat";
  return "task";
}
function difficulty(issue, now) {
  const start = new Date(issue.createdAt).getTime();
  const end = issue.closedAt ? new Date(issue.closedAt).getTime() : now;
  const ageDays = Math.max(0, (end - start) / DAY), c = issue.comments?.length ?? 0;
  let s = 0; if (c >= 2) s++; if (c >= 6) s++; if (ageDays >= 14) s++; if (ageDays >= 90) s++;
  return Math.max(1, Math.min(3, 1 + Math.floor(s / 1.5)));
}

// accept "owner/name", a full https URL, or git@github.com:owner/name
function normalizeRepo(s) {
  s = (s || "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m = s.match(/github\.com[/:]+([^/]+\/[^/#?]+)/i);
  return m ? m[1] : s;
}

async function ghJson(args) {
  const { stdout } = await pexec("gh", args, { maxBuffer: 128 * 1024 * 1024 });
  return JSON.parse(stdout);
}
function ghIssues(repo, state, limit) {
  return ghJson(["issue", "list", "--repo", repo, "--state", state, "--limit", String(limit),
    "--json", "number,title,state,labels,assignees,author,comments,createdAt,updatedAt,closedAt,url"]);
}
async function ghCommitsPage(repo, per, page) {
  try { return await ghJson(["api", `repos/${repo}/commits?per_page=${per}&page=${page}`]); }
  catch { return []; }
}
function ghPRs(repo, limit) {
  return ghJson(["pr", "list", "--repo", repo, "--state", "all", "--limit", String(limit),
    "--json", "number,title,state,createdAt,closedAt,mergedAt,author"]);
}
function ghReleases(repo, limit) {
  return ghJson(["release", "list", "--repo", repo, "--limit", String(limit),
    "--json", "tagName,name,publishedAt,isPrerelease"]);
}
const isBot = s => /\[bot\]|dependabot|renovate|github-actions|greenkeeper|snyk-bot/i.test(s || "");

export async function buildLevel({ repo, limit = 120, commits = 400, onProgress = () => {} }) {
  repo = normalizeRepo(repo);
  if (!repo || !repo.includes("/")) throw new Error("repo must be owner/name");
  onProgress(4, "reading open issues…");
  const open = await ghIssues(repo, "open", limit);
  onProgress(10, "reading closed issues…");
  const closed = await ghIssues(repo, "closed", limit);
  const issues = [...open, ...closed];

  onProgress(14, "reading pull requests…");
  let prs = [];
  try { prs = await ghPRs(repo, limit); } catch { prs = []; }

  onProgress(15, "reading releases…");
  let rels = [];
  try { rels = await ghReleases(repo, 60); } catch { rels = []; }

  onProgress(16, "reading commits…");
  const per = 100, pages = Math.max(1, Math.ceil(commits / per));
  let raw = [];
  for (let p = 1; p <= pages; p++) {
    const arr = await ghCommitsPage(repo, per, p);
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const c of arr) raw.push({
      sha: (c.sha || "").slice(0, 7),
      date: c.commit?.author?.date || c.commit?.committer?.date,
      login: (c.author && c.author.login) || c.commit?.author?.name || "?",
      msg: (c.commit?.message || "").split("\n")[0],
    });
    onProgress(16 + Math.round(66 * p / pages), `reading commits… ${raw.length}`);
    if (arr.length < per) break;
  }
  const commitList = raw.filter(c => c.date).slice(0, commits);
  if (issues.length === 0 && commitList.length === 0) throw new Error(`no issues or commits found on ${repo}`);

  onProgress(88, "building level…");
  const now = Date.now();

  // timeline: trucks (issues) drive the axis; sparse gaps clamped so it isn't dead air.
  const workEpochs = [...new Set([
    ...issues.map(i => new Date(i.createdAt).getTime()),
    ...prs.map(p => new Date(p.createdAt).getTime()),
  ])].sort((a, b) => a - b);
  const allEpochs = [...workEpochs, ...commitList.map(c => new Date(c.date).getTime())];
  const t0 = workEpochs.length ? workEpochs[0] : Math.min(...allEpochs);
  const t1 = workEpochs.length ? workEpochs[workEpochs.length - 1] : Math.max(...allEpochs);
  const span = Math.max(1, t1 - t0);
  let frac;
  if (workEpochs.length < 2) {
    frac = ms => (ms - t0) / span;
  } else {
    const ev = workEpochs;
    const gaps = []; for (let i = 1; i < ev.length; i++) gaps.push(ev[i] - ev[i - 1]);
    const med = [...gaps].sort((a, b) => a - b)[gaps.length >> 1] || DAY;
    const CAP = Math.max(3 * DAY, med * 4);
    const C = [0]; for (let i = 1; i < ev.length; i++) C[i] = C[i - 1] + Math.min(ev[i] - ev[i - 1], CAP);
    const totalC = C[C.length - 1] || 1;
    frac = x => {
      if (x <= ev[0]) return 0;
      if (x >= ev[ev.length - 1]) return 1;
      let lo = 0, hi = ev.length - 1;
      while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (ev[m] <= x) lo = m; else hi = m; }
      const seg = ev[hi] - ev[lo], f = seg > 0 ? (x - ev[lo]) / seg : 0;
      return (C[lo] + f * Math.min(seg, CAP)) / totalC;
    };
  }

  const obstacles = issues.map(issue => {
    const closedState = issue.state.toLowerCase() === "closed";
    const cat = categorize(issue.labels, issue.title);
    const diff = difficulty(issue, now);
    const createdMs = new Date(issue.createdAt).getTime();
    const updatedMs = issue.updatedAt ? new Date(issue.updatedAt).getTime() : createdMs;
    const comments = issue.comments?.length ?? 0;
    let engage, resolves, endMs;
    if (closedState) { engage = true; resolves = true; endMs = issue.closedAt ? new Date(issue.closedAt).getTime() : updatedMs; }
    else { const active = comments > 0 || (updatedMs - createdMs) > HOUR; engage = active; resolves = false; endMs = active ? updatedMs : createdMs; }
    const size = comments >= 6 ? 3 : comments >= 2 ? 2 : 1;
    return {
      n: issue.number, title: issue.title, url: issue.url, author: issue.author?.login || "",
      state: closedState ? "closed" : "open",
      kind: "truck", hero: cat, diff, comments, size,
      t: frac(createdMs), endT: Math.max(frac(createdMs), frac(endMs)),
      engage, resolves, labels: issue.labels.map(l => l.name),
    };
  });
  obstacles.sort((a, b) => a.t - b.t);

  const order = ["bug", "feat", "docs", "task"];
  const counts = {}; obstacles.forEach(o => counts[o.hero] = (counts[o.hero] || 0) + 1);
  const heroes = order.filter(c => counts[c]).map(c => ({ id: c, name: SQUADS[c].name, color: SQUADS[c].color, count: counts[c], real: true }));
  if (heroes.length === 0) heroes.push({ id: "task", name: SQUADS.task.name, color: SQUADS.task.color, count: 0, real: true });
  const lead = [...heroes].sort((a, b) => b.count - a.count)[0].id;

  const stars = commitList
    .filter(c => { const ms = new Date(c.date).getTime(); return ms >= t0 - DAY && ms <= t1 + DAY; })
    .map(c => ({ sha: c.sha, login: c.login, msg: c.msg, bot: isBot(c.login), t: frac(new Date(c.date).getTime()) }))
    .sort((a, b) => a.t - b.t);

  // PRs -> airplanes (a PR is a branch that came and either merged or was abandoned)
  const planes = prs.map(p => {
    const merged = p.state === "MERGED" || !!p.mergedAt;
    const state = merged ? "merged" : (p.state === "OPEN" ? "open" : "rejected");
    const createdMs = new Date(p.createdAt).getTime();
    const endMs = p.mergedAt ? new Date(p.mergedAt).getTime() : (p.closedAt ? new Date(p.closedAt).getTime() : createdMs);
    return { n: p.number, title: p.title, state, author: p.author?.login || "", t: frac(createdMs), endT: Math.max(frac(createdMs), frac(endMs)) };
  }).sort((a, b) => a.t - b.t);

  // releases within the window -> checkpoint banners
  const releases = rels
    .filter(r => r.publishedAt)
    .map(r => ({ tag: r.tagName, name: r.name || r.tagName, pre: !!r.isPrerelease, ms: new Date(r.publishedAt).getTime() }))
    .filter(r => r.ms >= t0 - DAY && r.ms <= t1 + DAY)
    .map(r => ({ tag: r.tag, name: r.name, pre: r.pre, t: frac(r.ms) }))
    .sort((a, b) => a.t - b.t);

  // the most-discussed closed issue becomes the boss
  let boss = null;
  for (const o of obstacles) if (o.state === "closed" && (!boss || o.comments > boss.comments)) boss = o;
  if (!boss) for (const o of obstacles) if (!boss || o.comments > boss.comments) boss = o;
  if (boss && boss.comments >= 3) boss.boss = true;

  const closedN = obstacles.filter(o => o.state === "closed").length;
  const openN = obstacles.filter(o => o.state === "open").length;
  const openActiveN = obstacles.filter(o => o.state === "open" && o.engage).length;
  const prMerged = planes.filter(p => p.state === "merged").length;
  const prRejected = planes.filter(p => p.state === "rejected").length;

  onProgress(100, "done");
  return {
    repo, generatedAt: new Date(now).toISOString(),
    span: { start: new Date(t0).toISOString(), end: new Date(t1).toISOString(), days: Math.round(span / DAY) },
    counts: { total: obstacles.length, closed: closedN, open: openN, openActive: openActiveN, idle: openN - openActiveN,
      commits: stars.length, bots: stars.filter(s => s.bot).length, prs: planes.length, prMerged, prRejected, releases: releases.length },
    heroes, lead, obstacles, stars, planes, releases,
  };
}

export const levelToJs = level => "window.GITBOY_LEVEL = " + JSON.stringify(level) + ";\n";

// ---- CLI ----------------------------------------------------------------
const isMain = (() => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMain) {
  const argv = process.argv.slice(2);
  const repo = argv.find(a => !a.startsWith("--"));
  const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (!repo) { console.error("usage: node build-level.mjs <owner/repo> [--limit N] [--commits N] [--out FILE]"); process.exit(1); }
  buildLevel({
    repo, limit: parseInt(opt("limit", "120"), 10), commits: parseInt(opt("commits", "400"), 10),
    onProgress: (p, m) => process.stderr.write(`\rGITBOY ${String(p).padStart(3)}%  ${m}                    `),
  }).then(level => {
    writeFileSync(opt("out", "level-data.js"), levelToJs(level));
    process.stderr.write(`\nGITBOY: ${level.counts.total} trucks (${level.counts.closed} closed, ${level.counts.open} open), ${level.counts.commits} stars (${level.counts.bots} bot), ${level.counts.prs} planes (${level.counts.prMerged}m/${level.counts.prRejected}r), ${level.counts.releases} releases; ${level.span.days}-day window\n`);
    process.stderr.write(`GITBOY: squads -> ${level.heroes.map(h => h.name + "(" + h.count + ")").join(", ")}   lead=${level.lead}\n`);
  }).catch(e => { console.error("\nGITBOY error:", e.message || e); process.exit(1); });
}
