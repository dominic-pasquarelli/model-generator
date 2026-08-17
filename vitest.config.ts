import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The DOM-dependent journey is covered by Playwright (tests/e2e); unit tests are host-level.
  },
});
