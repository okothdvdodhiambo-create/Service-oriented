import type { VerificationResult } from "../generated/client/index.js";
import type { RegistryDocument, VerificationResponse } from "./types.js";
import { maskDocumentNumber, maskHolderName } from "./masking.js";

export function mapResult(status: RegistryDocument["status"]): VerificationResult {
  switch (status) {
    case "ACTIVE": return "GENUINE";
    case "LOST": return "REPORTED_LOST";
    case "REVOKED": return "REVOKED";
    case "REPLACED": return "REPLACED";
    case "EXPIRED": return "EXPIRED";
  }
}

export function fullResult(document: RegistryDocument | null): VerificationResponse {
  if (!document) {
    return {
      result: "NOT_FOUND",
      documentType: null,
      issuedByName: null,
      issueDate: null,
      expiryDate: null,
      status: null,
      statusChangedAt: null,
      checkedAt: new Date().toISOString()
    };
  }
  return {
    result: mapResult(document.status),
    documentType: document.documentType,
    maskedNumber: maskDocumentNumber(document.documentNumber),
    holderName: document.holderName,
    issuedByName: document.issuedByName,
    issueDate: document.issueDate,
    expiryDate: document.expiryDate,
    status: document.status,
    statusChangedAt: document.statusChangedAt,
    checkedAt: new Date().toISOString()
  };
}

export function publicResult(document: RegistryDocument | null): VerificationResponse {
  if (!document) {
    return {
      result: "NOT_FOUND",
      documentType: null,
      issuedByName: null,
      issueYear: null,
      checkedAt: new Date().toISOString(),
      maskedHolderName: null
    };
  }
  return {
    result: mapResult(document.status),
    documentType: document.documentType,
    issuedByName: document.issuedByName,
    issueYear: document.issueYear ?? new Date(document.issueDate).getUTCFullYear(),
    checkedAt: new Date().toISOString(),
    maskedHolderName: maskHolderName(document.holderName)
  };
}
