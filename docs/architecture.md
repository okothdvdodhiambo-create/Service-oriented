# Architecture

The gateway exposes versioned contracts while internal service-to-service registry routes are not routed externally. The public web app and the independently built Employer HR client use the same verification API.

## Public QR verification

```mermaid
sequenceDiagram
  participant B as Browser
  participant G as Gateway
  participant V as Verification service
  participant C as In-memory cache
  participant R as Document registry
  B->>G: GET /api/v1/verify/public/{qrToken}
  G->>G: IP rate limit (30/min)
  G->>V: GET /verify/public/{qrToken}
  V->>V: Validate HMAC signature
  V->>C: Lookup opaque token
  alt Cache miss
    V->>R: lookup-by-qr (internal service token)
    R->>R: Validate HMAC and exact stored-token equality
    R-->>V: Document or generic invalid-token result
    V->>C: Cache for at most 30 seconds
  end
  V-->>G: Minimal public result
  G-->>B: Result (no number/DOB/internal ID)
```

## Institution number check with cache hit/miss

```mermaid
sequenceDiagram
  participant HR as Institution client
  participant G as Gateway
  participant V as Verification service
  participant C as Cache
  participant R as Document registry
  HR->>G: POST /verify/number + API key
  G->>G: Authenticate policy and 300/min key limit
  G->>V: POST /verify/number
  V->>V: Validate approved institution; HMAC document number
  V->>C: Lookup numberHash + type
  alt Cache hit
    C-->>V: Current cached registry response
  else Cache miss
    V->>R: Internal lookup by type and number
    R-->>V: Current record/status or no record
    V->>C: Cache result for 30 seconds
  end
  V-->>HR: Full institution response, masked number
  V--)V: Asynchronously persist log and publish performed event
```

## Status event invalidation

```mermaid
sequenceDiagram
  participant R as Document registry
  participant V as Verification service
  participant C as Cache
  R->>R: Persist changed status
  R-)V: POST internal status_changed event
  V->>V: Validate internal event secret
  V->>C: Invalidate all entries for document ID/number hash
  Note over V,C: When event delivery is unavailable, the 30-second TTL bounds stale results.
```

## Employer batch flow

```mermaid
sequenceDiagram
  participant HR as Employer HR demo
  participant G as Gateway
  participant V as Verification service
  participant R as Document registry
  HR->>HR: Validate CSV (maximum 500 rows)
  loop Batch of at most 50
    HR->>G: POST /verify/batch + institution API key
    G->>G: Enforce role and API-key rate limit
    G->>V: Forward batch request
    V->>R: Number lookup(s)
    R-->>V: Per-item current statuses
    V-->>HR: Results and verification IDs
  end
  HR->>HR: Render statuses and export CSV
```
