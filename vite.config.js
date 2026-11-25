import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { gamesPlugin } from "./scripts/games-plugin.mjs";

export default defineConfig({
  plugins: [react(), gamesPlugin()],
  base: "/oneshot-testers/",
});
