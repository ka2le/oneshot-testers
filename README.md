# OneShots

A game archive with two ways to explore: **By game** compares versions from every model; **By model** filters by family, then model. Search covers game names, models, versions and original filenames. Filters stay in the URL. Paste HTML opens an isolated temporary preview.

Live archive: https://ka2le.github.io/oneshot-testers/

## Upload and deploy

On Windows, double-click **Start-Uploader.cmd**, or run:

```sh
npm ci
npm run uploader
```

Open **http://127.0.0.1:4397**. Name the game, pick or type its model, and optionally set the family and version. Choose files, a folder, or ZIPs. Drag and drop works too. ZIPs and folders retain their paths; use relative asset references such as `css/style.css` and `images/cover.png`. Mixed ZIPs and loose assets can be uploaded together, provided paths do not collide. Choose the HTML entry page when there is more than one.

Press **Deploy game**. The server runs `scripts/deploy.mjs` on your computer to:

1. Check that source is clean, on `main`, and not behind `origin/main`.
2. Add the upload under its own `games/uploads/<game>/<model>-<id>/` folder and register its metadata. Other HTML pages in the upload remain available as supporting pages.
3. Build the launcher and copy the complete game trees, including assets.
4. Commit only that game's files and `catalog.json`, then push `main`.
5. Publish `dist/` to the existing `gh-pages` branch.

Progress and errors appear in the form and terminal. Build failures roll back the import before committing. If publishing fails after a commit, **Retry publishing** pushes and publishes the existing commit. After restarting the server, `npm run deploy` provides the same recovery. GitHub Pages can take a minute to update.

The server binds only to `127.0.0.1`, checks the request origin and a session token, and never executes uploaded code on the server. Limits: 100 MB total input, 500 selected files, 2,000 extracted files, 250 MB expanded. Links, unsafe paths, encrypted archives and path collisions are rejected. Staged files expire after one hour. Close the uploader's terminal to stop it; drafts remain in the browser, but staged uploads must be selected again after a restart. Change the port using `ONESHOTS_UPLOAD_PORT`.

Requires Node **22.12+**, Git, and GitHub credentials with push access to this repository. Your computer's existing Git credential manager is used; the form does not need a token or password. `gh-pages` is installed locally and locked in `package-lock.json`.

## Source layout

- `src/`: React archive and styles.
- `games/`: original static game files and assets; recursive discovery.
- New local game files were imported on 2026-11-25. Existing repository versions were preserved; local copies that differed only in line endings were omitted. Identical HTML copies are listed once.
- `catalog.json`: optional per-path overrides for `game`, `family`, `model`, `variant`, `hidden`, and `keepDuplicate`. Filename inference fills gaps; unknown model credits stay **Unspecified**.
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
```

Open Vite's printed URL. Games are served as raw files during development and copied unchanged into `dist/games/` during builds; their relative images, CSS and scripts continue to work. A new HTML file in `games/` is discovered automatically. The flow report is supporting material, so it is hidden from the game launcher.

`npm test` runs catalog/upload/deployment checks, Wildfang's gameplay regressions and Ninth Tide's exhaustive story traversal. See `qa/README.md` for longer simulations and optional real-browser checks.

To publish changes you have already committed:

```sh
npm run deploy
```

This pushes `main`, builds, and publishes GitHub Pages. `npm run publish` builds and publishes the current files without creating or pushing a source commit; use it only when source is already saved. `Deploy.cmd` is a Windows shortcut for `npm run deploy`.
