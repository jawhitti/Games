// Deck, Sarah, and hand construction for NO FATE.
//
// Card instance shape:
//   { id, type, name, owner?, color?, value, power?, global? }
//   type: 'terminator' | 'sarah' | 'prize' | 'potato' | 'power' | 'global'
//
//   - Future deck = the catalog (prizes/potatoes/powers/globals), expanded.
//   - Sarahs: 1 per player, seeded into the Future at setup (blind or buried).
//   - Terminators: 5 per player, held in hand, planted via fishing.

const { buildCatalog } = require('./catalog');

const DEFAULT_PLAYERS = [
  { id: 'P1', name: 'Player 1', color: 'red' },
  { id: 'P2', name: 'Player 2', color: 'blue' },
  { id: 'P3', name: 'Player 3', color: 'green' },
  { id: 'P4', name: 'Player 4', color: 'yellow' },
];

// Non-Sarah Future cards (instances), each with a stable id.
function buildDeckCards() {
  const defs = buildCatalog();
  return defs.map((d) => ({
    id: d.copies > 1 ? `${d.id}.${d.copy}` : d.id,
    catId: d.id,
    type: d.kind, // prize | neutral | upgrade | downgrade | potato | global
    name: d.name,
    label: d.name,
    owner: null,
    color: null,
    value: d.value || 0,
    scaleWithSarahs: d.scaleWithSarahs || 0,
    valueLadder: d.valueLadder || false,
    dyn: d.dyn || null,        // dynamic-value formula (computed at take)
    onTake: d.onTake || null,  // sight/tempo rider fired on take
    timing: d.timing || '',
    eff: d.eff || null,
    desc: d.desc || '',
    flavor: d.flavor || '',
  }));
}

// Iconic rescuer <-> protectee pairs (one assigned per player). The matching
// rescuer reuniting with its protectee is the instant-win story beat; a mismatch
// (Doc Brown grabbing Rachel) is a funny whiff.
const PAIRS = [
  { id: 'sarah', who: 'Sarah Connor', hero: 'Kyle Reese', flavor: 'Come with me if you want to live.' },
  { id: 'rachel', who: 'Rachel', hero: 'Deckard', flavor: "It's too bad she won't live. But then again, who does?" },
  { id: 'marty', who: 'Marty McFly', hero: 'Doc Brown', flavor: 'Great Scott! 1.21 gigawatts!' },
  { id: 'trinity', who: 'Trinity', hero: 'Neo', flavor: 'There is no spoon.' },
  { id: 'leia', who: 'Princess Leia', hero: 'Han Solo', flavor: 'Never tell me the odds.' },
  { id: 'newt', who: 'Newt', hero: 'Ellen Ripley', flavor: 'Get away from her, you bitch!' },
];

// Each player is dealt one pair's PROTECTEE (the "Sarah" role), shuffled into the deck.
function buildSarahs(players = DEFAULT_PLAYERS) {
  return players.map((p, i) => {
    const pr = PAIRS[i % PAIRS.length];
    return {
      id: `${p.id}-S`, type: 'sarah', pairId: pr.id,
      name: pr.who, label: `${pr.who} (${p.name})`,
      owner: p.id, color: p.color, value: 0, // scored by order of appearance
    };
  });
}

// The RESCUERS (one per in-play pair) START in their owner's hand (heroesInHand) --
// the hero is your agent from turn one. (Legacy: seeded into the deck, owner set on
// acquire.) Plant yours to bring your protectee home for the win.
function buildRescuers(players = DEFAULT_PLAYERS) {
  return players.map((p, i) => {
    const pr = PAIRS[i % PAIRS.length];
    return {
      id: `HERO-${pr.id}`, type: 'kyle', pairId: pr.id, name: pr.hero, label: pr.hero,
      owner: null, value: 0, // worth nothing banked -- they exist to be USED; owner set at setup
      desc: `Yours from the start. To send them in, burn one card (a spare terminator/one-shot). Land them on ${pr.who} for an INSTANT WIN -- beats a terminator above, dies to one below, whiffs on the wrong protectee. If they come home empty (or a Timequake scatters them), FIND them in the Future to pull them back for free and try again.`,
      flavor: pr.flavor,
    };
  });
}

function buildHands(players = DEFAULT_PLAYERS, terminatorsPer = 5) {
  const hands = {};
  for (const p of players) {
    hands[p.id] = [];
    for (let j = 1; j <= terminatorsPer; j++) {
      hands[p.id].push({
        id: `${p.id}-T${j}`, type: 'terminator', name: 'Terminator',
        label: `${p.color} terminator #${j}`, owner: p.id, color: p.color, value: 0,
      });
    }
  }
  return hands;
}

module.exports = { DEFAULT_PLAYERS, PAIRS, buildDeckCards, buildSarahs, buildRescuers, buildHands };
