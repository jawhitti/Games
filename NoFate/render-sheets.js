// Lay the cards out 6-per-8x10 print sheet (3 cols x 2 rows), exact 2.5"x3.5"
// cards, centered with safe margins and crop-mark ticks for cutting.
// 2400x3000 px = 8"x10" @ 300 DPI.  ->  cards-sheets/sheet-NN.svg
//   node render-sheets.js
//   pwsh svg-to-png.ps1 -SvgDir cards-sheets -PngDir cards-sheets-png -Width 2400 -Height 3000

const fs = require('fs');
const path = require('path');
const { buildCards, cardBody, W, H } = require('./render-svg');

const SW = 2400, SH = 3000, COLS = 3, ROWS = 2, PER = COLS * ROWS;
const bw = COLS * W, bh = ROWS * H;
const ox = Math.round((SW - bw) / 2), oy = Math.round((SH - bh) / 2); // 75, 450
const OUT = path.join(__dirname, 'cards-sheets');

// Expand each design into its real physical count (copies): catalog cards by their
// `copies`, terminators x5 per color, pair/identity cards x1. The sheets are the
// COMPLETE deck -- print them and you have every card you need, no manual duplicating.
const designs = buildCards();
const cards = [];
for (const c of designs) { const n = Number.isInteger(c.copies) ? c.copies : 1; for (let k = 0; k < n; k++) cards.push(c); }
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) { if (f.endsWith('.svg')) fs.rmSync(path.join(OUT, f), { force: true }); } // clean regen
const pages = Math.ceil(cards.length / PER);

for (let p = 0; p < pages; p++) {
  const slice = cards.slice(p * PER, (p + 1) * PER);
  const ticks = [];
  for (let c = 0; c <= COLS; c++) {
    const x = ox + c * W;
    ticks.push(`<line x1="${x}" y1="${oy - 34}" x2="${x}" y2="${oy - 8}" stroke="#999" stroke-width="1"/>`);
    ticks.push(`<line x1="${x}" y1="${oy + bh + 8}" x2="${x}" y2="${oy + bh + 34}" stroke="#999" stroke-width="1"/>`);
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = oy + r * H;
    ticks.push(`<line x1="${ox - 34}" y1="${y}" x2="${ox - 8}" y2="${y}" stroke="#999" stroke-width="1"/>`);
    ticks.push(`<line x1="${ox + bw + 8}" y1="${y}" x2="${ox + bw + 34}" y2="${y}" stroke="#999" stroke-width="1"/>`);
  }
  let body = '';
  slice.forEach((card, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    body += `<g transform="translate(${ox + col * W} ${oy + row * H})">${cardBody(card, p + '-' + i)}</g>\n`;
  });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" font-family="Georgia, 'Times New Roman', serif">
<rect width="${SW}" height="${SH}" fill="#ffffff"/>
${ticks.join('\n')}
${body}</svg>`;
  fs.writeFileSync(path.join(OUT, 'sheet-' + String(p + 1).padStart(2, '0') + '.svg'), svg);
}
console.log(`Wrote ${pages} sheets (6 cards each, 8x10 @ 300 DPI, ${cards.length} cards) to cards-sheets/`);
