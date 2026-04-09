# oneshot-testers

Mobile-friendly React launcher for standalone one-page HTML game tests.

## Current structure

- `games/` holds the standalone HTML game files.
- `src/games.js` is the link registry used by the React launcher.
- The launcher should stay simple, touch-friendly, and easy to extend.

## Ongoing project note

When new standalone HTML files are added to `games/`, they should also be added as links in `src/games.js`, then committed and deployed to GitHub Pages.
