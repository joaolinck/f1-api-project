import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../server/app.js";
import { createStore, hashPassword } from "../server/store.js";
import { createJolpica } from "../server/jolpica.js";
import { contract, validator, deref } from "../server/contract.js";
import { fixtureFetch } from "./fixtures.js";
const secret = "test-secret-with-at-least-thirty-two-characters";
let app, store, token;
const provider = createJolpica({ fetchImpl: fixtureFetch, logger: () => {} });
before(async () => {
  store = createStore(":memory:");
  app = await createApp({
    store,
    provider,
    secret,
    rateMax: 100,
    logger: () => {},
  });
  await request(app)
    .post("/usuarios")
    .send({
      nome: "Pessoa Teste",
      email: "TESTE@example.com",
      senha: "senhaSegura123",
    });
  const r = await request(app)
    .post("/auth/login")
    .send({ email: "teste@EXAMPLE.COM", senha: "senhaSegura123" });
  assert.equal(r.status, 200);
  token = r.body.token;
});
after(() => store.db.close());
function validate(r, path, method = "get") {
  const schema = deref(contract.paths[path][method].responses[String(r.status)])
    .content?.["application/json"]?.schema;
  if (schema) {
    const fn = validator(schema);
    assert.ok(fn(r.body), JSON.stringify(fn.errors));
  }
  assert.ok(r.headers["x-correlation-id"]);
}
const authed = (method, path) =>
  request(app)[method](path).set("Authorization", `Bearer ${token}`);
test("cadastro rejeita papel, campos extras, email duplicado e JSON inválido", async () => {
  for (const extra of [{ papel: "admin" }, { outro: true }]) {
    const r = await request(app)
      .post("/usuarios")
      .send({
        nome: "Pessoa",
        email: "other@example.com",
        senha: "senhaSegura123",
        ...extra,
      });
    assert.equal(r.status, 400);
    validate(r, "/usuarios", "post");
  }
  const duplicate = await request(app)
    .post("/usuarios")
    .send({
      nome: "Pessoa",
      email: "teste@example.com",
      senha: "senhaSegura123",
    });
  assert.equal(duplicate.status, 409);
  const bad = await request(app)
    .post("/auth/login")
    .set("Content-Type", "application/json")
    .send("{");
  assert.equal(bad.status, 400);
  validate(bad, "/auth/login", "post");
  assert.notEqual(
    store.userByEmail("teste@example.com").senha,
    "senhaSegura123",
  );
});
test("login genérico; token ausente, expirado e inválido retornam 401", async () => {
  const messages = [];
  for (const email of ["teste@example.com", "nobody@example.com"]) {
    const r = await request(app)
      .post("/auth/login")
      .send({ email, senha: "incorreta" });
    assert.equal(r.status, 401);
    messages.push(r.body.mensagem_erro);
  }
  assert.equal(messages[0], messages[1]);
  for (const t of [
    "",
    "invalid",
    jwt.sign({}, secret, {
      subject: "1",
      expiresIn: -1,
      issuer: "f1-hub",
      audience: "f1-hub-client",
    }),
  ]) {
    const r = await request(app)
      .get("/usuarios/me")
      .set("Authorization", `Bearer ${t}`);
    assert.equal(r.status, 401);
    validate(r, "/usuarios/me");
  }
  const me = await authed("get", "/usuarios/me");
  assert.equal(me.body.email, "teste@example.com");
  assert.equal(me.body.senha, undefined);
  validate(me, "/usuarios/me");
});
test("todas as consultas mapeiam respostas conforme os schemas OpenAPI", async () => {
  for (const path of [
    "/pilotos",
    "/equipes",
    "/corridas",
    "/classificacoes-pilotos",
    "/classificacoes-equipes",
    "/pilotos/senna",
    "/corridas/1991/1/resultados",
  ]) {
    const r = await authed("get", path + "?temporada=1991");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    validate(
      r,
      path === "/pilotos/senna"
        ? "/pilotos/{id}"
        : path.startsWith("/corridas/1991")
          ? "/corridas/{temporada}/{rodada}/resultados"
          : path,
    );
    assert.equal(r.body.MRData, undefined);
  }
  const r = await authed("get", "/pilotos?temporada=1991");
  assert.equal(r.body.dados[0].numero, null);
});
test("pilotos sem nacionalidade no provedor continuam válidos pelo contrato", async () => {
  const incompleteProvider = createJolpica({
    fetchImpl: async () =>
      Response.json({
        MRData: {
          total: "1",
          DriverTable: {
            season: "2026",
            Drivers: [
              { driverId: "paul_aron", givenName: "Paul", familyName: "Aron" },
            ],
          },
        },
      }),
    logger: () => {},
  });
  const partialDataApp = await createApp({
    store,
    provider: incompleteProvider,
    secret,
    logger: () => {},
  });
  const response = await request(partialDataApp)
    .get("/pilotos?temporada=current")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.dados[0].nacionalidade, "Unknown");
  validate(response, "/pilotos");
});
test("valida parâmetros e headers, propaga correlation id e distingue filtro vazio de inexistência", async () => {
  for (const p of [
    "/pilotos?limite=101",
    "/pilotos?pagina=1.5",
    "/pilotos?pagina=1&pagina=2",
    "/pilotos?temporada=1949",
    "/pilotos/INVALID",
    "/corridas/2024/31/resultados",
  ])
    assert.equal((await authed("get", p)).status, 400, p);
  const r = await authed("get", "/pilotos").set(
    "X-Correlation-Id",
    "trace-123",
  );
  assert.equal(r.headers["x-correlation-id"], "trace-123");
  assert.equal(
    (await authed("get", "/pilotos").set("X-Correlation-Id", "bad value"))
      .status,
    400,
  );
  for (const p of ["/pilotos?nacionalidade=British", "/pilotos?pagina=99"]) {
    const empty = await authed("get", p);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.dados, []);
  }
  assert.equal((await authed("get", "/pilotos/missing")).status, 404);
});
test("favoritos: idempotência concorrente, conflito, isolamento e remoção", async () => {
  const post = (key, body = { piloto_id: "senna" }) =>
    authed("post", "/favoritos").set("Idempotency-Key", key).send(body);
  assert.equal(
    (await authed("post", "/favoritos").send({ piloto_id: "senna" })).status,
    400,
  );
  const responses = await Promise.all([
    post("same-key-123"),
    post("same-key-123"),
  ]);
  assert.deepEqual(responses.map((x) => x.status).sort(), [200, 201]);
  assert.deepEqual(responses[0].body, responses[1].body);
  validate(responses[0], "/favoritos", "post");
  assert.equal(
    (await post("same-key-123", { piloto_id: "prost" })).status,
    409,
  );
  assert.equal((await post("new-key-123")).status, 409);
  const list = await authed("get", "/favoritos");
  assert.equal(list.body.dados.length, 1);
  validate(list, "/favoritos");
  const other = store.createUser(
    "Outra pessoa",
    "other@example.com",
    await hashPassword("senhaSegura123"),
  );
  const otherToken = jwt.sign({}, secret, {
    subject: String(other.id),
    issuer: "f1-hub",
    audience: "f1-hub-client",
  });
  const hidden = await request(app)
    .delete(`/favoritos/${responses[0].body.id}`)
    .set("Authorization", `Bearer ${otherToken}`);
  assert.equal(hidden.status, 404);
  assert.deepEqual(
    (
      await request(app)
        .get("/favoritos")
        .set("Authorization", `Bearer ${otherToken}`)
    ).body.dados,
    [],
  );
  assert.equal(
    (await authed("delete", `/favoritos/${responses[0].body.id}`)).status,
    204,
  );
  assert.equal((await post("same-key-123")).status, 200);
  assert.equal((await authed("get", "/favoritos")).body.dados.length, 0);
  assert.equal((await post("fresh-key-123")).status, 201);
});
test("RBAC limita limpeza do cache ao administrador", async () => {
  assert.equal((await authed("delete", "/cache")).status, 403);
  const admin = store.createUser(
    "Admin",
    "admin@example.com",
    await hashPassword("senhaSegura123"),
    "admin",
  );
  const t = jwt.sign({}, secret, {
    subject: String(admin.id),
    issuer: "f1-hub",
    audience: "f1-hub-client",
  });
  const r = await request(app)
    .delete("/cache")
    .set("Authorization", `Bearer ${t}`);
  assert.equal(r.status, 200);
  validate(r, "/cache", "delete");
  assert.ok(r.body.entradas_removidas > 0);
});
test("limitação por IP retorna 429 e Retry-After", async () => {
  const limited = await createApp({
    store,
    provider,
    secret,
    rateMax: 1,
    logger: () => {},
  });
  await request(limited)
    .post("/auth/login")
    .send({ email: "none@example.com", senha: "incorrect" });
  const r = await request(limited)
    .post("/auth/login")
    .send({ email: "none@example.com", senha: "incorrect" });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers["retry-after"]) > 0);
  validate(r, "/auth/login", "post");
});
test("falhas externas recebem formato padronizado e status documentado", async () => {
  for (const [status, fetchImpl] of [
    [502, async () => new Response("", { status: 500 })],
    [
      503,
      async () =>
        new Response("", { status: 429, headers: { "Retry-After": "7" } }),
    ],
    [
      504,
      async (u, { signal }) =>
        new Promise((resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    ],
    [
      502,
      async () =>
        Response.json({
          MRData: { total: "1", DriverTable: { Drivers: [{}] } },
        }),
    ],
  ]) {
    const failing = createJolpica({
      fetchImpl,
      attempts: 2,
      timeoutMs: 5,
      sleepImpl: async () => {},
      logger: () => {},
    });
    const badApp = await createApp({
      store,
      provider: failing,
      secret,
      logger: () => {},
    });
    const r = await request(badApp)
      .get("/pilotos")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Correlation-Id", "external-123");
    assert.equal(r.status, status);
    validate(r, "/pilotos");
    assert.equal(r.body.correlation_id, "external-123");
    if (status === 503) assert.equal(r.headers["retry-after"], "7");
  }
});
