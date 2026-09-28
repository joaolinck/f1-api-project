export const errors = {
  400: ["VALIDATION_ERROR", "Parametro invalido"],
  401: ["UNAUTHORIZED", "Token ausente ou invalido"],
  403: ["FORBIDDEN", "Acesso restrito ao papel admin"],
  404: ["NOT_FOUND", "Recurso nao encontrado"],
  409: [
    "CONFLICT",
    "Recurso ja existente ou chave de idempotencia em conflito",
  ],
  429: ["TOO_MANY_REQUESTS", "Muitas tentativas, tente novamente em instantes"],
  500: ["INTERNAL_ERROR", "Erro interno do servidor"],
  502: [
    "EXTERNAL_BAD_GATEWAY",
    "Falha ao consultar o servico externo de Formula 1",
  ],
  503: [
    "EXTERNAL_UNAVAILABLE",
    "Servico externo temporariamente indisponivel, tente novamente em instantes",
  ],
  504: [
    "EXTERNAL_TIMEOUT",
    "Tempo limite excedido ao consultar o servico externo",
  ],
};
export class ApiError extends Error {
  constructor(status, message, details, retryAfter) {
    super(message || errors[status][1]);
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status =
    err instanceof ApiError
      ? err.status
      : ["entity.parse.failed", "entity.too.large"].includes(err.type)
        ? 400
        : 500;
  if (status === 500)
    console.error(
      JSON.stringify({
        event: "internal_error",
        correlation_id: req.correlationId,
        message: err.message,
      }),
    );
  if (err.retryAfter !== undefined)
    res.set("Retry-After", String(err.retryAfter));
  res
    .status(status)
    .json({
      mensagem_erro: err instanceof ApiError ? err.message : errors[status][1],
      codigo: errors[status][0],
      correlation_id: req.correlationId,
      ...(status === 400 && err.details ? { detalhes: err.details } : {}),
    });
}
