// Card balance + storytelling analysis. node report.js
const { playGame } = require('./src/bot');
const { DEFS } = require('./src/catalog');

const NAME = {}; for (const d of DEFS) NAME[d.id] = `${d.name} (${d.value || 0})`;
const P = 4; // players
const lift = (winRate) => (winRate / (1 / P)).toFixed(2);

// ---------- A) CARD BALANCE (win-rate of acquirers) ----------
function balance(N) {
  const acq = {}, win = {}; // per catId: acquirer-instances, wins among them
  let baseAcq = 0, baseWin = 0; // any-acquisition baseline
  for (let i = 0; i < N; i++) {
    const g = playGame({ seed: 20000 + i, jitter: 3 });
    if (!g.isOver()) continue;
    const winId = g.standings()[0].id;
    for (const p of g.players) {
      const got = new Set(p.acquired);
      for (const cid of got) {
        acq[cid] = (acq[cid] || 0) + 1; if (p.id === winId) win[cid] = (win[cid] || 0) + 1;
        baseAcq++; if (p.id === winId) baseWin++;
      }
    }
  }
  return { acq, win, baseLift: lift(baseWin / baseAcq) };
}

// ---------- B) STORY METRICS ----------
function leaderAt(scoreLog, frac) {
  if (!scoreLog.length) return -1;
  const row = scoreLog[Math.min(scoreLog.length - 1, Math.floor(scoreLog.length * frac))].s;
  let bi = 0; for (let i = 1; i < row.length; i++) if (row[i] > row[bi]) bi = i;
  return bi;
}
function story(N) {
  let comeback = 0, lastSarahDecides = 0, tqReversal = 0, tqGames = 0, totBetray = 0, totLeadChanges = 0, games = 0, kyleWins = 0;
  let best = null, bestScore = -1;
  for (let i = 0; i < N; i++) {
    const seed = 30000 + i;
    const g = playGame({ seed, jitter: 3 });
    if (!g.isOver()) continue; games++;
    if (g.instantWinner) kyleWins++;
    const winId = g.standings()[0].id;
    const winIdx = g.players.findIndex((p) => p.id === winId);

    // comeback: winner not leading at the 50% mark
    const midLeader = leaderAt(g.scoreLog, 0.5);
    const cb = midLeader !== winIdx;
    if (cb) comeback++;

    // lead changes over time
    let lc = 0, prev = -1;
    for (const row of g.scoreLog) {
      let bi = 0; for (let j = 1; j < row.s.length; j++) if (row.s[j] > row.s[bi]) bi = j;
      if (row.s[bi] > 0 && bi !== prev) { if (prev !== -1) lc++; prev = bi; }
    }
    totLeadChanges += lc;

    // last Sarah decides: beneficiary of the final Sarah-leave == winner?
    let lastSarahBy = null;
    for (const e of g.log) { const m = e.msg.match(/sidekick #\d+ to leave -> \+\d+ to (Player \d)/); if (m) lastSarahBy = m[1]; }
    const winName = g.player(winId).name;
    if (lastSarahBy === winName) lastSarahDecides++;

    // timequake reversal: leader just before TQ fired != winner
    if (g.timequakeInfo) {
      tqGames++;
      const pre = g.scoreLog.filter((r) => r.turn < g.timequakeInfo.turn);
      const preLeader = pre.length ? (() => { const row = pre[pre.length - 1].s; let bi = 0; for (let j = 1; j < row.length; j++) if (row[j] > row[bi]) bi = j; return bi; })() : -1;
      if (preLeader !== -1 && preLeader !== winIdx) tqReversal++;
    }

    totBetray += g.fishingStats.absorbedByRival;

    // pick an exemplary game: comeback + betrayals + close + a quake reversal
    const margin = g.finalScore(g.standings()[0]) - g.finalScore(g.standings()[1]);
    const sc = (cb ? 4 : 0) + lc + Math.min(g.fishingStats.absorbedByRival, 6) + (g.timequakeInfo ? 2 : 0) + (margin <= 3 ? 3 : 0);
    if (sc > bestScore) { bestScore = sc; best = { seed, g, cb, lc, margin }; }
  }
  return { games, comeback, lastSarahDecides, tqReversal, tqGames, totBetray, totLeadChanges, kyleWins, best };
}

const pct = (x, y) => (x / y * 100).toFixed(0) + '%';

console.log('=== CARD BALANCE (win-rate lift of acquirers; 1.00 = neutral, >1 helps, <1 hurts) ===');
const b = balance(600);
console.log(`baseline lift of "acquired anything": ${b.baseLift} (winners naturally hoard, so >1 baseline is expected)\n`);
const rows = Object.keys(b.acq).filter((c) => b.acq[c] >= 60)
  .map((c) => ({ c, n: b.acq[c], wr: (b.win[c] || 0) / b.acq[c] }))
  .sort((a, z) => z.wr - a.wr);
for (const r of rows) console.log(`  ${(NAME[r.c] || r.c).padEnd(34)} lift ${lift(r.wr)}  (acquired by a player in ${r.n} game-slots)`);

console.log('\n=== STORYTELLING (does it tell a story?) ===');
const s = story(300);
console.log(`games decided by a Kyle-Sarah instant win: ${pct(s.kyleWins, s.games)} (rest on points)`);
console.log(`comeback wins (winner was NOT leading at halftime): ${pct(s.comeback, s.games)}`);
console.log(`avg lead changes per game: ${(s.totLeadChanges / s.games).toFixed(1)}`);
console.log(`the LAST (most valuable) Sarah's recipient won the game: ${pct(s.lastSarahDecides, s.games)}`);
console.log(`Timequake reversals (pre-quake leader did NOT win): ${pct(s.tqReversal, s.tqGames)} of games where it fired`);
console.log(`betrayals (your terminator absorbed into a rival convoy): ${(s.totBetray / s.games).toFixed(1)}/game`);

console.log(`\n=== EXEMPLARY GAME (seed ${s.best.seed}): comeback=${s.best.cb}, lead-changes=${s.best.lc}, final margin=${s.best.margin} ===`);
const hot = /buddies up|drags home|sidekick #|TIMEQUAKE|SECOND SIGHT|loots .*\+|EMPs|re-buries|afflicted|convoy of [3-9]|GLITCHED|Veteran chassis/i;
for (const e of s.best.g.log) if (hot.test(e.msg)) console.log(`  T${String(e.turn).padStart(3)} [${e.by}] ${e.msg.trim()}`);
console.log('  FINAL: ' + s.best.g.standings().map((p) => `${p.name} ${s.best.g.finalScore(p)}`).join(' | '));
