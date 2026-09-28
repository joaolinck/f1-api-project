import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { createJolpica } from "./jolpica.js";
function numberEnv(name, fallback, min = 1, max = 3600000) {
  const v = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(v) || v < min || v > max)
    throw new Error(`${name} invalido`);
  return v;
}
const store = createStore(process.env.DATABASE_PATH);
const provider = createJolpica({
  baseUrl: process.env.JOLPICA_BASE_URL,
  timeoutMs: numberEnv("EXTERNAL_TIMEOUT_MS", 5000),
  attempts: numberEnv("EXTERNAL_ATTEMPTS", 3, 1, 5),
  retryBaseMs: numberEnv("RETRY_BASE_MS", 300),
  cacheTtlMs: numberEnv("CACHE_TTL_MS", 60000),
  threshold: numberEnv("BREAKER_THRESHOLD", 5),
  cooldownMs: numberEnv("BREAKER_COOLDOWN_MS", 30000),
});
const app = await createApp({
  store,
  provider,
  secret: process.env.JWT_SECRET,
});
const server = app.listen(numberEnv("PORT", 3000, 1, 65535), () =>
  console.log(`F1 Hub em http://localhost:${process.env.PORT || 3000}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.db.close();
      process.exit(0);
    }),
  );
