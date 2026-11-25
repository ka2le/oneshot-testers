import catalog from "virtual:games";
export const games = catalog.map((game) => ({
  ...game,
  href: `${import.meta.env.BASE_URL}games/${game.file.split("/").map(encodeURIComponent).join("/")}`,
}));
export const unique = (values) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));
export function filterGames(entries, { mode, family, model, game, search }) {
  const query = search.trim().toLowerCase();
  return entries.filter(
    (item) =>
      (mode !== "model" ||
        ((!family || item.family === family) &&
          (!model || item.model === model))) &&
      (mode !== "game" || !game || item.game === game) &&
      (!query ||
        `${item.game} ${item.family} ${item.model} ${item.variant} ${item.file}`
          .toLowerCase()
          .includes(query)),
  );
}
