import { PrismaClient } from "../generated/client/index.js";
import { createApp } from "./app.js";

const requiredSecrets = [
  "QR_SECRET",
  "SERVER_PEPPER",
  "JWT_SECRET",
  "INTERNAL_SERVICE_TOKEN",
  "INTERNAL_EVENT_SECRET"
] as const;
for (const name of requiredSecrets) {
  if (!process.env[name] || Buffer.byteLength(process.env[name]) < 32) {
    throw new Error(`${name} must be configured with at least 32 bytes`);
  }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured");

const prisma = new PrismaClient();
const app = createApp({ prisma });
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => console.info(`verification-service listening on ${port}`));

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
