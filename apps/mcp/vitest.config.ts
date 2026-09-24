import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/mcp",

  plugins: [tsconfigPaths({ root: "../../" })],

  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    watch: false,
    reporters: ["default"],
    // The integration spec starts the server and pages as processes.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
