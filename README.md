# OneShots

A game archive. Pick a model family or model on the left (chips on mobile); switch between **Games** (each game lists the models that made it), **Models** (each model lists its games), and **New** (individual builds, newest additions first). Addition dates come from Git history, with local file creation dates as a fallback for uncommitted files or source exports; an optional `addedAt` catalog override can supply an ISO date. Builds without a known model are grouped under **Unspecified**. The selected view, search and filters stay in the URL. Paste HTML opens an isolated temporary preview.

Choose **Compare** beside two builds, then **Compare 2 builds**. Both game/model/build/quantization credits remain visible while you try A or B in the player. Only one game runs at a time; switching restarts it. Change either selection directly in the comparison, inspect its file details, or open its original page if the game needs a larger window or does not work embedded. Published games retain their ordinary archive origin and saved browser state, just as when opened directly; they are not isolated from the archive. Selected builds are included in the archive URL. These are qualitative comparisons of saved artifacts, which may have different prompts or revisions, not benchmark scores.

The comparison player defaults to **Fit 960 × 900**, scaling a larger game viewport into the available space so fixed-size games can remain visible beside their credits. Uncheck it to try the available window size instead; changing this setting does not reload the game.

**Paste HTML** supports **Preview → Back to edit** without losing code. Close or Escape retains the draft for this page session; **Discard code** clears it. Reloading the page clears the pasted draft. This preview does not publish anything and cannot supply missing local asset files.

Live archive: https://ka2le.github.io/oneshot-testers/

## Upload and deploy

On Windows, double-click **Start-Uploader.cmd**, or run:

```sh
npm ci
npm run uploader
```

Open **http://127.0.0.1:4397**. Fill in **Game**, **Model** (e.g. `Qwen`), optional **Model version** (e.g. `3.6-35B-A3B`) and **Quantization** (e.g. `Q4_K_M`). Model and model version are joined into the model credit; the family is detected from it. **Game build** is a separate optional attempt/revision label, such as `v2` or `second attempt`; it does not change the model identity. The composed credit is shown beneath the fields and all five values are saved as a browser draft.

Choose files, a folder, or ZIPs. Drag and drop works too. ZIPs and folders retain their paths; use relative asset references such as `css/style.css` and `images/cover.png`. Mixed ZIPs and loose assets can be uploaded together, provided paths do not collide. **Included files** lists the staged paths. **Starting page** shows the selected HTML entry even when there is only one; with several entries, select the one to launch. **Replace files/folder** replaces the package only after the replacement validates. Canceling selection or supplying an invalid package keeps the previous package and starting page.

**Preview game** runs the chosen starting page with its assets before publication. **Back to upload** or Escape returns to the unchanged form. The preview uses a separate, temporary loopback origin with an enforced sandbox, cannot access publisher APIs, and never builds, commits or publishes. External services, nested frames, browser storage and some browser APIs are unavailable in this preview; use it to inspect the package, not as proof of every gameplay feature. The preview origin closes with the uploader.

Press **Publish game**. The server runs `scripts/deploy.mjs` on your computer to:

1. Check that source is clean, on `main`, and not behind `origin/main`.
2. Add the upload under its own `games/uploads/<game>/<model>-<id>/` folder and register its metadata. Other HTML pages in the upload remain available as supporting pages.
3. Build the launcher and copy the complete game trees, including assets.
4. Commit only that game's files and `catalog.json`, then push `main`.
5. Publish `dist/` to the existing `gh-pages` branch.

For design or feature changes, use **Publish site changes** above the upload form. It needs no game name, model or upload. It builds the current checkout, commits changed project files, pushes `main`, publishes GitHub Pages, and waits for the live deployment marker before reporting success. It also works when there are no new source changes.

Progress and errors appear in the form and terminal. Build failures roll back the import before committing. If publishing fails after a commit, **Retry publishing** pushes and publishes the existing commit. After restarting the server, `npm run deploy` provides the same recovery. While GitHub Pages updates, the job remains Publishing; Published means the new deployment was verified live.

The job shows its current stage: checking source, preparing files, building, saving, pushing, publishing or verifying live. On failure it names the failed stage and places recovery before the diagnostic log. **Retry publishing saved source** does not import another copy of the game. A lost connection keeps publishing controls locked until **Reconnect** checks the existing job; reconnecting never starts publication. If a restart lost the job history, the UI clears the old tracking ID and advises checking the terminal/archive before another publish. Expired staged files offer **Choose files again** while preserving metadata.

The server binds only to `127.0.0.1`, checks the request origin and a session token, and never executes uploaded code on the server. Limits: 100 MB total input, 500 selected files, 2,000 extracted files, 250 MB expanded. Links, unsafe paths, encrypted archives and path collisions are rejected. Staged files expire after one hour. Close the uploader's terminal to stop it; drafts remain in the browser, but staged uploads must be selected again after a restart. Change the port using `ONESHOTS_UPLOAD_PORT`.

Requires Node **22.12+**, Git, and GitHub credentials with push access to this repository. Your computer's existing Git credential manager is used; the form does not need a token or password. `gh-pages` is installed locally and locked in `package-lock.json`.

## Source layout

- `src/`: React archive and styles.
- `games/`: original static game files and assets; recursive discovery.
- New local game files were imported on 2026-11-25. Existing repository versions were preserved; local copies that differed only in line endings were omitted. Identical HTML copies are listed once.
- `catalog.json`: optional per-path overrides for `game`, `family`, `model`, `quant`, `variant`, `hidden`, and `keepDuplicate`. Filename inference fills gaps (quant suffixes such as `Q4_K_M` or `UD-IQ4_NL` are split from the model name); unknown model credits stay **Unspecified**.
- `uploader/`: separate local HTTP server and upload form. It is excluded from the published website.
- `scripts/`: catalog discovery, raw-asset copying and deployment.
- `tests/`: upload and Git/deployment integration tests, using temporary repositories.
- `qa/`: imported Wildfang and Ninth Tide suites, simulation tools, reports and original visual evidence.

The Drink Atlas bundle is kept beside the game under `games/drinks-assets/`. The missing `audio.js` referenced by AutumNation V3/V5 was recovered from the local AutumNation project's public folder.

## Development and checks

```sh
npm run dev
npm test
npm run build
npm run test:ui
```

Open Vite's printed URL. Games are served as raw files during development and copied unchanged into `dist/games/` during builds; their relative images, CSS and scripts continue to work. A new HTML file in `games/` is discovered automatically. The flow report is supporting material, so it is hidden from the game launcher.

`npm test` runs catalog/upload/deployment checks, Wildfang's gameplay regressions and Ninth Tide's exhaustive story traversal. See `qa/README.md` for longer simulations and optional real-browser checks.

After building, `node qa/new-view.mjs` checks the New view's chronological order, keyboard activation, URL reload, search, family filters and comparison selection at desktop and phone widths, including enlarged text. Screenshots are saved in `.local/ui-evidence/`.

`npm run test:ui` builds the production archive and exercises the archive and real uploader frontend at desktop and phone sizes in headless Playwright. Deployment callbacks are controlled local simulations: this browser suite never commits, pushes or publishes. It covers package inspection/replacement/expiry, nested-folder assets, isolated previews, distinct build metadata, publication phases/recovery/reconnect, missing jobs, pasted-code editing, keyboard focus, enlarged text and comparison selection/player controls. Comparison controls use a deterministic player fixture plus a real archived Snake smoke check, including saved state and full-canvas fit; it does not test every archived game's internals. Screenshots and a results manifest are written to ignored `.local/ui-evidence/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if the installed Chromium is not in Playwright's default location. `npm test` deployment integration cases use temporary Git repositories and local bare remotes, never this checkout or its GitHub remote.

To build, commit and publish the current site from the command line:

```sh
npm run deploy
```

This builds the current project, commits its changed source files, pushes `main`, publishes GitHub Pages, and verifies the live update. Build failures preserve your local edits. `npm run publish` builds and publishes the current files without creating or pushing a source commit; use it only when source is already saved. `Deploy.cmd` is a Windows shortcut for `npm run deploy`.
