# Barnyard — solve for the Fox

A **candy-crush algebra** where you never learn you're doing algebra. You slide
critter tiles around a barnyard, match and cancel them, and try to seat the Fox at
his dinner table. Underneath, it's linear equations over the **finite field GF(5)** —
but the player is never told that, and never sees a number, a fraction, or a minus
sign.

Prototype: **`barnyard.html`** (self-contained, open in a browser). This is a spin-off
of the main [Balance](README.md) game, born from Balance's sore spot: multi-digit
constants and fractions are clumsy to render and manipulate as tiles. A finite field
fixes both at the root — see [Why GF(5)](#why-gf5).

## The numbers are critters

The whole number system is **five tiles** — a goose egg and two cancelling
predator/prey pairs, in *balanced* form `{−2, −1, 0, +1, +2}`:

| tile | value | | tile | value |
|------|-------|-|------|-------|
| 🥚 goose egg | 0 | | | |
| 🦆 duck | +1 | | 🦢 goose | −1 |
| 🐱 kitty | +2 | | 🐶 puppy | −2 |

The variable joins the same system as its own pair:

| 🦊 fox | +x | | 🐭 mouse | −x |
|--------|----|-|----------|-----|

Every quantity is a ± pair that **lays an egg** when added to its opposite:
`🦆+🦢 → 🥚`, `🐱+🐶 → 🥚`, `🦊+🐭 → 🥚`. There are no other numbers — ever.

## The notation is terrain, not symbols

- **Adjacency = addition.** Tiles sitting next to each other on the grass are added.
  `🦊🐱` = `x + 2`. There is no `+` glyph; addition is just *being next to each other.*
- **🐇 rabbit = multiply.** The only visible operator. "Multiply like rabbits." It
  sits between a multiplier and a group: `🐱🐇🌜…🌛` = `2 × (…)`.
- **🌜 🌛 moons = grouping.** 🌜 opens, 🌛 closes — distinct open/close, so they nest
  exactly like parentheses: `🌜🌜…🌛🌛` = `((…))`. No depth trick needed.
- **🍴 = equals.** It's a place setting: the *table*. Solving = seating the Fox.

No `+`, `×`, `( )`, `=`, digits, or fractions appear anywhere. Just critters and
terrain. Every rule is something you **discover** by playing.

## The moves

- **Cross the table** — click a loose tile; it flips to its opposite and jumps to the
  other side. `🐱` on the left → `🐶` on the right. (This is negate-and-move; it's the
  *same* operation as laying an egg — the tile you'd cancel with is the tile you
  become.)
- **Distribute** — click a group; the 🐇 hops through, multiplying every tile inside
  and dissolving the moons onto the grass. `🐱🐇🌜🦊🦆🌛` → `🦊🦊🐱` (`2(x+1) → 2x+2`).
- **Graze / cancel** — like tiles merge (coefficients add, mod 5); opposites lay a 🥚
  and vanish; **five of a kind → 🥚** (characteristic 5). This is automatic in the
  prototype ("the board tidies itself").
- **Flip the board** — negate everything at once; turns a stranded 🐭 back into a 🦊.
- **Swap sides** — reflect the table (`a = b` ⟺ `b = a`); no sign change, just walks a
  Fox to his seat.

## Winning: seat the Fox

- **🦊 alone on the left → he eats.** `🦊 🍴 🐱` means `x = 2`, and the Fox gets his
  dinner.
- **🐭 alone → flip the board** to turn the Mouse back into a Fox (a mouse can't dine).
- **🦊 on the right → swap sides** to bring him home (or the 🦆 eats him if you stop
  there). The win/lose is a little food chain around the table.

## Why GF(5)

A set closed under **all four** of `+ − × ÷` *is* a finite field, and finite fields
are modular arithmetic. GF(5) buys two things at once:

- **No multi-digit numbers** — every result stays inside the five tiles.
- **No fractions** — in a field, division is total. `🐱 ÷ 🐶` isn't a fraction, it's
  another tile.

Balanced form `{−2,−1,0,1,2}` makes it read like ordinary numbers that *wrap*: it's a
goose egg plus two ± pairs, which is *exactly* the "egg + cancelling critters"
structure. (Use a **prime** modulus — 5 gives 2 pairs; 3 gives 1; 7 gives 3. The trap
size is 4: GF(4) ≠ mod-4 and behaves alien.)

The field is **invisible plumbing.** The player never needs to know it's GF(5); they
just notice numbers never blow up into digit-strings or fractions, and that sometimes
things vanish in surprising ways.

## Two operations, two "zeros"

- **Addition collapses to the egg** — opposites annihilate (`🦆+🦢 → 🥚`).
- **Multiplication collapses to the duck** — a tile times its *reciprocal* → 🦆 (the
  "1"). And `🐱🐇🐶 → 🦆` (kitty × puppy = 1): the same cat/dog pair adds to the egg
  *and* multiplies to the duck.
- **The egg is a multiplicative black hole** — `🥚 🐇 anything → 🥚`. You can't *make*
  an egg by multiplying (a field has no zero divisors); you make eggs by adding
  opposites, and then the egg devours whatever it's multiplied into.

### Arithmetic worth knowing (for authoring & play)

- **Inverses:** `🦆⁻¹ = 🦆`, `🦢⁻¹ = 🦢`, `🐱⁻¹ = 🐶`, `🐶⁻¹ = 🐱`. (Kitty's inverse
  is **puppy**, *not* duck or goose: `2 · (−2) = −4 = 1`.)
- **×goose = negate** — multiplying any tile by 🦢 (−1) flips it to its opposite.
- **Characteristic 5** — five of anything sums to the egg, and coefficients collapse:
  in `2(x + 2(x+1))`, distributing gives `6x + 4`, and `6 ≡ 1`, so **the six foxes
  graze down to one fox** (`x − 1`) with no division at all. Distributing is usually
  easier than multiplying by an inverse — the field untangles the coefficients for you.

## Why it stays legible (the ugliness cap)

The finite field bounds the mess: a coefficient is **at most two tiles** (magnitude
≤ 2), a constant is one, and there are no fractions or big numbers. The *only* thing
that can sprawl is **nesting depth**, which is author-controlled and **dissolves on
distribute** — the busy state is the "before" of a dramatic simplification, not a
resting state. Everything is flat cubes on the grass; groups are marked *only* by moon
tiles (no containers, ever).

## Calculator (`barnyard-calc.html`)

A second prototype: an **expression editor shaped like a calculator.** Keys are
labeled both ways — a critter face *and* the numeral/symbol it means (`🦆 +1`,
`🐶 −2`, `🦊 x`, `🐭 −x`, `🐇 ×`, `🌜 (`, `🌛 )`). You tap keys to build an expression
of tiles on the green "screen," and:

- **`=` simplifies** — parses the tile line (adjacency = add, 🐇 = multiply,
  🌜🌛 = group) into a canonical linear form over GF(5) and shows the result. Five
  ducks → 🥚; `🦊🐭` → 🥚; `🐱🐇🌜🦊🦆🌛` → `🦊🦊🐱`.
- **`±`** multiplies the whole expression by −1.
- **⌫ / AC** work like a calculator; **tap any tile on the screen to toss it.**
- **🐭 −x** is on the pad as the derived special case: `🐭 = 🦢🐇🦊` (swan × fox = −1·x).

Same boundaries as the solver: **linear only** (`🦊🐇🦊` = x² is politely refused),
and multiplication is scalar × group (no group×group FOIL yet). Self-contained;
open in a browser. `#demo` preloads `2(x+1)`.

## Status & next steps

Playable prototype with five problems (cross / distribute / flip / swap → win).
Deliberately not built yet:

- **Tactile cancellation** — grazing is automatic; the drag-a-duck-onto-a-goose,
  watch-the-egg-pop feel is the next polish.
- **Group × group (FOIL)** — multiplication is currently *scalar* × group
  (`🐱🐇🌜…🌛`); a true `🌜…🌛 🐇 🌜…🌛` product of two sums isn't wired.
- **Multiply-both-sides / division** — no explicit "×k to both sides" move yet; the
  prototype expects you to *distribute*. Add it the day a problem can't be solved by
  distribution alone (a leftover `2x` that won't collapse).
- Standalone `barnyard.html`; not yet folded into the Balance engine.

## Run

Just open `barnyard.html` in a browser — it's a single self-contained file. (Or serve
the folder with the project's Vite dev server.) The `#N` hash loads problem N
(`barnyard.html#4` is the nested one).
