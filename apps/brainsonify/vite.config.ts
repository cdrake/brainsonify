import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/brainsonify",

  // Relative asset URLs so the build works from any GitHub Pages subpath
  // (https://<user>.github.io/brainsonify/) without hardcoding the repo name.
  base: "./",

  plugins: [tsconfigPaths({ root: "../../" })],

  build: {
    outDir: "../../dist/apps/brainsonify",
    emptyOutDir: true,
    target: "es2022",
    // NiiVue alone is well past the default warning threshold.
    chunkSizeWarningLimit: 3000,
  },

  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.spec.ts"],
    watch: false,
  },

  server: {
    port: 4200,
    host: "localhost",
    // The agent socket on the page's own origin, for browsers that allow a
    // page one origin only (Claude's built-in browser pane). The server
    // itself listens on :4242 under the path /app.
    proxy: {
      "/agent": {
        target: "ws://127.0.0.1:4242",
        ws: true,
        rewrite: (path) => path.replace(/^\/agent/, "/app"),
      },
    },
  },
  preview: { port: 4300, host: "localhost" },
});
