import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { DashPageHero } from "@/components/admin/DashPageHero";
import { FinDesdePicker, FinYearPicker } from "@/components/admin/FinMonthPickers";
import { formatMoeda } from "@/lib/financeiro-display";
import { Route as FinanceiroRoute } from "@/routes/painel/financeiro";

type FinData = {
  updated_at: string;
  resumo: {
    receita_confirmado: number;
    qtd_confirmados: number;
    receita_faturada: number;
    qtd_faturados: number;
    total_geral: number;
    custo_itens: number;
    custo_compras: number;
    margem_confirmado: number;
    margem_faturado: number;
    margem: number;
    margem_mes_label: string;
    recebido_mes?: number;
    despesas_mes?: number;
    folha_mes?: number;
    liquido_mes?: number;
  };
  por_status: {
    confirmado: { qtd: number; valor: number };
    finalizado: { qtd: number; valor: number };
  };
  por_fornecedor: { id: number; nome: string; custo: number; venda: number; margem: number }[];
  movimentos: {
    tipo: "faturado" | "confirmado";
    titulo: string;
    detalhe: string;
    valor: number;
    link: string;
  }[];
  faturado_mensal: {
    ano: number;
    desde_ym: string | null;
    primeiro_finalizado_ym: string | null;
    meses: { label: string; valor: number; qtd: number; atual: boolean }[];
    total_ano: number;
    qtd_ano: number;
    mes_atual: { label: string; valor: number; qtd: number };
    anos_disponiveis: number[];
  };
};

export function FinanceiroPage() {
  const navigate = useNavigate({ from: FinanceiroRoute.fullPath });
  const search = FinanceiroRoute.useSearch();
  const ano = search.ano ?? new Date().getFullYear();
  const desde = search.desde ?? "";

  const [data, setData] = useState<FinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [tabelaAberta, setTabelaAberta] = useState(false);

  const applyFilters = useCallback(
    (next: { ano?: number; desde?: string }) => {
      void navigate({
        search: {
          ano: next.ano ?? ano,
          desde: next.desde !== undefined ? next.desde || undefined : desde || undefined,
        },
      });
    },
    [navigate, ano, desde],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const qs = new URLSearchParams({ ano: String(ano) });
      if (desde) qs.set("desde", desde);
      const res = await fetch(`/api/admin/financeiro?${qs}`, { credentials: "include" });
      const json = (await res.json()) as FinData & { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(json.message ?? "Erro ao carregar financeiro.");
      setData(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ano, desde]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.body.classList.add("dashboard-page--financeiro");
    return () => document.body.classList.remove("dashboard-page--financeiro");
  }, []);

  const fm = data?.faturado_mensal;
  const res = data?.resumo;
  const finDesdeMin = fm?.primeiro_finalizado_ym ?? new Date().toISOString().slice(0, 7);
  const finDesdeVal = desde || fm?.desde_ym || finDesdeMin;
  const finDesdeMax = new Date().toISOString().slice(0, 7);

  const stConfirmado = data?.por_status.confirmado;
  const stFinalizadoDisplay = fm
    ? { qtd: fm.qtd_ano, valor: fm.total_ano }
    : data?.por_status.finalizado;

  return (
    <div className="analytics-page dash-form-page--pro">
      <DashPageHero
        title="Financeiro"
        subtitle="Caixa do mês usa o que entrou de verdade. Confirmado e finalizado continuam como contratado."
        iconClass="bi-cash-coin"
        accent="financeiro"
        layout="header"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header">
        <div className="dash-financeiro-page">
          {erro ? (
            <div className="alert alert-danger" role="alert">
              {erro}
            </div>
          ) : null}
          {loading ? <p className="text-muted py-3">Carregando…</p> : null}

          {!loading && data && res && fm && stConfirmado && stFinalizadoDisplay ? (
            <>
              <div className="inv-list-toolbar mb-3">
                <div className="inv-list-toolbar__stats">
                  <span className="inv-list-stat">
                    Atualizado em <strong>{data.updated_at}</strong>
                  </span>
                </div>
                <span className="inv-list-toolbar__badge inv-list-toolbar__badge--financeiro">
                  <i className="bi bi-shield-lock" aria-hidden="true" /> Administração
                </span>
              </div>

              <p className="fin-intro text-secondary small mb-3">
                Cada mês começa no <strong>dia 1</strong> e vai até o último dia do mês. O caixa do mês
                soma pagamentos lançados, menos despesas e folha. O faturado contratado entra no mês da
                data do serviço (montagem ou visita).{" "}
                <strong>Confirmado</strong> = em faturamento · <strong>Finalizado</strong> = faturado.
              </p>

              <section className="dash-form-card mb-3" aria-labelledby="fin-caixa-mes-title">
                <h2 id="fin-caixa-mes-title" className="dash-form-block__title mb-3">
                  <i className="bi bi-wallet2" aria-hidden="true" /> Caixa de {res.margem_mes_label}
                </h2>
                <div className="row g-3 forn-finance-summary">
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card forn-stat-card--venda">
                      <span className="forn-stat-card__label">Recebido</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.recebido_mes ?? 0)}
                      </strong>
                      <span className="forn-stat-card__sub">Pagamentos lançados no mês</span>
                    </div>
                  </div>
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card forn-stat-card--custo">
                      <span className="forn-stat-card__label">Despesas</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.despesas_mes ?? 0)}
                      </strong>
                      <span className="forn-stat-card__sub">Combustível, material e demais</span>
                    </div>
                  </div>
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card forn-stat-card--custo">
                      <span className="forn-stat-card__label">Folha</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.folha_mes ?? 0)}
                      </strong>
                      <span className="forn-stat-card__sub">Pagamentos de funcionários</span>
                    </div>
                  </div>
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card forn-stat-card--margem">
                      <span className="forn-stat-card__label">Líquido</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.liquido_mes ?? 0)}
                      </strong>
                      <span className="forn-stat-card__sub">Recebido − despesas − folha</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="dash-form-card mb-3 fin-mensal" aria-labelledby="fin-mensal-title">
                <div className="fin-mensal__header">
                  <div className="fin-mensal__header-icon" aria-hidden="true">
                    <i className="bi bi-calendar3" />
                  </div>
                  <div className="fin-mensal__header-text">
                    <h2 id="fin-mensal-title" className="fin-mensal__title">
                      Faturado por mês
                    </h2>
                    <p className="fin-mensal__subtitle">
                      Valores finalizados agrupados por mês de calendário (dia 1 ao último dia).
                    </p>
                  </div>
                </div>

                <div className="fin-mensal__filter-panel">
                  <form className="fin-mensal__filter-form" id="fin-mensal-form" onSubmit={(e) => e.preventDefault()}>
                    <div className="fin-mensal__field">
                      <label className="fin-mensal__label" id="fin-ano-label">
                        Ano exibido na tabela
                      </label>
                      <FinYearPicker
                        years={fm.anos_disponiveis}
                        value={ano}
                        onChange={(y) => applyFilters({ ano: y })}
                      />
                    </div>
                    <div className="fin-mensal__field fin-mensal__field--desde">
                      <label className="fin-mensal__label" id="fin-desde-label">
                        Somar a partir de
                      </label>
                      <FinDesdePicker
                        minYm={finDesdeMin}
                        maxYm={finDesdeMax}
                        value={finDesdeVal}
                        onChange={(ym) => applyFilters({ desde: ym })}
                      />
                    </div>
                  </form>
                </div>

                <div className="row g-3 fin-mensal__highlights mb-4">
                  <div className="col-md-6">
                    <div className="fin-mensal__highlight fin-mensal__highlight--current">
                      <div className="fin-mensal__highlight-top">
                        <span className="fin-mensal__badge-atual">Mês atual</span>
                        <i
                          className="bi bi-arrow-repeat fin-mensal__highlight-icon"
                          aria-hidden="true"
                          title="Reinicia no dia 1"
                        />
                      </div>
                      <span className="fin-mensal__highlight-label">{fm.mes_atual.label}</span>
                      <strong className="fin-mensal__highlight-value">
                        R$ {formatMoeda(fm.mes_atual.valor)}
                      </strong>
                      <span className="fin-mensal__highlight-meta">
                        {fm.mes_atual.qtd} serviço(s) finalizado(s)
                      </span>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="fin-mensal__highlight">
                      <div className="fin-mensal__highlight-top">
                        <span className="fin-mensal__highlight-tag">Ano {fm.ano}</span>
                      </div>
                      <span className="fin-mensal__highlight-label">Total no período filtrado</span>
                      <strong className="fin-mensal__highlight-value fin-mensal__highlight-value--year">
                        R$ {formatMoeda(fm.total_ano)}
                      </strong>
                      <span className="fin-mensal__highlight-meta">{fm.qtd_ano} serviço(s) no ano</span>
                    </div>
                  </div>
                </div>

                <div className="fin-mensal__table-collapse">
                  <button
                    type="button"
                    className={`fin-mensal__table-toggle${tabelaAberta ? " is-open" : ""}`}
                    aria-expanded={tabelaAberta}
                    aria-controls="fin-mensal-table-panel"
                    title={`Ver detalhamento por mês (${fm.ano})`}
                    aria-label={
                      tabelaAberta
                        ? "Fechar detalhamento por mês"
                        : `Abrir detalhamento por mês em ${fm.ano}`
                    }
                    onClick={() => setTabelaAberta((v) => !v)}
                  >
                    <i className="bi bi-chevron-down fin-mensal__table-toggle-icon" aria-hidden="true" />
                  </button>
                  <div
                    id="fin-mensal-table-panel"
                    className="fin-mensal__table-panel"
                    hidden={!tabelaAberta}
                  >
                    <div className="inv-table-shell fin-mensal__table-shell">
                      <div className="table-responsive inv-table-scroll inv-table-scroll--fit">
                        <table className="table inv-data-table fin-mensal-table align-middle mb-0">
                          <thead>
                            <tr>
                              <th>Mês</th>
                              <th className="text-end">Qtd.</th>
                              <th className="text-end">Faturado (R$)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fm.meses.map((mes) => {
                              let rowClass = mes.atual ? "fin-mensal-table__row--atual" : "";
                              if (mes.valor > 0) {
                                rowClass = rowClass
                                  ? `${rowClass} fin-mensal-table__row--has-value`
                                  : "fin-mensal-table__row--has-value";
                              }
                              return (
                                <tr key={mes.label} className={rowClass || undefined}>
                                  <td>
                                    {mes.label}
                                    {mes.atual ? (
                                      <span className="fin-mensal__badge-atual fin-mensal__badge-atual--inline ms-1">
                                        Mês atual
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="text-end">{mes.qtd}</td>
                                  <td className="text-end fw-semibold">{formatMoeda(mes.valor)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td className="fw-semibold">Total {fm.ano}</td>
                              <td className="text-end fw-semibold">{fm.qtd_ano}</td>
                              <td className="text-end fw-semibold">R$ {formatMoeda(fm.total_ano)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="dash-form-card mb-3 fin-confronto" aria-labelledby="fin-confronto-title">
                <h2 id="fin-confronto-title" className="dash-form-block__title mb-3">
                  <i className="bi bi-arrow-left-right" aria-hidden="true" /> Confronto: confirmado ×
                  finalizado (faturado)
                </h2>
                <div className="row g-3 forn-finance-summary">
                  <div className="col-md-6">
                    <div className="forn-stat-card forn-stat-card--margem fin-confronto__card">
                      <span className="forn-stat-card__label">Confirmado — em faturamento</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.receita_confirmado)}
                      </strong>
                      <span className="forn-stat-card__sub">
                        {res.qtd_confirmados} serviço(s) confirmado(s)
                      </span>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="forn-stat-card forn-stat-card--venda fin-confronto__card">
                      <span className="forn-stat-card__label">Faturado em {fm.ano}</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.receita_faturada)}
                      </strong>
                      <span className="forn-stat-card__sub">{fm.qtd_ano} serviço(s) no ano</span>
                    </div>
                  </div>
                </div>
                <div className="fin-confronto__total mt-3 p-3 rounded">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <span className="fw-semibold">Total no financeiro</span>
                    <strong className="fs-5 text-success">R$ {formatMoeda(res.total_geral)}</strong>
                  </div>
                </div>
              </section>

              <section className="dash-form-card mb-3" aria-labelledby="fin-resumo-title">
                <h2 id="fin-resumo-title" className="dash-form-block__title mb-3">
                  <i className="bi bi-pie-chart" aria-hidden="true" /> Detalhamento
                </h2>
                <div className="row g-3 forn-finance-summary">
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card forn-stat-card--custo">
                      <span className="forn-stat-card__label">Custo (materiais)</span>
                      <strong className="forn-stat-card__value">R$ {formatMoeda(res.custo_itens)}</strong>
                      <span className="forn-stat-card__sub">
                        Compras forn.: R$ {formatMoeda(res.custo_compras)}
                      </span>
                    </div>
                  </div>
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card">
                      <span className="forn-stat-card__label">Margem faturamento</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.margem_confirmado)}
                      </strong>
                      <span className="forn-stat-card__sub">
                        {res.qtd_confirmados} confirmado(s) em andamento
                      </span>
                    </div>
                  </div>
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card">
                      <span className="forn-stat-card__label">Margem faturado</span>
                      <strong className="forn-stat-card__value">
                        R$ {formatMoeda(res.margem_faturado)}
                      </strong>
                      <span className="forn-stat-card__sub">
                        Finalizados em {res.margem_mes_label}
                      </span>
                    </div>
                  </div>
                  <div className="col-6 col-lg-3">
                    <div className="forn-stat-card forn-stat-card--margem">
                      <span className="forn-stat-card__label">Margem geral</span>
                      <strong className="forn-stat-card__value">R$ {formatMoeda(res.margem)}</strong>
                      <span className="forn-stat-card__sub">
                        Mês atual — confirmados + finalizados do mês
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="row g-3 mb-3">
                <div className="col-lg-5">
                  <section className="dash-form-card h-100" aria-labelledby="fin-status-title">
                    <h2 id="fin-status-title" className="dash-form-block__title h6 mb-3">
                      Comparativo por etapa
                    </h2>
                    <div className="table-responsive">
                      <table className="table inv-data-table align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Etapa</th>
                            <th className="text-end">Qtd.</th>
                            <th className="text-end">Valor (R$)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <span className="fin-mov-badge fin-mov-badge--orc">Confirmado</span>
                              <span className="d-block small text-muted mt-1">Em faturamento</span>
                            </td>
                            <td className="text-end">{stConfirmado.qtd}</td>
                            <td className="text-end fw-semibold">{formatMoeda(stConfirmado.valor)}</td>
                          </tr>
                          <tr>
                            <td>
                              <span className="fin-mov-badge fin-mov-badge--faturado">Finalizado</span>
                              <span className="d-block small text-muted mt-1">Faturado</span>
                            </td>
                            <td className="text-end">{stFinalizadoDisplay.qtd}</td>
                            <td className="text-end fw-semibold">
                              {formatMoeda(stFinalizadoDisplay.valor)}
                            </td>
                          </tr>
                          <tr className="table-light">
                            <td className="fw-semibold">Total</td>
                            <td className="text-end fw-semibold">
                              {res.qtd_confirmados + res.qtd_faturados}
                            </td>
                            <td className="text-end fw-semibold">{formatMoeda(res.total_geral)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
                <div className="col-lg-7">
                  <section className="dash-form-card h-100" aria-labelledby="fin-forn-title">
                    <h2 id="fin-forn-title" className="dash-form-block__title h6 mb-3">
                      Por fornecedor (confirmado + finalizado)
                    </h2>
                    {data.por_fornecedor.length === 0 ? (
                      <p className="inv-detail-empty mb-0">
                        Nenhum custo vinculado a fornecedores nesses serviços.
                      </p>
                    ) : (
                      <div className="table-responsive inv-table-scroll inv-table-scroll--fit">
                        <table className="table inv-data-table align-middle mb-0">
                          <thead>
                            <tr>
                              <th>Fornecedor</th>
                              <th className="text-end">Custo</th>
                              <th className="text-end">Venda</th>
                              <th className="text-end">Margem</th>
                              <th className="inv-col-actions" />
                            </tr>
                          </thead>
                          <tbody>
                            {data.por_fornecedor.map((pf) => (
                              <tr key={pf.id}>
                                <td>{pf.nome}</td>
                                <td className="text-end">R$ {formatMoeda(pf.custo)}</td>
                                <td className="text-end">R$ {formatMoeda(pf.venda)}</td>
                                <td className="text-end">R$ {formatMoeda(pf.margem)}</td>
                                <td className="inv-col-actions">
                                  <Link
                                    to="/painel/fornecedores"
                                    search={{ controle: pf.id }}
                                    className="inv-action-btn inv-action-btn--secondary"
                                    title="Detalhar"
                                    aria-label="Detalhar fornecedor"
                                  >
                                    <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <section className="dash-form-card" aria-labelledby="fin-mov-title">
                <h2 id="fin-mov-title" className="dash-form-block__title h6 mb-3">
                  <i className="bi bi-list-check" aria-hidden="true" /> Serviços no faturamento
                </h2>
                {data.movimentos.length === 0 ? (
                  <p className="inv-detail-empty mb-0">
                    Nenhum serviço confirmado ou finalizado ainda.
                  </p>
                ) : (
                  <div className="table-responsive inv-table-scroll inv-table-scroll--fit">
                    <table className="table inv-data-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Etapa</th>
                          <th>Cliente</th>
                          <th>Detalhe</th>
                          <th className="text-end">Valor (R$)</th>
                          <th className="inv-col-actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.movimentos.map((mov, i) => {
                          const ehFaturado = mov.tipo === "faturado";
                          return (
                            <tr key={`${mov.titulo}-${i}`}>
                              <td>
                                <span
                                  className={`fin-mov-badge ${ehFaturado ? "fin-mov-badge--faturado" : "fin-mov-badge--orc"}`}
                                >
                                  {ehFaturado ? "Finalizado" : "Confirmado"}
                                </span>
                              </td>
                              <td>{mov.titulo}</td>
                              <td className="small text-muted">{mov.detalhe}</td>
                              <td className="text-end fw-semibold">{formatMoeda(mov.valor)}</td>
                              <td className="inv-col-actions">
                                <Link
                                  to={mov.link}
                                  className="inv-action-btn inv-action-btn--secondary"
                                  title="Abrir"
                                >
                                  <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
