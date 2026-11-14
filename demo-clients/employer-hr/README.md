# Employer HR verification demo

This is a standalone third-party client. It intentionally does not import code from `web/` or the shared workspace. It calls the documented HTTP API through the gateway.

## Run locally

```sh
npm install
VITE_API_URL=http://localhost:8080/api/v1 npm run dev
```

In the UI, enter an institution API key provided by the system operator, then paste or upload a CSV with `documentType,documentNumber` columns. The demo validates files to 500 records and sends batches of at most 50. The key is held in browser memory and is not included in build configuration. Use a short-lived, restricted demo key; never put a production API key in a public browser application.

## Integration guide

An approved institution receives an API key from the platform operator. Keep it in a server-side secret manager and call the HTTPS gateway endpoint:

```http
POST /api/v1/verify/batch
X-API-Key: <institution-api-key>
Content-Type: application/json
```

Request:

```json
{
  "items": [
    { "documentType": "CERTIFICATE", "documentNumber": "CERT-2025-0001" }
  ]
}
```

Response:

```json
{
  "results": [
    {
      "result": "GENUINE",
      "documentType": "CERTIFICATE",
      "holderName": "Jane Otieno",
      "issuedByName": "Example University",
      "checkedAt": "2026-01-20T09:00:00.000Z",
      "verificationId": "example-verification-id"
    }
  ]
}
```

Handle `401` by rotating or correcting the key, `403` by asking the operator to confirm institution approval, `429` by honoring `Retry-After`, and `503` with bounded exponential backoff. Batch requests accept 1–50 checks. The gateway limit is 300 requests per minute per API key. Do not retry validation errors (4xx other than 429). Keep document numbers out of your own request logs and store only verification receipts needed for your lawful workflow.

## Container

```sh
docker build -t employer-hr-demo .
docker run --rm -p 8082:80 employer-hr-demo
```
