# MovieHex

A daily movie-title **chain** game on a hex board. You hop from movie to movie —
each film's **last word** must be the next film's **first word** — trying to get
from a **START** title to a **TARGET** title.

> `BETTER OFF DEAD` → `DEAD POETS SOCIETY` → … reads as one absurd run-on:
> *"Better Off Dead Poets Society…"* — which is the shareable trophy.

This is a **prototype**. The generation pipeline is solid; the core game loop is
still an open design question (see [Status](#status-and-open-question)).

## Play it

Everything is plain JavaScript with **no dependencies** — just Node and a browser.

```sh
node build-play.mjs   # generates a fresh board -> open play.html
node build-board.mjs  # a pan/zoom MAP of a generated board -> open board.html
```

- **Center hex** = where you are. The **six neighbor slots** hold the titles you
  can hop to (a title whose first word matches your last word). Fewer than six
  exits scatter into random slots; the rest sit dim.
- Each door shows its title with the **last word in gold** — your only clue to
  how "fertile" that direction is (a common word → more options ahead; a rare
  word → likely a dead end).
- **Longer route scores higher** (each hop +1); **each backtrack −2**. Par is the
  shortest solve, so beating it means finding a *scenic* route, not a short one.
- Some doors are **traps** — decoys that dead-end and never reach the target. They
  look like any other door; only the gold word warns you.

## The pipeline

| file | what it does |
|------|--------------|
| `mine.mjs`, `mine-full.mjs` | **Bridge-miner.** Build the last-word→first-word graph; rank word *fertility* (hubs vs dead-ends); surface **surprising bridges** (barren-looking word → one famous escape, e.g. `KING KONG → KONG: SKULL ISLAND`) and **false friends** (fertile-looking words that are near-dead). |
| `build-board.mjs` | **Board generator.** Pick a well-fed target, grow its ancestors *backward* through hub words, induce every valid link, pick a deep start, and cull to the start's forward cone (reachable-from-start **and** reaches-target). Emits `board.html`. |
| `generate.mjs` | A simpler single-board pass (spine + reverse-reachability labels). |
| `generate-many.mjs` | **Viability probe** — ~3,100+ distinct quality boards from 8k attempts (≈8 years of dailies) on the toy corpus alone. |
| `build-play.mjs` | The **playable** hex-flower `play.html` (branchy-board gate + traps). |
| `movies-famous.txt` | Corpus: **~18k IMDb films with ≥5,000 votes**, uppercased. Recognizable titles, denser link graph (avg out-degree ~3.7). |
| `movies.txt` | The original ITA Software "Sling Blade Runner" list (6,589 titles). |

## Corpus / data

Titles come from the free [IMDb bulk datasets](https://datasets.imdbws.com/):
`title.basics` (titles + type) joined with `title.ratings` (vote counts), filtered
to `titleType == movie` with `numVotes >= 5000`. The raw dumps (~224 MB) live in
`_imdb/` and are **gitignored** — only the processed `movies-famous.txt` (~290 KB)
is committed. To rebuild:

```sh
mkdir -p _imdb
curl -sk https://datasets.imdbws.com/title.ratings.tsv.gz -o _imdb/ratings.tsv.gz
curl -sk https://datasets.imdbws.com/title.basics.tsv.gz  -o _imdb/basics.tsv.gz
zcat _imdb/ratings.tsv.gz | awk -F'\t' 'NR>1 && $3>=5000{print $1}' > _imdb/hot.txt
zcat _imdb/basics.tsv.gz | awk -F'\t' 'FNR==NR{h[$1];next} $2=="movie" && ($1 in h){print toupper($3)}' _imdb/hot.txt - | sort -u > movies-famous.txt
```

## Status and open question

**What works:** the generation pipeline (thousands of distinct, solvable,
multi-path boards), the blooming hex-flower presentation, and the merged-phrase
artifact.

**The unresolved core:** the loop doesn't yet reliably test *skill or knowledge*,
so there's no felt accomplishment and nothing to challenge a friend with. The
diagnosis and the fork:

- The board **shows you the movies**, so it never tests movie *knowledge* — a buff
  and a novice play identically. Making the player *recall* the movies fixes that
  but lands squarely in the **most saturated** movie-game genre.
- With hidden info + free backtracks, the *choice* is low-stakes guessing, not
  skill — and a luck-based game can't be genuinely competitive.

The most promising un-derivative direction on the table: **reveal the whole board
and make it a longest-path optimization** ("wander as far as you can from A to B on
today's board"). Finding the longest simple path is NP-hard, so it's real skill
even fully visible; it's deterministic, so it's *beatable* ("I got 17 hops, beat
that"); and it's not a shortest-path/recall chain game. The cost: it tests
route-*planning*, not movie recall — movies become flavor + the phrase.

**Considered and rejected:**
- Variable link rules (connect by shared year / actor / director) → that's Six
  Degrees: both the most-cloned movie game *and* pure trivia recall.
- Auto-gliding through forced (single-door) corridors → confusing (you teleport
  past titles you never see).
- Pruning out-degree-1 nodes / a "generative stack" to force branchiness → the
  link graph is too sparse: pruning cascades the board to nothing, generative
  growth collapses to shallow blobs. The realistic fix was corpus density, not an
  algorithm trick.
