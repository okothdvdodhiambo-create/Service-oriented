import { PrismaClient } from "../generated/client/index.js";
import { createQrToken, sha256, verifyQrToken } from "@service-oriente/shared";

const prisma = new PrismaClient();
if (!process.env.QR_SECRET) throw new Error("QR_SECRET must be configured before rotating existing tokens");
const documents = await prisma.document.findMany({ select: { id: true, qrToken: true } });
for (const document of documents) {
  const existing = document.qrToken ? verifyQrToken(document.qrToken, process.env.QR_SECRET) : null;
  if (existing?.documentId === document.id) continue;
  const token = createQrToken(document.id, process.env.QR_SECRET);
  await prisma.$transaction([
    prisma.document.update({ where: { id: document.id }, data: { qrToken: token } }),
    prisma.documentHistory.create({
      data: {
        documentId: document.id,
        eventType: "QR_TOKENS_REGENERATED",
        previousTokenHash: document.qrToken ? sha256(document.qrToken) : null,
        changedBy: "migration"
      }
    })
  ]);
}
await prisma.$disconnect();
console.info(`Regenerated QR tokens for ${documents.length} documents`);
