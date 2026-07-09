// The game around the tree: an action log, the one-change-per-day rule, and
// deterministic replay. A saved tree is just { seed, actions } — tiny, and
// enough to reconstruct every day of its life, which is exactly what the
// shareable timelapse replays.
//
// Real calendar gating lives at the edge (the UI decides when "today" is);
// the core only knows day NUMBERS, so tests and a debug stepper drive it
// the same way a year of real mornings would.

import { createTree } from './tree.js';
import { CONFIG } from './config.js';

// action = { day, type: 'prune'|'pinch'|'wire', segId, angle? }
export function createGame({ seed = 1, actions = [], config = CONFIG } = {}) {
  const log = [...actions].sort((a, b) => a.day - b.day);

  // Build the tree state as of `day` by replaying the log from scratch.
  // Order within a day: the tree grows overnight, THEN you make your change
  // (so a prune/wire on day D is visible immediately in the day-D tree).
  function simulateTo(day, { onDay = null } = {}) {
    const tree = createTree({ seed, config });
    applyDay(tree, 0); // day-0 actions (shaping the seedling) apply up front
    if (onDay) onDay(0, tree);
    for (let d = 1; d <= day; d++) {
      tree.growDay(d);
      applyDay(tree, d);
      tree.state.day = d;
      if (onDay) onDay(d, tree);
    }
    return tree;
  }

  function applyDay(tree, d) {
    for (const a of log) if (a.day === d) applyAction(tree, a);
  }

  function applyAction(tree, a) {
    if (a.type === 'prune') return tree.prune(a.segId);
    if (a.type === 'pinch') return tree.pinch(a.segId);
    if (a.type === 'wire') return tree.wire(a.segId, a.delta);
    return false;
  }

  return {
    seed,
    get log() {
      return log;
    },
    hasActionOn(day) {
      return log.some((a) => a.day === day);
    },
    // append an action on a day. No count limit — the real game will gate
    // acting on wall-clock time, not on how many changes you've made.
    // sort() is stable, so same-day actions keep insertion order (needed for
    // deterministic replay).
    act(day, action) {
      log.push({ ...action, day });
      log.sort((a, b) => a.day - b.day);
      return true;
    },
    simulateTo,
    // the timelapse: hand back every day's tree in sequence for the recorder
    frames(day) {
      const out = [];
      simulateTo(day, { onDay: (d, tree) => out.push({ day: d, tree }) });
      return out;
    },
    save() {
      return JSON.stringify({ seed, actions: log });
    },
  };
}

export function loadGame(json, config = CONFIG) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  return createGame({ seed: data.seed, actions: data.actions ?? [], config });
}
