import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Flag,
  Users,
  Trophy,
  CalendarDays,
  Star,
  LogOut,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Shield,
  Search,
  Activity,
} from "lucide-react";
import { api, session, saveSession, clearSession } from "./api";
import "./style.css";
const navigation = [
  ["classificacoes-pilotos", "Classificação", Trophy],
  ["pilotos", "Pilotos", Users],
  ["equipes", "Equipes", Flag],
  ["corridas", "Calendário", CalendarDays],
  ["favoritos", "Favoritos", Star],
];
const formatDate = (d) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(d));
function ErrorBox({ error, retry }) {
  return (
    <div className="error" role="alert">
      <strong>{error.message}</strong>
      {error.details?.map((d, i) => (
        <div key={i}>
          {d.campo}: {d.problema}
        </div>
      ))}
      {error.retryAfter && (
        <p>Aguarde {error.retryAfter} segundos antes de tentar novamente.</p>
      )}
      {error.correlationId && <small>Referência: {error.correlationId}</small>}
      {retry && (
        <button onClick={retry}>
          <RefreshCw size={16} />
          Tentar novamente
        </button>
      )}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <Activity size={22} /> Buscando dados da temporada…
    </div>
  );
}
function Empty({ children = "Nenhum dado encontrado." }) {
  return (
    <div className="empty">
      <Flag size={28} />
      <p>{children}</p>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>F1</span> HUB<small>RACE INTELLIGENCE</small>
    </div>
  );
}
function Auth({ onLogin, notice }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (register) {
        await api("/usuarios", { method: "POST", body });
        setRegister(false);
        setSuccess("Conta criada. Entre com seu email e senha.");
      } else {
        const data = await api("/auth/login", { method: "POST", body });
        saveSession(data);
        onLogin(data.usuario);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">CADA PONTO CONTA.</span>
          <h1>
            A temporada.
            <br />
            Sob seu
            <br />
            <em>controle.</em>
          </h1>
          <p>
            Do grid à bandeirada. Explore os pilotos, acompanhe as equipes e
            reveja cada resultado.
          </p>
        </div>
        <span className="auth-footer">FÓRMULA 1 · DADOS E RESULTADOS</span>
      </section>
      <section className="auth-form">
        <span className="eyebrow">BEM-VINDO AO PADDOCK</span>
        <h2>{register ? "Crie sua conta" : "Entre na sua conta"}</h2>
        <p className="muted">Sua próxima análise começa aqui.</p>
        {notice && <p role="status">{notice}</p>}
        {success && (
          <p className="success" role="status">
            {success}
          </p>
        )}
        {error && <ErrorBox error={error} />}
        <form onSubmit={submit}>
          {register && (
            <label>
              Nome
              <input
                name="nome"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={150}
            />
          </label>
          <label>
            Senha
            <input
              name="senha"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 8 : 6}
              maxLength={100}
            />
          </label>
          {register && <small>Use uma senha de pelo menos 8 caracteres.</small>}
          <button className="primary" disabled={busy}>
            {busy ? "Aguarde…" : register ? "Criar conta" : "Entrar"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="switch-auth">
          {register ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
          <button
            onClick={() => {
              setRegister(!register);
              setError(null);
              setSuccess("");
            }}
          >
            {register ? "Entrar" : "Cadastre-se"}
          </button>
        </p>
      </section>
    </main>
  );
}
function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" onClick={onClose} aria-label="Fechar">
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Results({ data }) {
  return (
    <>
      <div className="detail-intro">
        <span className="eyebrow">RODADA {data.corrida.rodada}</span>
        <h3>{data.corrida.nome}</h3>
        <p>
          {data.corrida.circuito.nome} · {formatDate(data.corrida.data)}
        </p>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Piloto</th>
              <th>Equipe</th>
              <th>Grid</th>
              <th>Pontos</th>
              <th>Tempo / status</th>
            </tr>
          </thead>
          <tbody>
            {data.resultados.map((r) => (
              <tr key={r.piloto.id}>
                <td>{r.posicao ?? r.posicao_texto}</td>
                <td>{r.piloto.nome_completo}</td>
                <td>{r.equipe.nome}</td>
                <td>{r.grid}</td>
                <td>{r.pontos}</td>
                <td>{r.tempo || r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Profile({ data, onFavorite, busy }) {
  return (
    <>
      <div className="detail-intro">
        <span className="eyebrow">
          {data.piloto.codigo || "PILOTO"} · {data.piloto.nacionalidade}
        </span>
        <h3>{data.piloto.nome_completo}</h3>
        <p>
          {data.piloto.data_nascimento &&
            `Nascimento: ${formatDate(data.piloto.data_nascimento)}`}
        </p>
        <button onClick={() => onFavorite(data.piloto.id)} disabled={busy}>
          <Star size={17} />
          Adicionar aos favoritos
        </button>
      </div>
      {data.classificacao_atual && (
        <div className="metrics compact">
          <div>
            <small>Posição</small>
            <strong>{data.classificacao_atual.posicao}º</strong>
          </div>
          <div>
            <small>Pontos</small>
            <strong>{data.classificacao_atual.pontos}</strong>
          </div>
          <div>
            <small>Vitórias</small>
            <strong>{data.classificacao_atual.vitorias}</strong>
          </div>
        </div>
      )}
      <h3>Últimos resultados · {data.temporada}</h3>
      {!data.ultimos_resultados.length ? (
        <Empty>Este piloto ainda não tem resultados nesta temporada.</Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Corrida</th>
                <th>Data</th>
                <th>Posição</th>
                <th>Pontos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.ultimos_resultados.map((r) => (
                <tr key={r.rodada}>
                  <td>{r.corrida}</td>
                  <td>{formatDate(r.data)}</td>
                  <td>{r.posicao ?? "—"}</td>
                  <td>{r.pontos}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function Dashboard({ user, onLogout }) {
  const [view, setView] = useState("classificacoes-pilotos"),
    [season, setSeason] = useState("current"),
    [standings, setStandings] = useState("pilotos"),
    [page, setPage] = useState(1),
    [nationality, setNationality] = useState(""),
    [filter, setFilter] = useState(""),
    [data, setData] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0),
    [detail, setDetail] = useState(null),
    [detailError, setDetailError] = useState(null),
    [detailLoading, setDetailLoading] = useState(false),
    [actionBusy, setActionBusy] = useState(false),
    [feedback, setFeedback] = useState(null);
  const detailController = useRef(null),
    keys = useRef(new Map());
  useEffect(() => () => detailController.current?.abort(), []);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError(null);
    setData(null);
    let path =
      view === "classificacoes-pilotos"
        ? `/classificacoes-${standings}`
        : `/${view}`;
    const q = new URLSearchParams({ temporada: season });
    if (view === "pilotos") {
      q.set("pagina", page);
      q.set("limite", "12");
      if (filter) q.set("nacionalidade", filter);
    }
    if (view !== "favoritos") path += `?${q}`;
    api(path, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [view, season, standings, page, filter, revision]);
  async function openDetail(type, path) {
    detailController.current?.abort();
    const c = new AbortController();
    detailController.current = c;
    setDetail({ type, path });
    setDetailError(null);
    setDetailLoading(true);
    try {
      const result = await api(path, { signal: c.signal });
      if (!c.signal.aborted) setDetail({ type, path, data: result });
    } catch (e) {
      if (!c.signal.aborted) setDetailError(e);
    } finally {
      if (!c.signal.aborted) setDetailLoading(false);
    }
  }
  function closeDetail() {
    detailController.current?.abort();
    setDetail(null);
    setDetailError(null);
  }
  async function favorite(id) {
    setActionBusy(true);
    setFeedback(null);
    if (!keys.current.has(id)) keys.current.set(id, crypto.randomUUID());
    try {
      await api("/favoritos", {
        method: "POST",
        body: { piloto_id: id },
        headers: { "Idempotency-Key": keys.current.get(id) },
      });
      keys.current.delete(id);
      setFeedback({ message: "Piloto adicionado aos favoritos." });
    } catch (e) {
      if (e.status && e.status < 500) keys.current.delete(id);
      setFeedback({ error: e });
    } finally {
      setActionBusy(false);
    }
  }
  async function remove(id) {
    setActionBusy(true);
    try {
      await api(`/favoritos/${id}`, { method: "DELETE" });
      keys.current.clear();
      setRevision((x) => x + 1);
      setFeedback({ message: "Favorito removido." });
    } catch (e) {
      setFeedback({ error: e });
    } finally {
      setActionBusy(false);
    }
  }
  async function clearCache() {
    setActionBusy(true);
    try {
      const r = await api("/cache", { method: "DELETE" });
      setFeedback({
        message: `Cache limpo: ${r.entradas_removidas} entradas removidas.`,
      });
    } catch (e) {
      setFeedback({ error: e });
    } finally {
      setActionBusy(false);
    }
  }
  const title = navigation.find((x) => x[0] === view)?.[1],
    rows = data?.dados || [],
    leader = rows[0];
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <span className="nav-label">EXPLORAR</span>
        <nav>
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "selected" : ""}
              onClick={() => {
                setBusy(true);
                setData(null);
                setError(null);
                setView(id);
                setPage(1);
                setFeedback(null);
              }}
            >
              <Icon size={19} />
              {label}
              {view === id && <span className="active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {user.papel === "admin" && (
            <button onClick={clearCache} disabled={actionBusy}>
              <Shield size={18} />
              Limpar cache
            </button>
          )}
          <div className="user">
            <span className="avatar">
              {user.nome.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.nome}</strong>
              <small>
                {user.papel === "admin" ? "Administrador" : "Minha conta"}
              </small>
            </div>
            <button className="icon" aria-label="Sair" onClick={onLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            FÓRMULA 1 <span className="divider">/</span> CENTRAL DA TEMPORADA
          </span>
          <span className="data-source">Dados via Jolpica F1</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                F1 HUB / {view === "favoritos" ? "SUA SELEÇÃO" : "TEMPORADA"}
              </span>
              <h1>
                {title}
                <span>.</span>
              </h1>
            </div>
            {view !== "favoritos" && (
              <label className="season">
                Temporada
                <select
                  value={season}
                  onChange={(e) => {
                    setSeason(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="current">Atual</option>
                  {Array.from(
                    { length: new Date().getFullYear() - 1949 },
                    (_, i) => new Date().getFullYear() - i,
                  ).map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {feedback &&
            !detail &&
            (feedback.error ? (
              <ErrorBox error={feedback.error} />
            ) : (
              <p className="success" role="status">
                {feedback.message}
              </p>
            ))}
          {view === "classificacoes-pilotos" && (
            <div className="tabs" aria-label="Tipo de classificação">
              {["pilotos", "equipes"].map((k) => (
                <button
                  key={k}
                  className={standings === k ? "active" : ""}
                  onClick={() => setStandings(k)}
                >
                  {k === "pilotos" ? "Pilotos" : "Construtores"}
                </button>
              ))}
            </div>
          )}
          {view === "pilotos" && (
            <form
              className="filters"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setFilter(nationality);
              }}
            >
              <label>
                <Search size={18} />
                <input
                  aria-label="Nacionalidade"
                  placeholder="Nacionalidade (ex.: Brazilian)"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  minLength={2}
                  maxLength={50}
                />
              </label>
              <button>Filtrar</button>
              {filter && (
                <button
                  type="button"
                  onClick={() => {
                    setNationality("");
                    setFilter("");
                    setPage(1);
                  }}
                >
                  Limpar
                </button>
              )}
            </form>
          )}
          {busy ? (
            <Loading />
          ) : error ? (
            <ErrorBox error={error} retry={() => setRevision((x) => x + 1)} />
          ) : (
            <>
              {view === "classificacoes-pilotos" && data && (
                <>
                  <div className="metrics">
                    <div>
                      <small>LÍDER DO CAMPEONATO</small>
                      <strong className="leader">
                        {standings === "pilotos"
                          ? leader?.piloto.nome_completo
                          : leader?.equipe.nome}
                      </strong>
                      <span>{leader?.equipe.nome}</span>
                    </div>
                    <div>
                      <small>PONTOS DO LÍDER</small>
                      <strong>
                        {leader?.pontos ?? "—"}
                        <em>PTS</em>
                      </strong>
                    </div>
                    <div>
                      <small>TEMPORADA {data.temporada}</small>
                      <strong>
                        {String(data.rodada).padStart(2, "0")}
                        <em>RODADA</em>
                      </strong>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Disputa pelo campeonato</h2>
                      <span>
                        {rows.length}{" "}
                        {standings === "pilotos" ? "pilotos" : "equipes"}
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Pos.</th>
                            <th>
                              {standings === "pilotos" ? "Piloto" : "Equipe"}
                            </th>
                            {standings === "pilotos" && <th>Equipe</th>}
                            <th>Vitórias</th>
                            <th className="points">Pontos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={r.piloto?.id || r.equipe.id}>
                              <td>
                                <span className={`rank rank-${i}`}>
                                  {String(r.posicao).padStart(2, "0")}
                                </span>
                              </td>
                              <td>
                                {r.piloto ? (
                                  <button
                                    className="name-button"
                                    onClick={() =>
                                      openDetail(
                                        "profile",
                                        `/pilotos/${r.piloto.id}?temporada=${data.temporada}`,
                                      )
                                    }
                                  >
                                    {r.piloto.nome_completo}
                                    <small>{r.piloto.codigo}</small>
                                  </button>
                                ) : (
                                  <strong>{r.equipe.nome}</strong>
                                )}
                              </td>
                              {standings === "pilotos" && (
                                <td className="muted">{r.equipe.nome}</td>
                              )}
                              <td>{r.vitorias}</td>
                              <td className="points">
                                <strong>{r.pontos}</strong>
                                <div className="point-track">
                                  <span
                                    style={{
                                      width: `${leader?.pontos ? (100 * r.pontos) / leader.pontos : 0}%`,
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {view === "pilotos" && (
                <>
                  {!rows.length ? (
                    <Empty>
                      Nenhum piloto encontrado para este filtro ou página.
                    </Empty>
                  ) : (
                    <div className="cards">
                      {rows.map((d) => (
                        <article className="driver-card" key={d.id}>
                          <div className="card-top">
                            <span className="number">{d.numero ?? "—"}</span>
                            <button
                              className="icon"
                              aria-label={`Favoritar ${d.nome_completo}`}
                              onClick={() => favorite(d.id)}
                              disabled={actionBusy}
                            >
                              <Star size={19} />
                            </button>
                          </div>
                          <span className="eyebrow">
                            {d.codigo || "PILOTO"}
                          </span>
                          <h2>
                            {d.nome}
                            <br />
                            <strong>{d.sobrenome}</strong>
                          </h2>
                          <footer>
                            <span>{d.nacionalidade}</span>
                            <button
                              className="icon"
                              aria-label={`Ver perfil de ${d.nome_completo}`}
                              onClick={() =>
                                openDetail(
                                  "profile",
                                  `/pilotos/${d.id}?temporada=${season}`,
                                )
                              }
                            >
                              <ArrowRight size={21} />
                            </button>
                          </footer>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="pagination">
                    <span>
                      {data?.paginacao.total} pilotos · Página {page}
                      {data?.paginacao.total_paginas > 0 &&
                        ` de ${data.paginacao.total_paginas}`}
                    </span>
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      aria-label="Página anterior"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      disabled={page >= data?.paginacao.total_paginas}
                      onClick={() => setPage((p) => p + 1)}
                      aria-label="Próxima página"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </>
              )}
              {view === "equipes" && (
                <div className="cards">
                  {rows.map((t, i) => (
                    <article className="team-card" key={t.id}>
                      <span className="eyebrow">
                        CONSTRUTOR / {String(i + 1).padStart(2, "0")}
                      </span>
                      <Flag size={34} />
                      <h2>{t.nome}</h2>
                      <p>{t.nacionalidade}</p>
                    </article>
                  ))}
                </div>
              )}
              {view === "corridas" && (
                <div className="races">
                  {rows.map((r) => (
                    <article className="race-card" key={r.rodada}>
                      <span className="round">
                        {String(r.rodada).padStart(2, "0")}
                        <small>RODADA</small>
                      </span>
                      <div>
                        <span className="eyebrow">
                          {r.circuito.pais} · {r.circuito.localidade}
                        </span>
                        <h2>{r.nome}</h2>
                        <p>{r.circuito.nome}</p>
                      </div>
                      <div className="race-date">
                        <strong>{formatDate(r.data)}</strong>
                        <small>
                          {r.horario
                            ? `${r.horario.slice(0, 5)} UTC`
                            : "Horário a confirmar"}
                        </small>
                      </div>
                      <button
                        onClick={() =>
                          openDetail(
                            "results",
                            `/corridas/${r.temporada}/${r.rodada}/resultados`,
                          )
                        }
                      >
                        Resultados
                        <ArrowRight size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {view === "favoritos" &&
                (!rows.length ? (
                  <Empty>
                    Você ainda não tem favoritos. Adicione um piloto na aba
                    Pilotos.
                  </Empty>
                ) : (
                  <div className="cards">
                    {rows.map((f) => (
                      <article className="favorite-card" key={f.id}>
                        <Star className="red" />
                        <h2>{f.piloto.nome_completo}</h2>
                        <p>Adicionado em {formatDate(f.criado_em)}</p>
                        <div className="favorite-actions">
                          <button
                            onClick={() =>
                              openDetail(
                                "profile",
                                `/pilotos/${f.piloto.id}?temporada=${season}`,
                              )
                            }
                          >
                            Ver perfil
                          </button>
                          <button
                            onClick={() => remove(f.id)}
                            disabled={actionBusy}
                          >
                            Remover
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ))}
            </>
          )}
          <footer className="page-footer">
            <span>F1 HUB</span>
            <span>História na pista. Clareza nos dados.</span>
          </footer>
        </main>
      </div>
      {detail && (
        <Modal
          title={
            detail.type === "profile"
              ? "Perfil do piloto"
              : "Resultado da corrida"
          }
          onClose={closeDetail}
        >
          {feedback &&
            (feedback.error ? (
              <ErrorBox error={feedback.error} />
            ) : (
              <p className="success" role="status">
                {feedback.message}
              </p>
            ))}
          {detailLoading ? (
            <Loading />
          ) : detailError ? (
            <ErrorBox
              error={detailError}
              retry={() => openDetail(detail.type, detail.path)}
            />
          ) : (
            detail.data &&
            (detail.type === "profile" ? (
              <Profile
                data={detail.data}
                onFavorite={favorite}
                busy={actionBusy}
              />
            ) : (
              <Results data={detail.data} />
            ))
          )}
        </Modal>
      )}
    </div>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [restoring, setRestoring] = useState(!!session()),
    [notice, setNotice] = useState(""),
    [restoreError, setRestoreError] = useState(null),
    [revision, setRevision] = useState(0);
  function logout(message = "") {
    clearSession();
    setUser(null);
    setNotice(message);
    setRestoring(false);
    setRestoreError(null);
  }
  useEffect(() => {
    const c = new AbortController();
    if (session()) {
      if (session().expiresAt <= Date.now()) {
        logout("Sua sessão expirou. Entre novamente.");
        return;
      }
      setRestoring(true);
      setRestoreError(null);
      api("/usuarios/me", { signal: c.signal })
        .then(setUser)
        .catch((e) => {
          if (!c.signal.aborted && e.status !== 401) setRestoreError(e);
        })
        .finally(() => {
          if (!c.signal.aborted) setRestoring(false);
        });
    }
    const expired = () => logout("Sua sessão expirou. Entre novamente.");
    window.addEventListener("session-expired", expired);
    return () => {
      c.abort();
      window.removeEventListener("session-expired", expired);
    };
  }, [revision]);
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(
      () => logout("Sua sessão expirou. Entre novamente."),
      Math.max(0, (session()?.expiresAt || 0) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [user]);
  if (restoring) return <Loading />;
  if (restoreError)
    return (
      <main className="restore">
        <ErrorBox
          error={restoreError}
          retry={() => setRevision((x) => x + 1)}
        />
        <button onClick={() => logout()}>Voltar ao login</button>
      </main>
    );
  return user ? (
    <Dashboard user={user} onLogout={() => logout()} />
  ) : (
    <Auth notice={notice} onLogin={setUser} />
  );
}
createRoot(document.getElementById("root")).render(<App />);
