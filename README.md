# F1 Hub

Plataforma de Fórmula 1 com backend **Node.js 24 + Express 5**, frontend **React + Vite** e persistência **SQLite**. O arquivo `openapi.yaml` é uma cópia integral do contrato fornecido. A API usa suas rotas e schemas, sem prefixo `/api`.

## Executar

Instale Node.js 24 ou superior. No terminal, dentro desta pasta:

```bash
npm ci
npm run setup
npm run build
npm start
```

Abra **http://localhost:3000**. Clique em **Cadastre-se**, crie uma conta e faça login. Não existem credenciais padrão. A Jolpica não requer uma chave de API para os endpoints públicos usados aqui.

`npm run setup` cria `.env` com segredo JWT criptograficamente aleatório. Ele nunca sobrescreve uma configuração existente. O banco é criado automaticamente em `data/f1.sqlite`.

Para desenvolvimento com atualização automática:

```bash
npm run dev
```

Abra **http://localhost:5173**. O Vite encaminha as rotas da API para o Express na porta 3000; se alterar a porta do backend, ajuste o destino em `client/vite.config.js`. Para execução com `npm start`, o Express serve o frontend compilado e a API na mesma origem.

## Funcionalidades

- Cadastro e login; sessão restaurada por `GET /usuarios/me`.
- Classificação de pilotos e construtores por temporada.
- Pilotos com filtro de nacionalidade sem diferenciar maiúsculas e paginação.
- Perfil consolidado: cadastro, classificação atual e até cinco resultados mais recentes.
- Equipes, calendário e resultados completos das corridas, incluindo circuito.
- Favoritos privados de cada usuário, com criação idempotente e remoção.
- Limpeza do cache disponível apenas para administradores.
- Estados de carregamento, erro, sessão expirada e ausência de dados; interface adaptável a celular.

O contrato anexado **não contém** rotas próprias de circuitos, ranking por pista ou perfil individual de equipe. Essas extensões exigiriam alterar o contrato antes de implementá-las.

## Organização

```text
server/
  app.js          Rotas, JWT, RBAC, rate limit e composição
  contract.js     Validação de parâmetros, corpos e respostas pelo OpenAPI
  jolpica.js      Fetch, AbortController, retry, circuit breaker e cache
  f1.js           Mapeamento explícito do modelo Jolpica para o contrato
  store.js        SQLite, senhas e transações dos favoritos
  errors.js       Respostas de erro padronizadas
  index.js        Configuração e inicialização
client/src/
  api.js          Cliente HTTP, armazenamento e expiração da sessão
  main.jsx        Telas e interações React
  style.css       Estilos responsivos
scripts/
  setup.js        Criação segura da configuração local
  admin.js        Criação administrativa fora do cadastro público
  smoke-live.js   Verificação opcional com a Jolpica real
tests/           Testes automatizados e fixtures exclusivas de teste
openapi.yaml      Contrato original, preservado
```

## Integração e resiliência

Toda requisição à Jolpica passa por `server/jolpica.js`. O frontend não conhece a URL, o envelope `MRData` nem os campos do provedor. Os mapeadores convertem nomes e tipos, números representados como texto, campos opcionais para `null` e posições não classificadas para `null`.

Cada tentativa usa um novo `AbortController`. O timeout inclui a leitura do JSON. O temporizador é limpo em `finally`. Por padrão são **3 tentativas no total**, com timeout de **5 segundos cada**. Timeout, erro de conexão e HTTP 5xx geram retry: espera de 300 ms, depois 600 ms, acrescida de jitter de 0–299 ms. Não se repetem imediatamente respostas 429, outros 4xx nem JSON inválido.

| Situação final | HTTP | Código |
| --- | --- | --- |
| Timeout após as tentativas | 504 | `EXTERNAL_TIMEOUT` |
| HTTP 5xx após as tentativas, conexão interrompida ou payload inválido | 502 | `EXTERNAL_BAD_GATEWAY` |
| Provedor responde 429 ou circuit breaker está aberto | 503 | `EXTERNAL_UNAVAILABLE` |
| Provedor responde lista vazia onde o recurso é obrigatório | 404 | `NOT_FOUND` |
| Filtro sem correspondência ou página além do total | 200 | `dados: []` |

O contrato não dá um status separado para falha de conexão; ela é tratada como erro de gateway (502). Cada erro contém `mensagem_erro`, `codigo` e `correlation_id`, com `detalhes` apenas para validação. Respostas 503 e 429 incluem `Retry-After`. Todas as respostas incluem `X-Correlation-Id`; valores válidos recebidos são propagados ao provedor e aos logs. Um header inválido gera um identificador novo e resposta 400.

Após 5 consultas externas esgotarem suas tentativas consecutivamente, o breaker abre por 30 segundos. Enquanto aberto, ele não faz novas requisições ao provedor. Após a espera, permite uma sondagem; sucesso fecha o circuito e falha o reabre. HTTP 429 abre o bloqueio pelo `Retry-After` recebido (ou 30 segundos). Entradas de cache ainda válidas podem ser servidas durante a indisponibilidade.

O cache em memória tem TTL de 60 segundos e limite de 300 páginas. Apenas respostas HTTP bem-sucedidas com envelope válido são armazenadas; os dados mapeados são validados antes da resposta ao cliente. Paginação externa usa `limit=100` e percorre offsets; resultados agrupados da mesma corrida são mesclados. O limite defensivo de 200 páginas evita loops de paginação de um provedor inconsistente.

## Autenticação e segurança

- Senhas com **scrypt**, salt aleatório individual e comparação resistente a timing attacks.
- JWT HS256 com validade de 3600 segundos, validação de algoritmo, emissor e audiência. Segredo vem apenas de `.env`; mínimo de 32 caracteres.
- Login devolve mensagem genérica para email inexistente e senha incorreta; ambos executam verificação de hash.
- Email normalizado para minúsculas; unicidade no banco. Cadastro público rejeita `papel` e quaisquer campos adicionais, conforme contrato.
- Login e cadastro compartilham limite de 15 tentativas por IP em 15 minutos, com 429 padronizado.
- Frontend usa **sessionStorage**, preservando a sessão ao recarregar a aba e removendo-a ao sair ou expirar. Não interpreta o JWT: consulta `/usuarios/me`. Não existe refresh token.
- Bearer tokens acessíveis ao JavaScript exigem prevenção de XSS. React escapa o conteúdo e Helmet aplica CSP; não há `dangerouslySetInnerHTML` nem scripts de terceiros. O armazenamento não substitui proteção contra XSS.
- Idempotência persistente por usuário/chave, comparação canônica de todo o corpo, criação em transação e restrição única por usuário/piloto. Corridas entre pedidos concorrentes não duplicam favoritos.
- Remoção de favorito de outra pessoa retorna 404. Chaves antigas continuam retornando o recurso originalmente criado mesmo após sua remoção, sem recriá-lo; para nova criação, use nova chave.
- Logs não incluem senhas, corpo de login nem tokens.

### Criar administrador

O cadastro público nunca cria administradores. Defina temporariamente estas variáveis em `.env`:

```dotenv
ADMIN_NAME=Administrador
ADMIN_EMAIL=seu-email@example.com
ADMIN_PASSWORD=escolha-uma-senha-forte
```

Execute:

```bash
npm run admin
```

Remova `ADMIN_PASSWORD` de `.env` depois de criar a conta. Faça login com ela para ver **Limpar cache** no menu. Um email já cadastrado gera conflito; o script não promove silenciosamente uma conta existente.

## Configuração

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `PORT` | `3000` | Porta Express |
| `JWT_SECRET` | Gerado por setup | Assinatura dos tokens |
| `DATABASE_PATH` | `./data/f1.sqlite` | Arquivo persistente SQLite |
| `JOLPICA_BASE_URL` | `https://api.jolpi.ca/ergast/f1/` | URL externa, definida no servidor |
| `EXTERNAL_TIMEOUT_MS` | `5000` | Timeout de cada tentativa |
| `EXTERNAL_ATTEMPTS` | `3` | Tentativas totais, entre 1 e 5 |
| `RETRY_BASE_MS` | `300` | Base do backoff |
| `CACHE_TTL_MS` | `60000` | Validade do cache |
| `BREAKER_THRESHOLD` | `5` | Falhas de consultas antes de abrir |
| `BREAKER_COOLDOWN_MS` | `30000` | Intervalo antes da sondagem |

## Testar

```bash
npm test
npm run build
```

A suíte usa SQLite em memória e respostas externas controladas; não depende da disponibilidade da Jolpica. Ela cobre os schemas das rotas, autenticação, RBAC, paginação, filtros, idempotência concorrente, isolamento dos favoritos, rate limit, 502/503/504, retries, timeout, cache, breaker e paginação externa.

Para consultar a Jolpica real (opcional, sem alterar seu banco):

```bash
node scripts/smoke-live.js
```

As fixtures ficam apenas em `tests/`; não são usadas pela aplicação. Não há fallback para dados fictícios durante falhas reais.

## Execução em servidor

Esta entrega é um projeto Node/Express executável, sem publicação em hospedagem. Use `npm ci`, `npm run setup`, `npm run build` e `npm start` em um host que suporte Node 24. Use HTTPS, um segredo estável e volume persistente para `data/`; faça backup do SQLite. Não publique `.env` nem o banco no Git.

A configuração fornecida se destina a **uma instância Node**. Cache, rate limit e circuit breaker são locais ao processo. Para múltiplas réplicas, esses estados precisam de armazenamento compartilhado e o banco deve ser adequado ao ambiente distribuído. Por padrão `trust proxy` está desabilitado; se houver proxy reverso, configure apenas os proxies efetivamente confiáveis em `app.js` para obter corretamente o IP do cliente, sem confiar indiscriminadamente em `X-Forwarded-For`.

## Referências técnicas

- Jolpica: https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md
- Express: https://expressjs.com/en/guide/error-handling/
