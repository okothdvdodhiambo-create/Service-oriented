import { createHash } from "node:crypto";
import { PrismaClient } from "../generated/client/index.js";
import { createQrToken } from "@service-oriente/shared";

const prisma = new PrismaClient();
const apiKey = process.env.DEMO_INSTITUTION_API_KEY;
if (!apiKey) throw new Error("DEMO_INSTITUTION_API_KEY must be configured before seeding");

const institution = await prisma.institution.upsert({
  where: { id: "demo-employer" },
  update: { name: "Demo Employer", apiKeyHash: createHash("sha256").update(apiKey).digest("hex"), status: "APPROVED" },
  create: { id: "demo-employer", name: "Demo Employer", apiKeyHash: createHash("sha256").update(apiKey).digest("hex"), status: "APPROVED" }
});

const document = await prisma.document.upsert({
  where: { documentType_documentNumber: { documentType: "CERTIFICATE", documentNumber: "CERT-2025-0001" } },
  update: {},
  create: {
    documentType: "CERTIFICATE",
    documentNumber: "CERT-2025-0001",
    holderName: "Jane Otieno",
    issuedById: institution.id,
    issueDate: new Date("2025-06-15")
  }
});
if (!document.qrToken) {
  await prisma.document.update({ where: { id: document.id }, data: { qrToken: createQrToken(document.id, process.env.QR_SECRET) } });
}
await prisma.$disconnect();
