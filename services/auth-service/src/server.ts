import { PrismaClient } from "../../verification-service/generated/client/index.js";
import { createAuthApp } from "./app.js";

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error("DATABASE_URL and a JWT_SECRET of at least 32 bytes must be configured");
}
const prisma = new PrismaClient();
const server = createAuthApp(prisma).listen(Number(process.env.PORT ?? 3000), () => console.info("auth-service listening"));
const close = async () => { server.close(); await prisma.$disconnect(); };
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
