import { describe, expect, it } from "vitest";
import { shareableFile } from "./share.js";

describe("shareableFile", () => {
  it("uses .json when the browser accepts it", () => {
    const f = shareableFile("{}", "b.json", { canShare: () => true });
    expect(f.name).toBe("b.json");
  });
  it("falls back to .txt when .json is refused (Chrome on Android)", () => {
    const f = shareableFile("{}", "b.json", { canShare: ({ files }) => files[0].type === "text/plain" });
    expect(f.name).toBe("b.txt");
  });
  it("returns null when files can't be shared", () => {
    expect(shareableFile("{}", "b.json", {})).toBeNull();
    expect(shareableFile("{}", "b.json", { canShare: () => false })).toBeNull();
  });
});
