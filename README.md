# oneshot-testers

Mobile-friendly React launcher for standalone one-page HTML game tests.

## Current structure

- `games/` holds the standalone HTML game files.
- The launcher auto-discovers every `.html` file in `games/` at build time.
- The launcher should stay simple, touch-friendly, and easy to extend.

## Ongoing project note

When new standalone HTML files are added to `games/`, they should appear automatically in the launcher on the next build/deploy. The usual workflow is: add files, commit, and deploy to GitHub Pages.

## Paste HTML loader

The launcher also includes a paste-to-preview feature. If a user pastes HTML into the UI, it can be opened locally in the browser for quick testing without adding the file to the repo.
