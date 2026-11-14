import { expect, test } from "@playwright/test";

const registryBase = process.env.E2E_REGISTRY_URL ?? "http://localhost:3001";
const token = process.env.E2E_QR_TOKEN;
const documentId = process.env.E2E_DOCUMENT_ID;
const apiKey = process.env.E2E_INSTITUTION_API_KEY;

test("QR status invalidation reaches the public page and batch demo", async ({ page, request }) => {
  test.skip(!token || !documentId || !apiKey, "Set E2E_QR_TOKEN, E2E_DOCUMENT_ID, and E2E_INSTITUTION_API_KEY");

  const setStatus = async (status: "ACTIVE" | "LOST") => {
    const response = await request.patch(`${registryBase}/documents/${documentId}/status`, {
      headers: { "x-api-key": apiKey! },
      data: { status }
    });
    expect(response.ok()).toBeTruthy();
  };

  try {
    await setStatus("ACTIVE");
    await page.goto(`/verify/q/${encodeURIComponent(token!)}`);
    await expect(page.getByRole("heading", { name: "Genuine" })).toBeVisible();
    await setStatus("LOST");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Reported lost" })).toBeVisible({ timeout: 10_000 });

    await page.goto(process.env.EMPLOYER_URL ?? "http://localhost:5174");
    await page.getByLabel("Institution API key").fill(apiKey!);
    await page.getByLabel("Candidates CSV").locator("textarea").fill(
      `documentType,documentNumber\nCERTIFICATE,CERT-2025-0001\nCERTIFICATE,UNKNOWN-E2E-ROW`
    );
    await page.getByRole("button", { name: "Verify candidates" }).click();
    await expect(page.getByText("REPORTED_LOST")).toBeVisible();
    await expect(page.getByText("NOT_FOUND")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Attention required");
  } finally {
    await setStatus("ACTIVE");
  }
});
