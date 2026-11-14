import { createGatewayApp } from "./app.js";

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 bytes");
}
const port = Number(process.env.PORT ?? 8080);
createGatewayApp().listen(port, () => console.info(`gateway listening on ${port}`));
