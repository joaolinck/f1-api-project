import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { ApiError, errorHandler } from "./errors.js";
import {
  validateRequest,
  checkResponse,
  validator,
  contract,
} from "./contract.js";
import { hashPassword, verifyPassword, publicUser } from "./store.js";
import { createF1 } from "./f1.js";
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
export async function createApp({
  store,
  provider,
  secret,
  rateMax = 15,
  logger = console.info,
}) {
  if (!secret || secret.length < 32)
    throw new Error(
      "JWT_SECRET precisa de pelo menos 32 caracteres. Execute npm run setup.",
    );
  const app = express(),
    f1 = createF1(provider);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const incoming = req.get("X-Correlation-Id");
    req.correlationId =
      incoming && /^[A-Za-z0-9._-]{1,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    res.set("X-Correlation-Id", req.correlationId);
    res.on("finish", () =>
      logger(
        JSON.stringify({
          event: "request",
          method: req.method,
          path: req.path,
          status: res.statusCode,
          correlation_id: req.correlationId,
        }),
      ),
    );
    if (incoming && incoming !== req.correlationId)
      return next(
        new ApiError(400, undefined, [
          { campo: "X-Correlation-Id", problema: "formato invalido" },
        ]),
      );
    next();
  });
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));
  const auth = (req, res, next) => {
    try {
      const match = /^Bearer (\S+)$/.exec(req.get("Authorization") || "");
      if (!match) throw new Error();
      const payload = jwt.verify(match[1], secret, {
        algorithms: ["HS256"],
        issuer: "f1-hub",
        audience: "f1-hub-client",
      });
      req.user = store.userById(Number(payload.sub));
      if (!req.user) throw new Error();
      next();
    } catch {
      next(new ApiError(401));
    }
  };
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: rateMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(
        new ApiError(
          429,
          undefined,
          undefined,
          Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)),
        ),
      ),
  });
  const dummyHash = await hashPassword(randomUUID());
  function route(
    method,
    path,
    handler,
    { publicRoute = false, external = false } = {},
  ) {
    app[method](
      path.replace(/\{(\w+)\}/g, ":$1"),
      ...(publicRoute ? [limiter] : [auth]),
      validateRequest(path, method),
      async (req, res) => {
        res.set("Cache-Control", "no-store");
        let result;
        try {
          result = await handler(req);
        } catch (e) {
          if (external && !(e instanceof ApiError)) throw new ApiError(502);
          throw e;
        }
        const { status = 200, data } = result;
        if (status === 204) return res.status(204).end();
        res
          .status(status)
          .json(checkResponse(path, method, status, data, external));
      },
    );
  }
  route(
    "post",
    "/usuarios",
    async (req) => {
      const { nome, email, senha } = req.body;
      return {
        status: 201,
        data: store.createUser(
          nome,
          email.toLowerCase(),
          await hashPassword(senha),
        ),
      };
    },
    { publicRoute: true },
  );
  route(
    "post",
    "/auth/login",
    async (req) => {
      const user = store.userByEmail(req.body.email.toLowerCase());
      const valid = await verifyPassword(
        req.body.senha,
        user?.senha || dummyHash,
      );
      if (!user || !valid) throw new ApiError(401, "Email ou senha invalidos");
      return {
        data: {
          token: jwt.sign({}, secret, {
            subject: String(user.id),
            expiresIn: 3600,
            issuer: "f1-hub",
            audience: "f1-hub-client",
            algorithm: "HS256",
          }),
          tipo: "Bearer",
          expira_em: 3600,
          usuario: publicUser(user),
        },
      };
    },
    { publicRoute: true },
  );
  route("get", "/usuarios/me", async (req) => ({ data: publicUser(req.user) }));
  const season = (req) => req.query.temporada || "current";
  route(
    "get",
    "/pilotos",
    async (req) => ({
      data: await f1.drivers(season(req), req.query, req.correlationId),
    }),
    { external: true },
  );
  route(
    "get",
    "/pilotos/{id}",
    async (req) => ({
      data: await f1.profile(season(req), req.params.id, req.correlationId),
    }),
    { external: true },
  );
  route(
    "get",
    "/equipes",
    async (req) => ({ data: await f1.teams(season(req), req.correlationId) }),
    { external: true },
  );
  route(
    "get",
    "/corridas",
    async (req) => ({ data: await f1.races(season(req), req.correlationId) }),
    { external: true },
  );
  route(
    "get",
    "/corridas/{temporada}/{rodada}/resultados",
    async (req) => ({
      data: await f1.results(
        req.params.temporada,
        req.params.rodada,
        req.correlationId,
      ),
    }),
    { external: true },
  );
  route(
    "get",
    "/classificacoes-pilotos",
    async (req) => ({
      data: await f1.standings(season(req), "drivers", req.correlationId),
    }),
    { external: true },
  );
  route(
    "get",
    "/classificacoes-equipes",
    async (req) => ({
      data: await f1.standings(season(req), "teams", req.correlationId),
    }),
    { external: true },
  );
  route("get", "/favoritos", async (req) => ({
    data: { dados: store.favorites(req.user.id) },
  }));
  route("post", "/favoritos", async (req) => {
    const key = req.get("Idempotency-Key"),
      body = JSON.stringify(canonical(req.body));
    const replay = store.replay(req.user.id, key, body);
    if (replay) return { data: replay };
    let piloto;
    try {
      piloto = await f1.favoriteDriver(req.body.piloto_id, req.correlationId);
    } catch (e) {
      throw e instanceof ApiError ? e : new ApiError(502);
    }
    if (!validator(contract.components.schemas.PilotoResumo)(piloto))
      throw new ApiError(502);
    return store.addFavorite(req.user.id, key, body, piloto);
  });
  route("delete", "/favoritos/{id}", async (req) => {
    store.removeFavorite(req.user.id, Number(req.params.id));
    return { status: 204 };
  });
  route("delete", "/cache", async (req) => {
    if (req.user.papel !== "admin") throw new ApiError(403);
    return { data: { entradas_removidas: provider.clearCache() } };
  });
  const dist = fileURLToPath(new URL("../client/dist/", import.meta.url));
  if (existsSync(dist)) app.use(express.static(dist));
  app.use((req, res, next) => next(new ApiError(404)));
  app.use(errorHandler);
  return app;
}
