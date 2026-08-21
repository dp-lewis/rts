# Competitor Analysis: Simple Browser RTS

> Generated: 2026-08-21 · 8 competitors + 4 open-source reference implementations
> Tests hypothesis **H1** — "the quick-session browser RTS niche is genuinely underserved."

## Executive Summary

**H1 is CONFIRMED, but with an important correction to its framing.** The browser
RTS space is *not* empty — it is actively populated (BrowserRTS, Honest War,
Littlewargame, a large itch.io HTML5 RTS tag). What is genuinely absent is the
*session length* we are targeting. Every credible browser RTS found competes on
**scale and persistence**: thousands of units, enormous maps, MMO-style servers,
long-form empire building. They are browser-delivered *big* RTS games, not short
ones. The 10-minute complete-match-arc slot is empty — not because nobody can
build it, but because nobody has chosen to.

The second finding is more sobering. The dominant competitor pattern is
**multiplayer**. Littlewargame, BrowserRTS, and Honest War all lead with PvP.
Single-player-vs-AI is consistently the *afterthought* mode, when present at all.
This is a real signal about where the retention comes from in this genre — and it
points directly at our Risk R2 (the real competitor is "play nothing"). A
single-player-only v1 forgoes the retention mechanism the entire category relies
on. That is a defensible v1 decision, but it should be a *knowing* one.

Third: **the strongest reference implementations are open-source and old.**
Aditya Ravi Shankar's Command & Conquer HTML5 recreation and Anders Evenrud's
`cncjs` are the best-documented full-RTS-in-JavaScript codebases available, and
both predate modern tooling. Neither is a live competitor; both are excellent
architectural references.

## Competitors Analyzed

### 1. Littlewargame — [4/5] · closest analogue
- **Feature:** Full browser RTS, HTML5, no download / no plugin / **no registration**.
- **Core UX pattern:** Workers → buildings → soldiers/archers → attack enemy base. Classic base-building loop.
- **Differentiator:** **Gold is the only resource.** This is the single most important competitive datapoint we found — a shipped, well-reviewed browser RTS independently arrived at exactly the mechanic reduction hypothesised in H2, and reviewers explicitly cite it as a *virtue* ("so you can focus all your attention on that").
- **Access:** Free, no account.
- **User sentiment:** Positive within a niche audience; "RTS fans highly recommend trying this game out." Community map editor drove longevity.
- **Relevance:** Our nearest neighbour by design philosophy. Differs in that it leads with multiplayer and has no short-session framing.
- **Reference:** https://littlewargame.com/

### 2. BrowserRTS — [3/5] · scale competitor
- **Feature:** Large-scale browser RTS: streaming resource economy, sprawling bases, **thousands of units**, enormous maps.
- **Core UX pattern:** Total Annihilation / Supreme Commander lineage — macro-first, economy-as-flow.
- **Differentiator:** Raw scale in a browser; explicitly positions against TA/SupCom/C&C/AoE nostalgia.
- **Access:** Free.
- **Relevance:** **Direct opposite of our positioning.** Confirms the niche is contested at the "big" end and vacant at the "short" end.

### 3. Honest War — [3/5] · persistent multiplayer
- **Feature:** Full online RTS, no download/install: base → economy → army → fight *real players*.
- **Core UX pattern:** Persistent server-based competitive play.
- **Differentiator:** Real-player PvP as the entire proposition.
- **Relevance:** Reinforces the pattern — browser RTS ≈ multiplayer RTS.

### 4. Territory-control / .io-style expansion games — [3/5] · the actual short-session incumbent
- **Feature:** Fast-paced territory expansion on a world map; overwhelm opponents by numbers.
- **Core UX pattern:** One mechanic (send N units at target), zero build order, instant comprehension.
- **Differentiator:** **Time-to-comprehension measured in seconds.** No tutorial required.
- **Relevance:** This is the genuine competitor for our target session and our target player — not StarCraft. It wins on legibility and loses on depth. **Our opportunity is precisely the gap between these two poles.**

### 5. itch.io HTML5 `rts` tag — [2/5] · the long tail
- **Feature:** Large volume of small/experimental browser RTS entries.
- **Relevance:** Low individual threat, but proves low barrier to entry and that the niche is *attempted* often. Differentiation must come from execution quality, not novelty.

### 6. Command & Conquer HTML5 (Aditya Ravi Shankar) — [4/5] · reference, not competitor
- **Feature:** Faithful C&C recreation entirely in HTML5/JavaScript; later versions added levels, units, effects, music, and experimental Node.js multiplayer.
- **Access:** Free. **The early demo was open-source; the finished game is not.**
- **Relevance:** Best-documented proof that a complete classic RTS runs well in a browser with plain JS. The open demo remains a usable architectural reference.
- **Reference:** https://adityaravishankar.github.io/command-and-conquer/

### 7. `cncjs` (Anders Evenrud) — [4/5] · reference, open source
- **Feature:** JavaScript recreation of Westwood's C&C.
- **Relevance:** Open-source, readable, covers sprite/unit/selection/order systems. Strong prior art for unit command handling.
- **Reference:** https://github.com/andersevenrud/cncjs

### 8. 0 A.D. — [4/5] · out-of-category reference
- **Feature:** Mature, free, open-source full RTS (native, C++/JS).
- **Relevance:** Not a browser competitor. Valuable as a reference for RTS *simulation architecture* and for how a serious project structures sim vs. presentation.

## Common Patterns (table stakes)

| Pattern | Prevalence | Implication for us |
|---|---|---|
| No download, no plugin, no install | Universal | Non-negotiable. Already our design. |
| **No registration to start playing** | Littlewargame, most .io | **Adopt. Any account wall violates R2 directly.** |
| Worker → building → military unit loop | Universal | Players arrive with this mental model already loaded. Exploit it; do not reinvent it. |
| Drag-select + right-click-to-order | Universal | Do not innovate here. Deviation costs comprehension. |
| Multiplayer as headline mode | Dominant | **We deliberately depart from this.** Record as a knowing trade-off. |
| Minimap | Common | Consider deferring for a small single-screen map — see H2. |

## Differentiation Opportunities (ranked by impact)

1. **The complete arc in ~10 minutes.** No competitor found targets or advertises a bounded, short, *finishable* match. Every one is open-ended or long-form. This is the clearest white space and maps exactly to our JTBD.
2. **Legibility without dumbing down.** Territory-control games are instantly legible but strategically thin; browser RTS games are deep but demand a tutorial. Littlewargame's single-resource design proves the middle exists and is under-occupied.
3. **Zero-friction cold start.** No account, no lobby, no matchmaking queue. Single-player-vs-AI is a *weakness* for retention but an outright *strength* for cold-start friction — the player is in a match the instant the page loads. This reframes our single-player choice as a positioning advantage rather than a compromise.
4. **Honest determinism / replay as a feature.** No browser competitor advertises replays or shareable match seeds. Our constitution forces us to build the machinery anyway (Principles I & IV) — surfacing it as "share this match" is differentiation obtained essentially for free. *(Speculative; noted for the spec, not committed.)*

## Top 3 Reference Implementations

1. **Littlewargame** — closest design philosophy; single-resource economy is direct empirical support for H2. Study its unit roster and build tree for scope calibration.
2. **`cncjs` (open source)** — readable JavaScript RTS covering selection, ordering, and unit state machines; the systems most likely to be underestimated in our plan.
3. **Aditya Ravi Shankar's C&C HTML5** — proof of full-RTS feasibility in-browser plus a written account of the build; the open demo is the inspectable part.

## Gaps in this analysis

- No competitor was play-tested directly; findings derive from documentation, reviews, and press. Sentiment data is thin and skews to enthusiast sources.
- No reliable player-count or revenue figures are publicly available for any browser RTS found. Market *sizing* is therefore unestablished — consistent with the Weak validation strength recorded in Phase 0, and not resolvable by desk research.

## Sources

- https://littlewargame.com/ · https://www.pcgamesn.com/indie/littlewargame-multiplayer-rts-runs-entirely-your-browser
- https://browserrts.com/ · https://honestwar.com/browser-rts/
- https://itch.io/games/html5/tag-rts
- https://adityaravishankar.github.io/command-and-conquer/ · https://github.com/adityaravishankar/command-and-conquer
- https://github.com/andersevenrud/cncjs · https://osgameclones.com/command-conquer/
- https://en.wikipedia.org/wiki/0_A.D._(video_game) · https://en.wikipedia.org/wiki/Real-time_strategy
