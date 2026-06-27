// NO FATE -- rules engine (v1).
//
// Decks are arrays where index 0 = TOP. The Present is a committed window (8).
// The Future is the hidden, editable stack.
//
// A turn has two steps:
//   1. RESOLVE the top of the Present (flip + resolve), then refill Present to 8
//      from the top of the Future.
//   2. FISH the Future: cut anywhere, privately peek the card(s) at the cut,
//      optionally plant one Terminator on top, square up.
//
// Resolution by type:
//   terminator -> buddy-chain capture; loot goes to the TOP terminator's owner.
//   sarah      -> walks home; scores for her owner by order of appearance.
//   prize/potato/power -> ACTIVE PLAYER chooses: take (bank) or send to bottom.
//   global     -> fires immediately; cannot be refused/sent/looted.

const { mulberry32, shuffle } = require('./rng');
const { DEFAULT_PLAYERS, buildDeckCards, buildSarahs, buildRescuers, buildHands } = require('./cards');

const DEFAULT_CONFIG = {
  presentSize: 8,
  terminatorBounty: 2, // points per machine absorbed into a convoy (the buddies below the top one) -> captured machines are worth 2
  cutJitter: 3, // fishing imprecision: you aim for a depth, land within +/- this
  peekScalesWithSarahs: true, // RULE: baseline peek = (Sarahs out + 1); sight grows with the clock
  peekInverted: false, // INVERT the clock: most sight EARLY (the fog thins later as the city empties). Mutually exclusive feel with the default growth.
  sarahCaptureMult: 2, // a captured/dragged protectee scores double (consistent everywhere)
  handCap: 7, // max cards in hand; over it you ditch to the bottom (use-it-or-lose-it). null = no cap
  maxBuddy: null, // EXPERIMENTAL cap on buddies per convoy (null = unbounded, rules-faithful)
  timequakeOff: false, // counterfactual: suppress Timequake's shuffle (card still flips)
  splitSeed: true, // protectees ride the BOTTOM half (can't strand you early); any deck-seeded rescuers ride the TOP half. false = fully blind
  splitFraction: null, // where the players cut the two "roughly equal" piles (fraction in the TOP/hero pile). null = roughly equal, varies ~45-55% per game
  heroesInHand: true, // heroes START in their owner's hand (no portal wait); the Future holds only sidekicks + catalog. false = seed rescuers into the deck
  heroPlantCost: true, // sending your hero costs a tribute: burn one hand card (a spare terminator / one-shot, never a potato), every time -- even the first. false = free plants
  reunionEndsGame: true, // DEFAULT: bringing your pair home is an INSTANT WIN -- the chase IS the game. (false = the ladder experiment: reunion scores on the 1-2-4-8 clock, game plays on.)
  reunionMult: 2, // a reunion ("made it home together") scores ladder x this to the couple's owner. Matches capture's pull, so reuniting your own is as good as a rival stealing her.
};

class Game {
  constructor(opts = {}) {
    const playerDefs = opts.players || DEFAULT_PLAYERS;
    const hands = opts.hands || buildHands(playerDefs);
    this.players = playerDefs.map((p) => ({
      ...p, score: 0, hand: (hands[p.id] || []).slice(), holdings: [], peekBonus: 0,
      peekTurnBonus: 0, // prize sight rider, this turn only
      extraFish: 0,    // prize tempo rider: extra Fish actions queued this turn
      // status / lasting flags
      skipFish: 0,    // Temporal Sickness: skip this many Fish actions
      noPlant: 0,     // Static Cling: cannot plant for this many turns
      glitched: false, // Glitched Targeting: next planted terminator takes nothing
      longReach: false, // Long Reach: terminator reaches one card deeper
      veteran: false,   // Veteran Chassis / The Survivor: terminators can't be buddied/taken
      defector: false,  // The Defector aura: extra Fish + plant each turn
      skipJunk: false,  // The Fixer aura: your terminators skip potatoes/downgrades
      acquired: [],     // catIds this player took/looted (for balance analysis)
      protecteeGone: false, // their protectee has left the deck -> their reunion is dead
    }));
    this.config = { ...DEFAULT_CONFIG, ...(opts.config || {}) };
    this.seed = opts.seed != null ? opts.seed : 1;
    this._rng = mulberry32(this.seed);
    this.rngState = (this.seed * 0x9e3779b1) >>> 0; // reload-safe stream for jitter
    this.lastFish = null; // {turn, by, pos, count} -- set by fish(), used by plant()

    let deck = shuffle(opts.deckCards || buildDeckCards(), this._rng);
    const sarahs = opts.sarahs || buildSarahs(playerDefs);
    const rescuers = opts.rescuers || buildRescuers(playerDefs);
    if (this.config.heroesInHand) {
      // Heroes are YOUR agent from turn one -- deal each owner their hero, owned,
      // straight to hand. The portal never holds a hero; no opening-wait, no
      // Timequake-scatters-my-protagonist feel-bad. Only sidekicks + catalog flow
      // through the Future.
      const ownerByPair = {}; for (const s of sarahs) ownerByPair[s.pairId] = s.owner; // sarahs carry owner+pairId
      for (const r of rescuers) { r.owner = r.owner != null ? r.owner : ownerByPair[r.pairId]; }
      for (const r of rescuers) { const pl = this.player(r.owner); if (pl) pl.hand.push(r); }
    }
    const heroSeed = this.config.heroesInHand ? [] : rescuers; // rescuers go in the deck only when NOT in hand
    if (this.config.splitSeed === false) {
      // Legacy: protectees AND (when seeded) rescuers blind-shuffled across the whole Future.
      this.future = shuffle(deck.concat(sarahs).concat(heroSeed), this._rng);
    } else {
      // Setup: shuffle the pair-free deck, deal the opening Present off the top (so NO
      // pair card is ever in the opening 8), cut the rest into two halves. Any deck-seeded
      // RESCUERS go in the top half and the PROTECTEES in the bottom half, hero-half on
      // top. With heroesInHand the top half is just catalog; sidekicks still ride the bottom.
      const opening = deck.splice(0, Math.min(this.config.presentSize, deck.length));
      // "Cut into two roughly equal piles" -- the PLAYERS choose where to cut. The
      // fraction in the TOP pile is the lever. null = roughly equal, varies ~45-55% per game.
      const frac = this.config.splitFraction != null ? this.config.splitFraction : (0.45 + this._rng() * 0.10);
      const mid = Math.max(0, Math.min(deck.length, Math.round(deck.length * frac)));
      const topHalf = shuffle(deck.slice(0, mid).concat(heroSeed), this._rng);
      // Sidekicks ride the BOTTOM half, randomly scattered. Measured fair (the shallowest Sarah
      // wins slightly LESS than her share -- a shallow Sarah is exposed early and the
      // clear-the-way contest lets rivals fight any head start). The wide depth spread is a
      // FEATURE: every couple has a different-length journey home, and the deep ones are the
      // long slugfests. (Bottom-half keeps her from surfacing naked in the opening.)
      const bottomHalf = shuffle(deck.slice(mid).concat(sarahs), this._rng);
      this.future = opening.concat(topHalf, bottomHalf);
    }
    this.present = [];
    this.dealt = false;
    for (const s of sarahs) { const pl = this.player(s.owner); if (pl) pl.pairId = s.pairId; } // each player's pair

    this.discard = [];
    this.turn = 0;
    this.current = 0;
    this.log = [];
    this.revealed = {}; // cardId -> [playerIds who have privately seen it]
    this.flareReveals = []; // PUBLIC sightings from Flare: {cardId, type, owner, depth, turn} -- all players know, may hunt
    this.sarahsLeft = 0; // order-of-appearance counter
    this.secondSight = false;
    this.instantWinner = null; // set if Kyle reunites with a Sarah -> her owner wins outright
    // analysis instrumentation
    this.fishingStats = { planted: 0, surfacedTop: 0, hitTarget: 0, hitOther: 0, empty: 0, absorbedByRival: 0, sarahAimed: 0, sarahGot: 0 };
    this.lootStats = { prize: 0, potato: 0, neutral: 0, upgrade: 0, downgrade: 0, sarah: 0, none: 0, potatoPts: 0 };
    this.haulLog = []; // per terminator haul: {type, catId, value, turn, futureLen, termDensity}
    this.scoreLog = []; // {turn, s:[banked score per player]} snapshot each endTurn
    this.timequakeInfo = null;
    this.pending = null; // a prize/potato/power awaiting take/send
    this.flipped = null; // a just-flipped card awaiting the reactive yeet window
    this.phase = 'setup'; // 'setup' -> 'resolve' -> 'choice' -> 'fish' -> ...

    this.deal();
  }

  player(id) { return this.players.find((p) => p.id === id); }
  currentPlayer() { return this.players[this.current]; }
  emit(msg) { this.log.push({ turn: this.turn, by: this.currentPlayer ? this.currentPlayer().id : '-', msg }); return msg; }

  deal() {
    if (this.dealt) return;
    const n = Math.min(this.config.presentSize, this.future.length);
    this.present = this.future.splice(0, n);
    this.dealt = true;
    this.phase = 'resolve';
    return this.emit(`Dealt ${n} cards to the Present. Future: ${this.future.length}.`);
  }

  // --- Step 1: RESOLVE ------------------------------------------------------
  resolveTop() {
    if (this.phase !== 'resolve') throw new Error(`Not in resolve phase (phase=${this.phase}).`);
    this.turn += 1;
    return this._flipNext([]);
  }

  // Flip the next Present card; if it's yeet-able and someone holds a Temporal
  // Riptide, open a reactive yeet window; otherwise resolve it.
  _flipNext(events) {
    const top = this.present.shift();
    if (!top) { events.push(this.emit('Present is empty -- nothing to resolve.')); this.phase = 'fish'; this._refill(); return events; }
    this._reveal(top, 'all');
    events.push(this.emit(`${this.currentPlayer().name} flips the top of the Present: ${top.label} [${top.type}${top.value ? ' ' + signed(top.value) : ''}].`));
    // The 13th Monkey can fling ANY surfacing card to the bottom -- except the
    // Timequake (the one global), which fires on flip and can't be yeeted.
    // Yeeting a terminator flings only THIS top one; the rest of the would-be
    // convoy evaluates normally when the next card surfaces.
    if (top.type !== 'global' && this.players.some((p) => this._has(p, 'YEET'))) {
      this.flipped = top; this.phase = 'yeetWindow';
      events.push(this.emit(`  (13th Monkey window: a holder may fling ${top.label} to the bottom, or pass)`));
      return events;
    }
    return this._resolveFlipped(top, events);
  }

  passYeet() {
    if (this.phase !== 'yeetWindow') throw new Error('No yeet window open.');
    const top = this.flipped; this.flipped = null;
    return this._resolveFlipped(top, []);
  }

  doYeet(playerId) {
    if (this.phase !== 'yeetWindow') throw new Error('No yeet window open.');
    const pl = this.player(playerId);
    if (!this._consume(pl, 'YEET')) throw new Error(`${playerId} has no 13th Monkey.`);
    const card = this.flipped; this.flipped = null;
    this.future.push(card); // to the bottom; if a protectee, the clock does NOT tick
    const events = [this.emit(`${pl.name} plays The 13th Monkey -- ${card.label} is flung to the bottom of the deck.`)];
    return this._flipNext(events); // active player draws again
  }

  _resolveFlipped(top, events) {
    switch (top.type) {
      case 'terminator': this._capture(top, events); this.phase = 'fish'; this._refill(); break;
      case 'kyle':
        if (top.owner == null) { // unacquired rescuer surfaces: he reports to HIS pair's owner, then drawer flips again
          const rightful = this.players.find((p) => p.pairId === top.pairId) || this.currentPlayer();
          top.owner = rightful.id; rightful.hand.push(top);
          events.push(this.emit(`  ${top.name} reports to ${rightful.name} (their pair). ${this.currentPlayer().name} flips again.`));
          return this._flipNext(events);
        }
        this._resolveKyle(top, events); this.phase = 'fish'; this._refill(); // planted rescuer: hero resolution
        break;
      case 'sarah': {
        // A naked protectee's value goes to whoever DREW her -- doubled if the drawer owns her.
        const drawer = this.currentPlayer();
        const ownBonus = drawer.id === top.owner ? 2 : 1;
        this._sarahHome(top, drawer, events, ownBonus, false);
        const next = this.present[0]; // the card that was directly beneath her
        if (next && next.type === 'kyle' && next.pairId === top.pairId) {
          const pairOwner = this.player(top.owner);
          pairOwner.score += 2; // "oh well, you tried"
          events.push(this.emit(`  ...star-crossed: ${next.name} surfaces one card too late for ${top.name}. +2 (oh well, you tried) to ${pairOwner.name}.`));
        }
        this.phase = 'fish'; this._refill();
        break;
      }
      case 'global': this._fireGlobal(top, events); this.phase = 'fish'; this._refill(); break;
      case 'prize': case 'neutral': case 'potato': case 'upgrade': case 'downgrade': case 'character':
        this.pending = top;
        this.phase = 'choice';
        events.push(this.emit(`  ${this.currentPlayer().name} must choose: TAKE or SEND ${top.label} [${top.type}${top.value ? ' ' + signed(top.value) : ''}]${top.desc ? ' -- ' + top.desc : ''}`));
        break;
      default:
        this.discard.push(top);
        events.push(this.emit(`  unknown type '${top.type}' -- discarded.`));
        this.phase = 'fish'; this._refill();
    }
    return events;
  }

  // Active player's choice on a self-surfacing prize/potato/power.
  choose(take) {
    if (this.phase !== 'choice' || !this.pending) throw new Error('No pending take/send choice.');
    const card = this.pending; this.pending = null;
    const me = this.currentPlayer();
    const events = [];
    if (take) {
      this._acquire(me, card, events, 'banks');
      this.enforceCap(me); // taking over the cap forces an immediate ditch (use it or lose it)
    } else {
      // Send ALWAYS means the bottom of the Future -- one concrete, table-legal action
      // for every card. (A clock-scaled card sent here usually meets the late-game
      // graveyard: gambling on a resurface is a real risk, not a free ripen.)
      this.future.push(card);
      events.push(this.emit(`  ${me.name} sends ${card.label} to the bottom of the Future.`));
    }
    this.phase = 'fish';
    this._refill();
    return events;
  }

  // Buddy-chain capture. The surfacing terminator chains down through further
  // terminators until the first non-terminator (the loot). The whole convoy's
  // loot goes to the TOP terminator's owner -- no choice.
  _capture(term, events) {
    const owner = this.player(term.owner);
    // Glitched Targeting (D02): a glitched terminator surfaces and takes nothing.
    if (term.glitched) {
      if (term.plantTurn != null) { this.fishingStats.surfacedTop += 1; this.fishingStats.empty += 1; }
      term.glitched = false; term.plantTurn = undefined; term.plantTarget = null;
      if (owner) owner.hand.push(term); else this.discard.push(term);
      events.push(this.emit(`  ${term.label} surfaces GLITCHED -- grabs a fistful of nothing, returns to ${owner ? owner.name : 'the discard'}.`));
      return events;
    }
    const maxBuddy = this.config.maxBuddy == null ? Infinity : this.config.maxBuddy;
    const convoy = [term];
    let loot = null;
    let destroyed = false; // true only if a hero wipes the convoy -- the one way machines die in capture
    // Long Reach (U09): reach past the first card below (it is left in place).
    // DEFAULT RULING (flag for review): skips exactly one card, whatever it is.
    let skipped = null;
    if (owner.longReach && this.present.length > 0) {
      skipped = this.present.shift();
      this._reveal(skipped, 'all');
      events.push(this.emit(`  Long Reach: ${term.label} reaches past ${skipped.label} (left in the Present).`));
    }
    while (true) {
      const below = this.present.shift();
      if (!below) { events.push(this.emit('  ...nothing beneath; convoy comes home empty.')); break; }
      this._reveal(below, 'all');
      if (below.type === 'terminator') {
        // Veteran Chassis (U10): this terminator cannot be buddied/taken.
        if (this.player(below.owner) && this.player(below.owner).veteran) {
          this.present.unshift(below);
          events.push(this.emit(`  ${below.label} is a Veteran chassis -- cannot be taken; chain stops, convoy empty.`));
          break;
        }
        if (convoy.length - 1 >= maxBuddy) { // buddy cap reached: take this one, stop
          convoy.push(below);
          events.push(this.emit(`  ${below.label} taken at buddy cap (convoy ${convoy.length}); chain stops.`));
          break;
        }
        convoy.push(below);
        events.push(this.emit(`  ${below.label} buddies up (convoy ${convoy.length}).`));
        continue;
      }
      if (below.type === 'global') {
        events.push(this.emit(`  convoy hits a global -- it triggers and the machines come home empty.`));
        this._fireGlobal(below, events);
        break;
      }
      if (below.type === 'kyle') {
        // Kyle defeats terminators that come down onto him; he survives, they die.
        this.present.unshift(below);
        events.push(this.emit(`  ${below.name} stands their ground -- the convoy of ${convoy.length} is destroyed; ${below.name} survives.`));
        loot = null;
        destroyed = true; // a hero is the one thing that permanently kills attacking machines
        break;
      }
      // The Fixer aura: this owner's machines refuse junk and reach for the next real card.
      if (owner.skipJunk && (below.type === 'potato' || below.type === 'downgrade')) {
        this.discard.push(below);
        events.push(this.emit(`  ${below.label} is junk -- ${owner.name}'s machine skips it (Fixer).`));
        continue;
      }
      loot = below;
      break;
    }
    if (skipped) this.present.unshift(skipped); // Long Reach: the skipped card stays on top
    // Fishing-effectiveness instrumentation.
    if (term.plantTurn != null) {
      this.fishingStats.surfacedTop += 1;
      if (term.plantTarget && term.plantTarget.type === 'sarah') this.fishingStats.sarahAimed += 1;
      if (loot) {
        if (term.plantTarget && loot.id === term.plantTarget.id) this.fishingStats.hitTarget += 1; else this.fishingStats.hitOther += 1;
        if (loot.type === 'sarah' && term.plantTarget && term.plantTarget.type === 'sarah') this.fishingStats.sarahGot += 1;
      } else this.fishingStats.empty += 1;
    }
    for (let k = 1; k < convoy.length; k++) {
      const b = convoy[k];
      if (b.plantTurn != null && b.owner !== owner.id) this.fishingStats.absorbedByRival += 1;
    }
    // Terminators are a REUSABLE fleet -- but only the WINNER survives a convoy. The
    // top terminator hauls the loot home AND drags the whole convoy with it; it
    // returns to its owner's hand to be planted again, while every buddied machine
    // below it (the losers) goes OUT OF COMMISSION. (A hero's defense destroys the
    // whole convoy, top included.)
    convoy.forEach((t, idx) => {
      if (!destroyed && idx === 0) {
        t.plantTurn = undefined; t.plantTarget = null; t.glitched = false;
        const o = this.player(t.owner); if (o) o.hand.push(t); else this.discard.push(t);
      } else {
        this.discard.push(t); // hero-wiped, or a buddied loser swept home by the winner
      }
    });
    if (this.config.terminatorBounty && convoy.length > 1 && !destroyed) { // wiped convoys (hero defense) pay nothing
      const extra = this.config.terminatorBounty * (convoy.length - 1);
      owner.score += extra;
      events.push(this.emit(`  +${extra} convoy bounty (${convoy.length - 1} machine${convoy.length - 1 > 1 ? 's' : ''}) to ${owner.name}.`));
    }
    if (loot) {
      if (loot.type === 'sarah') {
        events.push(this.emit(`  the convoy drags home ${loot.label}!`));
        this._sarahHome(loot, owner, events, 1, true); // captor scores (capture bonus applies)
      } else {
        this._acquire(owner, loot, events, 'loots');
      }
    }
    this.lootStats[loot ? loot.type : 'none'] += 1;
    if (loot && loot.type === 'potato') this.lootStats.potatoPts += loot.value;
    this.haulLog.push({
      type: loot ? loot.type : 'none', catId: loot ? loot.catId : null, value: loot ? loot.value : 0,
      turn: this.turn, futureLen: this.future.length,
      termDensity: this.future.length ? this.future.filter((c) => c.type === 'terminator').length / this.future.length : 0,
    });
    events.push(this.emit(`  convoy of ${convoy.length} -> ${owner.name}.`));
  }

  _sarahHome(sarah, beneficiary, events, mult = 1, captured = false) {
    this.sarahsLeft += 1;
    const owner = this.player(sarah.owner); if (owner) owner.protecteeGone = true; // her reunion is now impossible
    const capMult = captured ? (this.config.sarahCaptureMult || 1) : 1; // capture beats survival
    const ladder = Math.round(Math.pow(2, (this.sarahsLeft - 1) * this._clockScale())); // 1..8 regardless of table size
    const value = ladder * mult * (this.config.sarahLadderMult || 1) * capMult;
    beneficiary.score += value;
    this.discard.push(sarah);
    events.push(this.emit(`  ${sarah.label} is sidekick #${this.sarahsLeft} to leave -> +${value}${mult > 1 ? ` (x${mult} rescue!)` : ''} to ${beneficiary.name} (now ${beneficiary.score}).`));
  }

  // A planted Kyle surfaces: rescue a Sarah below (DOUBLED), die to a terminator, else whiff.
  _resolveKyle(kyle, events) {
    const owner = this.player(kyle.owner);
    this.discard.push(kyle);
    const below = this.present.shift();
    if (!below) { events.push(this.emit(`  Kyle Reese surfaces but no one is below.`)); return; }
    this._reveal(below, 'all');
    if (below.type === 'sarah') {
      if (kyle.pairId === below.pairId) {
        const home = this.player(below.owner);
        if (this.config.reunionEndsGame) { // legacy: reunion is an outright win
          this.discard.push(below);
          this.instantWinner = below.owner;
          events.push(this.emit(`  *** ${kyle.name} REUNITES WITH ${below.name} -- INSTANT WIN for ${home.name}! ***`));
        } else {
          // They make it home TOGETHER -- it scores on the same 1-2-4-8 clock as any other
          // departure, but to the couple's own owner. No instant win; the war plays on, and
          // whoever brings their pair home LAST collects the biggest rung.
          events.push(this.emit(`  *** ${kyle.name} and ${below.name} make it home together! ***`));
          this._sarahHome(below, home, events, this.config.reunionMult || 2, false);
          (this.reunions = this.reunions || []).push({ owner: home.id, turn: this.turn });
        }
      } else {
        // Wrong pairing (Doc Brown grabs Rachel): no win, but he hauls her home --
        // her ladder value accrues to the RESCUER's owner.
        events.push(this.emit(`  ${kyle.name} hauls home ${below.name} -- wrong couple, no win, but the points are theirs.`));
        this._sarahHome(below, this.player(kyle.owner), events, 1, true);
      }
    } else if (below.type === 'terminator') {
      this.present.unshift(below);
      events.push(this.emit(`  ${kyle.name} charges ${below.label} but the machine guns them down. It survives, and brings home whatever's next.`));
    } else {
      this.present.unshift(below);
      events.push(this.emit(`  ${kyle.name} surfaces but finds no sidekick (just ${below.label}); spent.`));
    }
  }

  // Acquire a card into a player's score/hand/holdings, by category.
  _acquire(pl, card, events, verb) {
    if (card.catId) pl.acquired.push(card.catId);
    switch (card.type) {
      case 'prize': case 'neutral': {
        let v = card.value;
        if (card.valueLadder) v = Math.round(Math.pow(2, this.sarahsLeft * this._clockScale())); // clock-ladder, normalized to table size (1..8)
        else if (card.scaleWithSarahs) v = Math.max(0, card.value + card.scaleWithSarahs * Math.round(this.sarahsLeft * this._clockScale()));
        else if (card.dyn) v = this._dynValue(card, pl); // dynamic value: scales with the board (chit-tracked)
        const clock = card.scaleWithSarahs ? ` [clock: ${this.sarahsLeft} Sarahs out]` : (card.dyn ? ` [${card.dyn}]` : '');
        if (v >= 1) {
          // A point card is KEPT: it sits in your hand worth its locked value (your chits).
          // It counts against the hand cap and can be burned (hero-send tribute, Portal
          // Collapse) -- losing the points. Value locks NOW (dynamic prizes don't re-float).
          card.locked = v;
          pl.hand.push(card);
          events.push(this.emit(`  ${pl.name} ${verb} ${card.label} -> ${signed(v)}${clock}, kept in hand (total ${this.total(pl)}).`));
        } else {
          // Worthless neutral (e.g. a peek-rider card): it resolves and is gone.
          this.discard.push(card);
          events.push(this.emit(`  ${pl.name} ${verb} ${card.label} -> ${signed(v)}${clock}.`));
        }
        if (card.onTake) this._prizeRider(card, pl, events); // sight/tempo rider
        break;
      }
      case 'character':
        pl.score += card.value; // pay (negative) or earn now
        pl.holdings.push(card);
        this._applyAura(pl, card, events);
        break;
      case 'potato':
        pl.hand.push(card); // stuck in hand; scored at game end unless re-buried
        events.push(this.emit(`  ${pl.name} is stuck with ${card.label} (${signed(card.value)} at game end; playable to re-bury).`));
        break;
      case 'upgrade':
        if (card.timing === 'lasting') { pl.holdings.push(card); this._applyLasting(pl, card, events); }
        else { pl.hand.push(card); events.push(this.emit(`  ${pl.name} ${verb} ${card.label} (one-shot, held).`)); }
        break;
      case 'downgrade':
        this._applyDowngrade(pl, card, events);
        break;
      default:
        this.discard.push(card);
        events.push(this.emit(`  ${pl.name} ${verb} ${card.label}.`));
    }
  }

  _applyLasting(pl, card, events) {
    if (card.eff === 'U08') { pl.peekBonus += 1; events.push(this.emit(`  ${pl.name} gains Sharp Eyes (private peek +1).`)); }
    else if (card.eff === 'U09') { pl.longReach = true; events.push(this.emit(`  ${pl.name} gains Long Reach (terminators reach one card deeper).`)); }
    else if (card.eff === 'U10') { pl.veteran = true; events.push(this.emit(`  ${pl.name} gains Veteran Chassis (your terminators can't be buddied).`)); }
    else events.push(this.emit(`  ${pl.name} gains ${card.label}.`));
  }

  _applyAura(pl, card, events) {
    if (card.eff === 'A_DEF') { pl.defector = true; events.push(this.emit(`  ${pl.name} keeps ${card.label} (${signed(card.value)}); AURA: extra Fish + plant each turn.`)); }
    else if (card.eff === 'A_SUR') { pl.veteran = true; events.push(this.emit(`  ${pl.name} keeps ${card.label} (${signed(card.value)}); AURA: terminators can't be buddied/taken.`)); }
    else if (card.eff === 'A_FIX') { pl.skipJunk = true; events.push(this.emit(`  ${pl.name} keeps ${card.label} (${signed(card.value)}); AURA: terminators skip junk.`)); }
    else events.push(this.emit(`  ${pl.name} keeps ${card.label} (${signed(card.value)}).`));
  }

  _applyDowngrade(pl, card, events) {
    this.discard.push(card);
    if (card.eff === 'D01') { pl.skipFish += 2; events.push(this.emit(`  ${pl.name} afflicted: Temporal Sickness -- skips next 2 Fish actions.`)); }
    else if (card.eff === 'D02') { pl.glitched = true; events.push(this.emit(`  ${pl.name} afflicted: Glitched Targeting -- next planted terminator surfaces empty.`)); }
    else if (card.eff === 'D03') { pl.noPlant += 2; events.push(this.emit(`  ${pl.name} afflicted: Static Cling -- may peek but not plant for 2 turns.`)); }
    else events.push(this.emit(`  ${pl.name} afflicted by ${card.label}.`));
  }

  _fireGlobal(card, events) {
    this.discard.push(card);
    if (card.eff === 'timequake') {
      this.timequakeInfo = { turn: this.turn, futureLen: this.future.length, plantedInFuture: this.future.filter((c) => c.type === 'terminator').length, seenBy: (card._peekedBy || []).slice() };
      if (this.config.timequakeOff) {
        events.push(this.emit(`  TIMEQUAKE flips but is SUPPRESSED (counterfactual): no shuffle.`));
      } else {
        const rng = mulberry32((this.seed * 131 + this.turn * 17 + this.future.length) >>> 0);
        this.future = shuffle(this.future, rng);
        this.revealed = {}; this.flareReveals = []; // every read is destroyed, flare intel scattered
        events.push(this.emit(`  TIMEQUAKE! The Future (${this.future.length}) is shuffled (${this.timequakeInfo.plantedInFuture} planted terminators scrambled); all reads lost.`));
      }
    } else if (card.eff === 'portaldown') {
      // PORTAL COLLAPSE: every player THROWS AWAY one card (destroyed, their choice).
      // Holding a potato? Lucky -- shed it. Empty hand? Lucky -- nothing to give.
      events.push(this.emit(`  PORTAL COLLAPSE -- the rift is failing; everyone throws a card into it to hold it open.`));
      for (const p of this.players) {
        if (!p.hand.length) { events.push(this.emit(`    ${p.name} has nothing to throw -- lucky.`)); continue; }
        const [c] = p.hand.splice(this._throwAwayIdx(p), 1);
        this.discard.push(c);
        events.push(this.emit(`    ${p.name} throws ${c.label} into the collapse.`));
      }
    } else if (card.eff === 'flare') {
      // FLARE: light up one spot in the timeline -- reveal a cut card to the WHOLE table.
      if (this.future.length) {
        const at = Math.floor(this.stepRng() * this.future.length); const c = this.future[at];
        this._reveal(c, 'all'); c._peekedBy = this.players.map((p) => p.id);
        this.flareReveals.push({ cardId: c.id, type: c.type, owner: c.owner, depth: at, turn: this.turn }); // public, huntable
        events.push(this.emit(`  FLARE -- ${this.currentPlayer().name} lights up the timeline: everyone sees ${c.label} (depth ~${at}).`));
      } else events.push(this.emit(`  FLARE -- nothing in the Future to light up.`));
    } else if (card.eff === 'passleft') {
      // PASS THE WATCH: every player lifts a card; they AND the player on their left both see
      // it (then it goes back). The fog leaks all the way around the table at once.
      events.push(this.emit(`  PASS THE WATCH -- every player shares a lifted card with the player on their left.`));
      const n = this.players.length;
      for (let i = 0; i < n; i++) {
        if (!this.future.length) break;
        const at = Math.floor(this.stepRng() * this.future.length); const c = this.future[at];
        const me = this.players[i], left = this.players[(i + 1) % n];
        this._seePrivate([c], me.id); this._seePrivate([c], left.id);
        events.push(this.emit(`    ${me.name} and ${left.name} both see ${c.label}.`));
      }
    } else if (card.eff === 'showchosen') {
      // A WORD IN YOUR EAR: the active player lifts a card and shows it to ONE player of their
      // choice (negotiation / bluff / bait), then slips it back. (Sim picks a target; humans choose.)
      if (this.future.length) {
        const me = this.currentPlayer();
        const others = this.players.filter((p) => p.id !== me.id);
        const target = others.length ? others[Math.floor(this.stepRng() * others.length)] : me;
        const at = Math.floor(this.stepRng() * this.future.length); const c = this.future[at];
        this._seePrivate([c], me.id); this._seePrivate([c], target.id);
        events.push(this.emit(`  A WORD IN YOUR EAR -- ${me.name} shows ${c.label} to ${target.name} alone, then slips it back.`));
      } else events.push(this.emit(`  A WORD IN YOUR EAR -- nothing to show.`));
    }
  }

  // Which hand card to throw to the Portal Collapse: your least-valuable. A held
  // potato goes first (good riddance), then a spare one-shot, then a machine, hero last.
  _throwAwayIdx(p) {
    const rank = (c) => (c.type === 'potato' ? 0 : c.type === 'upgrade' ? 1 : c.type === 'terminator' ? 2 : 3);
    let idx = 0;
    for (let i = 1; i < p.hand.length; i++) if (rank(p.hand[i]) < rank(p.hand[idx])) idx = i;
    return idx;
  }

  // Hero-send tribute: sending your hero burns a kept PRIZE (a >=1-value card) -- you
  // spend real points to deploy them. The cheapest prize you hold, so the cost is small
  // but real. -1 = you hold no prize -> you can't send the hero until you've earned one.
  _heroTribute(p) {
    let idx = -1;
    for (let i = 0; i < p.hand.length; i++) {
      const c = p.hand[i];
      if (c.type !== 'prize' && c.type !== 'neutral') continue;
      if ((c.locked || 0) < 1) continue;
      if (idx === -1 || (c.locked || 0) < (p.hand[idx].locked || 0)) idx = i;
    }
    return idx;
  }

  _refill() {
    const target = this.config.presentSize;
    while (this.present.length < target && this.future.length > 0) {
      this.present.push(this.future.shift());
    }
  }

  // --- Step 2: FISH ---------------------------------------------------------
  peekCount(playerId) {
    const pl = this.player(playerId);
    // Baseline sight GROWS with the clock, normalized to table size so it spans the
    // same ~1..4 range at any player count (no god-sight at 6p, real growth at 2p).
    const cs = this._clockScale();
    let base;
    if (this.config.peekScalesWithSarahs) {
      base = this.config.peekInverted
        ? 1 + Math.round((this.players.length - 1 - this.sarahsLeft) * cs) // most sight early; the fog thins as the city empties
        : 1 + Math.round(this.sarahsLeft * cs);                            // sight grows with the clock
      base = Math.max(1, base);
    } else {
      base = this.config.basePeek || 1;
    }
    return base + (pl ? (pl.peekBonus + (pl.peekTurnBonus || 0)) : 0); // Sharp Eyes (lasting) + prize riders (this turn)
  }

  // Normalize clock-keyed values to a 4-player baseline: a T-player game has T-1
  // sidekick-departure steps, so scale the raw count to behave like the 4-player
  // (3-step) curve. Returns 1 at 4 players, >1 with fewer, <1 with more.
  _clockScale() { return this.players.length > 1 ? 3 / (this.players.length - 1) : 1; }

  // Dynamic prize value: scales with the board (chit-tracked at the table).
  _dynValue(card, pl) {
    const mine = this.future.filter((c) => c.type === 'terminator' && c.owner === pl.id).length;
    const all = this.future.filter((c) => c.type === 'terminator').length;
    const rival = all - mine;
    const hand = pl.hand.filter((c) => c.type === 'terminator').length;
    const sidekicksLeft = this.players.length - this.sarahsLeft;
    switch (card.dyn) {
      case 'myMachines': return card.value + mine;             // scavenge what you've deployed
      case 'machinesInPlay': return card.value + all;          // more war, more spent ammo to salvage
      case 'rivalMachines': return card.value + rival;         // profit off the enemy's deployment
      case 'sidekicksGone': return card.value + this.sarahsLeft; // scarcer as the city empties
      case 'sidekicksLeft': return card.value + sidekicksLeft; // worth more while the war is young
      case 'fewerHandMachines': return Math.max(1, card.value + (5 - hand)); // worth more the fewer you hold
      case 'handSize': return card.value + pl.hand.length;     // flush with gear
      case 'reunionDead': return pl.protecteeGone ? card.value * 2 : card.value;    // consolation when your couple is lost
      case 'reunionAlive': return pl.protecteeGone ? card.value : card.value * 2;   // The Power of Love: doubled while your couple can still reunite
      default: return card.value;
    }
  }

  // Sight/tempo rider fired when a prize is taken (during the choice phase, so it
  // buffs this turn's upcoming Fish). secondPeek/extraFish add Fish actions; peekN
  // widens this turn's band.
  _prizeRider(card, pl, events) {
    const addPeek = (n) => { pl.peekTurnBonus = (pl.peekTurnBonus || 0) + n; };
    const addFish = (n) => { pl.extraFish = (pl.extraFish || 0) + n; };
    switch (card.onTake) {
      case 'peek1': addPeek(1); events.push(this.emit(`    +rider: peek +1 this turn.`)); break;
      case 'peek2': addPeek(2); events.push(this.emit(`    +rider: peek +2 this turn.`)); break;
      case 'peek3': addPeek(3); events.push(this.emit(`    +rider: peek +3 this turn.`)); break;
      case 'secondPeek': addFish(1); events.push(this.emit(`    +rider: a second peek this turn.`)); break;
      case 'extraFish': addFish(1); events.push(this.emit(`    +rider: an extra Fish + plant this turn.`)); break;
      case 'extraFish2': addFish(2); events.push(this.emit(`    +rider: two extra Fish actions this turn.`)); break;
      case 'peek2second': addPeek(2); addFish(1); events.push(this.emit(`    +rider: peek +2 and a second peek.`)); break;
      case 'sacrifice':
        if (pl.hand.length) { const [c] = pl.hand.splice(this._throwAwayIdx(pl), 1); this.discard.push(c); events.push(this.emit(`    +sacrifice: ${pl.name} throws ${c.label} into the cause.`)); }
        else events.push(this.emit(`    +sacrifice: ${pl.name} has nothing to give -- lucky.`));
        break;
      default: break;
    }
  }

  // Bullet Time: read the ENTIRE committed Present (free; peek-only).
  useBulletTime() {
    const me = this.currentPlayer(); if (!this._consume(me, 'BULLET')) throw new Error('No Bullet Time to use.');
    this._seePrivate(this.present, me.id);
    me._sawPresent = this.turn;
    this.emit(`${me.name} plays Bullet Time -- reads the ENTIRE Present (${this.present.length} cards).`);
    return this.present.slice();
  }

  // Reload-safe RNG stream (mulberry32 step over this.rngState).
  stepRng() {
    let a = (this.rngState + 0x6d2b79f5) | 0;
    this.rngState = a >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Where an aimed cut actually lands. The two ENDS are crisp -- you can square the
  // deck and read the top/bottom card reliably -- but interior cuts are a guess, so
  // jitter tapers to 0 at either end and grows to full cutJitter toward the middle.
  _jitter(aim) {
    aim = aim == null ? Math.floor(this.future.length / 2) : aim;
    aim = Math.max(0, Math.min(aim, Math.max(0, this.future.length - 1)));
    const J0 = this.config.cutJitter || 0;
    if (J0 <= 0) return aim;
    const distToEnd = Math.min(aim, (this.future.length - 1) - aim);
    const J = Math.min(J0, distToEnd); // crisp at both ends, foggy in the middle
    if (J <= 0) return aim;
    const d = Math.round((this.stepRng() * 2 - 1) * J);
    return Math.max(0, Math.min(aim + d, this.future.length - 1));
  }

  _seePrivate(cards, who) {
    for (const c of cards) {
      this.revealed[c.id] = this.revealed[c.id] || [];
      if (!this.revealed[c.id].includes(who)) this.revealed[c.id].push(who);
      c._peekedBy = c._peekedBy || []; // fishing-only sight (survives the flip-reveal-to-all)
      if (!c._peekedBy.includes(who)) c._peekedBy.push(who);
    }
  }

  _consume(me, catId) {
    const i = me.hand.findIndex((c) => c.type === 'upgrade' && c.eff === catId);
    if (i === -1) return null;
    return me.hand.splice(i, 1)[0];
  }
  _has(me, eff) { return me.hand.some((c) => c.type === 'upgrade' && c.eff === eff); }

  // Fishing: you AIM for a depth and your cut lands within +/- cutJitter of it --
  // EXCEPT at the two ends, which are crisp (aim at the very top or bottom and you
  // get it exactly; see _jitter). Interior cuts can't reliably re-find a card. You
  // privately peek peekCount contiguous cards at the landing, then may plant on one.
  fish(aimedPos) {
    if (this.phase !== 'fish') throw new Error(`Not in fish phase (phase=${this.phase}).`);
    const cur = this.currentPlayer();
    if (cur.skipFish > 0) { cur.skipFish -= 1; this.emit(`${cur.name} skips this Fish (Temporal Sickness; ${cur.skipFish} left).`); return []; }
    if (this.future.length === 0) { this.emit('Future is empty -- nothing to fish.'); return []; }
    const aim = Math.max(0, Math.min(aimedPos == null ? Math.floor(this.future.length / 2) : aimedPos, this.future.length - 1));
    const actual = this._jitter(aim);
    const me = cur.id;
    const n = this.peekCount(me);
    const seen = this.future.slice(actual, actual + n);
    this._seePrivate(seen, me);
    this.lastFish = { turn: this.turn, by: me, pos: actual, count: seen.length };
    this.emit(`${cur.name} fishes aiming ~${aim}${this.config.cutJitter ? ` (lands ~${actual})` : ''} (peek ${n}). [depth leaks to all]`);
    return seen;
  }

  // --- One-shot upgrade uses & potato re-bury (each is a Fish action) -------
  // Ability power decays as Sarahs leave: strong early, fading late.
  decayPeek(base = 4) { return Math.max(1, base - Math.round(this.sarahsLeft * this._clockScale())); }

  useDeepRecon(aim) { // U01: peek (4 - Sarahs out) at the cut, no plant -- decays over the game
    const me = this.currentPlayer(); if (!this._consume(me, 'U01')) throw new Error('No Deep Recon to use.');
    const n = this.decayPeek(4);
    const at = this._jitter(aim); const seen = this.future.slice(at, at + n); this._seePrivate(seen, me.id);
    this.emit(`${me.name} uses Deep Recon at ~${at} (peek ${n} = 4 - ${this.sarahsLeft} Sarahs out, no plant).`); return seen;
  }
  useJuryRig() { // U02: look at the bottom three of the Future
    const me = this.currentPlayer(); if (!this._consume(me, 'U02')) throw new Error('No Jury-Rig Scope to use.');
    const seen = this.future.slice(-3); this._seePrivate(seen, me.id);
    this.emit(`${me.name} uses Jury-Rig Scope (sees bottom 3 of Future).`); return seen;
  }
  // Temporal Splice: reorder the cards in the window you JUST peeked (this turn's fish).
  reorderHere(orderArr) {
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) throw new Error('Fish before splicing (reorder applies to what you peeked).');
    const n = this.lastFish.count;
    if (!Array.isArray(orderArr) || orderArr.length !== n || new Set(orderArr).size !== n || orderArr.some((i) => i < 0 || i >= n)) throw new Error('Bad reorder permutation.');
    if (!this._consume(me, 'REORDER')) throw new Error('No Temporal Splice to use.');
    const pos = this.lastFish.pos;
    const window = this.future.slice(pos, pos + n);
    this.future.splice(pos, n, ...orderArr.map((i) => window[i]));
    this.lastFish = null;
    return this.emit(`${me.name} uses Temporal Splice -- re-splices ${n} cards at depth ${pos}.`);
  }
  // EXTRACT: if you FIND your own planted hero in the band you JUST peeked, scoop them
  // back to hand -- FREE, no card. The only recovery after a Timequake scatters a staged
  // reunion: re-find your hero, bring them home, re-stage. Table-legal: you may act only
  // on a hero you can actually see (peeked this turn). You can't reach for a rival's.
  extractHero() {
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) {
      throw new Error('Fish before extracting (you scoop a hero you peeked this turn).');
    }
    const { pos, count } = this.lastFish;
    let idx = -1;
    for (let i = pos; i < pos + count && i < this.future.length; i++) {
      const c = this.future[i];
      if (c && c.type === 'kyle' && c.owner === me.id) { idx = i; break; }
    }
    if (idx === -1) return null; // no hero of yours in the peeked band
    const [hero] = this.future.splice(idx, 1);
    hero.plantTurn = undefined; hero.plantTarget = null; hero.glitched = false;
    me.hand.push(hero);
    this.emit(`${me.name} finds ${hero.name} adrift in the Future (depth ${idx}) and pulls them home -- back in hand, free, ready to re-stage.`);
    return hero;
  }
  useEMP(offset = 0) { // U05: on your Fish, destroy a terminator you PEEKED -- reliably, no jitter
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) throw new Error('Fish before EMP (you hit a machine you peeked this turn).');
    if (!this._consume(me, 'U05')) throw new Error('No EMP Charge to use.');
    const off = Math.max(0, Math.min(offset || 0, this.lastFish.count - 1));
    const at = this.lastFish.pos + off; const card = this.future[at];
    this.lastFish = null;
    if (card && card.type === 'terminator') { this.future.splice(at, 1); this.discard.push(card); this.emit(`${me.name} EMPs ${card.label} (depth ${at}) -- destroyed.`); return card; }
    this.emit(`${me.name} EMPs depth ${at} but ${card ? card.label : 'nothing'} is not a terminator -- fizzle.`); return null;
  }
  // U06: send ONE card you peeked THIS fish to the bottom of the Future. You act on what you
  // SEE -- reliably, no jitter (jitter is the cut, and you already cut to fish). The reliable
  // star-cross: bury a rival's staged hero and his sidekick surfaces alone.
  useSabotage(offset = 0) {
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) {
      throw new Error('Fish before Sabotage (you bury a card you peeked this turn).');
    }
    if (!this._consume(me, 'U06')) throw new Error('No Sabotage to use.');
    const off = Math.max(0, Math.min(offset || 0, this.lastFish.count - 1));
    const at = this.lastFish.pos + off;
    const card = this.future[at];
    if (!card) { this.emit(`${me.name} Sabotage finds nothing.`); this.lastFish = null; return null; }
    this.future.splice(at, 1); this.future.push(card);
    this.lastFish = null; // one action per fish
    this.emit(`${me.name} sabotages ${card.label} (peeked at depth ${at}) to the bottom of the Future.`); return card;
  }
  // U17 ("Temporal Shift"): nudge a card you PEEKED exactly 3 spaces toward the top ('up') or
  // bottom ('down'). Reliable, no jitter. Slip a rival's hero behind his sidekick to star-cross
  // them, or edge your own pair into alignment / toward home.
  useShift(offset = 0, dir = 'down') {
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) throw new Error('Fish before Temporal Shift (you move a card you peeked this turn).');
    if (!this._consume(me, 'U17')) throw new Error('No Temporal Shift to use.');
    const off = Math.max(0, Math.min(offset || 0, this.lastFish.count - 1));
    const at = this.lastFish.pos + off; const card = this.future[at];
    this.lastFish = null;
    if (!card) { this.emit(`${me.name} Temporal Shift finds nothing.`); return null; }
    this.future.splice(at, 1);
    const to = Math.max(0, Math.min(at + (dir === 'up' ? -3 : 3), this.future.length));
    this.future.splice(to, 0, card);
    this.emit(`${me.name} shifts ${card.label} 3 spaces ${dir} (depth ${at} -> ${to}).`); return card;
  }
  useSnipe(offset = 0) { // SNIPE ("Hasta La Vista, Baby"): on your Fish, destroy a card you PEEKED -- not a protectee, hero, or Timequake. Reliable, no jitter.
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) throw new Error('Fish before Hasta La Vista (you hit a card you peeked this turn).');
    if (!this._consume(me, 'SNIPE')) throw new Error('No Hasta La Vista to use.');
    const off = Math.max(0, Math.min(offset || 0, this.lastFish.count - 1));
    const at = this.lastFish.pos + off; const card = this.future[at];
    this.lastFish = null;
    if (!card) { this.emit(`${me.name} -- Hasta la vista finds nothing.`); return null; }
    if (card.type === 'sarah' || card.type === 'kyle' || card.type === 'global') {
      const what = card.type === 'sarah' ? 'a protectee' : card.type === 'kyle' ? 'a hero' : 'the Timequake';
      this.emit(`${me.name} can't destroy ${card.label} (${what}) -- it holds.`); return null;
    }
    this.future.splice(at, 1); this.discard.push(card);
    this.emit(`${me.name} -- Hasta la vista, baby: ${card.label} (depth ${at}) is destroyed.`); return card;
  }
  useClaw(offset = 0) { // CLAW ("The Claw"): on your Fish, pull a terminator you PEEKED home to its OWNER's hand. Reliable, no jitter.
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) throw new Error('Fish before The Claw (you pull a machine you peeked this turn).');
    if (!this._consume(me, 'CLAW')) throw new Error('No Claw to use.');
    const off = Math.max(0, Math.min(offset || 0, this.lastFish.count - 1));
    const at = this.lastFish.pos + off; const card = this.future[at];
    this.lastFish = null;
    if (card && card.type === 'terminator') {
      this.future.splice(at, 1);
      card.plantTurn = undefined; card.plantTarget = null; card.glitched = false;
      const o = this.player(card.owner); if (o) o.hand.push(card); else this.discard.push(card);
      this.emit(`${me.name} claws ${card.label} out (depth ${at}) -- it goes home to ${o ? o.name : 'the scrap'}.`); return card;
    }
    this.emit(`${me.name} claws at depth ${at} but ${card ? card.label : 'nothing'} is not a machine -- fizzle.`); return null;
  }
  // PULL ("Actually, Fate"): drag one card from the band you JUST peeked up out of
  // the Future and into the Present at a depth you choose (fish first, like plant).
  // The Present is face-down, so what your card lands next to is a gamble -- a
  // machine already there may grab a Potato you meant for a rival.
  usePull(offset = 0, presentAim = 0) {
    const me = this.currentPlayer();
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) {
      throw new Error('Fish before "Actually, Fate" (you drag up a card you peeked this turn).');
    }
    if (!this._consume(me, 'PULL')) throw new Error('No "Actually, Fate" to use.');
    const pos = this.lastFish.pos, n = this.lastFish.count;
    const off = Math.max(0, Math.min(offset || 0, n - 1));
    const card = this.future[pos + off];
    if (!card) { this.emit(`${me.name} "Actually, Fate" finds nothing to drag up.`); this.lastFish = null; return null; }
    this.future.splice(pos + off, 1);
    const at = Math.max(0, Math.min(presentAim == null ? 0 : presentAim, this.present.length));
    this.present.splice(at, 0, card);
    this.lastFish = null; // one action per fish
    this.emit(`${me.name} plays "Actually, Fate" -- drags ${card.label} (peeked at depth ${pos + off}) up into the Present at depth ${at}.`); return card;
  }
  useQuartermaster(cardId) { // U07: discard a hand card to the bottom of the Future
    const me = this.currentPlayer(); if (!this._consume(me, 'U07')) throw new Error('No Quartermaster\'s Favor to use.');
    const i = me.hand.findIndex((c) => c.id === cardId); if (i === -1) throw new Error('No such hand card.');
    const [c] = me.hand.splice(i, 1); this.future.push(c);
    this.emit(`${me.name} uses Quartermaster's Favor to ditch ${c.label} to the bottom of the Future.`); return c;
  }
  useFieldPromotion() { // U04: take an extra Fish action this turn
    const me = this.currentPlayer(); if (!this._consume(me, 'U04')) throw new Error('No Field Promotion to use.');
    this.lastFish = null; // allow another fish+plant this turn
    this.emit(`${me.name} uses Field Promotion -- an extra Fish action.`);
  }
  useTemporalInsertion(viewAim, handCardId, insertAim) { // U03: view 2, insert any hand card anywhere
    const me = this.currentPlayer(); if (!this._consume(me, 'U03')) throw new Error('No Temporal Insertion to use.');
    const vat = this._jitter(viewAim); const seen = this.future.slice(vat, vat + 2); this._seePrivate(seen, me.id);
    const i = me.hand.findIndex((c) => c.id === handCardId); if (i === -1) throw new Error('No such hand card.');
    // Temporal Insertion places EXACTLY (no jitter) -- that precision is its whole point.
    const [c] = me.hand.splice(i, 1); const iat = Math.max(0, Math.min(insertAim, this.future.length)); this.future.splice(iat, 0, c);
    this.emit(`${me.name} uses Temporal Insertion: views ~${vat}, inserts ${c.label} at ${iat} (exact).`); return seen;
  }
  reburyPotato(potatoId, aim) { // play a held potato back into the Future
    const me = this.currentPlayer();
    const i = me.hand.findIndex((c) => c.id === potatoId && c.type === 'potato'); if (i === -1) throw new Error('No such held potato.');
    const [c] = me.hand.splice(i, 1); const at = this._jitter(aim); this.future.splice(at, 0, c);
    this.emit(`${me.name} re-buries ${c.label} (${c.value}) at ~${at} -- someone else's problem now.`); return c;
  }

  // Plant a terminator ON one of the cards you just peeked (offset within the
  // peek window; 0 = the card at the cut). You must fish first.
  plant(terminatorId, offset = 0) {
    const me = this.currentPlayer();
    if (me.noPlant > 0) throw new Error(`${me.name} cannot plant (Static Cling, ${me.noPlant} turns left).`);
    if (!this.lastFish || this.lastFish.by !== me.id || this.lastFish.turn !== this.turn) {
      throw new Error('You must fish this turn before planting (you plant on what you peeked).');
    }
    const idx = me.hand.findIndex((c) => c.id === terminatorId && (c.type === 'terminator' || c.type === 'kyle'));
    if (idx === -1) throw new Error(`${me.name} does not hold unit ${terminatorId}.`);
    const off = Math.max(0, Math.min(offset || 0, this.lastFish.count - 1));
    const at = this.lastFish.pos + off;
    const [term] = me.hand.splice(idx, 1);
    // Pay-to-send: committing your hero burns a tribute card every time (even the first).
    // A spare terminator or one-shot -- never a potato (that's a reward, not a cost).
    if (term.type === 'kyle' && this.config.heroPlantCost) {
      const ti = this._heroTribute(me);
      if (ti === -1) { me.hand.push(term); throw new Error(`${me.name} holds no prize to spend -- ${term.label} can't be sent.`); }
      const [tribute] = me.hand.splice(ti, 1); // a kept prize: its points leave with it (total auto-drops)
      this.discard.push(tribute);
      this.emit(`  ${me.name} spends ${tribute.label} (worth ${tribute.locked || 0}) to send ${term.label} into the Future (total ${this.total(me)}).`);
    }
    if (me.glitched) { term.glitched = true; me.glitched = false; this.emit(`  (${term.label} is glitched -- it will surface empty.)`); }
    this.future.splice(at, 0, term);
    term.plantTurn = this.turn;
    const tgt = this.future[at + 1];
    term.plantTarget = tgt ? { id: tgt.id, type: tgt.type } : null;
    this.fishingStats.planted += 1;
    this.lastFish = null; // one plant per fish
    return this.emit(`${me.name} plants ${term.label} at depth ${at} (${me.hand.filter((c) => c.type === 'terminator').length} terminators left).`);
  }

  endTurn() {
    if (this.phase === 'choice') throw new Error('Resolve the pending take/send first.');
    if (this.phase === 'resolve') throw new Error('Resolve the top of the Present first.');
    this.enforceCap(this.currentPlayer());
    const msg = this.emit(`End of turn. Present ${this.present.length}, Future ${this.future.length}.`);
    this.scoreLog.push({ turn: this.turn, s: this.players.map((p) => this.total(p)) });
    this.lastFish = null;
    const cur = this.currentPlayer();
    cur.peekTurnBonus = 0; cur.extraFish = 0; // prize riders expire at end of turn
    if (cur.noPlant > 0) cur.noPlant -= 1; // Static Cling counts down per turn
    this.current = (this.current + 1) % this.players.length;
    this.phase = 'resolve';
    return msg;
  }

  // Hand cap: over the limit you must ditch to the bottom of the Future. Ditch order
  // (cheapest first): unused one-shots, then a spare terminator, then the LOWEST-value
  // kept prize (you lose those points -- use it or lose it), and only ever the hero as a
  // last resort. A stuck potato is shed first of all (good riddance -- it sheds its penalty).
  enforceCap(pl) {
    const cap = this.config.handCap;
    if (cap == null) return;
    const prio = (c) => c.type === 'potato' ? -1 : c.type === 'upgrade' ? 0 : c.type === 'terminator' ? 1
      : (c.type === 'prize' || c.type === 'neutral') ? 2 + (c.locked || 0) * 0.001 : 1e6; // hero last
    while (pl.hand.length > cap) {
      let idx = 0;
      for (let i = 1; i < pl.hand.length; i++) if (prio(pl.hand[i]) < prio(pl.hand[idx])) idx = i;
      const [c] = pl.hand.splice(idx, 1);
      this.future.push(c);
      this.emit(`${pl.name} is over the hand cap (${cap}) -- ditches ${c.label} to the Future.`);
    }
  }

  isOver() {
    if (!this.dealt) return false;
    if (this.instantWinner) return true; // Kyle + Sarah reunion = outright win
    // Primary end: the moment the last Sarah has left the board.
    if (this.sarahsLeft >= this.players.length) return true;
    // Fallback: deck fully drained.
    return this.present.length === 0 && this.future.length === 0;
  }
  // Live total = banked points (captured sidekicks, characters, star-cross) + the value
  // of every point-card you're HOLDING (prizes you kept, potatoes you're stuck with,
  // heroes). Single source of truth: held cards. Burn/ditch a card -> its points vanish
  // automatically, no counter to keep in sync.
  total(pl) {
    let h = 0;
    for (const c of pl.hand) {
      if (c.type === 'prize' || c.type === 'neutral') h += (c.locked || 0); // kept prizes
      else if (c.type === 'potato') h += c.value;                            // stuck potatoes (negative)
      else if (c.type === 'kyle') h += (c.value || 0);                       // heroes
    }
    return pl.score + h;
  }
  // Final score = live total at game end.
  finalScore(pl) {
    return this.total(pl);
  }
  standings() {
    const s = [...this.players].sort((a, b) => this.finalScore(b) - this.finalScore(a));
    if (this.instantWinner) { const w = this.player(this.instantWinner); return [w, ...s.filter((p) => p.id !== w.id)]; }
    return s;
  }

  _reveal(card, who) {
    const ids = who === 'all' ? this.players.map((p) => p.id) : [who];
    this.revealed[card.id] = ids;
  }

  // --- Persistence ----------------------------------------------------------
  snapshot() {
    const o = {};
    for (const k of ['players', 'config', 'seed', 'rngState', 'lastFish', 'future', 'present', '_pendingSarahs', 'dealt',
      'discard', 'turn', 'current', 'log', 'revealed', 'sarahsLeft', 'secondSight', 'instantWinner', 'pending', 'flipped', 'phase']) o[k] = this[k];
    return o;
  }
  static fromSnapshot(snap) { return Object.assign(Object.create(Game.prototype), snap); }
}

function signed(v) { return v >= 0 ? `+${v}` : `${v}`; }

module.exports = { Game, DEFAULT_CONFIG };
