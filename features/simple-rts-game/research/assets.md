# Asset Inventory (addendum)

> Added 2026-08-21, **after** the five research dimensions completed — the pack was
> placed in the repo mid-session. Recorded here rather than folded into the
> dimension docs so its provenance and timing stay clear.

## What arrived

**Kenney "RTS Pack: Sci-Fi"** at `images/` — 255 files, top-down 2D sci-fi.

| Category | Count | Contents (per `Sample.png`) |
|---|---|---|
| Unit | 48 | Infantry, tanks, trucks/transports, turret-like vehicles. Almost certainly team-colour variants of a smaller type set (~4 colours × ~12 types). |
| Structure | 16 | Bases, factories/hangars, refinery-like buildings, silos, radar/dish. |
| Tile | 42 | Ground and path/river tiles with edge and corner variants. |
| Environment | 20 | Props: trees, crystal/rock clusters, ore-like deposits, small debris. |

Two sizes ship: `Default size` and `Retina`.

## Facts that matter downstream

1. **Licence: CC0 1.0 Universal.** Personal and commercial use, no permission
   needed, credit appreciated but not required. **This makes the Phase 9
   dependency-licence audit trivial for art** — CC0 sits comfortably inside the
   configured `supply_chain.license_allowlist` posture. Recommend crediting
   Kenney anyway; it costs a line.
2. **Uniform 64×64 (Retina 128×128) across Unit, Structure, and Tile.** A single
   consistent grid module. This is a genuine gift to the simulation design: a
   64-px tile grid makes deterministic grid A\* the obvious choice (see
   [tech-stack.md](./tech-stack.md) §3) and removes an entire class of
   "what size is a tile" decisions from Phase 5.
3. **Art direction is now settled: top-down sci-fi**, orange/red terrain, purple
   flora, grey-and-orange machinery. The product spec no longer needs to open
   this question — it needs only to *select* from what exists.
4. **Structures include refinery- and silo-like buildings**, and Environment
   includes ore/crystal deposits. The art therefore already supports the
   single-resource economy hypothesised in H2 without any custom asset work.
5. **Team colour appears to be baked into the sprites**, not tinted at runtime.
   Worth confirming in Phase 2/5 — it decides whether player/enemy identity comes
   from swapping sprite keys or from a shader/tint. Either is fine; the choice
   affects the component map.

## Effect on prior findings

- **Reinforces H2.** With a fixed roster of pre-made sprites, the natural design
  pressure is *toward* a small unit set, not away from it. Choosing ~3 unit types
  from 48 sprites is a selection problem, not a production problem.
- **Sharpens the a11y note in [ux-patterns.md](./ux-patterns.md).** If ownership
  is conveyed by baked-in team colour, WCAG 1.4.1 (use of colour) is *already* at
  risk by default. A non-colour ownership differentiator — outline, shape badge,
  or health-bar chrome — must be an explicit spec requirement rather than an
  afterthought.
- **Does not change any red flag.** RF-1…RF-7 stand as written.

## Open questions added for the spec

- Which ~3 unit sprites and which ~3 structure sprites constitute the v1 roster?
- Default size or Retina as the base resolution, and does the game scale up or down from it?
- Is team identity a sprite swap or a runtime tint? (Feeds the a11y requirement above.)
