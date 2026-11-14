import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client/index.js";
import { expireDocuments } from "./expiry.js";

describe("daily expiry lock", () => {
  it("does not expire records when another replica owns the advisory lock", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]),
      document: {
        findMany: vi.fn(),
        updateMany: vi.fn()
      }
    };
    const prisma = {
      $transaction: vi.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))
    } as unknown as PrismaClient;

    expect(await expireDocuments(prisma)).toBe(0);
    expect(transaction.document.findMany).not.toHaveBeenCalled();
    expect(transaction.document.updateMany).not.toHaveBeenCalled();
  });
});
