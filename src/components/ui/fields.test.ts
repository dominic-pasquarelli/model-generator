import { describe, it, expect } from "vitest";
import { resolveCommit } from "./fields";

describe("resolveCommit (NumberField commit policy)", () => {
  it("clears to null, but only when that is a change", () => {
    expect(resolveCommit("", 3, 2)).toEqual({ commit: true, value: null });
    expect(resolveCommit("   ", 3, 2)).toEqual({ commit: true, value: null });
    expect(resolveCommit("", null, 2)).toEqual({ commit: false, value: null });
  });

  it("does not commit non-finite text (reverts)", () => {
    expect(resolveCommit("abc", 5, 2)).toEqual({ commit: false, value: 5 });
    expect(resolveCommit("1.2.3", 5, 2)).toEqual({ commit: false, value: 5 });
  });

  it("rounds to the declared precision so stored equals displayed", () => {
    expect(resolveCommit("1.234", null, 2)).toEqual({ commit: true, value: 1.23 });
    expect(resolveCommit("1.235", null, 2).value).toBe(1.24);
  });

  it("does not commit a value equal to the current one (no spurious version bump)", () => {
    expect(resolveCommit("3.00", 3, 2)).toEqual({ commit: false, value: 3 });
    expect(resolveCommit("3", 3, 2)).toEqual({ commit: false, value: 3 });
  });

  it("clamps to min and max", () => {
    expect(resolveCommit("-5", null, 2, 0)).toEqual({ commit: true, value: 0 });
    expect(resolveCommit("100", null, 2, 0, 10)).toEqual({ commit: true, value: 10 });
    expect(resolveCommit("5", null, 2, 0, 10)).toEqual({ commit: true, value: 5 });
  });
});
