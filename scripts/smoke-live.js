import { createJolpica } from "../server/jolpica.js";
import { createF1 } from "../server/f1.js";
import { checkResponse } from "../server/contract.js";
const f1 = createF1(createJolpica());
try {
  const data = await f1.drivers("2024", {}, crypto.randomUUID());
  checkResponse("/pilotos", "get", 200, data, true);
  console.log(
    `Jolpica OK: ${data.paginacao.total} pilotos em 2024; primeiro: ${data.dados[0].nome_completo}.`,
  );
} catch (e) {
  console.error(`Consulta falhou: HTTP ${e.status || 500} — ${e.message}`);
  process.exitCode = 1;
}
