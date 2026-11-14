import { ServiceClient } from "@service-oriente/shared";
import type { RegistryDocument } from "./types.js";

const client = new ServiceClient({
  baseUrl: process.env.DOCUMENT_REGISTRY_URL ?? "http://document-registry-service:3000",
  serviceName: "Document registry",
  timeoutMs: 2500,
  retries: 1,
  headers: process.env.INTERNAL_SERVICE_TOKEN
    ? { "x-internal-service-token": process.env.INTERNAL_SERVICE_TOKEN }
    : undefined
});

export interface RegistryLookup {
  document: RegistryDocument | null;
  invalidToken?: boolean;
}

export async function lookupByNumber(documentType: string, documentNumber: string): Promise<RegistryLookup> {
  return client.request<RegistryLookup>("/internal/documents/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentType, documentNumber })
  });
}

export async function lookupByQr(qrToken: string): Promise<RegistryLookup> {
  return client.request<RegistryLookup>("/internal/documents/lookup-by-qr", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qrToken })
  });
}
