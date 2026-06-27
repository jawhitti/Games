// NO FATE -- interactive play harness. State persists to state.json so we
// can play one step at a time across messages.
//
// Turn:
//   1. node play.js resolve            flip + resolve top of Present
//        (if a prize/potato/power surfaces:)
//      node play.js take | send        bank it, or send to bottom of Future
//   2. node play.js fish POS           cut + private peek at depth POS
//      node play.js plant TERMID POS   (optional) plant a terminator above POS
//      node play.js endturn            advance to next player
//
// Other: node play.js show | peek (debug) | log [N]

const fs = require('fs');
const path = require('path');
const { Game } = require('./src/engine');
const { table, recent } = require('./src/render');

const STATE = path.join(__dirname, 'state.json');
function save(g) { fs.writeFileSync(STATE, JSON.stringify(g.snapshot(), null, 2)); }
function load() {
  if (!fs.existsSync(STATE)) { console.error('No game. Run: node play.js init'); process.exit(1); }
  return Game.fromSnapshot(JSON.parse(fs.readFileSync(STATE, 'utf8')));
}
function arg(name, def) { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; }
function print(lines) { (Array.isArray(lines) ? lines : [lines]).forEach((l) => console.log(l)); }

function situation(g) {
  console.log('');
  if (g.isOver()) {
    console.log(`=== GAME OVER (all ${g.players.length} Sarahs have left) ===`);
    for (const p of g.standings()) console.log(`${p.name}: ${g.finalScore(p)} pt`);
    return;
  }
  console.log(table(g));
  const me = g.currentPlayer();
  if (me.hand.length) console.log(`\n${me.name} hand: ${me.hand.map((t) => t.id).join(', ')}`);
  if (g.phase === 'resolve') console.log('-> node play.js resolve');
  else if (g.phase === 'yeetWindow') console.log(`-> ${g.flipped.label} flipped. node play.js yeet PID  (13th Monkey holder) | pass`);
  else if (g.phase === 'choice') console.log('-> node play.js take | send');
  else if (g.phase === 'fish') console.log('-> node play.js fish POS [then plant TERMID POS] then endturn');
}

const cmd = process.argv[2];
let g;

switch (cmd) {
  case 'init': {
    const seed = parseInt(arg('--seed', String(Math.floor(Math.random() * 1e6))), 10);
    const present = parseInt(arg('--present', '8'), 10);
    g = new Game({ seed, config: { presentSize: present } });
    console.log(`New game "NO FATE". seed=${seed}, Present=${present}. Sarahs blind-shuffled in.`);
    situation(g);
    save(g);
    break;
  }
  case 'resolve': { g = load(); print(g.resolveTop()); situation(g); save(g); break; }
  case 'pass': { g = load(); print(g.passYeet()); situation(g); save(g); break; }
  case 'yeet': { g = load(); print(g.doYeet(process.argv[3])); situation(g); save(g); break; }
  case 'take': { g = load(); print(g.choose(true)); situation(g); save(g); break; }
  case 'send': { g = load(); print(g.choose(false)); situation(g); save(g); break; }
  case 'fish': {
    g = load();
    const pos = parseInt(process.argv[3], 10);
    const seen = g.fish(pos);
    if (seen.length) {
      console.log(`*** PRIVATE to ${g.currentPlayer().name}: landed cards = ${seen.map((c, i) => `[${i}] ${c.label}[${c.type}${c.value ? ' ' + (c.value > 0 ? '+' : '') + c.value : ''}]`).join(', ')} ***`);
      console.log('-> optionally: node play.js plant TERMID [OFFSET]  (OFFSET = which peeked card, default 0)  then  node play.js endturn');
    }
    save(g);
    break;
  }
  case 'plant': { g = load(); print(g.plant(process.argv[3], process.argv[4] != null ? parseInt(process.argv[4], 10) : 0)); save(g); break; }
  case 'reorder': { g = load(); print(g.reorderHere(process.argv[3].split(',').map((x) => parseInt(x, 10)))); save(g); situation(g); break; }
  case 'snipe': { g = load(); print(g.useSnipe(parseInt(process.argv[3], 10))); situation(g); save(g); break; }
  case 'claw': { g = load(); print(g.useClaw(parseInt(process.argv[3], 10))); situation(g); save(g); break; }
  case 'bullet': { g = load(); const seen = g.useBulletTime(); console.log('*** PRESENT (Bullet Time): ' + seen.map((c) => c.label).join(' | ') + ' ***'); save(g); break; }
  case 'pull': { g = load(); print(g.usePull(process.argv[3] != null ? parseInt(process.argv[3], 10) : 0, process.argv[4] != null ? parseInt(process.argv[4], 10) : 0)); situation(g); save(g); break; }
  case 'endturn': {
    g = load();
    if (g.isOver()) { situation(g); break; }
    print(g.endTurn());
    situation(g);
    save(g);
    break;
  }
  case 'show': { g = load(); situation(g); break; }
  case 'peek': {
    g = load();
    console.log('=== PEEK (debug, not in-game info) ===');
    console.log('Present:', g.present.map((c) => c.label).join(' | '));
    console.log('Future :', g.future.map((c, i) => `${i}:${c.label}`).join(' | '));
    break;
  }
  case 'log': { g = load(); console.log(recent(g, parseInt(process.argv[3] || '14', 10))); break; }
  default: console.log('Usage: node play.js [init|resolve|pass|yeet PID|take|send|fish|plant|snipe AIM|pull OFF DEPTH|reorder|endturn|show|peek|log]');
}
