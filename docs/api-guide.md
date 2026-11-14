# Verification API integration guide

The versioned API is served by the gateway at `http://localhost:8080/api/v1` in the local demo. Production clients must use HTTPS. Full checks require an approved institution API key or an institution/admin JWT. The public QR endpoint does not require credentials and returns only limited details.

## Public QR check

```sh
curl --fail-with-body "http://localhost:8080/api/v1/verify/public/${QR_TOKEN}"
```

In production, pass the QR token as one path segment (URL-encode it if needed). The service returns a small JSON result without the document number, date of birth, internal document ID, or full holder name. Public calls are limited to 30 per minute per IP; repeated invalid/not-found results trigger progressive slowdown. `429` responses include `Retry-After`.

## Institution check by number

Prefer POST so a document number does not appear in a URL:

```sh
curl --fail-with-body \
  -H "X-API-Key: ${INSTITUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"CERTIFICATE","documentNumber":"CERT-2025-0001"}' \
  http://localhost:8080/api/v1/verify/number
```

Node fetch:

```js
const response = await fetch("https://gateway.example.org/api/v1/verify/number", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.INSTITUTION_API_KEY
  },
  body: JSON.stringify({
    documentType: "CERTIFICATE",
    documentNumber: "CERT-2025-0001"
  })
});

if (response.status === 429) {
  const retryAfter = Number(response.headers.get("retry-after") ?? "1");
  await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
}
if (response.status === 503) {
  throw new Error("Verification registry is temporarily unavailable; retry with bounded backoff.");
}
if (!response.ok) throw new Error(`Verification failed: ${response.status}`);
const result = await response.json();
```

## Batch checks

```sh
curl --fail-with-body \
  -H "X-API-Key: ${INSTITUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"documentType":"CERTIFICATE","documentNumber":"CERT-2025-0001"}]}' \
  http://localhost:8080/api/v1/verify/batch
```

Requests contain 1–50 checks. A 500-row CSV consumer should send 10 sequential batches. The gateway limit is 300 requests per minute per API key. Handle `401` by rotating/correcting credentials, `403` by checking institution approval/role, `429` using `Retry-After`, and `503` using bounded backoff. Do not retry other 4xx responses. Never log document numbers, IP addresses, or complete QR tokens.

## Status and receipts

Institution history is at `GET /api/v1/verify/history`; `GET /api/v1/verify/{verificationId}/receipt` returns printable HTML. Admins can read `/verify/stats`; institutions can read `/verify/stats/mine`.
