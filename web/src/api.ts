import type { VerificationResult } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080/api/v1";
let accessToken: string | null = null;
let apiKey: string | null = null;

export function setAuth(token: string | null, key: string | null = null): void {
  accessToken = token;
  apiKey = key;
}

export interface PublicResult {
  result: VerificationResult;
  documentType: string | null;
  issuedByName: string | null;
  issueYear?: number | null;
  checkedAt: string;
  maskedHolderName?: string | null;
}

export interface FullResult extends PublicResult {
  holderName?: string;
  maskedNumber?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  status?: string | null;
  statusChangedAt?: string | null;
  verificationId?: string;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  if (apiKey) headers.set("x-api-key", apiKey);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const verifyPublic = (token: string) =>
  api<PublicResult>(`/verify/public/${encodeURIComponent(token)}`);

export const receiptUrl = (verificationId: string) =>
  `${API_BASE}/verify/${encodeURIComponent(verificationId)}/receipt`;
