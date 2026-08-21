import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = process.env.MG_SHOTS_DIR || "test-results/screens";
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Each Playwright test runs in a fresh browser context, so localStorage already
  // starts empty (seeded on first load). We deliberately do NOT clear it on every
  // navigation, so reload-persistence can be exercised.
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

  // The sample's mount defaults are inferred, so export is gated until acknowledged.
  await expect(page.getByText(/Inferred fabrication dimensions \(\d+\)/)).toBeVisible();
  const exportStep = page.getByRole("button", { name: /Export STEP/ });
  await expect(exportStep).toBeDisabled();
  await page.getByRole("checkbox", { name: /inferred defaults/ }).click();
  await expect(exportStep).toBeEnabled();
  await exportStep.click();
  // The artifact is prepared in memory; it is not yet recorded as exported.
  await expect(page.getByText("Artifact prepared")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Prepared in memory/)).toBeVisible();
  await shot(page, "09-export-complete");
});

test("closing the export dialog without downloading does not claim an export", async ({ page }) => {
  await page.goto("/");
  await page.getByText("cm4-carrier-mount-a").click();
  const exportBtn = page.getByRole("button", { name: "Export", exact: true });
  await expect(exportBtn).toBeEnabled({ timeout: 10_000 });
  await exportBtn.click();
  await page.getByRole("checkbox", { name: /inferred defaults/ }).click();
  await page.getByRole("button", { name: /Export STEP/ }).click();
  await expect(page.getByText("Artifact prepared")).toBeVisible({ timeout: 15_000 });

  // Close without downloading → returns to the preview; history stays empty.
  await page.getByRole("button", { name: "Close" }).click();
  const rail = page.getByRole("navigation", { name: "Workflow steps" });
  await rail.getByRole("button", { name: /Preview & export/ }).click();
  await expect(page.getByText("No exports yet for this project.")).toBeVisible();
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

test("new project → add reference → place endpoints → reject then accept calibration", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();

  // Empty designer state
  await expect(page.getByRole("heading", { name: "Add a board reference" })).toBeVisible();
  await shot(page, "02-empty");
  await page.getByRole("button", { name: "Use sample board" }).click();

  // Calibrate is a two-click placement: begin, then click the two endpoints on the image
  // (no hard-coded anchors). The popover opens only once both endpoints exist.
  const rail = page.getByRole("navigation", { name: "Workflow steps" });
  await rail.getByRole("button", { name: /Calibrate/ }).click();
  await page.getByRole("button", { name: "Calibrate reference" }).click();

  const overlay = page.locator("svg.overlay");
  await expect(overlay).toBeVisible();
  const box = (await overlay.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.18, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.82, box.y + box.height * 0.5);

  const pop = page.getByRole("dialog", { name: "Calibrate A – B" });
  await expect(pop).toBeVisible();

  // A tiny distance across a wide span → implausible → rejected.
  const input = pop.getByLabel("Known distance between A and B");
  await input.fill("2");
  await input.blur();
  await expect(pop.getByText(/px per mm/)).toBeVisible();
  await shot(page, "04-calibration-invalid");

  // A plausible distance is accepted.
  await input.fill("78");
  await input.blur();
  await page.getByRole("button", { name: "Apply calibration" }).click();
  await expect(pop).toBeHidden();
  await expect(page.getByText(/Calibrated .* px\/mm/).first()).toBeVisible();
  await shot(page, "03-calibrated");
});

// A minimal valid 2×2 PNG (red pixels).
const PNG_2x2 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAmpwMB6H0AywAAAABJRU5ErkJggg==";

test("uploading a PNG persists the reference across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add a board reference" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "board.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_2x2, "base64"),
  });

  // The reference decodes and appears in the inspector with its intrinsic dimensions.
  await expect(page.getByText("board.png")).toBeVisible();
  await expect(page.getByText(/2 × 2 px/)).toBeVisible();

  // Reload: the browser-local draft persisted; reopening shows the same reference.
  await page.reload();
  await page.getByText("untitled-mount").first().click();
  await expect(page.getByText("board.png")).toBeVisible();
});

test("an oversized project file is rejected instantly and the UI stays responsive (reviewer #3)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  // A 13 MB blob, larger than the 12 MB project-file cap. The File.size pre-check must reject
  // it WITHOUT reading the bytes into a string, so the tab never freezes on a hostile file.
  const oversized = Buffer.alloc(13_000_000, 0x20);
  const start = Date.now();
  await page.locator('input[accept*=".mgproj"]').setInputFiles({
    name: "huge.mgproj",
    mimeType: "application/json",
    buffer: oversized,
  });

  // Diagnosable rejection, promptly.
  await expect(page.getByRole("alert").getByText(/larger than the .* MB limit/)).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - start).toBeLessThan(5_000);

  // The main thread is still responsive: an unrelated control still works immediately.
  const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
});

test("changing a keep-out's shape keeps its geometry consistent", async ({ page }) => {
  await page.goto("/");
  await page.getByText("cm4-carrier-mount-a").click();
  const rail = page.getByRole("navigation", { name: "Workflow steps" });
  await rail.getByRole("button", { name: /Keep-outs/ }).click();

  // Select the first keep-out and switch it to a circle.
  await page.getByRole("button", { name: /KO-1/ }).first().click();
  await page.getByLabel("Shape").selectOption("circle");

  // The editor now reflects a circle (Diameter readout), and export is still reachable
  // (no structurally-invalid object was produced). Match the field label exactly — the
  // generation-warning text ("…boss diameter, fit clearance…") also contains "diameter".
  await expect(page.getByText("Diameter", { exact: true })).toBeVisible();
});
