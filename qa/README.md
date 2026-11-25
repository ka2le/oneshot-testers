# WILDFANG — Tail & Coil Flow Lab

The game is `../games/wildfang.html`. It needs no other files, server, libraries, or network connection. Open that file directly to play.

The simulator executes the HTML's actual game script in a fresh function scope with small DOM/canvas stubs. It sends steering and ability inputs to the same movement, body, collision, capture, growth, XP, and scoring code used in the browser. Cosmetic randomness is separate from seeded gameplay. There is no second approximation of combat.

## Repeat the checks

From the source checkout, with Node.js:

```text
node qa/wildfang.test.cjs
node qa/simulate-flow.cjs --full
```

The full batch plays five seeds with four control policies, then repeats two cases at a phone viewport: 22 runs at 60 updates per second. It regenerates `qa/flow-results.json` and the standalone interactive `games/wildfang-flow-lab.html`.

Focused tuning:

```text
node qa/simulate-flow.cjs --quick --out=tuning.json
node qa/simulate-flow.cjs --profile=hunter --seed=3400 --fps=60 --out=focused-run.json
```

Lower FPS can help exploration but changes collision sampling. Final validation uses 60 Hz, matching the game. The engine is isolated by function parameters; this produces the same deterministic inputs/results as the older VM harness while avoiding its global-proxy overhead.

## Body rules

- Start with 64 segments. Length is life; below 8 ends the expedition. Normal capacity is 120, increased by Long Story.
- A distance-sampled trail preserves bends at 8 units per segment. Enemies collide with the tail's line segments, beginning behind the vulnerable neck. Substeps prevent fast movement from tunneling through walls or the head.
- Closing your head against a distant part of your tail creates a real polygon. Only enemies inside a sufficiently large closed loop are captured. Open arcs and tiny knots do not count. Crossing your own tail is safe.
- Jaw strength is compared with current armor. Holdable enemies are blocked and exhausted by body contact. Stronger enemies telegraph a bite before cutting, losing part of the rear tail and briefly breaching that wall. Closed loops give strong enemies a short breakout warning: timely hardening can complete the capture.
- Head hits take a percentage of current length, subject to armor and a minimum of four segments. Cuts normally remove up to half the body, with a six-segment minimum. Braided Spine limits major cuts further. A brief grace period prevents one collision from hitting every frame.
- Lost tail drops temporary scraps worth 45% of the loss, improved by Leave No Scale. Scraps award neither XP nor score. Ordinary fruit, growth fruit, and captured prey rebuild length.
- Long bodies trade speed for reach. Each evolution molts 18% of length, never reducing an already-short snake below 24 or healing it for free. The new level adds 0.55 base armor and 1.8% base movement speed. Silken Molt reduces future shedding.
- Surge gives speed and steering for 0.7 seconds. It deals no damage and grants no head invulnerability. Harden adds 3 armor for 2.2 seconds. Both have cooldowns and upgrades.

## Fifteen-minute progression

Runs end at exactly 900 seconds of active play. Pause and evolution choices stop the clock. Levels 2–10 cost 260, 340, 430, 520, 600, 680, 740, 800, and 860 XP (5,230 total). No XP or levels are granted by time. After level 10, food still grows the body and earns score.

Refuges, wilds, and hunting grounds use 55%, 100%, and 155% spawn pressure. Hunting grounds add 0.5 jaw strength and pay 160% of normal hunt points. Pressure also cycles through roaming, hunts, stillness, and regrowth. Wardens appear at 3:30, 7:00, 10:30, and 13:30; early wardens retreat after 100 seconds. Capturing them reduces normal spawn pressure for 35 seconds.

Score combines foraging, captures/holds, exploration, survival, and finishing length. True encirclements earn 50% more hunt points than wall exhaustion. Warden captures pay extra. Records use `wildfang-runs-v3`, keeping earlier combat scores separate. Restart offers a new world or the same seed. Gameplay spawning does not depend on viewport size.

## Policies and limits

- **Forager:** seeks food, avoids heads, uses hardening against active cutters, and turns toward refuges at low length. Favors gathering and speed upgrades.
- **Hunter:** plans circles around fixed world positions to close real loops; prefers armor, movement, and containment. Uses hardening when a loop is resisted and surges away from close head threats.
- **Explorer:** hunts opportunistically, reacts more slowly, and favors food ahead. Its speed-heavy choices expose the tradeoff against armored enemies.
- **Idle control:** never steers or activates abilities. Accepts choices to keep the simulation moving.

Bots get no free length, XP, captures, damage, or survival guarantees. These simple policies measure pacing and expose failures; they do not establish a human completion rate or prove that every build is equally strong. Inspect length, armor, captures, cuts, score, and level curves in the report. Earlier deaths remain visible rather than being omitted from the results.

The regression suite covers closed/open loop geometry, high-speed tail blocking, armor thresholds, cutter escape, head damage, length recovery, molting, pause, swipe retention, biome/area variation, seeded replay, optional wardens, the 15-minute finish, and immutable post-death records. Desktop and phone layouts are also checked in a real browser.

## Story and browser checks

`npm test` also runs Ninth Tide’s exhaustive story traversal against `games/the-ninth-tide.html`.

For the existing optional browser suites, first start Vite with `npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`, then in another terminal run `npm run test:browser`. These scripts use the installed Chrome browser through Playwright. Set `QA_BROWSER_CHANNEL=msedge` to use Edge, or `QA_BASE_URL` to change the games directory URL. No machine-specific paths are required.

The checked-in screenshots and flow results came from the original game QA. The November 25 archive update reran the gameplay regressions and exhaustive traversal; it did not rerun the full playing-strength simulation or every historical browser playthrough.
