import { Prisma, type PrismaClient } from "../generated/client/index.js";
import type { LogCheck } from "./types.js";

export function enqueueLog(prisma: PrismaClient, check: LogCheck): void {
  queueMicrotask(() => {
    void prisma.$transaction(async (transaction) => {
      await transaction.verificationLog.create({ data: check });
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      await transaction.dailyStat.upsert({
        where: {
          date_result_method_callerType: {
            date,
            result: check.result,
            method: check.method,
            callerType: check.callerType
          }
        },
        create: {
          date,
          result: check.result,
          method: check.method,
          callerType: check.callerType,
          count: 1
        },
        update: { count: { increment: 1 } }
      });
    }).catch((error: unknown) => {
      const message = error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : error instanceof Error ? error.message : "unknown error";
      console.error("Verification log persistence failed", message);
    });
  });
}
