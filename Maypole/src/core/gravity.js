// Gravity: attraction toward THE SUN — a large body very far away in 4-D
// space. At this distance the field is a constant direction. Rotating the
// building never moves gravity; the sun does not care about your switches.
// That is why walls become floors: the box turns under an indifferent sky.
//
// (Author decision 2026-07-08. Supersedes the spec §1 building-glued
// g = R·g0: under that model a building's own floor was down in every
// orientation and walls could never become floors — contradicting the
// spec's own Act 1. The sun resolves it.)
//
// Consequences worth knowing:
//   - g has no w component, ever: nothing is ever PULLED off the slice.
//     Things fall out of sealed rooms because their floors rotate out of
//     the slice — support ceases to exist, plain 3-D falling does the rest.
//   - The camera never needs to roll. Screen-down IS down.
//   - loom/wash as gravity phenomena are gone; re-cuts are the 4-D voice.

export const SUN_G = Object.freeze([0, -1, 0, 0]);

// Kept as a function (and tolerating an ignored R argument) so call sites
// read the same as before the model change.
export function resolveGravity() {
  return {
    g: SUN_G,
    screenDown: [SUN_G[0], SUN_G[1]],
    roll: 0,
    loom: SUN_G[2],
    wash: SUN_G[3],
  };
}
