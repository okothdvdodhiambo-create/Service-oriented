# Service Oriente

This repository contains the verification demo slice: shared security helpers, a document registry, authentication and verification services, the API gateway, the public/institution web app, and a separately packaged Employer HR API client.

> The workspace initially contained only this README, despite the brief describing Phases 1–3 as complete. This commit therefore establishes the runnable service contracts and supporting foundation in this repository rather than patching missing source. Existing outside deployments may need a migration adapted to their Phase 3 schema.

## Requirements

- Node.js 22+ and npm 10+
- Docker Compose v2 (for the full stack)
- A PostgreSQL instance for local process development

## Local Compose run

1. Copy `.env.example` to `.env`. Replace every `replace_with_...` value with a unique random value; use URL-safe characters for the PostgreSQL password. Keep `.env` private. `QR_SECRET`, `SERVER_PEPPER`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, and `INTERNAL_EVENT_SECRET` must be distinct.
2. Start the stack:

   ```sh
   docker compose up --build -d
   ```

3. Apply each database migration and load the local demo credentials:

   ```sh
   docker compose exec document-registry npm run db:migrate
   docker compose exec verification npm run db:migrate
   docker compose exec document-registry npm run db:seed
   docker compose exec verification npm run db:seed
   ```

4. Open the public web app at `http://localhost:5173`, the Employer HR client at `http://localhost:5174`, or the gateway docs at `http://localhost:8080/api/v1/docs`. The document registry is bound to localhost port 3001 for local administration only.

The demo key is `DEMO_INSTITUTION_API_KEY` from `.env`; the institution login is `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD`. The optional admin login uses `ADMIN_EMAIL` and `ADMIN_PASSWORD`. All demo credentials must be changed before deployment. The access token is held in browser memory and expires after 15 minutes; this baseline intentionally does not persist authentication in local storage.

To reissue QR tokens while upgrading an existing registry database, apply the schema migration, then run this idempotent data-migration command once:

```sh
docker compose exec document-registry npm run db:rotate-qr
```

The script skips already-current tokens, replaces legacy or invalid tokens, and writes a history entry containing only a hash of the previous token. A rotation also invalidates cached checks.

## Development

```sh
npm install
npm run build
npm test
npm run dev:registry
npm run dev:verification
npm run dev:auth
npm run dev:gateway
npm run dev:web
npm run dev:employer
```

Run the services after PostgreSQL is available and the two schemas are migrated. For a live browser-to-local-gateway connection, `VITE_API_URL` may be set to `http://localhost:8080/api/v1` when starting either Vite app. Do not configure API keys, passwords, or signing secrets as `VITE_*` values.

For the browser integration test, seed a test document, then provide its current QR token, ID, and institution key:

```sh
E2E_QR_TOKEN='...' \
E2E_DOCUMENT_ID='...' \
E2E_INSTITUTION_API_KEY='...' \
npm run test:e2e --workspace web
```

The Playwright test starts on `http://localhost:5173` by default and expects the gateway and Employer HR demo to be available.

## Verification checklist

Create a document first and retain its `id` and `qrToken`:

```sh
export INSTITUTION_API_KEY='value-from-.env'
export DOC=$(curl -fsS -H "X-API-Key: $INSTITUTION_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"documentType":"CERTIFICATE","documentNumber":"CERT-TEST-1001","holderName":"Jane Otieno","issueDate":"2025-01-01T00:00:00.000Z"}' \
  http://localhost:3001/documents)
export DOCUMENT_ID=$(printf '%s' "$DOC" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')
export QR_TOKEN=$(printf '%s' "$DOC" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).qrToken))')
```

1. **QR privacy** — the signed payload contains only the opaque document ID and nonce, not the document number/type:

   ```sh
   QR_TOKEN="$QR_TOKEN" node -e 'const t=process.env.QR_TOKEN;const p=Buffer.from(t.split(".")[0],"base64url").toString("utf8");if(p.includes("CERT-TEST-1001")||p.includes("CERTIFICATE"))process.exit(1);console.log("QR payload does not contain document number/type")'
   ```

2. **Public GENUINE** — `curl -fsS "http://localhost:8080/api/v1/verify/public/$QR_TOKEN"` should show `GENUINE` and only limited fields.
3. **Mark LOST and confirm cache invalidation**:

   ```sh
   curl -fsS -X PATCH -H "X-API-Key: $INSTITUTION_API_KEY" -H 'Content-Type: application/json' \
     -d '{"status":"LOST"}' "http://localhost:3001/documents/$DOCUMENT_ID/status"
   curl -fsS "http://localhost:8080/api/v1/verify/public/$QR_TOKEN"
   ```

   The next result should be `REPORTED_LOST`.
4. **REVOKED / EXPIRED** — update each status and scan again:

   ```sh
   for status in REVOKED EXPIRED; do
     curl -fsS -X PATCH -H "X-API-Key: $INSTITUTION_API_KEY" -H 'Content-Type: application/json' \
       -d "{\"status\":\"$status\"}" "http://localhost:3001/documents/$DOCUMENT_ID/status"
     curl -fsS "http://localhost:8080/api/v1/verify/public/$QR_TOKEN"
   done
   ```

5. **NOT_FOUND** — check an unregistered number:

   ```sh
   curl -fsS -H "X-API-Key: $INSTITUTION_API_KEY" -H 'Content-Type: application/json' \
     -d '{"documentType":"CERTIFICATE","documentNumber":"DOES-NOT-EXIST"}' \
     http://localhost:8080/api/v1/verify/number
   ```

6. **Tampered token** — mutate a signature character and verify the generic result:

   ```sh
   export TAMPERED_TOKEN=$(QR_TOKEN="$QR_TOKEN" node -e 'const [p,s]=process.env.QR_TOKEN.split(".");process.stdout.write(p+"."+(s[0]==="A"?"B":"A")+s.slice(1))')
   curl -fsS "http://localhost:8080/api/v1/verify/public/$TAMPERED_TOKEN"
   ```

7. **Public rate limit** — send 31 checks from the same IP in a minute; inspect the final status and `Retry-After` header:

   ```sh
   for n in $(seq 1 31); do
     curl -sS -o /dev/null -w '%{http_code}\n' -D - "http://localhost:8080/api/v1/verify/public/$QR_TOKEN"
   done
   ```

8. **Institution API key** — POST a full number check:

   ```sh
   curl -fsS -H "X-API-Key: $INSTITUTION_API_KEY" -H 'Content-Type: application/json' \
     -d '{"documentType":"CERTIFICATE","documentNumber":"CERT-TEST-1001"}' \
     http://localhost:8080/api/v1/verify/number
   ```

   The legacy GET is also available but POST avoids exposing numbers in URLs.
9. **Citizen forbidden** — same POST without credentials (expect HTTP 401):

   ```sh
   curl -i -H 'Content-Type: application/json' \
     -d '{"documentType":"CERTIFICATE","documentNumber":"CERT-TEST-1001"}' \
     http://localhost:8080/api/v1/verify/number
   ```

10. **Batch** — verify mixed results and CSV export in the Employer HR UI, or call:

   ```sh
   curl -fsS -H "X-API-Key: $INSTITUTION_API_KEY" -H 'Content-Type: application/json' \
     -d '{"items":[{"documentType":"CERTIFICATE","documentNumber":"CERT-TEST-1001"},{"documentType":"CERTIFICATE","documentNumber":"DOES-NOT-EXIST"}]}' \
     http://localhost:8080/api/v1/verify/batch
   ```

11. **History** — check records scoped to the institution (no raw numbers):

   ```sh
   curl -fsS -H "X-API-Key: $INSTITUTION_API_KEY" http://localhost:8080/api/v1/verify/history
   ```

12. **Admin stats** — log in as the configured admin, then use its JWT (an institution token should receive 403):

   ```sh
   export ADMIN_TOKEN=$(curl -fsS -H 'Content-Type: application/json' \
     -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
     http://localhost:8080/api/v1/auth/login | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).accessToken))')
   curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8080/api/v1/verify/stats
   ```

## Security notes

- Public results omit document numbers, full holder names, DOB, and internal IDs. Public QR tokens are signed using a dedicated QR secret; registry lookups require an exact match to the currently stored token.
- Document numbers and IPs are HMAC-hashed for logs. Full tokens and raw request numbers are not logged. Verification logs are asynchronous and do not delay the check response.
- In-memory caches and rate limits are per process. Cache TTL is 30 seconds; registry status/QR-rotation events invalidate matching entries. Deployments with multiple replicas should provide a shared cache/event bus and distributed rate limiting.
- `TRUST_PROXY_HOPS` must match the known trusted reverse-proxy topology. The gateway defaults to trusting no forwarded hops; Compose configures only the internal services to trust the gateway.
- Use TLS, private environment secrets, backups, key rotation, and an external production identity provider before real document data is used.

The work stops at this verification slice; Phase 5 has not been started.
