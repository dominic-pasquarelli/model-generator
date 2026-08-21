import { describe, it, expect } from "vitest";
import { sha256Text } from "./sha256";

describe("sha256", () => {
  // FIPS 180-4 / NIST published vectors.
  it("matches published test vectors", () => {
    expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("hashes a multi-block message (crosses the 64-byte boundary)", () => {
    // 'a' * 1_000_000 has a known digest.
    expect(sha256Text("a".repeat(1_000_000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  });

  it("is deterministic and sensitive to a single-byte change", () => {
    expect(sha256Text("solid x")).toBe(sha256Text("solid x"));
    expect(sha256Text("solid x")).not.toBe(sha256Text("solid y"));
  });
});
