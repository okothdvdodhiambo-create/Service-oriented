import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { ResultCard } from "./ResultCard";
import type { VerificationResult } from "../types";

afterEach(cleanup);

const results: VerificationResult[] = [
  "GENUINE", "NOT_FOUND", "REPORTED_LOST", "REVOKED", "REPLACED", "EXPIRED", "INVALID_TOKEN"
];
const labels = {
  en: {
    GENUINE: "Genuine", NOT_FOUND: "Not found", REPORTED_LOST: "Reported lost",
    REVOKED: "Revoked", REPLACED: "Replaced", EXPIRED: "Expired", INVALID_TOKEN: "Invalid code"
  },
  sw: {
    GENUINE: "Halisi", NOT_FOUND: "Haijapatikana", REPORTED_LOST: "Imeripotiwa kupotea",
    REVOKED: "Imebatilishwa", REPLACED: "Imebadilishwa", EXPIRED: "Muda umeisha", INVALID_TOKEN: "Msimbo si sahihi"
  }
};
const meanings = {
  en: {
    GENUINE: "The issuing registry confirms this document is currently valid.",
    NOT_FOUND: "No matching document was found. Check the code and try again.",
    REPORTED_LOST: "The holder has reported this document lost. Do not accept it.",
    REVOKED: "The issuing authority has revoked this document.",
    REPLACED: "This document has been replaced by a newer one.",
    EXPIRED: "This document has passed its expiry date.",
    INVALID_TOKEN: "This QR code could not be verified. Ask the issuer for a fresh code."
  },
  sw: {
    GENUINE: "Sajili ya mtoaji inathibitisha kuwa hati hii ni halali kwa sasa.",
    NOT_FOUND: "Hakuna hati inayolingana iliyopatikana. Kagua msimbo ujaribu tena.",
    REPORTED_LOST: "Mmiliki ameripoti hati hii kupotea. Usiikubali.",
    REVOKED: "Mamlaka iliyotoa hati imeibatilisha.",
    REPLACED: "Hati hii imebadilishwa na hati mpya.",
    EXPIRED: "Muda wa hati hii umeisha.",
    INVALID_TOKEN: "Msimbo huu wa QR haukuthibitishwa. Omba msimbo mpya kutoka kwa mtoaji."
  }
};

describe("ResultCard", () => {
  it.each(["en", "sw"] as const)("announces every result in %s", async (language) => {
    await i18n.changeLanguage(language);
    for (const result of results) {
      const { unmount } = render(<ResultCard result={{
        result, documentType: "CERTIFICATE", issuedByName: "Example College",
        checkedAt: "2026-01-20T09:00:00Z", maskedHolderName: "J*** O*****"
      }} />);
      expect(screen.getByRole("heading", { name: labels[language][result] })).toBeTruthy();
      expect(screen.getByText(meanings[language][result])).toBeTruthy();
      expect(screen.getByText("J*** O*****")).toBeTruthy();
      unmount();
    }
  });
});
