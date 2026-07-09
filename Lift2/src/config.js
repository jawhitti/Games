// Every tunable in the game lives here. Balancing passes edit this file only.
//
// Units:
//   time  — game months (1 real second = time.monthsPerSecond months)
//   water — money. Pumps move water/month; towers hold water.
//   goo   — debt volume, same magnitude scale as water (1 water pays 1 goo).
//   board — abstract x positions on a [0, 100] line; goo blobs grow radii
//           toward assets. radius = radiusScale * sqrt(volume).
//
// Rates are per month. For intuition: spreadRate 0.005/mo ~ 6%/yr,
// 0.01 ~ 13%/yr, 0.04 ~ 60%/yr (loan-shark, but game-legible: FAST).

export const CONFIG = {
  time: {
    monthsPerSecond: 1,
    tickDt: 1 / 60,
  },

  start: {
    water: 20, // main tower starting level
    firemen: 4,
  },

  pumps: {
    jobRate: 2.0, // income: fills the main tower from outside
    essentialsRate: 1.2, // expenses you can't cut
    lifestyleRate: 0.5, // expenses you CAN cut (the cut-expense verb)
  },

  firemen: {
    // Spraying IS debt payment: each deployed fireman moves this much water
    // per month from the pond onto his goo pool, killing goo 1:1.
    // No water in the pond -> no spray -> the goo wins unopposed.
    sprayWaterPerMonth: 0.4,
  },

  pond: {
    // Your water is a POND: a body on the map whose area is your level.
    radiusScale: 0.2, // pond radius = radiusScale * sqrt(level), in tiles
    // THE LAW: goo and water always annihilate 1:1 — spray, pump, or seam.
    // Goo's menace lives entirely in rates: it compounds, water doesn't.
    // Contact annihilation rate = this * overlap depth (tiles), per month.
    seamPerOverlapPerMonth: 1.0,
  },

  defensePump: {
    // Buildable standing debt service: pulls from the pond, pours on the
    // nearest goo in range, 1:1. Infrastructure: costs capital, holds a
    // tile, and is useless while goo overruns it. Firemen stay the free,
    // instantly-redeployable emergency layer.
    price: 5,
    flowPerMonth: 0.5,
    range: 3, // tiles from pump to a blob's edge
    salvage: 0.5, // fraction of price recovered on selling the pump
  },

  goo: {
    // Distances are in TILES on the iso grid. blob radius = radiusScale*sqrt(volume)
    radiusScale: 0.35,
    // A financed pool spawns at distance containBase + containMargin*radius
    // from its asset: born contained, with margin proportional to its size.
    // Its spread then eats that margin at spreadRate — the countdown IS the
    // interest rate.
    containBase: 1,
    containMargin: 1.5,
    // DEBT FINDS YOU: every pool drifts toward the pond at
    // spreadRate * driftPerSpread tiles/month. Fast goo hunts fast; slow
    // goo oozes toward you over decades; rate-0 goo (upkeep) never moves.
    // Distance buys time, never safety.
    driftPerSpread: 5,
    upkeepOffset: 1.2, // the permanent upkeep trickle sits this close
    closeEps: 1e-4, // a non-persistent pool below this volume is paid off
    destroyStoredPerMonth: 1.5, // stored water an overrunning pool eats
  },

  board: {
    gridW: 16, // iso map size in tiles
    gridH: 12,
    mainTile: { x: 3, y: 6 }, // main water tower
    loanTile: { x: 1, y: 9 }, // bank-loan goo erupts here (near the tower)
    cardTile: { x: 1, y: 3 }, // credit-card goo erupts here
    // fallback lots used when a buy doesn't specify a target tile
    assetLots: [
      { x: 6, y: 4 },
      { x: 8, y: 6 },
      { x: 10, y: 4 },
      { x: 6, y: 8 },
      { x: 10, y: 8 },
    ],
  },

  // The instrument grid: goo / stored water / produced water, independently.
  catalog: {
    rental: {
      label: 'rental',
      price: 30,
      purchase: 'cash', // the boring true asset: paid outright
      stored: { behavior: 'fixed' },
      income: { kind: 'fixed', rate: 1.2 },
    },
    house: {
      label: 'house',
      price: 60,
      purchase: 'financed',
      // volatile: geometric random walk — CAN fall below the goo owed
      stored: { behavior: 'volatile', mu: 0.002, sigma: 0.02 },
      goo: { spreadRate: 0.005, label: 'mortgage' }, // slow, big, calm
      // permanent upkeep: a goo trickle that NEVER ends, even paid off
      upkeep: { inflow: 0.06, spreadRate: 0, label: 'upkeep' },
    },
    car: {
      label: 'car',
      price: 15,
      purchase: 'financed',
      // the defining property: the stored value leaks to ~zero while the
      // goo is still being paid — underwater almost immediately
      stored: { behavior: 'leaking', leakRate: 0.04 },
      goo: { spreadRate: 0.008, label: 'car loan' },
    },
    investment: {
      label: 'investment',
      purchase: 'invest', // buy by moving water in, any amount
      stored: { behavior: 'fixed' },
      // the master primitive: pump speed scales with the tower it fills
      income: { kind: 'selffeed', feedRate: 0.015, valve: 'reinvest' },
    },
  },

  loans: {
    bank: { spreadRate: 0.01, label: 'bank loan' }, // slow-ish, ends
    card: { spreadRate: 0.04, label: 'card goo' }, // FAST, accelerates
  },

  display: {
    // compressed sizes for renderers; never hand raw volume to a pixel
    towerK: 40, // tower fill compression scale
    gooK: 8, // blob radius compression scale
  },

  events: {
    keep: 200,
  },
};
