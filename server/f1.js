import { ApiError } from "./errors.js";
const str = (v) => {
  if (typeof v !== "string" || !v) throw new ApiError(502);
  return v;
};
const num = (v) => {
  if (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)))
    throw new ApiError(502);
  return Number(v);
};
export const driver = (d) => ({
  id: str(d.driverId),
  numero: d.permanentNumber ? num(d.permanentNumber) : null,
  codigo: d.code ?? null,
  nome: str(d.givenName),
  sobrenome: str(d.familyName),
  nome_completo: `${str(d.givenName)} ${str(d.familyName)}`,
  data_nascimento: d.dateOfBirth ?? null,
  nacionalidade: d.nationality ? str(d.nationality) : "Unknown",
  url: d.url ?? null,
});
export const driverSummary = (d) => ({
  id: str(d.driverId),
  codigo: d.code ?? null,
  nome_completo: `${str(d.givenName)} ${str(d.familyName)}`,
});
const teamSummary = (t) => ({ id: str(t.constructorId), nome: str(t.name) });
const team = (t) => ({
  ...teamSummary(t),
  nacionalidade: str(t.nationality),
  url: t.url ?? null,
});
const circuit = (c) => ({
  id: str(c.circuitId),
  nome: str(c.circuitName),
  localidade: str(c.Location.locality),
  pais: str(c.Location.country),
});
const race = (r) => ({
  temporada: num(r.season),
  rodada: num(r.round),
  nome: str(r.raceName),
  data: str(r.date),
  horario: r.time ?? null,
  circuito: circuit(r.Circuit),
});
const position = (r) => (/^\d+$/.test(r.positionText) ? num(r.position) : null);
const result = (r) => ({
  posicao: position(r),
  posicao_texto: str(r.positionText),
  grid: num(r.grid),
  voltas: num(r.laps),
  pontos: num(r.points),
  status: str(r.status),
  tempo: r.Time?.time ?? null,
  melhor_volta: r.FastestLap?.Time?.time ?? null,
  piloto: driverSummary(r.Driver),
  equipe: teamSummary(r.Constructor),
});
const driverStanding = (r) => ({
  posicao: num(r.position),
  pontos: num(r.points),
  vitorias: num(r.wins),
  piloto: driverSummary(r.Driver),
  equipe: teamSummary(r.Constructors.at(-1)),
});
const teamStanding = (r) => ({
  posicao: num(r.position),
  pontos: num(r.points),
  vitorias: num(r.wins),
  equipe: teamSummary(r.Constructor),
});
const nonempty = (items) => {
  if (!items.length)
    throw new ApiError(404, "Dados nao encontrados para a consulta");
  return items;
};
export function createF1(provider) {
  return {
    async drivers(season, query, cid) {
      const { items } = await provider.list(
        `${season}/drivers/`,
        "DriverTable",
        "Drivers",
        cid,
      );
      const all = nonempty(items)
        .map(driver)
        .filter(
          (x) =>
            !query.nacionalidade ||
            x.nacionalidade.toLowerCase() === query.nacionalidade.toLowerCase(),
        );
      const pagina = Number(query.pagina || 1),
        limite = Number(query.limite || 10);
      return {
        dados: all.slice((pagina - 1) * limite, pagina * limite),
        paginacao: {
          pagina,
          limite,
          total: all.length,
          total_paginas: Math.ceil(all.length / limite),
        },
      };
    },
    async teams(season, cid) {
      const { items, meta } = await provider.list(
        `${season}/constructors/`,
        "ConstructorTable",
        "Constructors",
        cid,
      );
      return { temporada: num(meta.season), dados: nonempty(items).map(team) };
    },
    async races(season, cid) {
      const { items, meta } = await provider.list(
        `${season}/races/`,
        "RaceTable",
        "Races",
        cid,
      );
      return { temporada: num(meta.season), dados: nonempty(items).map(race) };
    },
    async results(season, round, cid) {
      const { items } = await provider.list(
        `${season}/${round}/results/`,
        "RaceTable",
        "Races",
        cid,
        "Results",
      );
      const r = nonempty(items)[0];
      return { corrida: race(r), resultados: nonempty(r.Results).map(result) };
    },
    async standings(season, kind, cid) {
      const isDriver = kind === "drivers",
        field = isDriver ? "DriverStandings" : "ConstructorStandings";
      const { items } = await provider.list(
        `${season}/${isDriver ? "driverstandings" : "constructorstandings"}/`,
        "StandingsTable",
        "StandingsLists",
        cid,
        field,
      );
      const s = nonempty(items)[0];
      return {
        temporada: num(s.season),
        rodada: num(s.round),
        dados: nonempty(s[field]).map(isDriver ? driverStanding : teamStanding),
      };
    },
    async profile(season, id, cid) {
      const { items, meta } = await provider.list(
        `${season}/drivers/${id}/`,
        "DriverTable",
        "Drivers",
        cid,
      );
      const piloto = driver(nonempty(items)[0]);
      const resolved = num(meta.season);
      const standings = await provider.list(
        `${resolved}/drivers/${id}/driverstandings/`,
        "StandingsTable",
        "StandingsLists",
        cid,
        "DriverStandings",
      );
      const results = await provider.list(
        `${resolved}/drivers/${id}/results/`,
        "RaceTable",
        "Races",
        cid,
        "Results",
      );
      const standing = standings.items[0]?.DriverStandings[0];
      let classificacao_atual = null;
      if (standing) {
        const { piloto: ignored, ...rest } = driverStanding(standing);
        classificacao_atual = rest;
      }
      return {
        piloto,
        temporada: resolved,
        classificacao_atual,
        ultimos_resultados: results.items
          .sort((a, b) => Number(b.round) - Number(a.round))
          .slice(0, 5)
          .map((r) => ({
            rodada: num(r.round),
            corrida: str(r.raceName),
            data: str(r.date),
            posicao: position(r.Results[0]),
            grid: num(r.Results[0].grid),
            pontos: num(r.Results[0].points),
            status: str(r.Results[0].status),
          })),
      };
    },
    async favoriteDriver(id, cid) {
      const { items } = await provider.list(
        `drivers/${id}/`,
        "DriverTable",
        "Drivers",
        cid,
      );
      return driverSummary(nonempty(items)[0]);
    },
  };
}
