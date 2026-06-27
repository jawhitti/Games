// Compare hero-start + peek-scaling variants. node hero-start.js [--n 2000]
const { playGame } = require('./src/bot');

function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
const N = parseInt(arg('--n', '2000'), 10);

const METAS = {
  casual:    ['spender', 'spender', 'spender', 'spender'],   // nobody denies -- everyone races their own reunion
  realistic: ['smart', 'spender', 'denier', 'spender'],      // one active denier, rest pursue
  cutthroat: ['denier', 'denier', 'denier', 'denier'],       // everyone denies
};

// when did each player's hero first reach hand? (turn, as fraction of game). -1 = never.
function heroWait(g) {
  const firstByPlayer = {}; // pid -> turn hero entered hand
  for (const e of g.log) {
    const m = e.msg.match(/reports to (Player \d) \(their pair\)/);
    if (m && firstByPlayer[m[1]] == null) firstByPlayer[m[1]] = e.turn;
  }
  return firstByPlayer;
}

function run(label, opts) {
  const rows = {};
  for (const [meta, styles] of Object.entries(METAS)) {
    let games = 0, reunions = 0, turnsSum = 0, comeback = 0;
    let waitSum = 0, waitN = 0, never = 0, seats = 0;
    for (let i = 0; i < N; i++) {
      const g = playGame({ seed: 50000 + i, jitter: 3, styles, ...opts });
      if (!g.isOver()) continue;
      games++;
      if (g.instantWinner) reunions++;
      turnsSum += g.turn;
      // comeback: leader at 50% != winner
      const winId = g.standings()[0].id;
      const winIdx = g.players.findIndex((p) => p.id === winId);
      const sl = g.scoreLog;
      if (sl.length) {
        const row = sl[Math.min(sl.length - 1, Math.floor(sl.length * 0.5))].s;
        let bi = 0; for (let j = 1; j < row.length; j++) if (row[j] > row[bi]) bi = j;
        if (bi !== winIdx) comeback++;
      }
      // hero wait (only meaningful when heroes ride the deck)
      if (!opts.heroesInHand) {
        const w = heroWait(g);
        for (const p of g.players) {
          seats++;
          if (w[p.name] == null) { never++; }
          else { waitSum += w[p.name] / g.turn; waitN++; }
        }
      }
    }
    rows[meta] = {
      games,
      reunionPct: (reunions / games * 100).toFixed(0) + '%',
      avgTurns: (turnsSum / games).toFixed(0),
      comebackPct: (comeback / games * 100).toFixed(0) + '%',
      medianWait: opts.heroesInHand ? 'n/a (in hand)' : (waitSum / waitN * 100).toFixed(0) + '% in',
      neverPct: opts.heroesInHand ? '-' : (never / seats * 100).toFixed(0) + '%',
    };
  }
  console.log(`\n=== ${label} ===`);
  for (const [meta, r] of Object.entries(rows)) {
    console.log(`  ${meta.padEnd(10)} reunion ${r.reunionPct.padStart(4)} | len ${r.avgTurns.padStart(3)}t | comeback ${r.comebackPct.padStart(4)} | hero-wait ${r.medianWait} | never ${r.neverPct}`);
  }
}

console.log(`Hero-start / peek-scaling comparison -- ${N} games per meta`);
run('BASELINE  (heroes in deck, peek grows)', { heroesInHand: false, peekInverted: false });
run('HERO-HAND (heroes in hand,  peek grows)', { heroesInHand: true,  peekInverted: false });
run('HERO-HAND + INVERTED PEEK (portal breaking down)', { heroesInHand: true, peekInverted: true });
run('CURRENT DEFAULTS: + extract + free plant (no tribute)', { heroesInHand: true, peekInverted: true, heroPlantCost: false });
run('CURRENT DEFAULTS: + extract + TRIBUTE (pay-to-send)', { heroesInHand: true, peekInverted: true, heroPlantCost: true });
