import { describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createGatewayApp } from "./app.js";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "options";

describe("gateway internal routes", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const)(
    "blocks /internal for %s",
    async (method) => {
      const requestForMethod = request(createGatewayApp())[method.toLowerCase() as HttpMethod];
      const response = await requestForMethod("/internal/documents/lookup");
      expect(response.status).toBe(404);
    }
  );
});

describe("gateway role policies", () => {
  it("requires authentication for number checks and admin role for global stats", async () => {
    process.env.JWT_SECRET = "gateway-test-secret-that-is-long-enough-123456";
    await request(createGatewayApp()).post("/api/v1/verify/number").expect(401);
    const institutionToken = jwt.sign(
      { role: "INSTITUTION", institutionId: "institution-1" },
      process.env.JWT_SECRET,
      { issuer: "service-oriente-auth" }
    );
    await request(createGatewayApp()).get("/api/v1/verify/stats")
      .set("authorization", `Bearer ${institutionToken}`).expect(403);
    const adminToken = jwt.sign({ role: "ADMIN" }, process.env.JWT_SECRET, { issuer: "service-oriente-auth" });
    await request(createGatewayApp()).get("/api/v1/verify/stats")
      .set("authorization", `Bearer ${adminToken}`).expect(503);
  });
});
