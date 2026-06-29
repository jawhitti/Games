// Paper Victory -- coarse model of the TERROR core (no euro).
//
// Two thrones (King/Crown, Pope/Mitre). Each round courtiers show PUBLIC allegiance
// (the record) and bank a SECRET conviction: Crown, Mitre, or "plague on both houses."
// At the reckoning the secret aggregate gives one of three weathers:
//   one-throne (a plurality): the pretender throne dies + its public backers are PURGED
//   both-die  ("neither" wins): both crowns burn, NO purge -- amnesty, the court walks
//   both-live (Crown ~= Mitre): both survive -> ALL courtiers suffer (sedition+apostasy)
// Each throne should end ~50% dead. The damned courtier's escape hatch: flip your secret
// vote to "neither" hoping for both-die (cancels the purge) -- a blind hail-mary.
//
// Secret AGENDAS (win conditions on the realm's end-state) drive the plotting:
//   zealotC/zealotM (your throne prevails), reformer (both die), ascetic (realm poor),
//   magnate (realm rich), survivor (you simply live).
//
// COARSE: it checks the reckoning skeleton + agenda balance. The terror itself -- the
// lying, the whispering -- is the table's, unmodelable as ever.

const { Rng } = require("./src/rng");

const CFG = {
  players: 6, rounds: 6,
  tieBand: 6,        // |Crown - Mitre| <= this (and not both-die) => both LIVE
  escapeRate: 0.3,   // a cornered courtier's chance/round to torch its vote to "neither"
  tax: 3, startWealth: 30, poorThreshold: 12, // realm wealth for ascetic/magnate
  predictNoise: 1.0,
};
const AGENDAS = ["zealotC", "zealotM", "reformer", "ascetic", "magnate", "survivor"];
const other = (c) => (c === "crown" ? "mitre" : "crown");

const NAMES = ["Vargo", "Ilsa", "Corvin", "Dax", "Mireille", "Brusk", "Oona", "Selk"];

function playGame(cfg, seed, log = null) {
  const rng = new Rng(seed);
  const players = [];
  let nm = 0;
  for (let i = 0; i < cfg.players; i++) {
    const role = i === 0 ? "king" : i === 1 ? "pope" : "courtier";
    players.push({
      role, name: role === "king" ? "the King" : role === "pope" ? "the Pope" : "House " + NAMES[nm++],
      agenda: role === "courtier" ? rng.pick(AGENDAS) : null,
      favor: { crown: 0, mitre: 0 },           // public record
      conv: { crown: 0, mitre: 0, neither: 0 }, // secret vote
      alive: true,
    });
  }
  const courtiers = players.filter((p) => p.role === "courtier");
  let wealth = cfg.startWealth;
  let escapeFlips = 0;
  if (log) for (const c of courtiers) log.push(`  ${c.name.padEnd(13)} sworn agenda: ${c.agenda}`);

  for (let r = 0; r < cfg.rounds; r++) {
    wealth -= cfg.tax + rng.noise(2);
    const fav = (c) => players.reduce((s, p) => s + p.favor[c], 0);
    const acts = [];
    for (const c of courtiers) {
      const predicted = fav("crown") + rng.noise(cfg.predictNoise * 2) >= fav("mitre") ? "crown" : "mitre";
      // public record: zealots wear their colors; everyone else hugs the apparent winner
      const lean = c.agenda === "zealotC" ? "crown" : c.agenda === "zealotM" ? "mitre" : predicted;
      c.favor[lean] += 1;
      // secret vote by agenda
      let vote = c.agenda === "zealotC" ? "crown" : c.agenda === "zealotM" ? "mitre"
        : c.agenda === "reformer" ? "neither" : predicted;
      // escape hatch: publicly stuck on the side that's losing -> maybe torch to "neither"
      const myLoser = c.favor[other(predicted)] > c.favor[predicted];
      let torched = false;
      if (myLoser && rng.chance(cfg.escapeRate)) { vote = "neither"; escapeFlips++; torched = true; }
      c.conv[vote] += 1;
      if (log) acts.push(`${c.name} kneels to the ${lean === "crown" ? "Crown" : "Mitre"}` +
        (torched ? `, but in secret torches its vote -- "a plague on both!"` :
          vote === lean ? "" : ` (secret heart: ${vote})`));
    }
    players[0].conv.crown += 1; // King
    players[1].conv.mitre += 1; // Pope
    if (log) {
      log.push(`\n  Round ${r + 1}  (realm treasury ~${Math.max(0, Math.round(wealth))})`);
      for (const a of acts) log.push(`    - ${a}`);
    }
  }

  const C = players.reduce((s, p) => s + p.conv.crown, 0);
  const M = players.reduce((s, p) => s + p.conv.mitre, 0);
  const N = players.reduce((s, p) => s + p.conv.neither, 0);
  let weather, legit = null;
  if (N > C && N > M) weather = "both-die";
  else if (Math.abs(C - M) <= cfg.tieBand) weather = "both-live";
  else { weather = "one-throne"; legit = C > M ? "crown" : "mitre"; }

  const kingDies = weather === "both-die" || (weather === "one-throne" && legit === "mitre");
  const popeDies = weather === "both-die" || (weather === "one-throne" && legit === "crown");

  // courtier survival
  for (const c of courtiers) {
    if (weather === "both-die") c.alive = true;
    else if (weather === "both-live") c.alive = false; // all suffer
    else c.alive = !(c.favor[other(legit)] > c.favor[legit]); // purged if backed pretender
  }

  // agenda satisfaction
  const sat = (c) => {
    switch (c.agenda) {
      case "zealotC": return weather === "one-throne" && legit === "crown" && c.alive;
      case "zealotM": return weather === "one-throne" && legit === "mitre" && c.alive;
      case "reformer": return weather === "both-die";
      case "ascetic": return wealth <= cfg.poorThreshold && c.alive;
      case "magnate": return wealth > cfg.poorThreshold && c.alive;
      case "survivor": return c.alive;
    }
  };
  if (log) {
    log.push(`\n  THE RECKONING.  secret tally  Crown ${C}  Mitre ${M}  "neither" ${N}`);
    if (weather === "both-die")
      log.push(`  Both crowns burn. No one rules -- and with no victor, there is no purge.`,
        `  The court walks free into the ashes. AMNESTY.`);
    else if (weather === "both-live")
      log.push(`  The vote splits dead even. Both thrones survive the night --`,
        `  and turn as one on the court. EVERY courtier answers for their sedition.`);
    else
      log.push(`  The ${legit === "crown" ? "Crown" : "Mitre"} is found legitimate; ` +
        `the ${legit === "crown" ? "Pope" : "King"} goes to the block.`,
        `  The new sovereign purges everyone who publicly knelt to the pretender.`);
    log.push("");
    for (const c of courtiers) {
      const won = sat(c) ? "  *** WINS ***" : "";
      log.push(`    ${c.name.padEnd(13)} ${c.alive ? "lives" : "PURGED"}  [${c.agenda}]${won}`);
    }
  }
  return {
    weather, kingDies, popeDies, escapeFlips, wealth,
    agendas: courtiers.map((c) => ({ agenda: c.agenda, won: sat(c) })),
  };
}

// ---- CLI ----
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) if (args[i] === "--set") { const [k, v] = args[i + 1].split("="); CFG[k] = Number(v); }
const cfg = CFG;

// story mode: replay a single seed with narration   node terror.js --story 42
if (args.includes("--story")) {
  const seed = parseInt(args[args.indexOf("--story") + 1], 10);
  const log = [];
  playGame(cfg, seed, log);
  console.log(`\n=== Paper Victory: a chronicle (seed ${seed}) ===`);
  console.log(log.join("\n"));
  process.exit(0);
}

// find mode: scan for one seed per flavor   node terror.js --find
if (args.includes("--find")) {
  const want = { "both-die": null, "both-live": null, "one-throne-escape": null, "ascetic-win": null, "survivor-loss": null };
  for (let s = 1; want && Object.values(want).some((v) => v === null) && s < 200000; s++) {
    const r = playGame(cfg, s);
    if (want["both-die"] === null && r.weather === "both-die") want["both-die"] = s;
    if (want["both-live"] === null && r.weather === "both-live") want["both-live"] = s;
    if (want["one-throne-escape"] === null && r.weather === "one-throne" && r.escapeFlips > 0) want["one-throne-escape"] = s;
    if (want["ascetic-win"] === null && r.agendas.some((a) => a.agenda === "ascetic" && a.won)) want["ascetic-win"] = s;
    if (want["survivor-loss"] === null && r.agendas.some((a) => a.agenda === "survivor" && !a.won)) want["survivor-loss"] = s;
  }
  console.log("representative seeds:", want);
  process.exit(0);
}

const n = args.includes("-n") ? parseInt(args[args.indexOf("-n") + 1], 10) : 20000;

const W = { "one-throne": 0, "both-die": 0, "both-live": 0 };
let kd = 0, pd = 0, flips = 0;
const ag = {}; for (const a of AGENDAS) ag[a] = { seen: 0, won: 0 };
for (let i = 0; i < n; i++) {
  const r = playGame(cfg, i + 1);
  W[r.weather]++; if (r.kingDies) kd++; if (r.popeDies) pd++; flips += r.escapeFlips;
  for (const a of r.agendas) { ag[a.agenda].seen++; if (a.won) ag[a.agenda].won++; }
}
const pct = (x, d) => ((100 * x) / d).toFixed(1) + "%";
console.log("=".repeat(58));
console.log(`  TERROR core model   (${n} games)  tieBand=${cfg.tieBand} escapeRate=${cfg.escapeRate}`);
console.log("=".repeat(58));
console.log("  Three weathers (want ~90 / 5 / 5):");
console.log(`    one throne dies  ${pct(W["one-throne"], n)}`);
console.log(`    BOTH die         ${pct(W["both-die"], n)}`);
console.log(`    BOTH live        ${pct(W["both-live"], n)}`);
console.log("  Each throne ~50% fucked:");
console.log(`    King dies ${pct(kd, n)}   Pope dies ${pct(pd, n)}`);
console.log(`  escape-hatch flips ${(flips / n).toFixed(2)}/game`);
console.log("  Agenda win rates (are they winnable / balanced?):");
for (const a of AGENDAS) console.log(`    ${a.padEnd(9)} ${pct(ag[a].won, ag[a].seen || 1)}  (appeared ${pct(ag[a].seen, n)})`);
