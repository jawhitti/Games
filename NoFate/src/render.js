// Plain-text rendering for NO FATE.

function scoreLine(game) {
  return game.players
    .map((p) => {
      const term = p.hand.filter((c) => c.type === 'terminator').length;
      const pot = p.hand.filter((c) => c.type === 'potato').length;
      const extra = [`term ${term}`];
      if (pot) extra.push(`potatoes ${pot}`);
      if (p.holdings.length) extra.push(`upg ${p.holdings.map((h) => h.catId).join(',')}`);
      if (p.peekBonus) extra.push(`peek+${p.peekBonus}`);
      return `${p.name} (${p.color}): ${game.finalScore(p)} pt | ${extra.join(' | ')}`;
    })
    .join('\n');
}

function table(game) {
  const lines = [];
  lines.push(`=== Turn ${game.turn} -- ${game.currentPlayer().name} | phase: ${game.phase} ===`);
  lines.push(`Present: ${game.present.length} FACE DOWN | Future: ${game.future.length} hidden | Sarahs left: ${game.sarahsLeft}${game.secondSight ? ' | Second Sight ON' : ''}`);
  if (game.pending) lines.push(`Pending choice: ${game.pending.label} (TAKE or SEND)`);
  lines.push('');
  lines.push(scoreLine(game));
  return lines.join('\n');
}

function recent(game, n = 12) {
  return game.log.slice(-n).map((e) => `  - ${e.msg}`).join('\n');
}

module.exports = { table, scoreLine, recent };
