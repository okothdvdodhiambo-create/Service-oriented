import { PrismaClient } from "../generated/client/index.js";
import { createRegistryApp } from "./app.js";
import { expireDocuments } from "./jobs/expiry.js";

for (const name of ["DATABASE_URL", "QR_SECRET", "INTERNAL_SERVICE_TOKEN", "JWT_SECRET"]) {
  if (!process.env[name] || Buffer.byteLength(process.env[name]) < 32) {
    throw new Error(`${name} must be configured with at least 32 bytes`);
  }
}

const prisma = new PrismaClient();
const server = createRegistryApp(prisma).listen(Number(process.env.PORT ?? 3000), () => {
  console.info("document-registry-service is listening");
});
const expiryTimer = setInterval(() => {
  void expireDocuments(prisma).catch((error: unknown) => {
    console.error("Daily expiry job failed", error instanceof Error ? error.message : "unknown error");
  });
}, 24 * 60 * 60 * 1000);
expiryTimer.unref();
void expireDocuments(prisma).catch((error: unknown) => {
  console.error("Initial expiry job failed", error instanceof Error ? error.message : "unknown error");
});
const close = async () => { clearInterval(expiryTimer); server.close(); await prisma.$disconnect(); };
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
