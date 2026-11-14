import { describe, expect, it } from "vitest";
import { namesMatch } from "./ownership.js";

describe("namesMatch", () => {
  it("requires an exact surname token and allows at most 15% edit distance", () => {
    expect(namesMatch("Jane Wanjiku Otieno", "Jane Wanjiku Otieno")).toBe(true);
    expect(namesMatch("Jane Wanjiku Oti", "Jane Wanjiku Otieno")).toBe(false);
    expect(namesMatch("Jane Wanjiku Otieno", "Jane Wanjiku Odhiambo")).toBe(false);
    expect(namesMatch(`${"A".repeat(90)} Smith`, `${"A".repeat(80)}${"B".repeat(10)} Smith`)).toBe(true);
    expect(namesMatch(`${"A".repeat(80)}${"B".repeat(20)} Smith`, `${"A".repeat(100)} Smith`)).toBe(false);
  });
});
