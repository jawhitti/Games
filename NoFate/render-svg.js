// Render every NO FATE card. Used two ways:
//   node render-svg.js   -> one print-ready SVG per card in cards-svg/ (750x1050 = 2.5"x3.5" @ 300 DPI)
//   require('./render-svg') -> { buildCards, cardBody, cardSVG, W, H } for the sheet layout (render-sheets.js)
// Category glyphs are drawn as VECTOR SHAPES (not font chars) so they survive
// SVG->PNG conversion regardless of the converter's fonts. Zero deps.
// Data-driven from src/catalog.js (DEFS) + src/cards.js (PAIRS).

const fs = require('fs');
const path = require('path');
const { DEFS } = require('./src/catalog');
const { PAIRS } = require('./src/cards');

const W = 750, H = 1050, M = 48;            // card size + margin
const OUT = path.join(__dirname, 'cards-svg');

const CAT = {
  prize:      { label: 'PRIZE',      color: '#b8901f' },
  upgrade:    { label: 'UPGRADE',    color: '#2f6fb0' },
  downgrade:  { label: 'DOWNGRADE',  color: '#a83333' },
  potato:     { label: 'HOT POTATO', color: '#9c5a22' },
  neutral:    { label: 'NEUTRAL',    color: '#666666' },
  character:  { label: 'CHARACTER',  color: '#7d44a0' },
  global:     { label: 'GLOBAL',     color: '#1f9aa8' },
  kyle:       { label: 'HERO',       color: '#268a4e' },
  sarah:      { label: 'SIDEKICK',   color: '#268a4e' },
  terminator: { label: 'TERMINATOR', color: '#3a3a3a' },
  pairid:     { label: 'YOUR PAIR',  color: '#268a4e' },
};

// A distinct HEART color per pair, so a couple's three cards (protectee + rescuer +
// pair card) read as a set at a glance.
const PAIR_COLORS = {
  sarah: '#d32f2f', rachel: '#1565c0', marty: '#ef6c00', trinity: '#f9a825', leia: '#7b1fa2', newt: '#c2185b',
};
function heart(cx, cy, r, fill) {
  return `<path d="M ${cx} ${(cy + 0.4 * r).toFixed(1)} C ${(cx + r).toFixed(1)} ${(cy - 0.25 * r).toFixed(1)} ${(cx + 0.5 * r).toFixed(1)} ${(cy - 0.95 * r).toFixed(1)} ${cx} ${(cy - 0.35 * r).toFixed(1)} C ${(cx - 0.5 * r).toFixed(1)} ${(cy - 0.95 * r).toFixed(1)} ${(cx - r).toFixed(1)} ${(cy - 0.25 * r).toFixed(1)} ${cx} ${(cy + 0.4 * r).toFixed(1)} Z" fill="${fill}"/>`;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
function tspans(text, x, y, maxChars, lh) {
  return wrap(text, maxChars).map((l, i) => `<tspan x="${x}" y="${y + i * lh}">${esc(l)}</tspan>`).join('');
}

function poly(pts, fill) { return `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}"/>`; }
function starPts(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5; const rad = i % 2 ? r * 0.42 : r; p.push([(cx + rad * Math.cos(ang)).toFixed(1), (cy + rad * Math.sin(ang)).toFixed(1)]); }
  return p;
}
function hexPts(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 6; i++) { const ang = -Math.PI / 2 + i * Math.PI / 3; p.push([(cx + r * Math.cos(ang)).toFixed(1), (cy + r * Math.sin(ang)).toFixed(1)]); }
  return p;
}
function glyphShape(kind, cx, cy, r, fill = '#ffffff') {
  const wf = fill;
  switch (kind) {
    case 'prize': return poly([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], wf);
    case 'upgrade': return poly([[cx, cy - r], [cx + r, cy + r * 0.82], [cx - r, cy + r * 0.82]], wf);
    case 'downgrade': return poly([[cx, cy + r], [cx + r, cy - r * 0.82], [cx - r, cy - r * 0.82]], wf);
    case 'neutral': return `<circle cx="${cx}" cy="${cy}" r="${r * 0.85}" fill="none" stroke="${wf}" stroke-width="7"/>`;
    case 'potato': return `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.7}" transform="rotate(-18 ${cx} ${cy})" fill="${wf}"/>`;
    case 'character': return `<circle cx="${cx}" cy="${cy - r * 0.45}" r="${r * 0.42}" fill="${wf}"/><path d="M ${cx - r * 0.8} ${cy + r} Q ${cx} ${cy - r * 0.1} ${cx + r * 0.8} ${cy + r} Z" fill="${wf}"/>`;
    case 'global': return poly([[cx + r * 0.25, cy - r], [cx - r * 0.55, cy + r * 0.15], [cx - r * 0.02, cy + r * 0.15], [cx - r * 0.25, cy + r], [cx + r * 0.55, cy - r * 0.15], [cx + r * 0.02, cy - r * 0.15]], wf);
    case 'kyle': return `<path d="M ${cx - r} ${cy - r * 0.85} L ${cx + r} ${cy - r * 0.85} L ${cx + r} ${cy + r * 0.2} Q ${cx + r} ${cy + r * 0.8} ${cx} ${cy + r} Q ${cx - r} ${cy + r * 0.8} ${cx - r} ${cy + r * 0.2} Z" fill="${wf}"/>`;
    case 'sarah': return poly(starPts(cx, cy, r), wf);
    case 'terminator': return poly(hexPts(cx, cy, r), wf);
    default: return `<circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="${wf}"/>`;
  }
}
function timingMark(timing, x, y) {
  if (timing === 'lasting') return `<circle cx="${x - 11}" cy="${y}" r="12" fill="none" stroke="#fff" stroke-width="5"/><circle cx="${x + 11}" cy="${y}" r="12" fill="none" stroke="#fff" stroke-width="5"/>`;
  if (timing === 'one-shot') return `<circle cx="${x}" cy="${y}" r="13" fill="#fff"/>`;
  return '';
}

const DYN_TEXT = {
  myMachines: (v) => `Worth ${v} + 1 per machine YOU have planted.`,
  machinesInPlay: (v) => `Worth ${v} + 1 per machine in play (anyone's).`,
  rivalMachines: (v) => `Worth ${v} + 1 per RIVAL machine in play.`,
  sidekicksGone: (v) => `Worth ${v} + 1 per sidekick already gone.`,
  sidekicksLeft: (v) => `Worth ${v} + 1 per sidekick still in play.`,
  fewerHandMachines: (v) => `Worth ${v} + (5 - your machines in hand).`,
  handSize: () => `Worth 1 per card in your hand.`,
  reunionDead: (v) => `Worth ${v}, doubled to ${v * 2} if your sidekick is lost.`,
  reunionAlive: (v) => `Worth ${v}, doubled to ${v * 2} while your sidekick lives.`,
};

function scoring(c) {
  switch (c.kind) {
    case 'prize':
      if (c.valueLadder) return 'CLOCK LADDER -- worth 1 to 8 by how many sidekicks have left, scored when you take it.';
      if (c.dyn) return DYN_TEXT[c.dyn] ? DYN_TEXT[c.dyn](c.value) : `Worth +${c.value}.`;
      if (c.onTake === 'sacrifice') return `Worth +${c.value} -- but throw one card from your hand into the cause.`;
      return `Worth +${c.value} when taken.`;
    case 'neutral': return `Worth ${c.value || 0}${c.onTake === 'peek1' ? ' -- on take, peek +1 this turn.' : ' -- a spacer.'}`;
    case 'upgrade': return c.timing === 'lasting' ? 'No points -- a LASTING ability (kept face-up).' : 'No points -- a ONE-SHOT ability.';
    case 'downgrade': return 'No points -- an affliction that lands on you.';
    case 'character': return c.value < 0 ? `Pay ${c.value} points for its aura (kept face-up).` : `Worth ${c.value}.`;
    case 'potato': return `${c.value} at game end if still in hand. Playable: bury it in the Future.`;
    case 'global': return 'No points -- fires the instant it surfaces; cannot be taken, sent, looted, or yeeted.';
    case 'kyle': return 'No points on its own -- send it onto your sidekick for an INSTANT WIN (sending costs a prize). Worth nothing if never used.';
    case 'sarah': return 'Leaves on the 1-2-4-8 ladder by order (x2 if captured); or your hero reaches her for an INSTANT WIN.';
    case 'terminator': return 'No points. Plant it; on surface its convoy drags the card below home to the top machine.';
    case 'pairid': return `${c.hero} starts in your hand; ${c.who} is lost in the deck. Bring them home together for an INSTANT WIN.`;
    default: return '';
  }
}

// Inner card markup (0,0 .. W,H). `uid` keeps clipPath ids unique when many are
// placed on one sheet. Inherits font-family from the enclosing <svg>.
// The per-player "YOUR PAIR" identity card: declares your couple, big colored heart.
function pairIdBody(c, uid) {
  const col = c.heart || '#268a4e';
  const cid = 'clip-' + uid;
  return `  <defs><clipPath id="${cid}"><rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="36"/></clipPath></defs>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="36" fill="#fbfaf7" stroke="#1a1a1a" stroke-width="6"/>
  <g clip-path="url(#${cid})">
    <rect x="0" y="0" width="${W}" height="150" fill="#268a4e"/>
    ${heart(86, 78, 40, '#ffffff')}
    <text x="150" y="92" fill="#fff" font-size="34" font-weight="bold" letter-spacing="2">YOUR PAIR</text>
    <text x="${W / 2}" y="258" fill="#141414" font-size="46" font-weight="bold" text-anchor="middle">${esc(c.who)}</text>
    <text x="${W / 2}" y="322" fill="#6a6258" font-size="34" font-style="italic" text-anchor="middle">&amp;</text>
    <text x="${W / 2}" y="388" fill="#141414" font-size="46" font-weight="bold" text-anchor="middle">${esc(c.hero)}</text>
    ${heart(W / 2, 615, 135, col)}
    <rect x="${M}" y="852" width="${W - 2 * M}" height="150" rx="16" fill="${col}1a" stroke="${col}" stroke-width="2.5"/>
    <text x="${M + 22}" y="888" fill="${col}" font-size="22" font-weight="bold" letter-spacing="2">HOW YOU WIN</text>
    <text x="${M + 22}" y="922" fill="#222" font-size="26">${tspans(scoring(c), M + 22, 922, 44, 34)}</text>
  </g>`;
}

function cardBody(c, uid = 'c') {
  if (c.kind === 'pairid') return pairIdBody(c, uid);
  const cat = CAT[c.kind] || CAT.neutral;
  const accent = c.accent || cat.color;
  const cx = W / 2;
  const titleLines = wrap(c.title, 18);
  const titleY = 230;
  const descY = titleY + titleLines.length * 52 + 40;
  let label = cat.label;
  if (c.kind === 'upgrade') label += c.timing === 'lasting' ? '  ·  LASTING' : '  ·  ONE-SHOT';
  if (c.colorName) label += '  ·  ' + c.colorName;
  const copies = c.copies != null ? `x${c.copies}` : '';
  const cid = 'clip-' + uid;
  return `  <defs><clipPath id="${cid}"><rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="36"/></clipPath></defs>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="36" fill="#fbfaf7" stroke="#1a1a1a" stroke-width="6"/>
  <g clip-path="url(#${cid})">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${accent}" opacity="0.09"/>
    <g opacity="0.20">${glyphShape(c.kind, cx, 520, 168, accent)}</g>
    <rect x="0" y="0" width="${W}" height="150" fill="${accent}"/>
    ${glyphShape(c.kind, 86, 75, 42)}
    ${c.kind === 'upgrade' ? timingMark(c.timing, 150, 118) : ''}
    <text x="${c.kind === 'upgrade' ? 185 : 150}" y="68" fill="#fff" font-size="34" font-weight="bold" letter-spacing="2">${esc(label)}</text>
    ${c.heart ? heart(W - 60, 66, 30, c.heart) : (copies ? `<text x="${W - 34}" y="58" fill="#fff" font-size="30" font-weight="bold" text-anchor="end">${esc(copies)}</text>` : '')}
    <text x="${cx}" y="${titleY}" fill="#141414" font-size="48" font-weight="bold" text-anchor="middle">${titleLines.map((l, i) => `<tspan x="${cx}" y="${titleY + i * 52}">${esc(l)}</tspan>`).join('')}</text>
    <line x1="${M}" y1="${descY - 28}" x2="${W - M}" y2="${descY - 28}" stroke="#cfc9bb" stroke-width="2"/>
    <text x="${M}" y="${descY}" fill="#2a2a2a" font-size="31">${tspans(c.desc, M, descY, 40, 41)}</text>
    <text x="${cx}" y="745" fill="#6a6258" font-size="27" font-style="italic" text-anchor="middle">${wrap('“' + (c.flavor || '') + '”', 42).map((l, i) => `<tspan x="${cx}" y="${745 + i * 35}">${esc(l)}</tspan>`).join('')}</text>
    <rect x="${M}" y="852" width="${W - 2 * M}" height="150" rx="16" fill="${accent}1a" stroke="${accent}" stroke-width="2.5"/>
    <text x="${M + 22}" y="888" fill="${accent}" font-size="22" font-weight="bold" letter-spacing="2">SCORING</text>
    <text x="${M + 22}" y="922" fill="#222" font-size="26">${tspans(scoring(c), M + 22, 922, 44, 34)}</text>
  </g>`;
}

function cardSVG(c) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Georgia, 'Times New Roman', serif">
${cardBody(c, c.id)}
</svg>`;
}

function buildCards() {
  const cards = [];
  for (const d of DEFS) cards.push({ id: d.id, kind: d.kind, title: d.name, copies: d.copies, timing: d.timing, value: d.value, valueLadder: d.valueLadder, scaleWithSarahs: d.scaleWithSarahs, dyn: d.dyn, onTake: d.onTake, desc: d.desc || '', flavor: d.flavor || '' });
  for (const pr of PAIRS) {
    const col = PAIR_COLORS[pr.id];
    cards.push({ id: 'pair-' + pr.id, kind: 'pairid', pairId: pr.id, heart: col, who: pr.who, hero: pr.hero, flavor: pr.flavor });
    cards.push({ id: 'hero-' + pr.id, kind: 'kyle', pairId: pr.id, heart: col, title: pr.hero, desc: `Yours from the start (in hand). Send them into the deck to reach ${pr.who} for an INSTANT WIN. Beats a machine above them, dies to one below, whiffs on the wrong sidekick. Sending them costs a prize.`, flavor: pr.flavor });
    cards.push({ id: 'sk-' + pr.id, kind: 'sarah', pairId: pr.id, heart: col, title: pr.who, desc: `Your other half, lost deep in the deck. They walk home alone for points, or your hero ${pr.hero} reaches them for the reunion. Keep them in play until you can win.`, flavor: pr.flavor });
  }
  // One terminator design per player color (×5 each), same six colors as the pair
  // hearts so a player's machines and their couple read as one color set.
  const TCOLORS = [['RED', '#d32f2f'], ['BLUE', '#1565c0'], ['ORANGE', '#ef6c00'], ['GOLD', '#f9a825'], ['PURPLE', '#7b1fa2'], ['MAGENTA', '#c2185b']];
  for (const [name, hex] of TCOLORS) {
    cards.push({ id: 'terminator-' + name.toLowerCase(), kind: 'terminator', accent: hex, colorName: name, copies: 5, title: 'Terminator', desc: 'Your machine — you start with five, and they’re REUSABLE: after hauling the card below home it returns to your hand to replant. It buddy-chains down through other machines and drags the first non-machine home — the whole convoy to the TOP machine’s owner; the buddies it sweeps up are out of commission.', flavor: 'It can’t be bargained with. It can’t be reasoned with.' });
  }
  return cards;
}

module.exports = { buildCards, cardBody, cardSVG, W, H };

if (require.main === module) {
  const cards = buildCards();
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) { if (f.endsWith('.svg')) fs.rmSync(path.join(OUT, f), { force: true }); } // clean regen -- no stale cards
  for (const c of cards) fs.writeFileSync(path.join(OUT, c.id + '.svg'), cardSVG(c));
  console.log(`Wrote ${cards.length} card SVGs to cards-svg/  (750x1050 px = 2.5"x3.5" @ 300 DPI)`);
}
