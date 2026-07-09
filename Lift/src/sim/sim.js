// Lift — Layer 1 simulation core. Pure module: no DOM, no rendering, no I/O.
//
// The one non-negotiable: balloon size lives in LOG SPACE (natural log).
// Growth is d(logVolume)/dt, never `volume *= rate`. Linear volume is
// materialized only at boundaries (lift computation, rain inflow, prices),
// and rain/price arithmetic goes through log1p so tiny-vs-huge stays stable.
//
// The governing rule, in log space:
//   d(logV_i)/dt = growthRate_i * flicker_i  -  totalLoad / totalVolume  -  leakDrain
// The first term is compounding (returns reinvested); the second draws the
// load pro-rata from the fleet's volume — when load exceeds lift it shrinks
// the balloons, which shrinks lift, which deepens the deficit: the spiral.

import { CONFIG } from '../config.js';
import { makeRng, makeGauss } from '../rng.js';
import { clamp, lerp, logSumExp, mergeConfig } from './math.js';

export function createSim({ seed = 1, config = {} } = {}) {
  const C = mergeConfig(CONFIG, config);
  const rng = makeRng(seed);
  const gauss = makeGauss(rng);

  let nextId = 1;
  const state = {
    month: 0,
    altitude: C.altitude.start,
    maxAltitudeReached: C.altitude.start,
    grounded: false,
    balloons: [],
    creatures: [],
    entropy: {}, // kindId -> { level }
    rig: { x: C.rain.mapSize / 2, y: C.rain.mapSize / 2, tx: null, ty: null },
    regions: [],
    events: [],
    // Recomputed every tick; exposed for readouts and tests.
    derived: {
      totalLift: 0,
      totalLoad: 0,
      surplus: 0,
      logTotalVolume: -Infinity,
      rainInflow: 0,
      speed: 0,
      verticalRate: 0, // altitude units/month actually moved last tick
      entropyPressure: {}, // kindId -> { accrual, cleaning }
    },
  };

  // ---- construction helpers ----

  function rollRange([lo, hi]) {
    return lerp(lo, hi, rng());
  }

  function newBalloon(logVolume) {
    const jitter = C.balloon.growthRateJitter;
    return {
      id: nextId++,
      logVolume,
      growthRate: C.balloon.growthRate * (1 + jitter * (2 * rng() - 1)),
      flickerAmp: C.balloon.flicker,
      flickerState: 0, // OU process state; lift multiplier is 1 + this
      popRisk: C.balloon.popRiskPerMonth,
    };
  }

  function newRegion() {
    const speed = rollRange(C.rain.driftSpeed);
    const angle = 2 * Math.PI * rng();
    return {
      x: C.rain.mapSize * rng(),
      y: C.rain.mapSize * rng(),
      radius: rollRange(C.rain.radius),
      intensity: rollRange(C.rain.intensity),
      dx: speed * Math.cos(angle),
      dy: speed * Math.sin(angle),
      dryUntil: 0, // month until which this region is a dry spell
    };
  }

  function pushEvent(type, data = {}) {
    state.events.push({ month: state.month, type, ...data });
    if (state.events.length > C.events.keep) {
      state.events.splice(0, state.events.length - C.events.keep);
    }
  }

  for (let i = 0; i < C.fleet.startBalloons; i++) {
    state.balloons.push(newBalloon(C.balloon.startLogVolume));
  }
  for (let i = 0; i < C.rain.regionCount; i++) {
    state.regions.push(newRegion());
  }
  for (const kind of C.entropy.kinds) {
    state.entropy[kind.id] = { level: 0 };
    // populated properly each tick; zeroed here so a snapshot taken before
    // the first tick is fully formed
    state.derived.entropyPressure[kind.id] = { accrual: 0, cleaning: 0 };
  }

  // ---- derived quantities ----

  function balloonVolume(b) {
    return Math.exp(b.logVolume);
  }

  function balloonLiftMult(b) {
    return Math.max(0, 1 + b.flickerState);
  }

  function balloonLift(b) {
    return b.growthRate * balloonVolume(b) * balloonLiftMult(b);
  }

  // Bounded, monotonic render size. Never hand raw volume to a renderer.
  function displaySize(b) {
    const { sizeK, sizeMin, sizeMax } = C.display;
    const x = Math.max(0, b.logVolume);
    return sizeMin + (sizeMax - sizeMin) * (1 - Math.exp(-x / sizeK));
  }

  function activeEntropyKinds() {
    return C.entropy.kinds.filter(
      (k) => state.maxAltitudeReached >= k.unlockAltitude
    );
  }

  function entropyLevel(kindId) {
    return state.entropy[kindId] ? state.entropy[kindId].level : 0;
  }

  function passengerWeight(c) {
    let w = c.weight;
    if (c.loanWeight0 !== undefined) {
      const remaining = Math.max(0, 1 - c.ageMonths / c.termMonths);
      w += c.loanWeight0 * remaining; // amortizes to 0; base weight is the
    } //                                 permanent floor that never does
    const hunger = C.entropy.kinds.find((k) => k.effect === 'passengerWeightMult');
    if (hunger) w *= 1 + hunger.factor * entropyLevel(hunger.id);
    return w;
  }

  function totalLoad() {
    let load = C.fleet.gondolaWeight;
    for (const c of state.creatures) {
      load += c.kind === 'passenger' ? passengerWeight(c) : c.weight;
    }
    const garbage = C.entropy.kinds.find((k) => k.effect === 'loadGain');
    if (garbage) load += garbage.weightPerUnit * entropyLevel(garbage.id);
    return load;
  }

  // Draw linear volume out of the fleet (prices, depreciation). Takes from
  // the largest balloon; log1p keeps it exact even when amount << volume.
  // Returns false (and takes nothing) if it would effectively empty it.
  function subtractVolume(amount) {
    if (amount <= 0) return true;
    let biggest = null;
    for (const b of state.balloons) {
      if (!biggest || b.logVolume > biggest.logVolume) biggest = b;
    }
    if (!biggest) return false;
    const frac = amount * Math.exp(-biggest.logVolume);
    if (frac >= 0.99) return false;
    biggest.logVolume += Math.log1p(-frac);
    return true;
  }

  // ---- tick phases ----

  function updateRegions(dt) {
    const size = C.rain.mapSize;
    for (const r of state.regions) {
      r.x += r.dx * dt;
      r.y += r.dy * dt;
      if (r.x < 0) { r.x = -r.x; r.dx = -r.dx; }
      if (r.x > size) { r.x = 2 * size - r.x; r.dx = -r.dx; }
      if (r.y < 0) { r.y = -r.y; r.dy = -r.dy; }
      if (r.y > size) { r.y = 2 * size - r.y; r.dy = -r.dy; }
      if (state.month >= r.dryUntil) {
        const p = 1 - Math.exp(-C.rain.drySpellStartRate * dt);
        if (rng() < p) {
          r.dryUntil = state.month + rollRange(C.rain.drySpellMonths);
          pushEvent('dry-spell', { until: r.dryUntil });
        }
      }
    }
  }

  function updateFlicker(dt) {
    for (const b of state.balloons) {
      const tau = C.balloon.flickerTau;
      const sigma = b.flickerAmp * Math.sqrt(2 / tau);
      b.flickerState +=
        (-b.flickerState / tau) * dt + sigma * Math.sqrt(dt) * gauss();
    }
  }

  function updateEntropy(dt) {
    const active = activeEntropyKinds();
    const holdings = state.balloons.length + state.creatures.length;
    const scale =
      C.entropy.baseRate *
      (1 + C.entropy.perHoldingFactor * holdings) *
      (1 + state.altitude / C.entropy.altitudeScale);
    const soloShare = active.length ? C.entropy.soloCapacity / active.length : 0;
    state.derived.entropyPressure = {};
    for (const kind of C.entropy.kinds) {
      if (!active.includes(kind)) {
        state.derived.entropyPressure[kind.id] = { accrual: 0, cleaning: 0 };
        continue;
      }
      const crew = state.creatures.filter(
        (c) => c.kind === 'crew' && c.entropyKind === kind.id
      ).length;
      const accrual = scale;
      const cleaning = soloShare + C.entropy.crewCleanRate * crew;
      const e = state.entropy[kind.id];
      e.level = Math.max(0, e.level + (accrual - cleaning) * dt);
      state.derived.entropyPressure[kind.id] = { accrual, cleaning };
    }
  }

  function rainInflow() {
    let inflow = 0;
    for (const r of state.regions) {
      if (state.month < r.dryUntil) continue;
      const dx = state.rig.x - r.x;
      const dy = state.rig.y - r.y;
      if (dx * dx + dy * dy <= r.radius * r.radius) inflow += r.intensity;
    }
    return inflow;
  }

  function applyRain(inflow, dt) {
    if (inflow <= 0 || state.balloons.length === 0) return;
    const share = (inflow * dt) / state.balloons.length;
    for (const b of state.balloons) {
      // logV' = ln(V + share): exact for tiny balloons, ~no-op for huge ones
      // (income matters when you're small; it rounds to nothing at 1e6x).
      b.logVolume += Math.log1p(share * Math.exp(-b.logVolume));
    }
  }

  function applyGrowth(load, dt) {
    if (state.balloons.length === 0) return;
    const leak = C.entropy.kinds.find((k) => k.effect === 'liftDrain');
    const leakDrain = leak ? leak.effectRate * entropyLevel(leak.id) : 0;
    const logTotalV = logSumExp(state.balloons.map((b) => b.logVolume));
    // Load is drawn from the fleet pro-rata by volume: per unit of volume the
    // drain is load/totalVolume, computed stably as load * exp(-logTotalV).
    // Docked exception: on the ground, the ground carries the load — a
    // grounded balloon regrows instead of bleeding, so touching down is a
    // recoverable reset (the spec's "rise again, rebuild wiser"), never a
    // dead state.
    const loadPerVolume = state.grounded ? 0 : load * Math.exp(-logTotalV);
    for (const b of state.balloons) {
      const growth = b.growthRate * balloonLiftMult(b);
      b.logVolume += (growth - loadPerVolume - leakDrain) * dt;
      b.logVolume = clamp(b.logVolume, C.balloon.minLogVolume, C.balloon.maxLogVolume);
    }
  }

  function updateAltitude(surplus, dt) {
    const k = surplus >= 0 ? C.altitude.climbRate : C.altitude.sinkRate;
    const rate = k * Math.asinh(surplus / C.altitude.surplusScale);
    const before = state.altitude;
    state.altitude = clamp(state.altitude + rate * dt, 0, C.altitude.max);
    // effective rate (post-clamp): 0 when parked on the ground or ceiling
    state.derived.verticalRate = (state.altitude - before) / dt;
    if (state.altitude > state.maxAltitudeReached) {
      state.maxAltitudeReached = state.altitude;
    }
    if (state.altitude <= 0) {
      if (!state.grounded) {
        state.grounded = true;
        // Ground contact: every creature scatters — you lose the life you
        // built but keep the balloons. Suddenly light, you rise again.
        const lost = state.creatures.length;
        state.creatures = [];
        pushEvent('ground', { creaturesLost: lost });
      }
    } else {
      state.grounded = false;
    }
  }

  function updateCreatures(dt) {
    for (const c of state.creatures) c.ageMonths += dt;
    const leaving = state.creatures.filter(
      (c) => c.kind === 'crew' && c.ageMonths >= c.stayMonths
    );
    for (const c of leaving) {
      pushEvent('crew-left', { id: c.id, entropyKind: c.entropyKind });
    }
    if (leaving.length) {
      state.creatures = state.creatures.filter((c) => !leaving.includes(c));
    }
    for (const c of state.creatures) {
      if (c.kind === 'passenger' && c.depreciating) {
        subtractVolume(C.creatures.depreciationDrain * dt);
      }
    }
  }

  function updatePops(dt) {
    const popped = [];
    for (const b of state.balloons) {
      const p = 1 - Math.exp(-b.popRisk * dt);
      if (rng() < p) popped.push(b);
    }
    for (const b of popped) {
      pushEvent('pop', { id: b.id, logVolume: b.logVolume });
      state.balloons = state.balloons.filter((x) => x !== b);
    }
  }

  function updateMovement(lift, load, dt) {
    const { tx, ty } = state.rig;
    if (tx === null) {
      state.derived.speed = 0;
      return;
    }
    const speed = Math.max(
      C.movement.baseSpeed * C.movement.minSpeedFrac,
      C.movement.baseSpeed /
        (1 + (C.movement.loadFactor * load) / Math.max(lift, 1e-12))
    );
    state.derived.speed = speed;
    const dx = tx - state.rig.x;
    const dy = ty - state.rig.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;
    if (dist <= step) {
      state.rig.x = tx;
      state.rig.y = ty;
      state.rig.tx = null;
      state.rig.ty = null;
    } else {
      state.rig.x += (dx / dist) * step;
      state.rig.y += (dy / dist) * step;
    }
  }

  // ---- the loop ----

  function tick(dt = C.time.tickDt) {
    state.month += dt;
    updateRegions(dt);
    updateFlicker(dt);
    updateEntropy(dt);

    const lift = state.balloons.reduce((s, b) => s + balloonLift(b), 0);
    const load = totalLoad();
    const surplus = lift - load;
    const inflow = rainInflow();

    applyRain(inflow, dt);
    applyGrowth(load, dt);
    updateAltitude(surplus, dt);
    updateCreatures(dt);
    updatePops(dt);
    updateMovement(lift, load, dt);

    const d = state.derived;
    d.totalLift = lift;
    d.totalLoad = load;
    d.surplus = surplus;
    d.rainInflow = inflow;
    d.logTotalVolume = logSumExp(state.balloons.map((b) => b.logVolume));
  }

  // Fixed-timestep accumulator: results are identical regardless of how
  // real time is sliced. Renderers call advance(realSeconds) per frame.
  let accumulator = 0;
  function advance(realSeconds) {
    accumulator += realSeconds * C.time.monthsPerSecond;
    while (accumulator >= C.time.tickDt) {
      tick(C.time.tickDt);
      accumulator -= C.time.tickDt;
    }
  }

  // ---- actions (the surface a UI or agent drives) ----

  function acquireBalloon() {
    if (state.balloons.length >= C.fleet.maxBalloons) return false;
    if (state.balloons.length > 0) {
      if (!subtractVolume(C.balloon.acquireCost)) return false;
      const b = newBalloon(Math.log(C.balloon.acquireStartVolume));
      state.balloons.push(b);
      pushEvent('balloon-acquired', { id: b.id });
      return b.id;
    }
    // Fleet is empty (everything popped): grant a fresh starter so the
    // session isn't dead-ended. Layer 2 can gate this however it likes.
    const b = newBalloon(C.balloon.startLogVolume);
    state.balloons.push(b);
    pushEvent('balloon-acquired', { id: b.id, rescue: true });
    return b.id;
  }

  // Trade a matured balloon for a fresh small one (rerolled growth rate).
  // The accumulated compounding is simply gone — that's the lesson.
  function swapBalloon(id) {
    const i = state.balloons.findIndex((b) => b.id === id);
    if (i === -1) return false;
    const old = state.balloons[i];
    const fresh = newBalloon(C.balloon.startLogVolume);
    state.balloons[i] = fresh;
    pushEvent('balloon-swapped', {
      oldId: old.id,
      newId: fresh.id,
      logVolumeLost: old.logVolume,
      oldGrowthRate: old.growthRate,
      newGrowthRate: fresh.growthRate,
    });
    return fresh.id;
  }

  function addPassenger({ financed = false, depreciating = false, weight } = {}) {
    const w = weight !== undefined ? weight : rollRange(C.creatures.passengerWeight);
    const c = {
      id: nextId++,
      kind: 'passenger',
      weight: w,
      ageMonths: 0,
      depreciating,
    };
    if (financed) {
      c.loanWeight0 = C.creatures.financeLoanMult * w;
      c.termMonths = rollRange(C.creatures.financeTermMonths);
    } else {
      const price = w / C.balloon.growthRate;
      if (!subtractVolume(price)) {
        pushEvent('rejected', { action: 'addPassenger', price });
        return false;
      }
    }
    state.creatures.push(c);
    pushEvent('passenger-added', { id: c.id, weight: w, financed, depreciating });
    return c.id;
  }

  function addCrew(entropyKind, { weight, stayMonths } = {}) {
    if (!C.entropy.kinds.some((k) => k.id === entropyKind)) return false;
    const c = {
      id: nextId++,
      kind: 'crew',
      entropyKind,
      weight: weight !== undefined ? weight : rollRange(C.creatures.crewWeight),
      stayMonths: stayMonths !== undefined ? stayMonths : rollRange(C.creatures.crewStayMonths),
      ageMonths: 0,
    };
    state.creatures.push(c);
    pushEvent('crew-joined', { id: c.id, entropyKind, stayMonths: c.stayMonths });
    return c.id;
  }

  // Voluntary triage: drop a creature to arrest a fall before the ground does
  // it for you (and takes everyone).
  function shedCreature(id) {
    const c = state.creatures.find((x) => x.id === id);
    if (!c) return false;
    state.creatures = state.creatures.filter((x) => x !== c);
    pushEvent('shed', { id: c.id, kind: c.kind });
    return true;
  }

  function moveTo(x, y) {
    state.rig.tx = clamp(x, 0, C.rain.mapSize);
    state.rig.ty = clamp(y, 0, C.rain.mapSize);
  }

  // ---- readout ----

  function snapshot() {
    return {
      month: state.month,
      altitude: state.altitude,
      maxAltitudeReached: state.maxAltitudeReached,
      grounded: state.grounded,
      balloons: state.balloons.map((b) => ({
        id: b.id,
        logVolume: b.logVolume,
        growthRate: b.growthRate,
        lift: balloonLift(b),
        liftMult: balloonLiftMult(b),
        displaySize: displaySize(b),
      })),
      creatures: state.creatures.map((c) => ({
        ...c,
        effectiveWeight: c.kind === 'passenger' ? passengerWeight(c) : c.weight,
      })),
      entropy: Object.fromEntries(
        C.entropy.kinds.map((k) => [
          k.id,
          {
            level: entropyLevel(k.id),
            active: state.maxAltitudeReached >= k.unlockAltitude,
            ...state.derived.entropyPressure[k.id],
          },
        ])
      ),
      rig: { ...state.rig },
      regions: state.regions.map((r) => ({ ...r, dry: state.month < r.dryUntil })),
      derived: { ...state.derived },
      events: [...state.events],
    };
  }

  return {
    config: C,
    state, // direct access for tests/debug; UIs should prefer snapshot()
    tick,
    advance,
    snapshot,
    actions: {
      acquireBalloon,
      swapBalloon,
      addPassenger,
      addCrew,
      shedCreature,
      moveTo,
    },
    // test/debug hooks
    forcePop(id) {
      const b = state.balloons.find((x) => x.id === id);
      if (!b) return false;
      pushEvent('pop', { id: b.id, logVolume: b.logVolume, forced: true });
      state.balloons = state.balloons.filter((x) => x !== b);
      return true;
    },
    setAltitude(a) {
      state.altitude = clamp(a, 0, C.altitude.max);
      state.maxAltitudeReached = Math.max(state.maxAltitudeReached, state.altitude);
    },
  };
}
