# Ten Minute War

A complete RTS skirmish against an AI, in a browser tab, in about ten minutes.
No install, no account, no lobby — the page loads and you are in a match.

**Play it: https://dp-lewis.github.io/rts/**

---

## Running it locally

You need **Node 22 or newer**. Nothing else — Phaser is the only runtime dependency.

```bash
git clone git@github.com:dp-lewis/rts.git
cd rts
npm ci
npm run dev
```

Then open the URL Vite prints (usually <http://localhost:5173/>).

### How to play

Pick a difficulty, then:

| | |
|---|---|
| **Click your Base** | opens its production panel — build a Worker to start mining |
| **Click a Barracks / Factory** | shows what that building trains |
| **Bottom bar** | the buildings you can place; click one, then click valid ground |
| **Drag** | select units |
| **Right-click** | move to ground, attack an enemy — or cancel a pending placement |
| **F3** | debug overlay: tick, fps, ore, army sizes, time-to-first-action |

You start with a Base and 150 ore and nothing else. Workers train at the Base,
Troopers at a Barracks, Tanks at a Factory. Ore nodes run dry, so the map is
meant to be walked.

---

## Commands

```bash
npm run dev            # dev server with hot reload
npm test               # unit tests (~350, a few seconds)
npm run test:watch     # same, in watch mode
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, including the src/sim boundary rules
npm run build          # production bundle into dist/
npm run preview        # serve dist/ — this is what CI and E2E test
```

End-to-end tests need a browser downloaded once:

```bash
npx playwright install chromium
npm run e2e
```

`npm run e2e` builds and serves the **production** bundle rather than using the
dev server. That is deliberate: this project once shipped a bundle containing no
sprites at all while `npm run dev` looked perfect, because the dev server serves
the whole project directory and the bundle does not.

---

## How the code is arranged

```
src/
  sim/      the simulation. Pure, headless, deterministic. No Phaser, no DOM.
  game/     the presentation. Reads sim state, never writes it.
    scenes/   screen flow (Gate, Match, Result) — the first two are DOM controllers
    input/    what a click MEANS — select, orders, placement. No Phaser here.
    render/   drawing — world, ownership rings, effects, jitter
    hud/      DOM overlays — build bar, production panel, alerts, counters
  assets/   sprite roster mapping kinds to Kenney PNGs
tests/
  sim/      headless unit tests
  game/     presentation logic that does not need a browser
  replay/   the corpus — recorded matches replayed hash-for-hash
  e2e/      Playwright, against the production build
```

The split between `sim/` and `game/` is the load-bearing decision in this
codebase, and it is enforced by lint rather than by convention. Inside
`src/sim/` you may not:

- import Phaser, the DOM, or anything from `src/game/`
- use `Math.random`, `Date.now`, `performance`, `window`, `document`, `navigator`
- use transcendental maths (`sin`, `cos`, `atan2`, …)
- use `for...in`, or iterate a `Map`/`Set` directly

Those are not stylistic. The simulation has to produce bit-identical results on
every machine, so anything that varies by platform, clock, or hash order is
banned outright. `npm run lint` will stop you.

---

## The one thing that will surprise you

**If you change how the simulation behaves, the replay corpus will fail — and it
is supposed to.**

`tests/replay/corpus/` holds recorded matches with checkpoint hashes. Every CI run
replays them on four platforms and compares bit-for-bit. Change a constant, a
combat rule, or the map layout, and you will see:

```
Corpus case "003-tuned-baseline" first diverged at tick 1800:
  expected 7592f6b4d50ad981, got decad312a3275aab
```

That is the corpus doing its job: **behaviour moved and you did not declare it.**
If the change was intentional:

1. Bump `SIM_VERSION` **by hand** in `src/sim/version.ts`
2. Run `npm run corpus:regen`
3. Put the hash diff in your pull request

A diff larger than you expected is itself the finding — it means behaviour moved
in more places than you meant. Never bump the version just to turn a red build
green; a failing case at the *current* version is a defect in your code, not a
stale recording.

---

## Other things worth knowing

- **A backgrounded tab freezes the game.** Browsers pause `requestAnimationFrame`
  entirely, so the simulation stops and Phaser stops processing input. This is
  handled — the accumulator clamps and drops the lost time rather than
  fast-forwarding the match you just lost — but it will confuse you if you are
  driving the game from a script.
- **`?test=1` exposes a debug hook** on `window.__tmw` for the E2E suite: read
  tick/ore/verdict, force an outcome, set ore. Strictly gated on the flag, and
  there is a test asserting it is absent without one.
- **Determinism is verified across three platforms** — Node on ubuntu and macOS
  plus Chromium — because a hash that only agrees with itself proves nothing.

---

## Documentation

- `docs/blog-notes.md` — how this was built, what went wrong, and what a
  playtester found that seven milestones of automated checks did not
- `docs/process-comparison.md` — this game was one arm of a two-arm experiment;
  the other used a rich PRD first. What each process bought, and what it cost
- `features/simple-rts-game/` — the full trail: research, product spec, plan, two
  ADRs, 82 tasks, code reviews, change requests, and an implementation log
- `.specify/memory/constitution.md` — the five principles the lint rules enforce

## Credits

Art: [Kenney](https://kenney.nl/) "RTS Pack: Sci-Fi" (CC0).
