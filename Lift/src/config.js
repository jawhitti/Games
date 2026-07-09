// Every tunable in the game lives here. Balancing passes edit this file only.
//
// Units:
//   time      — game months (1 real second = time.monthsPerSecond months)
//   volume    — linear balloon volume; state is kept as ln(volume) ("logVolume")
//   lift/load — volume-flow per month (lift = growthRate * volume)
//   altitude  — abstract height units; 0 is the ground
//   map       — abstract distance units on a [0, mapSize]^2 plane

export const CONFIG = {
  time: {
    monthsPerSecond: 1, // game-time speed: 1 month of sim per real second
    tickDt: 1 / 60, // fixed timestep, in months (60 ticks per game month)
  },

  fleet: {
    maxBalloons: 5,
    startBalloons: 1,
    gondolaWeight: 0.01, // baseline load you always carry
  },

  balloon: {
    startLogVolume: 0, // ln(1) — every fresh balloon starts at volume 1
    // growthRate is the return rate: lift = growthRate * volume (per month).
    // At 0.05/month an unloaded balloon reaches 1e6x volume in ~276 months.
    growthRate: 0.05,
    growthRateJitter: 0.3, // fresh balloons roll rate in ±30% of base
    flicker: 0.35, // stationary std-dev of the lift multiplier's noise
    flickerTau: 3, // months — how fast flicker decorrelates (OU process)
    popRiskPerMonth: 0.0008, // ~21% chance per balloon over a 300-month session
    acquireCost: 1.0, // linear volume drawn from the fleet to buy a balloon
    acquireStartVolume: 0.5, // ...of which this much becomes the new balloon
    maxLogVolume: 500, // hard numeric ceiling (volume ~1e217), far above play
    minLogVolume: -30, // a balloon drained this far is effectively empty
  },

  display: {
    // displaySize = min + (max-min) * (1 - exp(-max(logVolume,0)/k))
    // Bounded, monotonic; hand this to renderers, never raw volume.
    sizeK: 6,
    sizeMin: 4,
    sizeMax: 40,
  },

  altitude: {
    start: 20,
    // Numeric backstop only — the real ceiling is emergent: entropy accrual
    // scales with altitude, so climbing costs ever more crew to sustain.
    max: 1000000,
    // dAlt/dt = rate * asinh(surplus / surplusScale) — log-compressed
    // response so a 1e6x fleet doesn't rocket off the chart. Descent is
    // deliberately slower than ascent: that asymmetry IS the rescue window.
    climbRate: 25,
    sinkRate: 15,
    surplusScale: 0.05,
  },

  entropy: {
    // A kind is active once maxAltitudeReached >= unlockAltitude.
    kinds: [
      { id: 'leak', unlockAltitude: 0, effect: 'liftDrain', effectRate: 0.005 },
      { id: 'garbage', unlockAltitude: 300, effect: 'loadGain', weightPerUnit: 0.005 },
      { id: 'hunger', unlockAltitude: 800, effect: 'passengerWeightMult', factor: 0.03 },
    ],
    // accrual per kind = baseRate * (1 + perHoldingFactor*holdings)
    //                             * (1 + altitude/altitudeScale)
    baseRate: 0.015,
    perHoldingFactor: 0.1, // holdings = balloons + creatures
    altitudeScale: 300,
    // The player cleans soloCapacity per month, split evenly across active
    // kinds. The phase change: altitude raises accrual AND unlocks more kinds,
    // spreading solo capacity thinner until it can't keep up. With these
    // numbers a lone balloon stays solo-manageable to ~alt 1200; a full
    // menagerie (more holdings) pulls that threshold down toward ~700.
    soloCapacity: 0.25,
    crewCleanRate: 0.4, // per crew member, applied to their kind only
  },

  creatures: {
    passengerWeight: [0.02, 0.08],
    // Cash price of a passenger = weight / balloon.growthRate: the volume
    // whose lift would exactly carry it. Buying outright costs the principal.
    financeLoanMult: 1.5, // initial loan-weight = mult * base weight
    financeTermMonths: [12, 36], // loan-weight amortizes linearly to 0
    depreciationDrain: 0.01, // linear volume/month leaked by depreciating ones
    crewWeight: [0.02, 0.05],
    crewStayMonths: [60, 120], // 5–10 years
  },

  rain: {
    regionCount: 3,
    mapSize: 100,
    intensity: [0.08, 0.2], // linear volume/month while under the region
    radius: [10, 18],
    driftSpeed: [0.5, 2], // map units/month, regions bounce off edges
    drySpellStartRate: 0.03, // per region per month
    drySpellMonths: [3, 10],
  },

  movement: {
    baseSpeed: 5, // map units (miles)/month for an unloaded rig
    // speed = baseSpeed / (1 + loadFactor * totalLoad / totalLift)
    loadFactor: 1.0,
    // A failing rig (load >> lift) never stalls completely — it can always
    // limp toward rain at this fraction of base speed.
    minSpeedFrac: 0.3,
  },

  events: {
    keep: 200, // ring-buffer length of the event log
  },
};
