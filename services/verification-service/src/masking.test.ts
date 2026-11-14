import { describe, expect, it } from "vitest";
import { maskHolderName } from "./masking.js";

describe("maskHolderName", () => {
  it("masks each name component while retaining its initial", () => {
    expect(maskHolderName("Jane Otieno")).toBe("J*** O*****");
  });
});
