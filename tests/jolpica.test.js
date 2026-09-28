import { test } from "node:test";
import assert from "node:assert/strict";
import { createJolpica } from "../server/jolpica.js";
const response = () =>
  Response.json({ MRData: { total: "0", DriverTable: { Drivers: [] } } });
const options = { logger: () => {}, random: () => 0, retryBaseMs: 10 };
test("5xx usa backoff exponencial e recupera; acerto posterior usa cache", async () => {
  let calls = 0;
  const delays = [];
  const client = createJolpica({
    ...options,
    fetchImpl: async () =>
      ++calls < 3 ? new Response("", { status: 502 }) : response(),
    sleepImpl: async (ms) => delays.push(ms),
  });
  await client.request("drivers/", "test");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
  await client.request("drivers/", "test");
  assert.equal(calls, 3);
  assert.equal(client.clearCache(), 1);
});
test("timeout é abortado por tentativa e retorna 504 após esgotar retries", async () => {
  let calls = 0,
    aborted = 0;
  const client = createJolpica({
    ...options,
    timeoutMs: 5,
    sleepImpl: async () => {},
    fetchImpl: async (url, { signal }) => {
      calls++;
      return new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => {
          aborted++;
          reject(new Error("abort"));
        }),
      );
    },
  });
  await assert.rejects(
    client.request("drivers/", "test"),
    (e) => e.status === 504,
  );
  assert.equal(calls, 3);
  assert.equal(aborted, 3);
});
test("falha de conexão esgota tentativas e retorna 502", async () => {
  let calls = 0;
  const client = createJolpica({
    ...options,
    fetchImpl: async () => {
      calls++;
      throw new TypeError("network");
    },
    sleepImpl: async () => {},
  });
  await assert.rejects(client.request("x", "test"), (e) => e.status === 502);
  assert.equal(calls, 3);
});
test("429 não repete imediatamente e bloqueia chamadas pelo Retry-After", async () => {
  let calls = 0;
  const client = createJolpica({
    ...options,
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "20" },
      });
    },
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      client.request("x", "test"),
      (e) => e.status === 503 && e.retryAfter === 20,
    );
  assert.equal(calls, 1);
});
test("circuit breaker abre, permite uma sondagem e fecha após recuperação", async () => {
  let clock = 100,
    calls = 0,
    healthy = false;
  const client = createJolpica({
    ...options,
    attempts: 1,
    threshold: 2,
    cooldownMs: 1000,
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return healthy ? response() : new Response("", { status: 500 });
    },
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(client.request("x", "test"), (e) => e.status === 502);
  await assert.rejects(client.request("x", "test"), (e) => e.status === 503);
  assert.equal(calls, 2);
  clock += 1001;
  healthy = true;
  await client.request("x", "test");
  assert.equal(calls, 3);
  await client.request("y", "test");
  assert.equal(calls, 4);
});
test("resposta inválida não vaza e não é repetida como falha temporária", async () => {
  let calls = 0;
  const client = createJolpica({
    ...options,
    fetchImpl: async () => {
      calls++;
      return new Response("invalid");
    },
  });
  await assert.rejects(client.request("x", "test"), (e) => e.status === 502);
  assert.equal(calls, 1);
});
test("paginação externa busca além de 100 e mescla resultados da mesma corrida", async () => {
  const offsets = [];
  const client = createJolpica({
    ...options,
    fetchImpl: async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      offsets.push(offset);
      return Response.json({
        MRData: {
          total: "125",
          RaceTable: {
            Races: [
              {
                season: "2024",
                round: "1",
                Results: Array.from({ length: offset ? 25 : 100 }, (_, i) => ({
                  position: offset + i + 1,
                })),
              },
            ],
          },
        },
      });
    },
  });
  const data = await client.list(
    "2024/results/",
    "RaceTable",
    "Races",
    "test",
    "Results",
  );
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].Results.length, 125);
});
