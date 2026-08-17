import { describe, it, expect } from "vitest";
import { createSampleProject } from "@/core/project/fixtures";
import { unknownVal } from "@/core/project/value";
import { computeDimensions, computeWarnings, mockGenerator } from "./mockGenerator";

describe("mock generator dimensions", () => {
  it("derives the mockup bracket footprint from an 85×56 board", () => {
    const p = createSampleProject(1_000_000);
    const dims = computeDimensions(p)!;
    expect(dims.widthMm).toBe(91); // 85 + 2×3 wall
    expect(dims.depthMm).toBe(62); // 56 + 2×3 wall
    expect(dims.heightMm).toBe(9); // base 3 + standoff 6
    expect(dims.standoffCount).toBe(4);
    expect(dims.bodies).toBe(1);
  });

  it("warns that S4's seat is clipped by KO-3", () => {
    const p = createSampleProject(1_000_000);
    const warnings = computeWarnings(p);
    expect(warnings.some((w) => w.includes("S4") && w.includes("KO-3"))).toBe(true);
  });
});

describe("mock generator determinism + guards", () => {
  it("produces a stable parameter hash for an unchanged model", async () => {
    const p = createSampleProject(1_000_000);
    const a = await mockGenerator.generate(p);
    const b = await mockGenerator.generate(p);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.model.paramsHash).toBe(b.model.paramsHash);
  });

  it("refuses to generate when a hole has no diameter", async () => {
    const p = createSampleProject(1_000_000);
    p.board.holes[0].diameterMm = unknownVal<number>();
    const r = await mockGenerator.generate(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MISSING_DIAMETER");
  });

  it("does not advertise exact-solid capability (no real kernel yet)", () => {
    expect(mockGenerator.capabilities.exactSolid).toBe(false);
  });
});
