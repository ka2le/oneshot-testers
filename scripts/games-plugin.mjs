import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { readCatalog, root } from "./catalog.mjs";

export function gamesPlugin() {
  let config;
  return {
    name: "oneshot-games",
    configResolved(value) {
      config = value;
    },
    resolveId(id) {
      if (id === "virtual:games") return "\0virtual:games";
    },
    async load(id) {
      if (id === "\0virtual:games")
        return `export default ${JSON.stringify(await readCatalog())}`;
    },
    configureServer(server) {
      server.middlewares.use(
        `${config.base}games`,
        express.static(path.join(root, "games")),
      );
      server.watcher.add([
        path.join(root, "games"),
        path.join(root, "catalog.json"),
      ]);
      const refresh = (file) => {
        if (
          file.startsWith(path.join(root, "games")) ||
          file === path.join(root, "catalog.json")
        ) {
          const mod = server.moduleGraph.getModuleById("\0virtual:games");
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: "full-reload" });
        }
      };
      server.watcher
        .on("add", refresh)
        .on("change", refresh)
        .on("unlink", refresh);
    },
    async closeBundle() {
      if (config.command !== "build") return;
      const dist = path.resolve(root, config.build.outDir);
      await mkdir(dist, { recursive: true });
      await cp(path.join(root, "games"), path.join(dist, "games"), {
        recursive: true,
      });
    },
  };
}
