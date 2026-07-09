// Level data model — the exact §7 format:
// {
//   "id": "3-01-sealed-vault",
//   "cells": [ { "min": [x,y,z,w], "max": [x,y,z,w], "kind": "solid|floor|goal|start" } ],
//   "switches": [ { "id", "plane", "angle", "dir", "trigger": [x,y,z,w], "anchor": null|[x,y,z,w] } ],
//   "start": [x,y,z,w],
//   "goal":  [x,y,z,w],
//   "act": 3
// }
// Trigger/anchor/start/goal are points in the building's REST frame: they
// ride with the building under rotation, like everything else.

import { PLANES } from './so4.js';

const KINDS = ['solid', 'floor', 'goal', 'start'];

function isPoint4(p) {
  return Array.isArray(p) && p.length === 4 && p.every((v) => typeof v === 'number');
}

export function loadLevel(data) {
  const errors = [];
  if (typeof data.id !== 'string') errors.push('missing id');
  if (!Array.isArray(data.cells) || data.cells.length === 0) errors.push('no cells');
  const cells = (data.cells ?? []).map((c, i) => {
    if (!isPoint4(c.min) || !isPoint4(c.max)) errors.push(`cell ${i}: bad min/max`);
    else {
      for (let k = 0; k < 4; k++) {
        if (c.min[k] >= c.max[k]) errors.push(`cell ${i}: min >= max on axis ${k}`);
      }
    }
    if (!KINDS.includes(c.kind)) errors.push(`cell ${i}: bad kind '${c.kind}'`);
    return { min: c.min, max: c.max, kind: c.kind, index: i };
  });
  const switches = (data.switches ?? []).map((s, i) => {
    if (!PLANES.includes(s.plane)) errors.push(`switch ${i}: bad plane '${s.plane}'`);
    if (s.angle !== 90 && s.angle !== 180) errors.push(`switch ${i}: angle must be 90 or 180`);
    if (s.dir !== 1 && s.dir !== -1) errors.push(`switch ${i}: dir must be 1 or -1`);
    if (!isPoint4(s.trigger)) errors.push(`switch ${i}: bad trigger`);
    if (s.anchor !== null && s.anchor !== undefined && !isPoint4(s.anchor)) {
      errors.push(`switch ${i}: bad anchor`);
    }
    return { id: s.id ?? `s${i}`, plane: s.plane, angle: s.angle, dir: s.dir ?? 1,
      trigger: s.trigger, anchor: s.anchor ?? null };
  });
  if (!isPoint4(data.start)) errors.push('bad start');
  if (!isPoint4(data.goal)) errors.push('bad goal');
  if (errors.length) throw new Error(`level '${data.id ?? '?'}': ${errors.join('; ')}`);

  const level = {
    id: data.id,
    act: data.act ?? 1,
    needsW: data.needsW ?? false, // §9.5: tagged levels must FAIL maypole-only BFS
    cells,
    switches,
    start: data.start,
    goal: data.goal,
  };
  // start/goal/triggers must live inside a cell (rest frame)
  for (const [name, p] of [['start', level.start], ['goal', level.goal]]) {
    if (cellIndexAt(level, p) === -1) throw new Error(`level '${level.id}': ${name} is not inside any cell`);
  }
  for (const s of switches) {
    if (cellIndexAt(level, s.trigger) === -1) {
      throw new Error(`level '${level.id}': switch ${s.id} trigger is not inside any cell`);
    }
    if (s.anchor && cellIndexAt(level, s.anchor) === -1) {
      throw new Error(`level '${level.id}': switch ${s.id} anchor is not inside any cell`);
    }
  }
  return level;
}

// Which cell contains this rest-frame point? (-1 if none; boundaries count.)
export function cellIndexAt(level, p, eps = 1e-9) {
  for (const c of level.cells) {
    let inside = true;
    for (let k = 0; k < 4; k++) {
      if (p[k] < c.min[k] - eps || p[k] > c.max[k] + eps) {
        inside = false;
        break;
      }
    }
    if (inside) return c.index;
  }
  return -1;
}
