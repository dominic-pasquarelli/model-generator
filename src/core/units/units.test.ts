import { describe, it, expect } from "vitest";
import {
  assessCalibration,
  fmtLen,
  fromDisplay,
  inchToMm,
  mmToInch,
  mmLengthToPx,
  pxLengthToMm,
  toDisplay,
  unitDecimals,
  unitLabel,
} from "./units";

describe("unit conversion", () => {
  it("round-trips mm↔inch", () => {
    expect(mmToInch(25.4)).toBeCloseTo(1, 10);
    expect(inchToMm(1)).toBeCloseTo(25.4, 10);
    expect(fromDisplay(toDisplay(12.7, "inch"), "inch")).toBeCloseTo(12.7, 10);
  });

  it("formats lengths in the display unit with unit-appropriate precision", () => {
    expect(fmtLen(85, "mm")).toBe("85.00");
    expect(fmtLen(25.4, "inch")).toBe("1.000");
    expect(unitDecimals("mm")).toBe(2);
    expect(unitDecimals("inch")).toBe(3);
    expect(unitLabel("mm")).toBe("mm");
    expect(unitLabel("inch")).toBe("in");
  });

  it("passes mm through unchanged in mm display", () => {
    expect(toDisplay(10, "mm")).toBe(10);
    expect(fromDisplay(10, "mm")).toBe(10);
  });
});

describe("calibration scale", () => {
  it("maps px lengths to mm and back", () => {
    const scale = { pxPerMm: 32 };
    expect(pxLengthToMm(2496, scale)).toBeCloseTo(78, 6);
    expect(mmLengthToPx(78, scale)).toBeCloseTo(2496, 6);
  });
});

describe("assessCalibration", () => {
  it("accepts a plausible caliper measurement (78 mm over 2496 px → 32 px/mm)", () => {
    const r = assessCalibration({ x: 312, y: 264 }, { x: 2808, y: 264 }, 78);
    expect(r.valid).toBe(true);
    expect(r.pxPerMm).toBeCloseTo(32, 3);
    expect(r.reason).toBeUndefined();
  });

  it("rejects an implausibly high scale and suggests the ×10 value (7.8 → 78)", () => {
    const r = assessCalibration({ x: 312, y: 264 }, { x: 2808, y: 264 }, 7.8);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("implausible-high");
    expect(r.suggestedMm).toBeCloseTo(78, 6);
    expect(r.message).toContain("px per mm");
  });

  it("rejects a zero-length anchor pair without producing a scale", () => {
    const r = assessCalibration({ x: 100, y: 100 }, { x: 100, y: 100 }, 78);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("non-positive-distance");
    expect(r.pxPerMm).toBeNull();
  });

  it("rejects a non-positive known distance (unknown must not become zero)", () => {
    const r = assessCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("non-positive-length");
  });

  it("rejects an implausibly low scale", () => {
    const r = assessCalibration({ x: 0, y: 0 }, { x: 20, y: 0 }, 500);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("implausible-low");
  });
});
