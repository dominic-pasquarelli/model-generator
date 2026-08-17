import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Cadence-adjacent local-first browser app (ADR 0003). No cloud dependency.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
