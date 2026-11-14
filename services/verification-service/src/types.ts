import type { CallerType, VerificationMethod, VerificationResult } from "../generated/client/index.js";

export interface AuthContext {
  callerType: CallerType;
  institutionId: string | null;
  userId: string | null;
}

export interface RegistryDocument {
  id: string;
  documentType: string;
  documentNumber?: string;
  holderName: string;
  issuedByName: string;
  issueDate: string;
  expiryDate: string | null;
  status: "ACTIVE" | "LOST" | "REVOKED" | "REPLACED" | "EXPIRED";
  statusChangedAt: string | null;
  issueYear?: number;
}

export interface VerificationResponse {
  result: VerificationResult;
  documentType: string | null;
  maskedNumber?: string;
  holderName?: string;
  issuedByName: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  status?: string | null;
  statusChangedAt?: string | null;
  checkedAt: string;
  verificationId?: string;
  issueYear?: number | null;
  maskedHolderName?: string | null;
}

export interface CacheEntry {
  response: VerificationResponse;
  documentId: string | null;
  numberHash?: string;
}

export interface LogCheck {
  id: string;
  callerType: CallerType;
  institutionId: string | null;
  userId: string | null;
  method: VerificationMethod;
  documentType: string | null;
  numberHash: string | null;
  documentId: string | null;
  result: VerificationResult;
  ipHash: string;
  userAgent: string | null;
  correlationId: string;
  latencyMs: number;
  cacheHit: boolean;
}
