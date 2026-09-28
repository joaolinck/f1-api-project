import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: Object.fromEntries(
      [
        "/usuarios",
        "/auth",
        "/pilotos",
        "/equipes",
        "/corridas",
        "/classificacoes-pilotos",
        "/classificacoes-equipes",
        "/favoritos",
        "/cache",
      ].map((p) => [p, "http://127.0.0.1:3000"]),
    ),
  },
  build: { outDir: "dist" },
});
