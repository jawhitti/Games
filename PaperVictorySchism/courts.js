// Paper Victory: Kings and Popes -- structural model of the castle-as-gallows loop.
//
// Houses take Holdings on CREDIT, posting a delegate (kin) to a throne's court as
// collateral. A throne funds its monument by CALLING DEBTS: the House pays, or the
// throne kills the hostage and seizes the land. Killing breeds fury; fury turns
// delegates into knives. A completed monument triggers the Reckoning, where each
// throne is judged by the loyalty of its own court -- and the builder it butchered
// to fund the build may vote it onto the block.
//
// The question this asks (and the ONLY thing bots can answer): is there a brutality
// at which a throne both FINISHES and SURVIVES, and how thin is that needle? The
// player layer -- aiming the axe, the whispers, the personal fury -- is the table's.

const { Rng } = require("./src/rng");

const CFG = {
  houses: 4, delegates: 3, rounds: 24,
  startCoin: 4, income: 2,
  holdingPrice: 6, holdingScore: 10,   // a holding: costs 6 to redeem, worth 10 at the end
  monumentCost: 90,                    // a monument is a long build -- most of the game's length
  rebellionMinRound: 12,               // no rebellion before the back half -- the simmer is guaranteed
  homeDelegateScore: 2,                // a kin kept safe at home is worth a little
  brutality: 0.5,                      // throne's per-round drive to call a debt when behind
  appetite: 0.7,                       // a House's per-round drive to take a holding on credit
  // fury -> betrayal: a posted delegate turns with this chance, rising with grudge
  turnBase: 0.08, turnPerGrudge: 0.22, turnCap: 0.9,
  grudgeKilled: 1.0,                   // grudge the bereaved House banks per kin killed
  grudgeWitnessFear: 0.6,              // a House with kin AT THIS COURT just watched a murder; it is next
  grudgeRepossess: 0.4,                // losing a granted land stings -- less than losing a child
  grudgeRippleHelp: 0.35,              // a distant rival's culling can please you (negative grudge)...
  grudgeRippleFear: 0.5,               // ...or frighten you (positive). table decides; we noise it.
  readNoise: 1.2,                      // how badly a cornered House misjudges the court's true fury
  pileOnWeight: 3,                     // weight the rival crown throws behind a rebellion it joins
  regicideTurnBias: 0.30,              // a Regicide House's kin turn knife far more readily
  zealotLoyalBias: 0.20,              // a Zealot's kin stay loyal to their chosen throne
  summonRate: 0.2,                     // move (c): a throne's per-round drive to summon a hostage
  grudgeSummon: 0.5,                   // a House forced to give up a child to court resents it
  agendaSweepBrutality: 0.6,           // brutality at which the per-agenda win-rates are reported
};
const AGENDAS = ["protector", "magnate", "zealot", "regicide"];

const other = (c) => (c === "king" ? "pope" : "king");

function makeGame(cfg, seed) {
  const rng = new Rng(seed);
  const ag = [];
  for (let i = 0; i < cfg.houses; i++) ag.push(AGENDAS[i % AGENDAS.length]);
  rng.shuffle(ag);
  const houses = [];
  for (let i = 0; i < cfg.houses; i++) {
    houses.push({
      id: i, name: "House " + ["Vargo", "Ilsa", "Corvin", "Dax", "Mireille", "Brusk"][i],
      agenda: ag[i],
      zThrone: ag[i] === "zealot" ? (rng.chance(0.5) ? "king" : "pope") : null,
      coin: cfg.startCoin,
      delegates: Array.from({ length: cfg.delegates }, (_, k) => ({
        name: ["a son", "a daughter", "an heir"][k] || "a cousin",
        loc: "home", alive: true, turned: false, holding: null, // holding = score value secured
      })),
      grudge: { king: 0, pope: 0 },
      gotFrom: { king: false, pope: false }, // which crowns this House has taken land from
    });
  }
  const throne = (c, name) => ({ color: c, name, monument: 0, killed: 0, stood: null });
  return {
    cfg, rng, houses,
    thrones: { king: throne("king", "the King"), pope: throne("pope", "the Pope") },
    trigger: null, round: 0, log: null,
  };
}

const posted = (g, color) => {
  const out = [];
  for (const h of g.houses) for (const d of h.delegates) if (d.alive && d.loc === color) out.push({ h, d });
  return out;
};

const postedCount = (h) => h.delegates.filter((d) => d.alive && d.loc !== "home").length;
const homeKin = (h) => h.delegates.filter((d) => d.alive && d.loc === "home").length;

// move (c): a throne summons a hostage outright -- a body, given nothing. it preys on the Houses
// hoarding kin at home (the turtling Protector), forcing a child into court where it is exposed at
// the Reckoning and may itself turn knife. refuse with a winnable read -> the rebellion fires.
function summon(g) {
  const { cfg, rng } = g;
  for (const color of ["king", "pope"]) {
    const t = g.thrones[color];
    if (t.monument >= cfg.monumentCost) continue;
    if (!rng.chance(cfg.summonRate)) continue;
    const candidates = g.houses.filter((h) => homeKin(h) > 0).sort((a, b) => homeKin(b) - homeKin(a));
    if (!candidates.length) continue;
    const h = candidates[0]; // the one hiding the most children
    if (g.round >= cfg.rebellionMinRound && (readsFall(g, color) || (h.agenda === "regicide" && rng.chance(0.35)))) {
      g.trigger = color; g.triggerKind = "rebellion"; g.rebellion = h;
      if (g.log) g.log.push(`    ${t.name} summons a hostage from ${h.name} -- they refuse and CALL THE REBELLION!`);
      return;
    }
    const d = h.delegates.find((x) => x.alive && x.loc === "home");
    d.loc = color; d.holding = 0; d.debt = 0; // a pure hostage: a body, no land, no debt
    h.grudge[color] += cfg.grudgeSummon;
    if (g.log) g.log.push(`    ${t.name} summons ${d.name} from ${h.name} to court -- a hostage, given nothing.`);
  }
}

// a House posts a delegate to a court it favors, taking a holding on credit it can't afford.
// agenda tilts the appetite: the Protector hoards kin at home, the Magnate leverages hard.
function seekHoldings(g) {
  const { cfg, rng } = g;
  for (const h of g.houses) {
    const ap = h.agenda === "magnate" ? Math.min(0.95, cfg.appetite * 1.5) : cfg.appetite;
    if (!rng.chance(ap)) continue;
    // the Protector is a hedger: it courts the crown it still lacks, then keeps its last kin home.
    if (h.agenda === "protector" && h.gotFrom.king && h.gotFrom.pope) continue;
    const free = h.delegates.find((d) => d.alive && d.loc === "home");
    if (!free) continue;
    // leverage is a choice: take the land on credit and keep your coin against the whim.
    // a Zealot sends kin to its throne; a Protector to the side it lacks; others to the court they resent less.
    const color = h.agenda === "zealot" ? h.zThrone
      : h.agenda === "protector" ? (h.gotFrom.king ? "pope" : h.gotFrom.pope ? "king" : (rng.chance(0.5) ? "king" : "pope"))
        : g.rng.noise(1) + (h.grudge.pope - h.grudge.king) >= 0 ? "king" : "pope";
    free.loc = color;
    free.holding = cfg.holdingScore; // the land it secured, scored only if the kin walks
    free.source = color;             // which crown granted it (the Protector wants one from each)
    free.debt = cfg.holdingPrice;
    h.gotFrom[color] = true;
    if (g.log) g.log.push(`    ${h.name} posts ${free.name} to ${g.thrones[color].name}'s court for an estate on credit`);
  }
}

// a cornered House reads whether the court's fury would topple this throne (imperfectly)
function readsFall(g, color) {
  const { cfg } = g;
  let exp = 0, n = 0;
  for (const { h } of posted(g, color)) {
    n++;
    exp += Math.min(cfg.turnCap, cfg.turnBase + cfg.turnPerGrudge * Math.max(0, h.grudge[color]));
  }
  return exp + g.rng.noise(cfg.readNoise) > n / 2; // expected knives beat half the hall?
}

// a murder radiates fury: the witnesses in the hall (next on the list), the table beyond (it decides)
function radicalize(g, killer, color) {
  const { cfg, rng } = g;
  const witnesses = new Set(posted(g, color).map((x) => x.h));
  for (const o of g.houses) {
    if (o === killer) continue;
    if (witnesses.has(o)) o.grudge[color] += cfg.grudgeWitnessFear;
    else o.grudge[color] += rng.noise(1) > 0 ? cfg.grudgeRippleFear * rng.float() : -cfg.grudgeRippleHelp * rng.float();
  }
}

// a throne behind on its monument presses a debtor. pay -> kin home with title. can't pay -> the
// refusal ladder: surrender a gift; stripped bare, give up the hostage OR call the rebellion NOW.
function callDebts(g) {
  const { cfg, rng } = g;
  for (const color of ["king", "pope"]) {
    const t = g.thrones[color];
    if (t.monument >= cfg.monumentCost) continue;
    if (!rng.chance(cfg.brutality)) continue;
    const debtors = posted(g, color).filter((x) => x.d.debt > 0);
    if (!debtors.length) continue;
    const { h, d } = rng.pick(debtors);

    if (h.coin >= d.debt) { // pays in coin: kin walks free with clean title
      h.coin -= d.debt; t.monument += d.debt; d.loc = "home"; d.debt = 0;
      if (g.log) g.log.push(`    ${t.name} calls ${h.name}'s debt -- paid; ${d.name} comes home with clean title.`);
      continue;
    }
    // refuses (can't pay). first the King takes back a gift, if there is one to return.
    const spare = h.delegates.find((x) => x.alive && x.loc === color && x.holding > 0 && x !== d);
    if (spare) {
      t.monument += spare.holding; spare.holding = 0; spare.loc = "home"; spare.debt = 0;
      h.grudge[color] += cfg.grudgeRepossess;
      if (g.log) g.log.push(`    ${t.name} presses ${h.name}; with no coin they yield a gift -- the land reverts.`);
      continue;
    }
    // nothing left to return: surrender the hostage to the block, OR detonate the rebellion now.
    // a Regicide House will roll the dice on a revolt it can't quite read; others need to see the fury.
    // but no one flips the table in the opening rounds -- the whispers must be earned first.
    const eager = h.agenda === "regicide" && rng.chance(0.35);
    if (g.round >= cfg.rebellionMinRound && (readsFall(g, color) || eager)) {
      g.trigger = color; g.triggerKind = "rebellion"; g.rebellion = h;
      if (g.log) g.log.push(`    ${t.name} presses ${h.name} -- nothing left to give. ${h.name} CALLS THE REBELLION!`);
      return; // straight to the Reckoning
    }
    d.alive = false; t.monument += cfg.holdingScore; t.killed++;
    h.grudge[color] += cfg.grudgeKilled;
    radicalize(g, h, color);
    if (g.log) g.log.push(`    ${t.name} presses ${h.name} -- nothing left. ${d.name} is KILLED, the land seized.`);
  }
}

// posted delegates settle loyalty: fury (grudge) makes a knife. agenda tilts the hand --
// Regicides itch to turn, Zealots cling to their chosen throne.
function settleLoyalty(g) {
  const { cfg } = g;
  for (const color of ["king", "pope"]) {
    for (const { h, d } of posted(g, color)) {
      let p = cfg.turnBase + cfg.turnPerGrudge * Math.max(0, h.grudge[color]);
      if (h.agenda === "regicide") p += cfg.regicideTurnBias;
      if (h.agenda === "zealot" && color === h.zThrone) p -= cfg.zealotLoyalBias;
      d.turned = g.rng.chance(Math.max(0, Math.min(cfg.turnCap, p)));
    }
  }
}

function courtCount(g, color) {
  let loyal = 0, turned = 0;
  for (const { d } of posted(g, color)) (d.turned ? turned++ : loyal++);
  return { loyal, turned };
}
function judgeThrone(g, color) {
  const { loyal, turned } = courtCount(g, color);
  return turned > loyal; // true => FALLS
}

function reckoning(g) {
  const { cfg } = g;
  settleLoyalty(g); // final loyalties reflect every grudge banked up to this moment
  const fell = { king: judgeThrone(g, "king"), pope: judgeThrone(g, "pope") };

  // the rival crown's choice: when a House rebels against one throne, the OTHER may pile on to
  // be rid of its only competitor -- a safe rival happily joins. its weight (pileOnWeight) is
  // thrown behind the revolt. but it exposes itself: if the coup fails anyway, the survivor turns
  // on the crown that backed it.
  g.piledOn = false;
  if (g.triggerKind === "rebellion") {
    const target = g.trigger, rival = other(target);
    if (!readsFall(g, rival)) { // rival reads itself safe -> seize the moment
      g.piledOn = true;
      const { loyal, turned } = courtCount(g, target);
      fell[target] = turned + cfg.pileOnWeight > loyal;
      if (!fell[target]) fell[rival] = true; // failed coup it backed -> the survivor destroys it
    }
  }
  g.thrones.king.stood = !fell.king;
  g.thrones.pope.stood = !fell.pope;
  const bothStand = !fell.king && !fell.pope;

  // resolve every posted delegate via the betrayal 2x2 (each by ITS OWN throne's fate)
  for (const color of ["king", "pope"]) {
    for (const { h, d } of posted(g, color)) {
      const throneFell = fell[color];
      const survives = throneFell ? d.turned : !d.turned; // loyal survives if throne stands; turned if it falls
      if (!survives) { d.alive = false; d.holding = null; }
      else d.loc = "home"; // walks home with title (d.holding kept)
    }
  }

  // win conditions diverge by agenda (multiple Houses can satisfy theirs)
  const rebellionWon = g.triggerKind === "rebellion" && fell[g.trigger]; // an uprising actually toppled a crown
  const aliveKin = (h) => h.delegates.filter((d) => d.alive).length;
  const wealth = (h) => h.coin + h.delegates.reduce((s, d) => s + (d.alive ? (d.holding || 0) : 0), 0);
  const maxWealth = Math.max(...g.houses.map(wealth));
  const sat = (h) => {
    switch (h.agenda) {
      case "protector": return aliveKin(h) === cfg.delegates  // every child home...
        && h.gotFrom.king && h.gotFrom.pope;                  // ...AND a foot in both camps (land from each crown)
      case "magnate": return wealth(h) === maxWealth && maxWealth > 0;     // richest at the table
      case "zealot": return !fell[h.zThrone] && g.thrones[h.zThrone].monument >= cfg.monumentCost; // your throne WINS
      case "regicide": return rebellionWon;                               // an uprising succeeds (chaos is a ladder)
    }
  };
  const agendas = g.houses.map((h) => ({ agenda: h.agenda, won: !!sat(h) }));

  const outcome = (color) => {
    const t = g.thrones[color];
    const done = t.monument >= cfg.monumentCost;
    if (done && t.stood) return "paper-victory";
    if (done && !t.stood) return "guillotine";
    return t.stood ? "survived" : "toppled";
  };
  return {
    trigger: g.trigger, triggerKind: g.triggerKind, round: g.round, bothStand, piledOn: g.piledOn,
    king: { ...outcome2(g, "king"), result: outcome("king") },
    pope: { ...outcome2(g, "pope"), result: outcome("pope") },
    agendas,
    kinKilled: g.houses.reduce((s, h) => s + h.delegates.filter((d) => !d.alive).length, 0),
  };
}
const outcome2 = (g, c) => ({ done: g.thrones[c].monument >= g.cfg.monumentCost, killed: g.thrones[c].killed, stood: g.thrones[c].stood });

function playGame(cfg, seed, log = null) {
  const g = makeGame(cfg, seed); g.log = log;
  if (log) for (const h of g.houses) log.push(`  ${h.name.padEnd(13)} agenda: ${h.agenda}${h.zThrone ? " (" + h.zThrone + ")" : ""}`);
  for (g.round = 1; g.round <= cfg.rounds; g.round++) {
    if (log) log.push(`\n  Round ${g.round}`);
    for (const h of g.houses) h.coin += cfg.income;
    seekHoldings(g);
    summon(g);
    if (g.trigger) break; // a summons refused -> rebellion
    callDebts(g);
    if (g.trigger) break; // a cornered House detonated the rebellion mid-round
    settleLoyalty(g);
    if (g.thrones.king.monument >= cfg.monumentCost) { g.trigger = "king"; g.triggerKind = "monument"; break; }
    if (g.thrones.pope.monument >= cfg.monumentCost) { g.trigger = "pope"; g.triggerKind = "monument"; break; }
  }
  if (!g.trigger) { g.trigger = "roundcap"; g.triggerKind = "roundcap"; }
  if (log) {
    const trg = g.triggerKind === "roundcap" ? "the round cap"
      : g.triggerKind === "rebellion" ? `${g.rebellion.name}'s rebellion against ${g.thrones[g.trigger].name}`
      : `${g.thrones[g.trigger].name}'s finished monument`;
    log.push(`\n  THE RECKONING (triggered by ${trg})`);
  }
  const r = reckoning(g);
  if (log) {
    if (r.piledOn) log.push(`    (the rival crown PILES ON the rebellion)`);
    for (const c of ["king", "pope"]) {
      const t = g.thrones[c];
      log.push(`    ${t.name}: monument ${t.monument}/${cfg.monumentCost}, killed ${t.killed} kin -> ` +
        `${t.stood ? "STANDS" : "FALLS"}  [${r[c].result}]`);
    }
    for (let i = 0; i < g.houses.length; i++) {
      const h = g.houses[i];
      const alive = h.delegates.filter((d) => d.alive).length;
      log.push(`    ${h.name.padEnd(13)} ${alive}/${cfg.delegates} kin alive  [${h.agenda}${h.zThrone ? " " + h.zThrone : ""}]` +
        `${r.agendas[i].won ? "  *** WINS ***" : ""}`);
    }
  }
  return r;
}

// ---- CLI ----
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) if (args[i] === "--set") { const [k, v] = args[i + 1].split("="); CFG[k] = Number(v); }

if (args.includes("--story")) {
  const seed = parseInt(args[args.indexOf("--story") + 1], 10);
  const log = [];
  playGame(CFG, seed, log);
  console.log(`\n=== Kings and Popes: a chronicle (seed ${seed}, brutality ${CFG.brutality}) ===`);
  console.log(log.join("\n"));
  process.exit(0);
}

const n = args.includes("-n") ? parseInt(args[args.indexOf("-n") + 1], 10) : 20000;
const pct = (x, d) => ((100 * x) / (d || 1)).toFixed(0) + "%";

function sweep(label, key, values, header) {
  console.log("=".repeat(82));
  console.log(`  KINGS AND POPES -- ${label}   (${n} games each)`);
  console.log("=".repeat(82));
  console.log(`  ${header}\n`);
  console.log(`  ${key.padEnd(9)}| finished | finishers STOOD/GUILL | TOPPLED early | rebel/game | kin/game`);
  console.log("  " + "-".repeat(78));
  for (const v of values) {
    CFG[key] = v;
    let finished = 0, stoodOfFin = 0, guillOfFin = 0, toppled = 0, kin = 0, thrones = 0, rebels = 0;
    for (let i = 0; i < n; i++) {
      const r = playGame(CFG, i + 1);
      kin += r.kinKilled;
      if (r.triggerKind === "rebellion") rebels++;
      for (const c of ["king", "pope"]) {
        thrones++;
        const res = r[c].result;
        if (res === "paper-victory") { finished++; stoodOfFin++; }
        else if (res === "guillotine") { finished++; guillOfFin++; }
        else if (res === "toppled") toppled++;
      }
    }
    console.log(`     ${String(v).padEnd(5)}| ${pct(finished, thrones).padStart(6)}   |   ` +
      `${pct(stoodOfFin, finished).padStart(4)} / ${pct(guillOfFin, finished).padStart(4)}        |     ` +
      `${pct(toppled, thrones).padStart(4)}     |    ${(rebels / n).toFixed(2)}    |  ${(kin / n).toFixed(2)}`);
  }
  console.log("");
}

if (args.includes("--lengths")) {
  const hist = {}; const kind = { monument: 0, rebellion: 0, roundcap: 0 }; let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = playGame(CFG, i + 1);
    const rd = Math.min(r.round, CFG.rounds + 1);
    hist[rd] = (hist[rd] || 0) + 1; sum += rd; kind[r.triggerKind]++;
  }
  console.log("=".repeat(60));
  console.log(`  GAME LENGTH   (${n} games)  roundCap=${CFG.rounds} monumentCost=${CFG.monumentCost}`);
  console.log("=".repeat(60));
  console.log(`  mean length: ${(sum / n).toFixed(1)} rounds`);
  console.log(`  triggered by: monument ${pct(kind.monument, n)} | rebellion ${pct(kind.rebellion, n)} | roundcap ${pct(kind.roundcap, n)}`);
  console.log("  round | share  (cumulative)");
  let cum = 0;
  for (let rd = 1; rd <= CFG.rounds + 1; rd++) {
    const c = hist[rd] || 0; cum += c;
    const bar = "#".repeat(Math.round((100 * c) / n));
    console.log(`   ${String(rd).padStart(3)}  | ${pct(c, n).padStart(5)}  (${pct(cum, n).padStart(5)})  ${bar}`);
  }
  process.exit(0);
}

if (args.includes("--costsweep")) {
  CFG.brutality = 1.0;
  sweep("the monument-cost lever (brutality fixed at 1.0)", "monumentCost", [24, 36, 48, 60, 72, 90],
    "If finishing REQUIRES more killing, does the furious court finally topple the builder?");
} else {
  sweep("the castle-as-gallows sweep", "brutality", [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
    "Does funding the monument build the gallows? (King & Pope symmetric, pooled.)");
  console.log("  Read: of throne that FINISHED, did it STAND (paper victory) or get GUILLOTINED");
  console.log("  (finished and fell)? TOPPLED early = fell to a rebellion before finishing.\n");

  // per-agenda win rates + pile-on rate, at a representative brutality
  CFG.brutality = CFG.agendaSweepBrutality;
  const ag = {}; for (const a of AGENDAS) ag[a] = { seen: 0, won: 0 };
  let piled = 0, rebellions = 0;
  for (let i = 0; i < n; i++) {
    const r = playGame(CFG, i + 1);
    if (r.piledOn) piled++;
    if (r.triggerKind === "rebellion") rebellions++;
    for (const a of r.agendas) { ag[a.agenda].seen++; if (a.won) ag[a.agenda].won++; }
  }
  console.log("=".repeat(82));
  console.log(`  AGENDAS -- win rates at brutality ${CFG.brutality}   (${n} games)`);
  console.log("=".repeat(82));
  for (const a of AGENDAS) console.log(`    ${a.padEnd(10)} wins ${pct(ag[a].won, ag[a].seen)}  (appeared in ${pct(ag[a].seen, n)} of games)`);
  console.log(`\n    rebellions: ${pct(rebellions, n)} of games   |   rival PILED ON: ${pct(piled, n)} of games`);
  console.log("\n  Try `node courts.js --costsweep` or `node courts.js --story <seed>`.");
}
