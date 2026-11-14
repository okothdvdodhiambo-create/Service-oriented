import { PrismaClient } from "../generated/client/index.js";
import { createHash } from "node:crypto";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();
const apiKey = process.env.DEMO_INSTITUTION_API_KEY;

if (apiKey) {
  await prisma.institution.upsert({
    where: { id: "demo-employer" },
    update: { name: "Demo Employer", apiKeyHash: createHash("sha256").update(apiKey).digest("hex"), status: "APPROVED" },
    create: { id: "demo-employer", name: "Demo Employer", apiKeyHash: createHash("sha256").update(apiKey).digest("hex"), status: "APPROVED" }
  });
}

const email = process.env.DEMO_LOGIN_EMAIL;
const password = process.env.DEMO_LOGIN_PASSWORD;
if (email && password) {
  if (password.length < 12) throw new Error("DEMO_LOGIN_PASSWORD must be at least 12 characters");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  await prisma.authUser.upsert({
    where: { email: email.trim().toLowerCase() },
    update: { passwordHash, institutionId: "demo-employer", role: "INSTITUTION" },
    create: { email: email.trim().toLowerCase(), passwordHash, institutionId: "demo-employer", role: "INSTITUTION" }
  });
}

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  if (adminPassword.length < 16) throw new Error("ADMIN_PASSWORD must be at least 16 characters");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(adminPassword, salt, 64).toString("hex")}`;
  await prisma.authUser.upsert({
    where: { email: adminEmail.trim().toLowerCase() },
    update: { passwordHash, institutionId: null, role: "ADMIN" },
    create: { email: adminEmail.trim().toLowerCase(), passwordHash, institutionId: null, role: "ADMIN" }
  });
}

await prisma.$disconnect();
