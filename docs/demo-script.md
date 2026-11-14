# Five-minute verification story

Prerequisites: start the compose stack, apply migrations, seed both databases, and open the web app. Use a demo institution key created for the environment.

1. **Register a document (1 minute).** Log in through the institution UI or use the local registry API with the demo institution API key. Create a test certificate and save its `id` and `qrToken`.
2. **Print its QR (1 minute).** Create a QR image from the returned token with a local QR utility, or open `/verify/q/<url-encoded-token>` on a phone. Keep the token private.
3. **Scan it (1 minute).** The public page shows a limited `GENUINE` result. Point out that the number, DOB, and internal ID are not returned.
4. **Mark it lost (1 minute).** As the issuing institution, PATCH `/documents/{id}/status` with `{"status":"LOST"}`. Scan the same QR again: the status event invalidates cached data and the page shows `REPORTED_LOST`.
5. **Verify as an employer (1 minute).** Paste a CSV row in the Employer HR demo, enter the approved demo API key, and submit. Show the mixed result table/banner and CSV export. Mention that the third-party client uses the public REST contract, not web-app internals.

For status scenarios, repeat with `REVOKED`, `EXPIRED`, and a document number that does not exist. A bad or rotated QR token returns `INVALID_TOKEN`.
