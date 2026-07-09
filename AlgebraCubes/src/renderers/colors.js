// Color ALWAYS encodes type (kind + varName), and nothing else. The type
// alphabet is finite and fixed; only the VALUE rendering varies between
// renderers. This module is the one place type-color lives, shared by all
// renderers so the "color = type" invariant can't drift.

export const CUBE = 62; // px, the base cube edge

const VAR_COLORS = {
  x: { fill: '#4f8fd6', stroke: '#2f6fb0', ink: '#08243f' },
  y: { fill: '#9b6fd0', stroke: '#6f48b0', ink: '#22103f' },
  z: { fill: '#54b38a', stroke: '#2f8c66', ink: '#0b3527' },
};
const CONST_COLOR = { fill: '#e0a44b', stroke: '#b07d2e', ink: '#3a2a10' };

function hashColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const hue = h % 360;
  return { fill: `hsl(${hue} 55% 60%)`, stroke: `hsl(${hue} 55% 42%)`, ink: `hsl(${hue} 60% 18%)` };
}

export function typeColor(term) {
  if (term.kind === 'const') return CONST_COLOR;
  return VAR_COLORS[term.varName] ?? hashColor(term.varName);
}
