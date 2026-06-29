// Paper Victory: Phase 1 (the Campaign) + Phase 2 (the Coronation).
//
// SIX players, each the lord of one of the six Houses, over FIVE elimination rounds.
// Each has a hidden color and a `crownDesire` (how hard they chase the throne). Each
// round a committed candidate spends down their war-chest to win support; some of that
// flows to the others as courting. The least-supported candidate is eliminated -- but
// KEEPS its remaining hand (banked leverage) and stays a Noble of its House. The last
// one standing is crowned King: he VACATES HIS HOUSE (gives up being its lord) and
// his threats are voided. So the reign's five nobles are the five Houses whose lords
// did NOT win; the King belongs to no House (judged only on the lands he holds).
//
// HONEST ABSTRACTION: real blind negotiation is collapsed to "spend = support". This
// measures the mechanical skeleton (elimination + banked leverage + colors), not
// whether the dealmaking is fun. Its payoff: feeding the reign end-to-end, and
// answering the doc's key Phase-1 question -- is being eliminated as good as winning?

const { Rng } = require("./rng");
const { HOUSES, shuffle } = require("./bots");

function runCampaign(cfg, seed, rec) {
  const rng = new Rng(seed);
  const houses = shuffle(HOUSES.slice(), rng); // which lord is which House
  const players = [];
  for (let i = 0; i < cfg.players; i++) {
    players.push({
      id: i,
      house: houses[i % houses.length], // {name, kind, edge}
      color: rng.chance(0.5) ? "red" : "black",
      coin: cfg.campStartCoin,
      promises: 0,
      threats: 1, // must accept a threat to even run -- no clean kings
      crownDesire: rng.float(), // the strategy variable: chase the crown, or bank?
      candidate: true,
      isKing: false,
      elimRank: -1, // 1 = first eliminated (best-armed loser); King gets the top rank
    });
  }

  if (rec) {
    rec.push(`### THE CAMPAIGN -- six lords vie for the throne (colors hidden) ###`);
    for (const p of players)
      rec.push(`  Lord of ${p.house.name} (${p.house.kind}) -- ambition ${p.crownDesire.toFixed(2)}.`);
  }

  let remaining = players.slice();
  let rank = 1;
  let round = 0;
  while (remaining.length > 1) {
    round += 1;
    const spends = new Map();
    for (const c of remaining) {
      const spend = Math.min(c.coin, c.coin * c.crownDesire * cfg.campSpendRate);
      c.coin -= spend;
      c.threats += 1; // staying in means shouldering another obligation
      c.support = spend + rng.noise(cfg.campNoise * 2);
      spends.set(c.id, spend);
    }
    // courting: a share of each spend flows to every OTHER player (woo the electorate)
    for (const [spenderId, spend] of spends) {
      const gift = (spend * cfg.campCourtShare) / (players.length - 1);
      for (const p of players) {
        if (p.id === spenderId) continue;
        p.coin += gift;
        p.promises += gift * 0.15; // some courting is recorded as promises owed
      }
    }
    remaining.sort((a, b) => a.support - b.support || a.coin - b.coin);
    const out = remaining.shift();
    out.candidate = false;
    out.elimRank = rank++;
    if (rec)
      rec.push(
        `  Round ${round}: ${out.house.name}, least supported, is cast from the running -- ` +
          `and banks a full hand (coin ${Math.round(out.coin)}, ${out.threats} threats) for the reign.`
      );
  }

  // coronation
  const king = remaining[0];
  king.isKing = true;
  king.elimRank = players.length; // top rank
  king.threats = 0; // voided on ascension
  king.vacatedHouse = king.house; // he gives up his lordship; this House sits vacant
  const winColor = king.color;
  for (const p of players) {
    p.losing = p.color !== winColor; // burned bloc = wrong color (relative to the king)
    p.coin = Math.round(p.coin);
    p.promises = Math.round(p.promises);
  }
  if (rec) {
    rec.push(
      `  CORONATION: the Lord of ${king.house.name} outlasts them all and is crowned KING -- ` +
        `vacating his House, his campaign threats forgiven, his war-chest spent (coin ${king.coin}).`
    );
    rec.push(`  The colors flip: the king flies ${winColor.toUpperCase()} -- the winning color.`);
    const burned = players.filter((p) => p.losing && !p.isKing).map((p) => p.house.name);
    rec.push(`  Burned (backed the wrong color), the natural rebels: ${burned.join(", ") || "(none)"}.`);
  }
  return { players, kingId: king.id, winColor };
}

module.exports = { runCampaign };
