import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Discover the pre-installed Chromium in this environment so we never trigger a
// browser download (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1). Falls back to Playwright's
// own managed browser if none is found locally.
function findChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  const candidates: string[] = [];
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith("chromium")) continue;
    candidates.push(
      join(root, entry, "chrome-linux", "chrome"),
      join(root, entry, "chrome-linux", "headless_shell"),
    );
  }
  return candidates.find((p) => existsSync(p));
}

const chromiumPath = findChromium();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
  webServer: {
    command: "pnpm run build && pnpm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
