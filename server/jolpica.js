import { setTimeout as sleep } from "node:timers/promises";
import { ApiError } from "./errors.js";
export function createJolpica({
  baseUrl = "https://api.jolpi.ca/ergast/f1/",
  timeoutMs = 5000,
  attempts = 3,
  retryBaseMs = 300,
  cacheTtlMs = 60000,
  threshold = 5,
  cooldownMs = 30000,
  fetchImpl = fetch,
  sleepImpl = sleep,
  now = Date.now,
  random = Math.random,
  logger = console.info,
} = {}) {
  const cache = new Map();
  let failures = 0,
    openUntil = 0,
    probing = false;
  function unavailable(seconds) {
    return new ApiError(
      503,
      undefined,
      undefined,
      Math.max(1, Math.ceil(seconds)),
    );
  }
  async function request(path, correlationId) {
    const cached = cache.get(path);
    if (cached && cached.expires > now()) return structuredClone(cached.data);
    cache.delete(path);
    if (openUntil > now()) throw unavailable((openUntil - now()) / 1000);
    const probe = openUntil !== 0;
    if (probe && probing) throw unavailable(cooldownMs / 1000);
    if (probe) probing = true;
    try {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let failure;
        try {
          const response = await fetchImpl(new URL(path, baseUrl), {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "User-Agent": "F1Hub/1.0.0",
              "X-Correlation-Id": correlationId,
            },
          });
          if (response.status === 429) {
            const header = response.headers.get("retry-after");
            const seconds =
              header && /^\d+$/.test(header)
                ? Number(header)
                : header
                  ? Math.ceil((Date.parse(header) - now()) / 1000)
                  : 30;
            const retry = Number.isFinite(seconds)
              ? Math.min(86400, Math.max(1, seconds))
              : 30;
            openUntil = now() + retry * 1000;
            throw unavailable(retry);
          }
          if (!response.ok) {
            const e = new ApiError(502);
            e.retryable = response.status >= 500;
            throw e;
          }
          let data;
          try {
            data = await response.json();
          } catch (e) {
            if (controller.signal.aborted) throw e;
            throw new ApiError(502);
          }
          if (
            !data?.MRData ||
            !Number.isSafeInteger(Number(data.MRData.total)) ||
            Number(data.MRData.total) < 0
          )
            throw new ApiError(502);
          failures = 0;
          openUntil = 0;
          if (cache.size >= 300) cache.delete(cache.keys().next().value);
          cache.set(path, { data: data.MRData, expires: now() + cacheTtlMs });
          return structuredClone(data.MRData);
        } catch (e) {
          if (e.status === 503) throw e;
          failure = controller.signal.aborted
            ? new ApiError(504)
            : e instanceof ApiError
              ? e
              : new ApiError(502);
          const retryable =
            controller.signal.aborted ||
            !(e instanceof ApiError) ||
            e.retryable;
          logger(
            JSON.stringify({
              event: "external_failure",
              correlation_id: correlationId,
              attempt: attempt + 1,
              status: failure.status,
            }),
          );
          if (!retryable || attempt === attempts - 1) {
            failures++;
            if (probe || failures >= threshold) openUntil = now() + cooldownMs;
            throw failure;
          }
        } finally {
          clearTimeout(timer);
        }
        await sleepImpl(
          retryBaseMs * 2 ** attempt + Math.floor(random() * retryBaseMs),
        );
      }
    } finally {
      if (probe) probing = false;
    }
  }
  async function list(path, table, rows, correlationId, nested) {
    const merged = [];
    let offset = 0;
    let meta;
    for (let page = 0; page < 200; page++) {
      const data = await request(
        `${path}?limit=100&offset=${offset}`,
        correlationId,
      );
      const group = data[table];
      const items = group?.[rows];
      if (!Array.isArray(items)) throw new ApiError(502);
      meta = group;
      const count = nested
        ? items.reduce(
            (n, x) => n + (Array.isArray(x[nested]) ? x[nested].length : NaN),
            0,
          )
        : items.length;
      const total = Number(data.total);
      if (!Number.isFinite(count) || (!count && offset < total))
        throw new ApiError(502);
      for (const item of items) {
        if (nested) {
          const existing = merged.find(
            (x) => x.season === item.season && x.round === item.round,
          );
          if (existing) existing[nested].push(...item[nested]);
          else merged.push(item);
        } else merged.push(item);
      }
      offset += count;
      if (offset >= total) return { items: merged, meta };
    }
    throw new ApiError(502);
  }
  return {
    request,
    list,
    clearCache() {
      const n = cache.size;
      cache.clear();
      return n;
    },
  };
}
