// NO FATE -- deck list (curated ~75-card non-pair deck for tighter pacing).
// Components (5 terminators/player; each player's protectee + matching rescuer)
// are built per-player in cards.js and shuffled in -> ~83-card deck for 4 players.
//
// Def fields: { id, kind, name, copies, value, timing, eff, ... }
//   kind: 'prize' | 'neutral' | 'upgrade' | 'downgrade' | 'potato' | 'character' | 'global'

const DEFS = [
  // --- Prizes (DYNAMIC value -- each scales off a different board fact; chit-tracked) ---
  { id: 'P01', kind: 'prize', name: 'The Scrap Fields', copies: 4, value: 1, dyn: 'myMachines',
    desc: 'Worth 1 + 1 per machine YOU have planted -- you scavenge what you deployed.', flavor: 'Acres of dead steel, and it all still counts.' },
  { id: 'P02', kind: 'prize', name: 'A Hidden Pantry', copies: 3, value: 1, dyn: 'sidekicksGone',
    desc: 'Worth 1 + 1 per sidekick already gone -- food gets dearer as the city empties.', flavor: 'Someone bricked this up before the end.' },
  { id: 'P03', kind: 'prize', name: 'The Armory', copies: 3, value: 1, dyn: 'machinesInPlay',
    desc: 'Worth 1 + 1 per machine in play (anyone\'s) -- the hotter the war, the richer the haul.', flavor: 'A Guard depot they never got to.' },
  { id: 'P04', kind: 'prize', name: 'Running on Fumes', copies: 3, value: 1, dyn: 'fewerHandMachines',
    desc: 'Worth MORE the fewer machines you hold: 1 + (5 - your machines in hand). Desperation pays.', flavor: 'The last gallon, siphoned from a dead truck.' },
  { id: 'P05', kind: 'prize', name: 'Fresh Recruits', copies: 2, value: 1, dyn: 'sidekicksLeft',
    desc: 'Worth 1 + 1 per sidekick still in play -- the resistance is strongest while people remain.', flavor: 'Green, scared, and exactly enough.' },
  { id: 'P06', kind: 'prize', name: 'Spoils of War', copies: 2, value: 1, dyn: 'rivalMachines',
    desc: 'Worth 1 + 1 per RIVAL machine in play -- you profit off the enemy\'s deployment.', flavor: 'Their war effort, repurposed.' },
  { id: 'P07', kind: 'prize', name: 'A Full Pack', copies: 2, value: 0, dyn: 'handSize',
    desc: 'Worth 1 per card in your hand right now -- the better equipped you are, the more it pays.', flavor: 'Everything you own, on your back.' },
  { id: 'P08', kind: 'prize', name: 'The Power of Love', copies: 2, value: 2, dyn: 'reunionAlive',
    desc: 'Worth 2, DOUBLED to 4 while your sidekick is still in play -- your couple can still reunite.', flavor: 'Don\'t need money, don\'t take fame... (Back to the Future).' },
  { id: 'P09', kind: 'prize', name: 'A Comrade\'s Effects', copies: 2, value: 2, dyn: 'reunionDead',
    desc: 'Worth 2, DOUBLED to 4 if your sidekick is already lost -- a soldier\'s consolation.', flavor: 'Dog tags, a photo, a promise you couldn\'t keep.' },
  { id: 'P10', kind: 'prize', name: 'The Needs of the Many', copies: 1, value: 5, onTake: 'sacrifice',
    desc: 'Worth 5, but on take you throw one card from your hand into the cause (your choice; gone). The few for the many.', flavor: 'The needs of the many outweigh the needs of the few. (Wrath of Khan).' },

  // --- Upgrades -- power cards --------------------------------------
  // (Deep Recon U01 / Jury-Rig U02 CUT 2026-06: pure-sight one-shots, used 0.00/game by bots
  //  and weakest cards for humans -- a peek with nothing to do about it. See DESIGN_NOTES.)
  { id: 'U03', kind: 'upgrade', name: 'Temporal Insertion', copies: 1, value: 0, timing: 'one-shot', eff: 'U03',
    desc: 'Cut and view TWO contiguous Future cards, then place ONE card from your hand anywhere in the deck via a cut.', flavor: 'Drop something into history exactly where you want it.' },
  { id: 'U04', kind: 'upgrade', name: 'Field Promotion', copies: 2, value: 0, timing: 'one-shot', eff: 'U04',
    desc: 'Take an extra Fish action immediately this turn.', flavor: 'Battlefield commission. Move.' },
  { id: 'U05', kind: 'upgrade', name: 'EMP Charge', copies: 2, value: 0, timing: 'one-shot', eff: 'U05',
    desc: 'On your Fish, cut and peek; if the card is a Terminator, destroy it outright (no buddy, no loot).', flavor: 'One pulse and the machine goes cold.' },
  { id: 'U06', kind: 'upgrade', name: 'Sabotage', copies: 3, value: 0, timing: 'one-shot', eff: 'U06',
    desc: 'On your Fish: send any ONE card you just peeked to the bottom of the Future. Bury a rival hero and his sidekick comes home alone.', flavor: 'Bury the thing before anyone else finds it.' },
  { id: 'U07', kind: 'upgrade', name: "Quartermaster's Favor", copies: 1, value: 0, timing: 'one-shot', eff: 'U07',
    desc: 'Discard one card from your hand to the bottom of the Future.', flavor: "Someone owed you. Now you're owed nothing." },
  { id: 'U08', kind: 'upgrade', name: 'Sharp Eyes', copies: 2, value: 0, timing: 'lasting', eff: 'U08',
    desc: 'For the rest of the game YOU peek one extra contiguous card on every Fish.', flavor: 'You learned to read the static.' },
  { id: 'U10', kind: 'upgrade', name: 'Veteran Chassis', copies: 1, value: 0, timing: 'lasting', eff: 'U10',
    desc: 'Your planted Terminators cannot be buddied or taken by another Terminator.', flavor: "This one's been hunted before. It learned." },
  { id: 'U11', kind: 'upgrade', name: 'Temporal Splice', copies: 4, value: 0, timing: 'one-shot', eff: 'REORDER',
    desc: 'On your Fish: after you peek your sight band, REORDER those cards however you like. Weapon: set your hero directly above your sidekick (reunion), or your sidekick atop your own next draw. Defense: star-cross a rival pair, or pull your sidekick off a terminator.', flavor: 'Cut the moment open and re-splice it the way it needs to go.' },
  { id: 'Y1', kind: 'upgrade', name: 'The 13th Monkey', copies: 1, value: 0, timing: 'one-shot', eff: 'YEET',
    desc: 'REACTIVE: when any card surfaces (except a global -- those fire instantly), the holder may fling it to the bottom of the deck; the active player then flips again. On a Terminator only the TOP one goes -- the rest of the would-be convoy resolves normally. The clock does NOT advance, so a yeeted sidekick stays in play (saved for a reunion, or denied a rival).', flavor: 'You will be sent back. Involuntarily. (12 Monkeys.)' },
  { id: 'U12', kind: 'upgrade', name: 'Hasta La Vista, Baby', copies: 3, value: 0, timing: 'one-shot', eff: 'SNIPE',
    desc: 'On your Fish: cut, peek a card, and DESTROY it outright (out of the game). Anything but a protectee, a hero, or the Timequake -- so you can vaporize a rival machine, John Connor, or a fat prize before someone banks it.', flavor: 'Hasta la vista, baby. (T2.)' },
  { id: 'U14', kind: 'upgrade', name: 'The Claw', copies: 2, value: 0, timing: 'one-shot', eff: 'CLAW',
    desc: 'On your Fish: cut and peek; if you find a Terminator, claw it out of the Future -- it goes home to its OWNER\'s hand. Reclaim your own machine to replant it, or yank a rival\'s out of position (they must re-deploy).', flavor: 'A salvage arm, reaching into the timestream.' },
  { id: 'U13', kind: 'upgrade', name: 'Actually, Fate', copies: 2, value: 0, timing: 'one-shot', eff: 'PULL',
    desc: 'On your Fish: cut and peek your band, then drag ONE card you saw up out of the Future and into the Present at a depth you choose. Bring your own hero home fast -- or time a Hot Potato onto a rival (risky: a machine already in the Present may grab it first).', flavor: 'No fate but what we make? Actually, fate. Right now.' },

  // --- Downgrades (3) ---------------------------------------------------
  { id: 'D01', kind: 'downgrade', name: 'Temporal Sickness', copies: 1, value: 0, timing: 'on-acquire', eff: 'D01',
    desc: 'When this lands on you: skip your next two Fish actions.', flavor: "The jumps add up. You're shaking and you can't aim." },
  { id: 'D02', kind: 'downgrade', name: 'Glitched Targeting', copies: 1, value: 0, timing: 'on-acquire', eff: 'D02',
    desc: 'When this lands on you: your next planted Terminator surfaces and takes nothing.', flavor: "Bad firmware -- it'll grab a fistful of nothing." },
  { id: 'D03', kind: 'downgrade', name: 'Static Cling', copies: 1, value: 0, timing: 'on-acquire', eff: 'D03',
    desc: 'When this lands on you: you may peek but not plant for your next two turns.', flavor: "The field won't let go. You can look but you can't touch." },

  // --- Hot Potatoes (4) -- negative value, playable to re-bury -----------
  { id: 'H01', kind: 'potato', name: 'A Potato', copies: 1, value: -9, timing: 'playable', eff: 'rebury',
    desc: 'Worth -9. It is, literally, a potato. Playable from hand: bury it anywhere in the Future via a cut.', flavor: 'The displacement field reached across spacetime and grabbed... a potato. Hot.' },
  { id: 'H02', kind: 'potato', name: 'A Time-Travel Primer', copies: 1, value: -3, timing: 'playable', eff: 'rebury',
    desc: 'Worth -3. Playable from hand: bury it anywhere in the Future via a cut.', flavor: 'Explains everything and clarifies nothing. (Primer, 2004.)' },
  { id: 'H04', kind: 'potato', name: 'Box of Spare Pinball Machine Parts', copies: 1, value: -1, timing: 'playable', eff: 'rebury',
    desc: 'Worth -1. Playable from hand: bury it anywhere in the Future via a cut.', flavor: 'The displacement field grabbed the wrong crate. (Back to the Future.)' },
  { id: 'H05', kind: 'potato', name: 'A Confused Child', copies: 1, value: -1, timing: 'playable', eff: 'rebury',
    desc: 'Worth -1. Playable from hand: bury (re-displace) anywhere in the Future via a cut.', flavor: 'Some poor kid yanked through time, asking for his mom. Pass him along -- gently.' },

  // --- Neutral (2) -- value 0, but they still buy you a small look -------
  { id: 'N01', kind: 'neutral', name: 'The Stragglers', copies: 1, value: 0, onTake: 'peek1',
    desc: 'Worth 0, but on take: peek +1 this turn (they point the way).', flavor: 'Another mouth, another pair of hands, another set of eyes.' },
  { id: 'N02', kind: 'neutral', name: 'After Curfew', copies: 1, value: 0, onTake: 'peek1',
    desc: 'Worth 0, but on take: peek +1 this turn.', flavor: 'Heads down, moving fast under the searchlights.' },

  // --- Characters (mechanical auras; negative value = pay points for power) ---
  { id: 'A1', kind: 'character', name: 'The Defector', copies: 2, value: -2, timing: 'aura', eff: 'A_DEF',
    desc: 'AURA: each turn you take an extra Fish + plant action.', flavor: 'Flipped, and fighting for the other side now.' },
  { id: 'A2', kind: 'character', name: 'The Survivor', copies: 2, value: -2, timing: 'aura', eff: 'A_SUR',
    desc: 'AURA: your planted terminators cannot be buddied or taken by another terminator.', flavor: 'Been hunted before. Learned.' },
  { id: 'A3', kind: 'character', name: 'The Fixer', copies: 2, value: -1, timing: 'aura', eff: 'A_FIX',
    desc: 'AURA: your terminators skip junk -- they never haul a potato/downgrade, they grab the next real card.', flavor: 'Knows what to leave in the rubble.' },

  // --- Clock-ladder "hunt-magnet" prizes (worth the clock-ladder value when taken) ---
  { id: 'JOHN', kind: 'prize', name: 'John Connor', copies: 1, value: 0, valueLadder: true,
    desc: 'Worth the current clock-ladder value when taken, growing as sidekicks leave (1/2/4/8). Take him cheap now, or send him to the bottom and gamble he resurfaces late worth more -- and that a rival does not grab him first.', flavor: 'No fate but what we make.' },
  { id: 'ITU', kind: 'prize', name: 'Into the Unknown', copies: 2, value: 0, valueLadder: true,
    desc: 'Worth the current clock-ladder value when taken, growing as sidekicks leave (1/2/4/8). Take it cheap now, or send it to the bottom and gamble it resurfaces late worth more.', flavor: 'You step through and cannot know what is on the other side -- only that the longer the war runs, the more it is worth.' },

  // --- Global (1) -------------------------------------------------------
  { id: 'G01', kind: 'global', name: 'Timequake', copies: 1, value: 0, timing: 'on-reveal', eff: 'timequake',
    desc: 'Shuffle the entire Future deck. Every planted Terminator, protectee, and read scrambles -- including yours. The Present is untouched.', flavor: 'The timeline convulses. Worst in the fat middle.' },
  // --- Portal Collapse (1) -- table-wide tax: everyone throws a card away ----
  { id: 'G02', kind: 'global', name: 'Portal Collapse', copies: 1, value: 0, timing: 'on-reveal', eff: 'portaldown',
    desc: 'When it emerges, the portal is failing: EVERY player throws one card from their hand into the collapse (your choice; it is gone for good). Holding a Hot Potato? Lucky -- shed it. Empty hand? Lucky -- you give nothing.', flavor: 'The rift screams and starts to close. Feed it or lose it.' },
  // --- Shared-sight globals (social): puncture the secret war, get the table talking ----
  { id: 'G03', kind: 'global', name: 'Flare', copies: 1, value: 0, timing: 'on-reveal', eff: 'flare', social: true,
    desc: 'Cut the deck and reveal that card FACE-UP to the whole table. It stays known to everyone until it surfaces. Light up the dark -- everyone sees what is coming.', flavor: 'A flare arcs over no-man’s-land. For one moment, nothing is hidden.' },
  { id: 'G04', kind: 'global', name: 'Pass the Watch', copies: 1, value: 0, timing: 'on-reveal', eff: 'passleft', social: true,
    desc: 'Every player cuts and lifts a card of their choice and shows it to the player on their left, then it goes back. So everyone ends up seeing TWO cards: the one they chose and the one handed to them from their right.', flavor: 'Word travels down the line in the dark.' },
  { id: 'G05', kind: 'global', name: 'A Word in Your Ear', copies: 1, value: 0, timing: 'on-reveal', eff: 'showchosen', social: true,
    desc: 'The active player cuts, lifts one card, and shows it to ONE player of their choice (and no one else), then slips it back. Make a deal, plant a lie, bait a rival.', flavor: 'Loyalty is a thing you trade in the dark.' },

  // --- Bullet Time (1) -- the rare oracle: read the WHOLE Present --------
  { id: 'U17', kind: 'upgrade', name: 'Temporal Shift', copies: 3, value: 0, timing: 'one-shot', eff: 'U17',
    desc: 'On your Fish: move any ONE card you peeked exactly 3 spaces up or down in the deck. Slip a rival hero behind his sidekick to star-cross them, or edge your own pair toward home.', flavor: 'A small shove in time. Three steps -- enough to miss each other forever.' },
  { id: 'U15', kind: 'upgrade', name: 'Bullet Time', copies: 1, value: 0, timing: 'one-shot', eff: 'BULLET',
    desc: 'Play it to read the ENTIRE Present -- all the committed cards, in order, so you know exactly what resolves next and on whose turn. Then take your turn normally. Peek-only; you never touch the Present.', flavor: 'You start to see it... the code behind the now.' },
];

function buildCatalog() {
  const out = [];
  for (const d of DEFS) {
    for (let i = 1; i <= d.copies; i++) out.push({ ...d, copy: i });
  }
  return out;
}

module.exports = { DEFS, buildCatalog };
