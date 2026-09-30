import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("./pages-host", import.meta.url));
const src = fileURLToPath(new URL("./src", import.meta.url));

/** Static playable preview for GitHub Pages. The furnace board stays in this browser. */
export default defineConfig({
  root,
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: [
      { find: "@/game/board", replacement: fileURLToPath(new URL("./src/game/board-local.ts", import.meta.url)) },
      { find: "@", replacement: src },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("./preview", import.meta.url)),
    emptyOutDir: true,
  },
});
