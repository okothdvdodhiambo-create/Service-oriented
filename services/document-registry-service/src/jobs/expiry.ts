import type { PrismaClient } from "../../generated/client/index.js";
import { publishDocumentChanged } from "../events.js";

const EXPIRY_LOCK_ID = 4_205_114;

export async function expireDocuments(prisma: PrismaClient, now = new Date()): Promise<number> {
  const expired = await prisma.$transaction(async (transaction) => {
    const [lock] = await transaction.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${EXPIRY_LOCK_ID}) AS locked
    `;
    if (!lock?.locked) return [];

    const documents = await transaction.document.findMany({
      where: { status: "ACTIVE", expiryDate: { lte: now } },
      select: { id: true, documentType: true, documentNumber: true }
    });
    if (documents.length) {
      await transaction.document.updateMany({
        where: { id: { in: documents.map((document) => document.id) } },
        data: { status: "EXPIRED", statusChangedAt: now }
      });
    }
    return documents;
  });

  await Promise.all(expired.map((document) => publishDocumentChanged(document)));
  return expired.length;
}
