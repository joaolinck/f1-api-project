import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    readFileSync(".env.example", "utf8").replace(
      "JWT_SECRET=",
      `JWT_SECRET=${randomBytes(48).toString("hex")}`,
    ),
    { mode: 0o600 },
  );
  console.log(".env criado com segredo JWT aleatório.");
} else console.log(".env já existe e foi preservado.");
