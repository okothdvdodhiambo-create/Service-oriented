import { VerificationCache } from "./cache.js";
import { hashDocumentNumber } from "@service-oriente/shared";

export interface StatusChangedEvent {
  type: "document.status_changed" | "document.qr_rotated";
  documentId: string;
  documentNumber?: string;
  documentType?: string;
}

export function handleStatusChanged(cache: VerificationCache, event: StatusChangedEvent): void {
  cache.invalidateDocument(event.documentId);
  if (event.documentNumber) {
    cache.invalidateNumberHash(hashDocumentNumber(event.documentNumber));
  }
}

export async function publishEvent(type: string, data: Record<string, unknown>): Promise<void> {
  const endpoint = process.env.EVENT_BUS_URL;
  if (!endpoint) return;
  try {
    await fetch(`${endpoint.replace(/\/$/, "")}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.EVENT_BUS_TOKEN ? { authorization: `Bearer ${process.env.EVENT_BUS_TOKEN}` } : {})
      },
      body: JSON.stringify({ type, data }),
      signal: AbortSignal.timeout(1000)
    });
  } catch {
    // Event delivery is best-effort; the cache TTL bounds stale results when the bus is unavailable.
  }
}
