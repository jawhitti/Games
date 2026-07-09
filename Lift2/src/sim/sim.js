// Lift 2 — flow-first simulation core. Pure module: no DOM, no I/O.
//
// Two substances only: WATER (money) and GOO (debt). Towers hold water and
// never produce flow; pumps move water and never hold it. Goo compounds on
// its own (d(goo)/dt = spreadRate * goo, plus any linear inflow) and is
// fought by firemen spraying tower water at it, 1 water : 1 goo — servicing
// debt is literally water that builds nothing else.
//
// Anything that compounds (investment towers, goo pools) lives in LOG SPACE:
// growth is addition on the log; linear deposits/sprays cross the boundary
// through logAdd/logSub (log1p). The main tower is linear (it never
// multiplies itself — income and expenses are pumps, not returns).

import { CONFIG } from '../config.js';
import { makeRng, makeGauss } from '../rng.js';
import { clamp, vol, logAdd, logSub, mergeConfig } from './math.js';

export function createSim({ seed = 1, config = {} } = {}) {
  const C = mergeConfig(CONFIG, config);
  const rng = makeRng(seed);
  const gauss = makeGauss(rng);

  let nextId = 1;
  const state = {
    month: 0,
    main: { x: C.board.mainTile.x, y: C.board.mainTile.y, level: C.start.water },
    pumps: [
      { id: nextId++, kind: 'income', label: 'job', rate: C.pumps.jobRate, enabled: true },
      { id: nextId++, kind: 'expense', label: 'essentials', rate: C.pumps.essentialsRate, enabled: true, cuttable: false },
      { id: nextId++, kind: 'expense', label: 'lifestyle', rate: C.pumps.lifestyleRate, enabled: true, cuttable: true },
    ],
    instruments: [],
    gooPools: [],
    firemen: Array.from({ length: C.start.firemen }, () => ({ id: nextId++, poolId: null })),
    events: [],
    derived: {
      income: 0,
      expenses: 0,
      sprayRate: 0, // water/month firemen actually spray
      pumpRate: 0, // water/month defense pumps actually move
      seamRate: 0, // water/month annihilating where goo touches the pond
      netFlow: 0, // income - expenses - all outflows: the getting-ahead number
      wealthFlow: 0, // netFlow + reinvested streams - total goo growth
      runwayMonths: Infinity, // level / -netFlow when netFlow < 0
      totalGoo: 0,
      dry: false, // firemen deployed but the tower has no water for them
    },
  };

  function pushEvent(type, data = {}) {
    state.events.push({ month: state.month, type, ...data });
    if (state.events.length > C.events.keep) {
      state.events.splice(0, state.events.length - C.events.keep);
    }
  }

  // ---- construction helpers ----

  function cellOccupied(cell) {
    if (cell.x === state.main.x && cell.y === state.main.y) return true;
    return state.instruments.some(
      (i) => !i.destroyed && i.x === cell.x && i.y === cell.y
    );
  }

  function inGrid(cell) {
    return (
      Number.isInteger(cell.x) && Number.isInteger(cell.y) &&
      cell.x >= 0 && cell.x < C.board.gridW &&
      cell.y >= 0 && cell.y < C.board.gridH
    );
  }

  function nextLot() {
    return C.board.assetLots.find((lot) => !cellOccupied(lot));
  }

  // Spawn point for a financed pool: `dist` tiles from the asset, pointing
  // away from the main tower; if that lands off-grid, fall back toward the
  // map center so the pool always exists somewhere real.
  function poolSpawn(ax, ay, dist) {
    const dirs = [];
    let dx = ax - state.main.x, dy = ay - state.main.y;
    let len = Math.hypot(dx, dy);
    if (len > 1e-9) dirs.push([dx / len, dy / len]);
    dx = C.board.gridW / 2 - ax;
    dy = C.board.gridH / 2 - ay;
    len = Math.hypot(dx, dy);
    if (len > 1e-9) dirs.push([dx / len, dy / len]);
    dirs.push([1, 0]);
    for (const [ux, uy] of dirs) {
      const px = ax + ux * dist, py = ay + uy * dist;
      if (px >= 0.5 && px <= C.board.gridW - 0.5 && py >= 0.5 && py <= C.board.gridH - 0.5) {
        return { x: px, y: py };
      }
    }
    return {
      x: clamp(ax, 0.5, C.board.gridW - 0.5),
      y: clamp(ay + dist, 0.5, C.board.gridH - 0.5),
    };
  }

  function newPool({ x, y, spreadRate, label, volume = 0, inflow = 0, persistent = false, sourceId = null }) {
    const p = {
      id: nextId++,
      label,
      x,
      y,
      logVolume: volume > 0 ? Math.log(volume) : -Infinity,
      spreadRate,
      inflow, // linear goo/month from a goo *pump* (e.g. permanent upkeep)
      persistent, // true: can never close, even at ~0 volume
      sourceId,
      closed: false,
    };
    state.gooPools.push(p);
    return p;
  }

  // ---- derived helpers ----

  function poolRadius(p) {
    return p.closed ? 0 : C.goo.radiusScale * Math.sqrt(vol(p.logVolume));
  }

  function pondRadius() {
    return C.pond.radiusScale * Math.sqrt(state.main.level);
  }

  function nearestOpenPool(x, y, range) {
    let best = null, bestD = Infinity;
    for (const p of state.gooPools) {
      if (p.closed) continue;
      const d = Math.hypot(p.x - x, p.y - y) - poolRadius(p); // to the blob's edge
      if (d <= range && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  function poolsOverrunning(x, y) {
    return state.gooPools.filter(
      (p) => !p.closed && Math.hypot(p.x - x, p.y - y) < poolRadius(p)
    );
  }

  function instrumentValue(inst) {
    return inst.stored ? vol(inst.stored.logValue) : 0;
  }

  function linkedOpenPools(inst) {
    return state.gooPools.filter((p) => !p.closed && p.sourceId === inst.id);
  }

  // Bounded display helpers — renderers get these, never raw volumes.
  function displayFill(level) {
    return 1 - Math.exp(-level / C.display.towerK); // 0..1 tower fill
  }
  function displayRadius(p) {
    return 1 - Math.exp(-poolRadius(p) / C.display.gooK); // 0..1 blob size
  }

  // ---- tick phases ----

  function updateStored(dt) {
    for (const inst of state.instruments) {
      if (inst.destroyed || !inst.stored) continue;
      const s = inst.stored;
      if (s.behavior === 'leaking') {
        s.logValue -= s.leakRate * dt; // exponential decay: exact in log space
      } else if (s.behavior === 'volatile') {
        // geometric random walk — value can genuinely FALL
        s.logValue += (s.mu - 0.5 * s.sigma * s.sigma) * dt + s.sigma * Math.sqrt(dt) * gauss();
      }
      if (inst.income && inst.income.kind === 'selffeed' && inst.income.valve === 'reinvest') {
        // the self-feeding pump, valve open: output fed back into the tower.
        // dV = feedRate * V * dt  ->  dlogV = feedRate * dt. Compounding is
        // addition in log space; stable at any size.
        s.logValue += inst.income.feedRate * dt;
      }
    }
  }

  function updateGoo(dt) {
    for (const p of state.gooPools) {
      if (p.closed) continue;
      if (p.logVolume !== -Infinity) p.logVolume += p.spreadRate * dt; // goo compounds
      if (p.inflow > 0) p.logVolume = logAdd(p.logVolume, p.inflow * dt);
      // debt finds you: drift toward the pond, fast goo hunting fastest.
      // En route it eats whatever you built in its path.
      const drift = p.spreadRate * C.goo.driftPerSpread * dt;
      if (drift > 0 && p.logVolume !== -Infinity) {
        const dx = state.main.x - p.x, dy = state.main.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.1) {
          const step = Math.min(drift, d - 0.05);
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
        }
      }
    }
  }

  function updateOverruns(dt) {
    // contained goo is harmless; goo that reaches something eats it
    for (const inst of state.instruments) {
      if (inst.destroyed) continue;
      const attackers = poolsOverrunning(inst.x, inst.y);
      inst.overrun = attackers.length > 0;
      if (!inst.overrun || !inst.stored) continue;
      inst.stored.logValue = logSub(
        inst.stored.logValue,
        C.goo.destroyStoredPerMonth * attackers.length * dt
      );
      if (vol(inst.stored.logValue) < 0.01) {
        inst.destroyed = true;
        inst.overrun = false;
        pushEvent('destroyed', { id: inst.id, label: inst.label });
      }
    }
  }

  // THE LAW: where goo touches the pond they annihilate 1:1. No penalty,
  // no discount — the danger is purely that goo compounds and water
  // doesn't. The seam is a rate race: income inflow vs spread rate.
  function updateSeam(dt) {
    const pr = pondRadius();
    let annihilated = 0;
    for (const p of state.gooPools) {
      if (p.closed) continue;
      const depth = pr + poolRadius(p) - Math.hypot(p.x - state.main.x, p.y - state.main.y);
      if (depth <= 0) continue;
      let a = C.pond.seamPerOverlapPerMonth * depth * dt;
      a = Math.min(a, state.main.level, vol(p.logVolume));
      if (a <= 0) continue;
      state.main.level -= a;
      p.logVolume = logSub(p.logVolume, a);
      annihilated += a;
    }
    return dt > 0 ? annihilated / dt : 0;
  }

  function computeFlows() {
    let income = 0;
    for (const pump of state.pumps) {
      if (pump.kind === 'income' && pump.enabled) income += pump.rate;
    }
    let reinvested = 0;
    for (const inst of state.instruments) {
      if (inst.destroyed) continue;
      if (!inst.income) continue;
      if (inst.income.kind === 'fixed') {
        if (!inst.overrun) income += inst.income.rate; // goo on it stops the rent
      } else if (inst.income.kind === 'selffeed') {
        const stream = inst.income.feedRate * instrumentValue(inst);
        if (inst.income.valve === 'consume') income += stream;
        else reinvested += stream;
      }
    }
    let expenses = 0;
    for (const pump of state.pumps) {
      if (pump.kind === 'expense' && pump.enabled) expenses += pump.rate;
    }
    return { income, expenses, reinvested };
  }

  function updateMainAndSpray(income, expenses, dt) {
    state.main.level = Math.max(0, state.main.level + (income - expenses) * dt);

    // demands on the pond: firemen at their pools + defense pumps at their
    // targets. Short pond -> everyone gets a pro-rata trickle. Dry pond ->
    // goo grows unopposed no matter what's deployed.
    const jobs = [];
    for (const f of state.firemen) {
      const p = state.gooPools.find((g) => g.id === f.poolId);
      if (p && !p.closed) jobs.push({ pool: p, rate: C.firemen.sprayWaterPerMonth, kind: 'spray' });
    }
    for (const inst of state.instruments) {
      if (inst.type !== 'pump' || inst.destroyed) continue;
      const target = inst.overrun ? null : nearestOpenPool(inst.x, inst.y, C.defensePump.range);
      inst.targetPoolId = target ? target.id : null; // overrun pump = swallowed, useless
      if (target) jobs.push({ pool: target, rate: C.defensePump.flowPerMonth, kind: 'pump' });
    }
    const wanted = jobs.reduce((s, j) => s + j.rate, 0) * dt;
    const usable = Math.min(wanted, state.main.level);
    const frac = wanted > 0 ? usable / wanted : 0;
    state.derived.dry = jobs.length > 0 && frac < 0.999;
    let spray = 0, pump = 0;
    for (const j of jobs) {
      const water = j.rate * dt * frac;
      if (water <= 0) continue;
      const kill = Math.min(water, vol(j.pool.logVolume)); // 1 water kills 1 goo
      if (kill <= 0) continue;
      j.pool.logVolume = logSub(j.pool.logVolume, kill);
      if (j.kind === 'spray') spray += kill;
      else pump += kill;
    }
    state.main.level -= spray + pump;
    return { sprayRate: dt > 0 ? spray / dt : 0, pumpRate: dt > 0 ? pump / dt : 0 };
  }

  function closePaidPools() {
    for (const p of state.gooPools) {
      if (p.closed || p.persistent || p.inflow > 0) continue;
      if (vol(p.logVolume) < C.goo.closeEps) {
        p.closed = true;
        pushEvent('debt-cleared', { id: p.id, label: p.label });
        for (const f of state.firemen) if (f.poolId === p.id) f.poolId = null;
      }
    }
  }

  // ---- the loop ----

  function tick(dt = C.time.tickDt) {
    state.month += dt;
    updateStored(dt);
    updateGoo(dt);
    updateOverruns(dt);
    const seamRate = updateSeam(dt);
    const { income, expenses, reinvested } = computeFlows();
    const { sprayRate, pumpRate } = updateMainAndSpray(income, expenses, dt);
    closePaidPools();

    const d = state.derived;
    d.income = income;
    d.expenses = expenses;
    d.sprayRate = sprayRate;
    d.pumpRate = pumpRate;
    d.seamRate = seamRate;
    d.netFlow = income - expenses - sprayRate - pumpRate - seamRate;
    d.totalGoo = state.gooPools.reduce((s, p) => s + (p.closed ? 0 : vol(p.logVolume)), 0);
    const gooGrowth = state.gooPools.reduce(
      (s, p) => s + (p.closed ? 0 : p.spreadRate * vol(p.logVolume) + p.inflow),
      0
    );
    // paying goo is wealth-neutral (1:1), so add the transfers back
    d.wealthFlow = d.netFlow + reinvested - gooGrowth + sprayRate + pumpRate + seamRate;
    d.runwayMonths = d.netFlow < -1e-9 ? state.main.level / -d.netFlow : Infinity;
  }

  let accumulator = 0;
  function advance(realSeconds) {
    accumulator += realSeconds * C.time.monthsPerSecond;
    while (accumulator >= C.time.tickDt) {
      tick(C.time.tickDt);
      accumulator -= C.time.tickDt;
    }
  }

  // ---- actions (the verbs) ----

  function spendWater(amount) {
    if (state.main.level < amount) return false;
    state.main.level -= amount;
    return true;
  }

  function makeInstrument(type, spec, x, y) {
    const inst = {
      id: nextId++,
      type,
      label: spec.label,
      x,
      y,
      destroyed: false,
      overrun: false,
      stored: spec.stored
        ? {
            behavior: spec.stored.behavior,
            logValue: spec.price > 0 ? Math.log(spec.price) : -Infinity,
            leakRate: spec.stored.leakRate ?? 0,
            mu: spec.stored.mu ?? 0,
            sigma: spec.stored.sigma ?? 0,
          }
        : null,
      income: spec.income ? { ...spec.income } : null,
    };
    state.instruments.push(inst);
    return inst;
  }

  // Resolve where a new building lands: the caller's chosen tile (the
  // highlighted square) if it's valid, else the next free fallback lot.
  function resolveCell(cell) {
    if (cell) {
      if (!inGrid(cell) || cellOccupied(cell)) return null;
      return { x: cell.x, y: cell.y };
    }
    return nextLot() ?? null;
  }

  function buy(type, { financed, cell } = {}) {
    const spec = C.catalog[type];
    if (!spec || spec.purchase === 'invest') return false;
    const at = resolveCell(cell);
    if (!at) {
      pushEvent('rejected', { action: 'buy', type, reason: 'no-space' });
      return false;
    }
    const useFinance = financed ?? spec.purchase === 'financed';
    if (!useFinance && !spendWater(spec.price)) {
      pushEvent('rejected', { action: 'buy', type, price: spec.price });
      return false;
    }
    const inst = makeInstrument(type, spec, at.x, at.y);
    if (useFinance && spec.goo) {
      // spawn contained, margin proportional to the debt's starting radius —
      // spread then eats the margin at the interest rate
      const r0 = C.goo.radiusScale * Math.sqrt(spec.price);
      const pos = poolSpawn(at.x, at.y, C.goo.containBase + C.goo.containMargin * r0);
      newPool({
        ...pos,
        spreadRate: spec.goo.spreadRate,
        label: spec.goo.label,
        volume: spec.price,
        sourceId: inst.id,
      });
    }
    if (spec.upkeep) {
      // the permanent goo trickle: never ends, even after the mortgage does
      const pos = poolSpawn(at.x, at.y, C.goo.upkeepOffset);
      newPool({
        ...pos,
        spreadRate: spec.upkeep.spreadRate,
        label: spec.upkeep.label,
        inflow: spec.upkeep.inflow,
        persistent: true,
        sourceId: inst.id,
      });
    }
    pushEvent('bought', { id: inst.id, type, financed: useFinance });
    return inst.id;
  }

  function invest(amount, { cell } = {}) {
    if (amount <= 0 || !spendWater(amount)) return false;
    let inst = state.instruments.find((i) => i.type === 'investment' && !i.destroyed);
    if (!inst) {
      const spec = C.catalog.investment;
      const at = resolveCell(cell);
      if (!at) {
        state.main.level += amount; // refund; nowhere to build
        return false;
      }
      inst = makeInstrument('investment', { ...spec, price: 0 }, at.x, at.y);
    }
    inst.stored.logValue = logAdd(inst.stored.logValue, amount);
    pushEvent('invested', { id: inst.id, amount });
    return inst.id;
  }

  // standing debt service: infrastructure that auto-sprays the nearest goo
  function buildPump({ cell } = {}) {
    const at = resolveCell(cell);
    if (!at) {
      pushEvent('rejected', { action: 'buildPump', reason: 'no-space' });
      return false;
    }
    if (!spendWater(C.defensePump.price)) {
      pushEvent('rejected', { action: 'buildPump', price: C.defensePump.price });
      return false;
    }
    const inst = {
      id: nextId++,
      type: 'pump',
      label: 'pump',
      x: at.x,
      y: at.y,
      destroyed: false,
      overrun: false,
      stored: null,
      income: null,
      targetPoolId: null,
    };
    state.instruments.push(inst);
    pushEvent('pump-built', { id: inst.id });
    return inst.id;
  }

  function setValve(instrumentId, valve) {
    const inst = state.instruments.find((i) => i.id === instrumentId);
    if (!inst || !inst.income || inst.income.kind !== 'selffeed') return false;
    if (valve !== 'reinvest' && valve !== 'consume') return false;
    inst.income.valve = valve;
    pushEvent('valve', { id: inst.id, valve });
    return true;
  }

  function assignFireman(firemanId, poolId) {
    const f = state.firemen.find((x) => x.id === firemanId);
    if (!f) return false;
    if (poolId === null) {
      f.poolId = null;
      return true;
    }
    const p = state.gooPools.find((g) => g.id === poolId && !g.closed);
    if (!p) return false;
    f.poolId = poolId;
    return true;
  }

  // lump payment: a bucket of water thrown at a pool right now
  function spray(poolId, amount) {
    const p = state.gooPools.find((g) => g.id === poolId && !g.closed);
    if (!p) return false;
    const pay = Math.min(amount, state.main.level, vol(p.logVolume));
    if (pay <= 0) return false;
    state.main.level -= pay;
    p.logVolume = logSub(p.logVolume, pay);
    closePaidPools();
    return pay;
  }

  // sell: reclaim CURRENT worth (maybe less than you paid — that's the
  // lesson); proceeds pay linked goo first; underwater leaves goo behind.
  function sell(instrumentId) {
    const inst = state.instruments.find((i) => i.id === instrumentId);
    if (!inst || inst.destroyed) return false;
    if (inst.type === 'pump') {
      const salvage = C.defensePump.price * C.defensePump.salvage;
      state.main.level += salvage;
      inst.destroyed = true;
      inst.sold = true;
      pushEvent('sold', { id: inst.id, label: inst.label, proceeds: salvage });
      return salvage;
    }
    let proceeds = instrumentValue(inst);
    for (const p of linkedOpenPools(inst)) {
      if (p.persistent) {
        p.closed = true; // selling the house ends its upkeep obligation
        for (const f of state.firemen) if (f.poolId === p.id) f.poolId = null;
        continue;
      }
      const owed = vol(p.logVolume);
      const pay = Math.min(proceeds, owed);
      proceeds -= pay;
      p.logVolume = logSub(p.logVolume, pay);
    }
    closePaidPools();
    state.main.level += proceeds;
    inst.destroyed = true;
    inst.sold = true;
    pushEvent('sold', { id: inst.id, label: inst.label, proceeds });
    return proceeds;
  }

  function takeLoan(amount) {
    if (amount <= 0) return false;
    state.main.level += amount;
    const p = newPool({
      x: C.board.loanTile.x,
      y: C.board.loanTile.y,
      spreadRate: C.loans.bank.spreadRate,
      label: C.loans.bank.label,
      volume: amount,
    });
    pushEvent('loan', { poolId: p.id, amount });
    return p.id;
  }

  function drawCredit(amount) {
    if (amount <= 0) return false;
    state.main.level += amount;
    // the always-available tap: draws pile into ONE fast pool
    let p = state.gooPools.find((g) => g.label === C.loans.card.label && !g.closed);
    if (!p) {
      p = newPool({
        x: C.board.cardTile.x,
        y: C.board.cardTile.y,
        spreadRate: C.loans.card.spreadRate,
        label: C.loans.card.label,
      });
    }
    p.logVolume = logAdd(p.logVolume, amount);
    pushEvent('credit-drawn', { poolId: p.id, amount });
    return p.id;
  }

  function cutExpense(pumpId) {
    const pump = state.pumps.find((p) => p.id === pumpId);
    if (!pump || pump.kind !== 'expense' || !pump.cuttable || !pump.enabled) return false;
    pump.enabled = false;
    pushEvent('expense-cut', { id: pump.id, label: pump.label });
    return true;
  }

  // ---- readout ----

  function snapshot() {
    return {
      month: state.month,
      main: {
        ...state.main,
        fill: displayFill(state.main.level),
        radius: pondRadius(),
      },
      pumps: state.pumps.map((p) => ({ ...p })),
      instruments: state.instruments.map((i) => ({
        id: i.id,
        type: i.type,
        label: i.label,
        x: i.x,
        y: i.y,
        destroyed: i.destroyed,
        sold: !!i.sold,
        overrun: i.overrun,
        value: instrumentValue(i),
        fill: i.stored ? displayFill(instrumentValue(i)) : 0,
        income: i.income ? { ...i.income } : null,
        gooOwed: linkedOpenPools(i).reduce((s, p) => s + vol(p.logVolume), 0),
        targetPoolId: i.targetPoolId ?? null,
      })),
      gooPools: state.gooPools.map((p) => ({
        id: p.id,
        label: p.label,
        sourceId: p.sourceId,
        x: p.x,
        y: p.y,
        volume: vol(p.logVolume),
        spreadRate: p.spreadRate,
        inflow: p.inflow,
        persistent: p.persistent,
        closed: p.closed,
        radius: poolRadius(p),
        displayRadius: displayRadius(p),
        firemen: state.firemen.filter((f) => f.poolId === p.id).length,
      })),
      firemen: state.firemen.map((f) => ({ ...f })),
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
      buy,
      invest,
      buildPump,
      setValve,
      assignFireman,
      spray,
      sell,
      takeLoan,
      drawCredit,
      cutExpense,
    },
  };
}
