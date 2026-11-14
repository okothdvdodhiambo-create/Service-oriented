import { describe, expect, it } from "vitest";
import { csvCell, parseCandidates } from "./csv";

describe("CSV validation", () => {
  it("parses quoted candidate values", () => {
    expect(parseCandidates('documentType,documentNumber\nCERTIFICATE,"CERT,2025"')).toEqual([
      { documentType: "CERTIFICATE", documentNumber: "CERT,2025" }
    ]);
  });

  it("rejects malformed, oversized, and over-limit input", () => {
    expect(() => parseCandidates('documentType,documentNumber\nCERTIFICATE,"unterminated')).toThrow();
    expect(() => parseCandidates(`CERTIFICATE,${"X".repeat(1_000_001)}`)).toThrow();
    const rows = Array.from({ length: 501 }, (_, index) => `CERTIFICATE,CERT-${index}`).join("\n");
    expect(() => parseCandidates(rows)).toThrow(/500/);
  });

  it("prevents spreadsheet formula execution in exported cells", () => {
    expect(csvCell("=2+2")).toBe('"\'=2+2"');
  });
});
