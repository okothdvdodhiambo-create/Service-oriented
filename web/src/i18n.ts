import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      home: "Home", verify: "Verify a document", login: "Institution login",
      headline: "Trust what you verify.", intro: "Check a document's status securely and privately.",
      lost: "I lost a document", found: "I found a document", comingSoon: "Coming soon",
      scan: "Scan QR", enter: "Enter link or code", verifyNow: "Verify document",
      how: "How it works", step1: "Open a document's QR code or enter its code.",
      step2: "We check its current status with the issuing registry.",
      step3: "Review the result. Personal details stay protected.",
      trust: "Privacy first", trustText: "Public checks never reveal document numbers, date of birth, or identity numbers.",
      scanHint: "Allow camera access to scan a QR code.", cameraDenied: "Camera access was denied. Paste the QR link or token instead.",
      inputHint: "Paste a QR URL or token", checking: "Checking…", verifyAnother: "Verify another",
      results: { GENUINE: "Genuine", NOT_FOUND: "Not found", REPORTED_LOST: "Reported lost", REVOKED: "Revoked", REPLACED: "Replaced", EXPIRED: "Expired", INVALID_TOKEN: "Invalid code" },
      meanings: {
        GENUINE: "The issuing registry confirms this document is currently valid.",
        NOT_FOUND: "No matching document was found. Check the code and try again.",
        REPORTED_LOST: "The holder has reported this document lost. Do not accept it.",
        REVOKED: "The issuing authority has revoked this document.",
        REPLACED: "This document has been replaced by a newer one.",
        EXPIRED: "This document has passed its expiry date.",
        INVALID_TOKEN: "This QR code could not be verified. Ask the issuer for a fresh code."
      },
      issuedBy: "Issued by", issueYear: "Year issued", checkedAt: "Checked at",
      holder: "Holder", documentType: "Document type", documentNumber: "Document number",
      number: "Document number", issueDate: "Issue date", expiryDate: "Expiry date",
      status: "Status", submit: "Check document", password: "Password", email: "Email",
      signIn: "Sign in", history: "Check history", filters: "Filter results",
      error: "Something went wrong", serviceError: "Verification is temporarily unavailable. Please try again."
    }
  },
  sw: {
    translation: {
      home: "Nyumbani", verify: "Hakiki hati", login: "Ingia kwa taasisi",
      headline: "Thibitisha kwa uhakika.", intro: "Angalia hali ya hati kwa usalama na faragha.",
      lost: "Nimepoteza hati", found: "Nimepata hati", comingSoon: "Inakuja hivi karibuni",
      scan: "Changanua QR", enter: "Ingiza kiungo au msimbo", verifyNow: "Hakiki hati",
      how: "Jinsi inavyofanya kazi", step1: "Fungua msimbo wa QR au uandike msimbo wa hati.",
      step2: "Tunaangalia hali yake kwenye sajili ya mtoaji.",
      step3: "Kagua matokeo. Taarifa binafsi zinalindwa.",
      trust: "Faragha kwanza", trustText: "Ukaguzi wa umma hauonyeshi nambari ya hati, tarehe ya kuzaliwa au nambari ya utambulisho.",
      scanHint: "Ruhusu kamera kuchanganua msimbo wa QR.", cameraDenied: "Ruhusa ya kamera imekataliwa. Bandika kiungo au msimbo wa QR.",
      inputHint: "Bandika kiungo au msimbo wa QR", checking: "Inakagua…", verifyAnother: "Hakiki nyingine",
      results: { GENUINE: "Halisi", NOT_FOUND: "Haijapatikana", REPORTED_LOST: "Imeripotiwa kupotea", REVOKED: "Imebatilishwa", REPLACED: "Imebadilishwa", EXPIRED: "Muda umeisha", INVALID_TOKEN: "Msimbo si sahihi" },
      meanings: {
        GENUINE: "Sajili ya mtoaji inathibitisha kuwa hati hii ni halali kwa sasa.",
        NOT_FOUND: "Hakuna hati inayolingana iliyopatikana. Kagua msimbo ujaribu tena.",
        REPORTED_LOST: "Mmiliki ameripoti hati hii kupotea. Usiikubali.",
        REVOKED: "Mamlaka iliyotoa hati imeibatilisha.",
        REPLACED: "Hati hii imebadilishwa na hati mpya.",
        EXPIRED: "Muda wa hati hii umeisha.",
        INVALID_TOKEN: "Msimbo huu wa QR haukuthibitishwa. Omba msimbo mpya kutoka kwa mtoaji."
      },
      issuedBy: "Imetolewa na", issueYear: "Mwaka wa kutolewa", checkedAt: "Wakati wa ukaguzi",
      holder: "Mmiliki", documentType: "Aina ya hati", documentNumber: "Nambari ya hati",
      number: "Nambari ya hati", issueDate: "Tarehe ya kutolewa", expiryDate: "Tarehe ya mwisho",
      status: "Hali", submit: "Kagua hati", password: "Nenosiri", email: "Barua pepe",
      signIn: "Ingia", history: "Historia ya ukaguzi", filters: "Chuja matokeo",
      error: "Hitilafu imetokea", serviceError: "Huduma haipatikani kwa sasa. Tafadhali jaribu tena."
    }
  }
};

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});

export default i18n;
