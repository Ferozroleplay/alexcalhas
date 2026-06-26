import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { DashPageHero } from "@/components/admin/DashPageHero";
import { formatMoeda, entregaNumeroNota } from "@/lib/fornecedores-display";
import { Route as InicioFornecedorRoute } from "@/routes/painel/inicio-fornecedor";

type Resumo = {
  total: number;
  recebidas: number;
  aguardando: number;
  suas_entregas: number;
  suas_recebidas: number;
};

type Financeiro = {
  valor_enviado: number;
  valor_recebido: number;
  valor_aguardando: number;
  valor_pago: number;
  valor_pago_confirmado: number;
};

type PorUsuario = {
  usuario_id: number;
  usuario_nome: string;
  total: number;
  recebidas: number;
  aguardando: number;
  valor_enviado: number;
  valor_recebido: number;
};

type Ultima = {
  id: number;
  status: string;
  enviado_em_fmt: string;
  qtd_itens: number;
  total_valor: number;
  usuario_nome: string;
};

type InicioData = {
  fornecedor_id: number;
  nome_empresa: string;
  erro?: string;
  resumo: Resumo;
  financeiro: Financeiro;
  percentual: number;
  percentual_valor: number;
  por_usuario: PorUsuario[];
  ultimas: Ultima[];
  updated_at: string;
};

function entregasSearch(fornecedorId: number) {
  return fornecedorId > 0 ? { controle: fornecedorId } : {};
}

export function FornecedorInicioPage() {
  const { user, ready } = useAdminAuth();
  const navigate = useNavigate({ from: InicioFornecedorRoute.fullPath });
  const search = InicioFornecedorRoute.useSearch();
  const controleUrl = search.controle ?? 0;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [data, setData] = useState<InicioData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const qs = new URLSearchParams();
      if (controleUrl > 0) qs.set("controle", String(controleUrl));
      const res = await fetch(`/api/admin/fornecedor-inicio?${qs}`, { credentials: "include" });
      const json = (await res.json()) as InicioData & { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(json.message ?? "Erro ao carregar.");
      setData(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [controleUrl]);

  useEffect(() => {
    if (!ready) return;
    if (user && user.visao !== "fornecedor") {
      void navigate({ to: "/painel" });
      return;
    }
    void load();
  }, [load, ready, user, navigate]);

  useEffect(() => {
    document.body.classList.add("dashboard-page--fornecedor-inicio");
    return () => document.body.classList.remove("dashboard-page--fornecedor-inicio");
  }, []);

  const nome = user?.nome?.split(" ")[0] ?? "Fornecedor";
  const fid = data?.fornecedor_id ?? controleUrl ?? user?.fornecedorPreviewId ?? 0;
  const entregasTo = { to: "/painel/fornecedores" as const, search: entregasSearch(fid) };

  const subtitulo = data?.nome_empresa
    ? `Resumo de entregas — ${data.nome_empresa}`
    : "Resumo das entregas da sua empresa";

  return (
    <div className="dash-form-page dash-form-page--pro analytics-page dash-func-inicio-page dash-forn-inicio-page">
      <DashPageHero
        title={`Olá, ${nome}`}
        subtitle={subtitulo}
        iconClass="bi-truck"
        layout="form"
        showNovaVisita={false}
        cta={
          fid > 0 ? (
            <Link to={entregasTo.to} search={entregasTo.search} className="dash-form-page__cta">
              <i className="bi bi-box-seam" aria-hidden="true" />
              <span>Nova entrega</span>
            </Link>
          ) : undefined
        }
      />

      <div className="dash-page-body dash-page-body--solo">
        {erro ? (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        ) : null}
        {loading ? <p className="text-muted py-3">Carregando…</p> : null}

        {!loading && data?.erro === "sem_vinculo" ? (
          <div className="alert alert-warning mb-0" role="alert">
            Sua conta não está vinculada a um fornecedor. Peça ao administrador para configurar o
            vínculo em Usuários → Fornecedor.
          </div>
        ) : null}

        {!loading && data && data.fornecedor_id > 0 ? (
          <>
            <section
              className="analytics-section dash-forn-inicio-finance"
              aria-label="Resumo financeiro"
            >
              <div className="analytics-metrics dash-forn-inicio-finance__metrics">
                <div className="metric-card metric-card--static metric-card--finance">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Valor recebido</span>
                    <span className="metric-card__icon metric-card__icon--green">
                      <i className="bi bi-bag-check" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">
                    R$ {formatMoeda(data.financeiro.valor_recebido)}
                  </strong>
                </div>

                <div className="metric-card metric-card--static metric-card--finance">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Total enviado</span>
                    <span className="metric-card__icon metric-card__icon--blue">
                      <i className="bi bi-send" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">
                    R$ {formatMoeda(data.financeiro.valor_enviado)}
                  </strong>
                </div>

                <div className="metric-card metric-card--static metric-card--finance">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Aguardando visto</span>
                    <span className="metric-card__icon metric-card__icon--amber">
                      <i className="bi bi-hourglass-split" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">
                    R$ {formatMoeda(data.financeiro.valor_aguardando)}
                  </strong>
                </div>

                <div className="metric-card metric-card--static metric-card--finance">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Pagamento confirmado</span>
                    <span className="metric-card__icon metric-card__icon--purple">
                      <i className="bi bi-cash-coin" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">
                    R$ {formatMoeda(data.financeiro.valor_pago_confirmado)}
                  </strong>
                </div>
              </div>

              {data.financeiro.valor_enviado > 0 ? (
                <div
                  className="dash-func-inicio-progress dash-forn-inicio-finance__progress"
                  role="group"
                  aria-label="Percentual recebido"
                >
                  <div className="dash-func-inicio-progress__head">
                    <span>Recebido do total enviado</span>
                    <strong>{data.percentual_valor}%</strong>
                  </div>
                  <div className="dash-func-inicio-progress__bar" aria-hidden="true">
                    <span
                      className="dash-func-inicio-progress__fill"
                      style={{ width: `${Math.min(100, Math.max(0, data.percentual_valor))}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </section>

            <section className="analytics-section" aria-labelledby="forn-resumo-title">
              <div className="analytics-section__head">
                <div>
                  <h2 id="forn-resumo-title" className="analytics-section__title">
                    Suas entregas
                  </h2>
                  <p className="analytics-section__meta">Atualizado em {data.updated_at}</p>
                </div>
                <button
                  type="button"
                  className="analytics-btn analytics-btn--ghost analytics-btn--sm"
                  onClick={() => void load()}
                  title="Atualizar"
                  aria-label="Atualizar resumo"
                >
                  <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                  <span className="dash-func-inicio-refresh-label">Atualizar</span>
                </button>
              </div>

              <div className="analytics-metrics dash-func-inicio-metrics">
                <Link to={entregasTo.to} search={entregasTo.search} className="metric-card metric-card--func">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Entregas feitas</span>
                    <span className="metric-card__icon metric-card__icon--blue">
                      <i className="bi bi-send" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">{data.resumo.total}</strong>
                  <span className="metric-card__hint">Total enviadas ao Alex Calhas</span>
                </Link>
                <Link to={entregasTo.to} search={entregasTo.search} className="metric-card metric-card--func">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Recebidas</span>
                    <span className="metric-card__icon metric-card__icon--purple">
                      <i className="bi bi-check2-circle" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">{data.resumo.recebidas}</strong>
                  <span className="metric-card__hint">Conferidas pela empresa</span>
                </Link>
                <div className="metric-card metric-card--func metric-card--static">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Aguardando</span>
                    <span className="metric-card__icon metric-card__icon--amber">
                      <i className="bi bi-hourglass-split" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">{data.resumo.aguardando}</strong>
                  <span className="metric-card__hint">Ainda sem visto</span>
                </div>
                <div className="metric-card metric-card--func metric-card--static">
                  <div className="metric-card__top">
                    <span className="metric-card__label">Você registrou</span>
                    <span className="metric-card__icon metric-card__icon--green">
                      <i className="bi bi-person-check" aria-hidden="true" />
                    </span>
                  </div>
                  <strong className="metric-card__value">{data.resumo.suas_entregas}</strong>
                  <span className="metric-card__hint">{data.resumo.suas_recebidas} já recebidas</span>
                </div>
              </div>

              {data.resumo.total > 0 ? (
                <div className="dash-func-inicio-progress" role="group" aria-label="Entregas recebidas">
                  <div className="dash-func-inicio-progress__head">
                    <span>Taxa de entregas recebidas</span>
                    <strong>{data.percentual}%</strong>
                  </div>
                  <div className="dash-func-inicio-progress__bar" aria-hidden="true">
                    <span
                      className="dash-func-inicio-progress__fill"
                      style={{ width: `${Math.min(100, Math.max(0, data.percentual))}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </section>

            {data.por_usuario.length > 0 ? (
              <section className="analytics-section" aria-labelledby="forn-usuarios-title">
                <div className="analytics-section__head">
                  <div>
                    <h2 id="forn-usuarios-title" className="analytics-section__title">
                      Entregas por usuário
                    </h2>
                    <p className="analytics-section__meta">
                      Cada login do fornecedor e quantas notas enviou
                    </p>
                  </div>
                </div>
                <div className="inv-table-shell dash-forn-inicio-table-shell">
                  <div className="table-responsive">
                    <table className="table inv-data-table inv-data-table--balanced dash-forn-inicio-usuarios mb-0">
                      <thead>
                        <tr>
                          <th>Usuário</th>
                          <th className="text-end">Feitas</th>
                          <th className="text-end">Recebidas</th>
                          <th className="text-end">Aguardando</th>
                          <th className="text-end">Valor recebido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.por_usuario.map((pu) => (
                          <tr
                            key={pu.usuario_id}
                            className={`inv-data-row${pu.usuario_id === user?.id ? " table-active" : ""}`}
                          >
                            <td>
                              {pu.usuario_nome}
                              {pu.usuario_id === user?.id ? (
                                <span className="dash-forn-badge-voce">você</span>
                              ) : null}
                            </td>
                            <td className="text-end fw-semibold">{pu.total}</td>
                            <td className="text-end">{pu.recebidas}</td>
                            <td className="text-end">{pu.aguardando}</td>
                            <td className="text-end fw-semibold dash-forn-inicio-valor">
                              R$ {formatMoeda(pu.valor_recebido)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="analytics-section" aria-labelledby="forn-ultimas-title">
              <div className="analytics-section__head">
                <div>
                  <h2 id="forn-ultimas-title" className="analytics-section__title">
                    Últimas entregas
                  </h2>
                </div>
              </div>
              {data.ultimas.length === 0 ? (
                <p className="analytics-section__meta mb-0">Nenhuma entrega registrada ainda.</p>
              ) : (
                <>
                  <div className="dash-func-inicio-visitas-mobile" aria-label="Últimas entregas">
                    {data.ultimas.map((ent) => {
                      const ok = ent.status === "recebido";
                      return (
                        <article key={ent.id} className="dash-func-inicio-visita-card dash-forn-entrega-card">
                          <div className="dash-forn-entrega-card__head">
                            <p className="dash-func-inicio-visita-card__nome mb-0">
                              {entregaNumeroNota(ent.id)}
                            </p>
                            <span
                              className={`dash-forn-entrega-st ${ok ? "dash-forn-entrega-st--ok" : "dash-forn-entrega-st--wait"}`}
                            >
                              {ok ? "Recebida" : "Aguardando"}
                            </span>
                          </div>
                          <p className="dash-func-inicio-visita-card__meta mb-0">
                            <i className="bi bi-calendar3" aria-hidden="true" /> {ent.enviado_em_fmt}
                            <span className="dash-func-inicio-visita-card__sep" aria-hidden="true">
                              {" "}
                              ·{" "}
                            </span>
                            {ent.qtd_itens} item(ns)
                            <span className="dash-func-inicio-visita-card__sep" aria-hidden="true">
                              {" "}
                              ·{" "}
                            </span>
                            <strong>R$ {formatMoeda(ent.total_valor)}</strong>
                          </p>
                          {ent.usuario_nome ? (
                            <p className="dash-func-inicio-visita-card__local mb-0">
                              <i className="bi bi-person" aria-hidden="true" /> {ent.usuario_nome}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  <div className="inv-table-shell dash-forn-inicio-table-shell dash-func-inicio-visitas-desktop">
                    <div className="table-responsive">
                      <table className="table inv-data-table inv-data-table--balanced dash-func-inicio-table mb-0">
                        <thead>
                          <tr>
                            <th>Nota</th>
                            <th>Enviada em</th>
                            <th className="text-end">Itens</th>
                            <th className="text-end">Total</th>
                            <th>Usuário</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.ultimas.map((ent) => {
                            const ok = ent.status === "recebido";
                            return (
                              <tr key={ent.id} className="inv-data-row">
                                <td>
                                  <span className="inv-id-badge">{entregaNumeroNota(ent.id)}</span>
                                </td>
                                <td>{ent.enviado_em_fmt}</td>
                                <td className="text-end">{ent.qtd_itens}</td>
                                <td className="text-end fw-semibold dash-forn-inicio-valor">
                                  R$ {formatMoeda(ent.total_valor)}
                                </td>
                                <td>{ent.usuario_nome}</td>
                                <td>
                                  <span
                                    className={`dash-forn-entrega-st ${ok ? "dash-forn-entrega-st--ok" : "dash-forn-entrega-st--wait"}`}
                                  >
                                    {ok ? "Recebida" : "Aguardando"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="dash-func-inicio-visitas-cta">
                    <Link
                      to={entregasTo.to}
                      search={entregasTo.search}
                      className="analytics-btn analytics-btn--outline analytics-btn--sm w-100"
                    >
                      <i className="bi bi-arrow-right" aria-hidden="true" /> Ir para minhas entregas
                    </Link>
                  </div>
                </>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
