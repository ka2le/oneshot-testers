import catalog from "virtual:games";

export const UNSPECIFIED = "Unspecified";
export const games = catalog.map((game) => ({
  ...game,
  quant: game.quant || "",
  variant: game.variant || "",
  href: `${import.meta.env.BASE_URL}games/${game.file.split("/").map(encodeURIComponent).join("/")}`,
}));

export const unique = (values) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

// Unspecified always sorts last.
export const byName = (a, b) =>
  (a === UNSPECIFIED) - (b === UNSPECIFIED) || a.localeCompare(b);

export const buildLabel = (item) =>
  [item.quant, item.variant].filter(Boolean).join(" · ") || "Original";

export function filterGames(entries, { family, model, search }) {
  const query = search.trim().toLowerCase();
  return entries.filter(
    (item) =>
      (!family || item.family === family) &&
      (!model || item.model === model) &&
      (!query ||
        `${item.game} ${item.family} ${item.model} ${item.quant} ${item.variant} ${item.file}`
          .toLowerCase()
          .includes(query)),
  );
}

const FAMILY_COLORS = {
  OpenAI: "#00a651",
  Claude: "#ee334e",
  Gemini: "#0081c8",
  Gemma: "#f4a300",
  Qwen: "#1d1d1f",
  LFM: "#0aa5a0",
  MiniCPM: "#7a4dd8",
  Muse: "#d94f9b",
  [UNSPECIFIED]: "#a3aab3",
};
const RINGS = ["#0081c8", "#f4a300", "#1d1d1f", "#00a651", "#ee334e"];
const hash = (text) =>
  [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const familyColor = (family) =>
  FAMILY_COLORS[family] || RINGS[hash(family) % RINGS.length];
export const ringColor = (text) => RINGS[hash(text) % RINGS.length];
