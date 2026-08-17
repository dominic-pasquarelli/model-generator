import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = process.env.MG_SHOTS_DIR || "test-results/screens";
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Start each test from a clean seeded library.
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

test("library lists seeded projects and the tool card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("cm4-carrier-mount-a")).toBeVisible();
  await expect(page.getByText("Board Mount Designer", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Local-first.")).toBeVisible();
  await shot(page, "01-library");
});

test("theme toggle flips the document theme", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await shot(page, "01-library-dark");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("opening the sample project generates a mount and enables export", async ({ page }) => {
  await page.goto("/");
  await page.getByText("cm4-carrier-mount-a").click();

  // Designer chrome — the sample opens on the Mount step (split view, no tool palette).
  await expect(page.getByRole("navigation", { name: "Workflow steps" })).toBeVisible();
  await expect(page.getByText("Mount strategy")).toBeVisible();

  // It auto-generates from the canonical model, which enables Export.
  const exportBtn = page.getByRole("button", { name: "Export", exact: true });
  await expect(exportBtn).toBeEnabled({ timeout: 10_000 });
  await shot(page, "07-mount-split");

  // Holes step exposes the 2D editor toolbar and the four mounting holes.
  const rail = page.getByRole("navigation", { name: "Workflow steps" });
  await rail.getByRole("button", { name: /Holes/ }).click();
  await expect(page.getByRole("button", { name: "Place hole" })).toBeVisible();
  for (const label of ["H1", "H2", "H3", "H4"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await shot(page, "05-holes");
});

test("export flow reaches the complete state", async ({ page }) => {
  await page.goto("/");
  await page.getByText("cm4-carrier-mount-a").click();
  const exportBtn = page.getByRole("button", { name: "Export", exact: true });
  await expect(exportBtn).toBeEnabled({ timeout: 10_000 });
  await exportBtn.click();

  const dialog = page.getByRole("dialog", { name: "Export mount" });
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Readiness")).toBeVisible();
  await shot(page, "08-export-ready");

  await page.getByRole("button", { name: /Export STEP/ }).click();
  await expect(page.getByText("Export complete")).toBeVisible({ timeout: 15_000 });
  await shot(page, "09-export-complete");
});

test("required-states showcase renders all six cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Required UI states" }).click();
  await expect(page.getByRole("heading", { name: /required early states/ })).toBeVisible();
  await expect(page.getByText("Reference image is missing")).toBeVisible();
  await expect(page.getByText("Export isn't ready")).toBeVisible();
  await expect(page.getByText("Export complete", { exact: true })).toBeVisible();
  await shot(page, "10-states");
});

test("new project → add reference → reject then accept calibration", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();

  // Empty designer state
  await expect(page.getByRole("heading", { name: "Add a board reference" })).toBeVisible();
  await shot(page, "02-empty");
  await page.getByRole("button", { name: "Use sample board" }).click();

  // Go to calibrate and open the popover
  const rail = page.getByRole("navigation", { name: "Workflow steps" });
  await rail.getByRole("button", { name: /Calibrate/ }).click();
  await page.getByRole("button", { name: "Calibrate reference" }).click();
  const pop = page.getByRole("dialog", { name: "Calibrate A – B" });
  await expect(pop).toBeVisible();

  // Reject an implausible distance (2 mm across the ~780 px span → ~390 px/mm),
  // then accept the true 78 mm (→ 10 px/mm for this 1000-px sample asset).
  const input = pop.getByLabel("Known distance between A and B");
  await input.fill("2");
  await input.blur();
  await expect(pop.getByText(/px per mm/)).toBeVisible();
  await shot(page, "04-calibration-invalid");

  await input.fill("78");
  await input.blur();
  await page.getByRole("button", { name: "Apply calibration" }).click();
  await expect(pop).toBeHidden();

  // Status bar now advertises the calibrated scale.
  await expect(page.getByText(/Calibrated .* px\/mm/).first()).toBeVisible();
  await shot(page, "03-calibrated");
});
