// Bridge-miner. Feed it a corpus of recognizable movie titles; it builds the
// tail-word -> head-word link graph and surfaces:
//   • HUB words   — fertile landing spots (many titles start with them): safe
//   • DEAD ENDS   — titles whose last word starts nothing: traps
//   • BRIDGES     — titles whose last word has exactly ONE (or two) escapes:
//                   the "unlikely bet that pays off" — a barren-looking word
//                   with a single famous continuation. This is the daily's gold.

const TITLES = [
  // — Dead —
  'Better Off Dead', 'Dead Again', 'Dead Poets Society', 'Dead Man Walking',
  'Dawn of the Dead', 'Shaun of the Dead', 'The Evil Dead', 'Dead Calm',
  'The Quick and the Dead', 'Night of the Living Dead', 'Drop Dead Gorgeous',
  // — Man / Men —
  'Rain Man', 'Iron Man', 'Spider-Man', 'The Elephant Man', 'Man on Fire',
  'Man of Steel', 'The Invisible Man', 'A Single Man', 'The Family Man',
  'Repo Man', 'Cinderella Man', 'The Running Man', 'Man of the Year',
  'Men in Black', 'The Wolfman', 'Walking Tall',
  // — Fire —
  "St. Elmo's Fire", 'Chariots of Fire', 'Fire in the Sky', 'Firestarter', 'Ball of Fire',
  // — Night / Day —
  "A Hard Day's Night", 'Night at the Museum', 'Silent Night', 'Boogie Nights',
  'Nightcrawler', 'A Nightmare on Elm Street', 'Groundhog Day', 'Independence Day',
  'Training Day', 'Day of the Dead', 'The Day After Tomorrow', 'Days of Thunder',
  'Tomorrow Never Dies',
  // — Love / City / Story —
  'Love Actually', 'Love Story', 'Shakespeare in Love', 'Punch-Drunk Love',
  'Crazy Stupid Love', 'From Russia with Love', 'Endless Love',
  'Sin City', 'City of God', 'City Lights', 'City Slickers', 'City of Angels', 'Dark City',
  'Toy Story', 'West Side Story', 'A Christmas Story', 'The NeverEnding Story',
  // — Blood / King / War / Dogs —
  'There Will Be Blood', 'Blood Diamond', 'Blood Simple', 'First Blood', 'In Cold Blood',
  'The Lion King', 'King Kong', "The King's Speech", 'King Arthur', 'The Last King of Scotland',
  'Kong: Skull Island',
  'War of the Worlds', 'War Horse', 'WarGames', 'Star Wars', 'The War of the Roses', 'War Dogs',
  'Reservoir Dogs', 'Straw Dogs', 'Isle of Dogs', 'Dog Day Afternoon',
  // — Water / Star / Black / Blue / Big —
  'The Shape of Water', 'Waterworld', 'Water for Elephants',
  'A Star Is Born', 'Star Trek', 'Stardust', 'Starship Troopers', 'Lone Star', 'Dark Star',
  'Black Swan', 'Black Hawk Down', 'Black Panther', 'The Black Stallion', 'Black Rain',
  'Pitch Black', 'Black Beauty', 'Black Widow',
  'Blue Velvet', 'Blue Valentine', 'Blue Jasmine', 'The Big Blue', 'Into the Blue',
  'Big', 'Big Fish', 'The Big Lebowski', 'Big Daddy', 'Big Hero 6', 'The Big Chill',
  // — Last / Life / House / Gold / Rain —
  'The Last Samurai', 'The Last Emperor', 'Last Action Hero', 'The Last of the Mohicans',
  'Last Christmas', 'Last Tango in Paris',
  'Life of Pi', 'Life Is Beautiful', "It's a Wonderful Life", "A Bug's Life", 'Life of Brian',
  'The Tree of Life', 'Still Life',
  'House of Wax', 'House of Sand and Fog', 'House of Cards', 'Monster House', 'The House',
  'Goldfinger', 'GoldenEye', 'Gold', "Fool's Gold", 'The Gold Rush',
  'Purple Rain', "Singin' in the Rain", 'The Rainmaker',
  // — seeded surprising bridges (barren-looking word -> one famous escape) —
  'Steel Magnolias',      // <- Man of Steel
  'Angels & Demons',      // <- City of Angels
  'A Fish Called Wanda',  // <- Big Fish
  // — standalone / classic traps (dead last words) —
  'Pulp Fiction', 'Forrest Gump', 'The Shawshank Redemption', 'Jurassic Park', 'Fight Club',
  'The Godfather', 'Goodfellas', 'Casablanca', 'Titanic', 'Gladiator', 'Inception',
  'Chinatown', 'Scarface', 'Vertigo', 'Psycho', 'Jaws', 'Amadeus', 'Fargo', 'Memento',
  'Whiplash', 'Se7en', 'Heat', 'Nomadland', 'Parasite', 'Moonlight', 'Birdman', 'Gravity',
  'Argo', 'Spotlight', 'Braveheart', 'Aliens', 'Alien',
];

const ARTICLES = new Set(['the', 'a', 'an']);
function words(t) {
  return t.toLowerCase().replace(/&/g, 'and').replace(/[.,:;!?"'’]/g, '')
    .split(/[\s\-]+/).filter(Boolean);
}
function keyWords(t) {
  let w = words(t);
  if (w.length > 1 && ARTICLES.has(w[0])) w = w.slice(1);
  return w;
}
const head = (t) => keyWords(t)[0];
const tail = (t) => keyWords(t).at(-1);

// index: word -> titles that START with it (fertility source)
const startsWith = new Map();
for (const t of TITLES) {
  const h = head(t);
  if (!startsWith.has(h)) startsWith.set(h, []);
  startsWith.get(h).push(t);
}
const fertility = (word) => (startsWith.get(word) || []).length;
const escapes = (t) => (startsWith.get(tail(t)) || []).filter((b) => b !== t);

console.log(`\n${TITLES.length} titles loaded.\n`);

// HUBS
const hubs = [...startsWith.entries()].filter(([, a]) => a.length >= 3)
  .sort((a, b) => b[1].length - a[1].length);
console.log('── HUB words (safe landings — many titles start here) ──');
console.log(hubs.map(([w, a]) => `${w} (${a.length})`).join('   ') + '\n');

// DEAD ENDS
const dead = TITLES.filter((t) => fertility(tail(t)) === 0);
console.log(`── DEAD ENDS (${dead.length}) — last word starts nothing (traps) ──`);
console.log(dead.slice(0, 18).map((t) => `"${t}" ✗ ${tail(t)}`).join('\n') + '\n');

// BRIDGES — the gold: last word has exactly ONE escape
const bridges = TITLES.filter((t) => fertility(tail(t)) === 1)
  .map((t) => ({ from: t, word: tail(t), to: escapes(t)[0] }))
  .filter((b) => b.to);
console.log(`── SURPRISING BRIDGES (${bridges.length}) — "${'barren'}" word, ONE famous escape ──`);
for (const b of bridges) console.log(`"${b.from}"  ──[ ${b.word} ]──▶  "${b.to}"`);

// near-bridges (two escapes) for flavour
const two = TITLES.filter((t) => fertility(tail(t)) === 2);
console.log(`\n(${two.length} titles have exactly two escapes — the "risky but likelier" bets)\n`);

// a greedy long walk, to see a chain + its merged phrase
function walk(start) {
  const path = [start], used = new Set([start]);
  let cur = start;
  while (true) {
    const opts = escapes(cur).filter((b) => !used.has(b));
    if (!opts.length) break;
    // greedy: keep options open — go to the escape with the most fertile tail
    opts.sort((a, b) => fertility(tail(b)) - fertility(tail(a)));
    cur = opts[0]; path.push(cur); used.add(cur);
  }
  return path;
}
let best = [];
for (const t of TITLES) { const p = walk(t); if (p.length > best.length) best = p; }
const merged = best.reduce((acc, t, i) => i === 0 ? keyWords(t) : acc.concat(keyWords(t).slice(1)), [])
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
console.log(`── LONGEST GREEDY CHAIN (${best.length} titles) ──`);
console.log(best.join('  →  '));
console.log(`\nreads as:  ${merged}\n`);
