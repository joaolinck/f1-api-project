const KEY = "f1hub.session";
export function session() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}
export function saveSession(data) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      token: data.token,
      expiresAt: Date.now() + data.expira_em * 1000,
    }),
  );
}
export function clearSession() {
  sessionStorage.removeItem(KEY);
}
export async function api(
  path,
  { method = "GET", body, headers = {}, signal } = {},
) {
  const current = session();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 120000);
  try {
    const response = await fetch(path, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(current ? { Authorization: `Bearer ${current.token}` } : {}),
        "X-Correlation-Id": crypto.randomUUID(),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      if (response.status === 401 && path !== "/auth/login") {
        clearSession();
        window.dispatchEvent(new Event("session-expired"));
      }
      const error = new Error(
        data?.mensagem_erro || "Não foi possível concluir a solicitação.",
      );
      Object.assign(error, {
        status: response.status,
        code: data?.codigo,
        correlationId: data?.correlation_id,
        details: data?.detalhes,
        retryAfter: response.headers.get("Retry-After"),
      });
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError" && !signal?.aborted)
      throw new Error("A solicitação demorou demais. Tente novamente.");
    if (error instanceof TypeError)
      throw new Error(
        "Não foi possível conectar. Verifique sua conexão e tente novamente.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
