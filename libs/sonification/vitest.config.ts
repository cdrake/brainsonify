import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/sonification",

  plugins: [tsconfigPaths({ root: "../../" })],

  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    watch: false,
    reporters: ["default"],
  },
});
