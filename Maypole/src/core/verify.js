// Reachability verifier: BFS over (playerCell, R). Finite because R ranges
// over a finite subgroup (90/180 authored angles) and cells are finite.
//
// v1 model (deliberately optimistic — refine as the player model firms up):
//   - At a rest orientation R, a cell is PRESENT if its rotated 4-box's
//     w-interval contains 0 and its slice has positive volume. At rest
//     orientations rotated boxes are still axis-aligned, so this is exact
//     interval arithmetic, no general slicing needed.
//   - The player "is at" a present cell. Walking: any present cell whose
//     slice box touches the current one (gravity-blind: an upper bound on
//     what a real player can traverse; a level PROVEN unreachable here is
//     truly impossible, which is what chirality locks and sealed rooms
//     need proven).
//   - A switch fires from the cell containing its trigger point. If it has
//     an anchor, the player must be at the anchor's cell. After firing,
//     the player stays put if their cell is still present; otherwise they
//     fall — modeled as reaching any present cell (again optimistic).

import { mul, matKey, planeRotation, IDENTITY, apply, isMaypole } from './so4.js';
import { cellIndexAt } from './level.js';

const EPS = 1e-9;

// Rotate an axis-aligned 4-box by a signed-permutation R: still a box.
function rotatedBox(cell, R) {
  const a = apply(R, cell.min);
  const b = apply(R, cell.max);
  const min = a.map((v, i) => Math.min(v, b[i]));
  const max = a.map((v, i) => Math.max(v, b[i]));
  return { min, max };
}

// Present: the rotated box's w-interval contains 0. The slice is then the
// box's xyz extent (positive volume by cell validity).
function presentBox(cell, R) {
  const box = rotatedBox(cell, R);
  if (box.min[3] > EPS || box.max[3] < -EPS) return null;
  return box;
}

function boxesTouch(a, b) {
  for (let k = 0; k < 3; k++) {
    if (a.min[k] > b.max[k] + EPS || b.min[k] > a.max[k] + EPS) return false;
  }
  return true;
}

// All (cellIndex -> slice box) present at R.
function presentCells(level, R) {
  const out = new Map();
  for (const c of level.cells) {
    const box = presentBox(c, R);
    if (box) out.set(c.index, box);
  }
  return out;
}

// options.maypoleOnly drops every monkey-bar edge from the graph — the §9.5
// w-necessity restriction. A "needs w" level must fail verification under it.
export function verify(level, { allowedSwitchIds = null, maypoleOnly = false } = {}) {
  const switches = level.switches.filter(
    (s) =>
      (!allowedSwitchIds || allowedSwitchIds.includes(s.id)) &&
      (!maypoleOnly || isMaypole(s.plane))
  );
  const startCell = cellIndexAt(level, level.start);
  const goalCell = cellIndexAt(level, level.goal);

  const startKey = `${startCell}|${matKey(IDENTITY)}`;
  const parents = new Map([[startKey, null]]);
  const queue = [{ cell: startCell, R: [...IDENTITY], key: startKey }];
  const orientations = new Map([[matKey(IDENTITY), [...IDENTITY]]]);
  let goalState = null;

  const push = (cell, R, key, from, via) => {
    if (parents.has(key)) return;
    parents.set(key, { from, via });
    queue.push({ cell, R, key });
  };

  while (queue.length) {
    const { cell, R, key } = queue.shift();
    if (cell === goalCell) {
      goalState = key;
      break;
    }
    const present = presentCells(level, R);
    const myBox = present.get(cell);
    if (!myBox) continue; // shouldn't happen: states are created present

    // walk to touching present cells
    for (const [idx, box] of present) {
      if (idx === cell || !boxesTouch(myBox, box)) continue;
      push(idx, R, `${idx}|${matKey(R)}`, key, { type: 'walk', to: idx });
    }
    // fire switches triggered from this cell
    for (const s of switches) {
      if (cellIndexAt(level, s.trigger) !== cell) continue;
      if (s.anchor && cellIndexAt(level, s.anchor) !== cell) continue;
      const R2 = mul(planeRotation(s.plane, s.angle * s.dir), R);
      const k2 = matKey(R2);
      if (!orientations.has(k2)) orientations.set(k2, R2);
      const present2 = presentCells(level, R2);
      if (present2.has(cell)) {
        push(cell, R2, `${cell}|${k2}`, key, { type: 'switch', id: s.id });
      } else {
        // the player's ground vanished: they fall somewhere present
        for (const idx of present2.keys()) {
          push(idx, R2, `${idx}|${k2}`, key, { type: 'switch+fall', id: s.id, to: idx });
        }
      }
    }
  }

  // reconstruct path if the goal was reached
  let path = null;
  if (goalState) {
    path = [];
    let k = goalState;
    while (k) {
      const p = parents.get(k);
      if (p && p.via) path.push(p.via);
      k = p ? p.from : null;
    }
    path.reverse();
  }

  return {
    reachable: goalState !== null,
    path,
    statesExplored: parents.size,
    orientationsSeen: orientations.size,
    startCell,
    goalCell,
  };
}
