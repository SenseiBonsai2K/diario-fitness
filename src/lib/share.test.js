import { describe, expect, it } from "vitest";
import { isIos, shareableFile } from "./share.js";

const android = { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/129", canShare: () => true };
const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", canShare: () => true };

describe("shareableFile", () => {
  it("shares .txt on Android, where Chrome refuses .json", () => {
    expect(shareableFile("{}", "b.json", android).name).toBe("b.txt");
  });
  it("shares .json on iPhone", () => {
    expect(isIos(iphone)).toBe(true);
    expect(shareableFile("{}", "b.json", iphone).name).toBe("b.json");
  });
  it("falls back to the other format when the first is refused", () => {
    expect(shareableFile("{}", "b.json", { ...iphone, canShare: ({ files }) => files[0].type === "text/plain" }).name).toBe("b.txt");
  });
  it("returns null when files can't be shared", () => {
    expect(shareableFile("{}", "b.json", {})).toBeNull();
    expect(shareableFile("{}", "b.json", { ...android, canShare: () => false })).toBeNull();
  });
});
