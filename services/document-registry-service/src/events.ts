export interface DocumentChanged {
  id: string;
  documentType: string;
  documentNumber: string;
}

export async function publishDocumentChanged(
  document: DocumentChanged,
  type: "document.status_changed" | "document.qr_rotated" = "document.status_changed"
): Promise<void> {
  const endpoint = process.env.VERIFICATION_SERVICE_URL;
  const secret = process.env.INTERNAL_EVENT_SECRET;
  if (!endpoint || !secret) return;
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/internal/events/document-status-changed`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-event-secret": secret },
      body: JSON.stringify({
        type,
        documentId: document.id,
        documentType: document.documentType,
        documentNumber: document.documentNumber
      }),
      signal: AbortSignal.timeout(1000)
    });
    if (!response.ok) console.error("Cache invalidation event was rejected", response.status);
  } catch (error) {
    console.error("Cache invalidation event delivery failed", error instanceof Error ? error.message : "unknown error");
  }
}
