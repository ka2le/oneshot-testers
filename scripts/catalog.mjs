import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "..");
export function inferMetadata(file) {
  const stem = path.basename(file, ".html");
  const match =
    /(?:^|[- ])(GPT|Gemma|Qwen|Claude|calude|Opus|Sonnet|Gemini|MiniCPM|LFM|Muse|Astra)/i.exec(
      stem,
    );
  let game = match?.index > 0 ? stem.slice(0, match.index) : stem;
  let model = match
    ? stem
        .slice(match.index)
        .replace(/^[- ]+/, "")
        .replace(/^calude/i, "Claude")
        .replace(/^(Opus|Sonnet)/i, "Claude-$1")
    : "Unspecified";
  const family = /^(GPT|Astra)/i.test(model)
    ? "OpenAI"
    : /^Gemma/i.test(model)
      ? "Gemma"
      : /^Qwen/i.test(model)
        ? "Qwen"
        : /^Claude/i.test(model)
          ? "Claude"
          : /^Gemini/i.test(model)
            ? "Gemini"
            : /^MiniCPM/i.test(model)
              ? "MiniCPM"
              : /^LFM/i.test(model)
                ? "LFM"
                : /^Muse/i.test(model)
                  ? "Muse"
                  : "Unspecified";
  if (match?.index === 0)
    game = /openclaw/i.test(stem)
      ? "Emoji · OpenClaw"
      : /emoji/i.test(stem)
        ? "Emoji chat"
        : "Chat test";
  if (/^TowerFood/i.test(stem)) game = "Tower Food";
  if (/^SnakeExplore/i.test(stem)) game = "Snake Explore";
  else if (/^Snake-/i.test(stem)) game = "Snake";
  if (/^LaneTap/i.test(stem)) game = "Lane Tap";
  if (/^NumberClick/i.test(stem)) game = "Number Click";
  if (/^AutumNation/i.test(stem)) game = "AutumNation";
  if (/^Aura-Farm/i.test(stem)) game = "Aura Farm";
  if (/^echo-maze/i.test(stem)) game = "Echo Maze";
  let variant = "";
  const revision = model.search(/-(?:\d+shot|try\d|reskin|v\d|modified)| - /i);
  if (revision > 0) {
    variant = model.slice(revision).replace(/^[- ]+/, "");
    model = model.slice(0, revision);
  }
  if (/^AutumNation/i.test(stem))
    variant = stem.match(/V\d+(?:_balance\d+)?/i)?.[0] || "";
  if (/^echo-maze/i.test(stem))
    variant = stem.match(/v\d+/i)?.[0] || "Original";
  if (match?.index === 0) {
    const context = model.search(/-(?:openclaw|chat)/i);
    if (context > 0) {
      variant = [model.slice(context + 1), variant].filter(Boolean).join(" · ");
      model = model.slice(0, context);
    }
  }
  model = model
    .replace(/^gpt/i, "GPT")
    .replace(/^qwen/i, "Qwen")
    .replace(/^gemma/i, "Gemma")
    .replace(/^Astra(?:[- ]?6(?:\.0)?)?$/i, "Astra 6.0")
    .replace(/^Astra-?(\d)/i, "Astra $1")
    .replace(/^Claude-Opus-?/i, "Claude Opus ")
    .replace(/^Claude-Sonnet-?/i, "Claude Sonnet ");
  game = game.replace(/[- ]+$/, "").replace(/-/g, " ");
  const { model: base, quant } = splitQuant(model);
  return { game: game || stem, family, model: base, quant, variant };
}

// "Qwen3.6-35B-A3B-UD-Q4_K_XL" -> model "Qwen3.6-35B-A3B", quant "UD-Q4_K_XL"
export function splitQuant(model) {
  const match =
    /[- ]((?:UD-)?I?Q\d(?:[_-](?:K|XL|M|S|L|NL|N|0|1))*|bf16|fp16)(?=$|[- ])/i.exec(
      model,
    );
  if (!match || match.index === 0) return { model, quant: "" };
  return {
    model: (model.slice(0, match.index) + model.slice(match.index + match[0].length))
      .replace(/[- ]+$/, ""),
    quant: match[1],
  };
}

export async function readCatalog(directory = root) {
  const overrides = JSON.parse(
    await readFile(path.join(directory, "catalog.json"), "utf8"),
  );
  const files = [];
  async function walk(folder, prefix = "") {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const file = prefix + item.name;
      if (item.isSymbolicLink())
        throw new Error(`Symbolic link in games: ${file}`);
      if (item.isDirectory())
        await walk(path.join(folder, item.name), file + "/");
      else if (/\.html$/i.test(file)) files.push(file);
    }
  }
  await walk(path.join(directory, "games"));
  const seen = new Set(),
    entries = [];
  files.sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
  for (const file of files) {
    const metadata = overrides[file];
    if (metadata?.hidden) continue;
    const html = await readFile(path.join(directory, "games", file));
    const hash = createHash("sha256")
      .update(html.toString("utf8").replace(/\r\n/g, "\n").trim())
      .digest("hex");
    if (seen.has(hash) && !metadata?.keepDuplicate) continue;
    seen.add(hash);
    const inferred = inferMetadata(file);
    if (metadata?.model && !("quant" in metadata)) inferred.quant = "";
    entries.push({ id: file, file, ...inferred, ...metadata });
  }
  return entries.sort(
    (a, b) =>
      a.game.localeCompare(b.game) ||
      a.model.localeCompare(b.model) ||
      a.file.localeCompare(b.file),
  );
}
