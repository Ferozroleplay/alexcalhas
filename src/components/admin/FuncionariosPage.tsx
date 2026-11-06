import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DiasPagosStrip } from "@/components/admin/DiasPagosStrip";
import { UserThumb } from "@/components/admin/UserThumb";
import { FuncionarioPagamentoModal } from "@/components/admin/FuncionarioPagamentoModal";
import { DashPageHero } from "@/components/admin/DashPageHero";
import { useAdminAuth } from "@/components/admin/admin-auth";
import {
  formatMoeda,
  pagamentoFormatarSemana,
  pagamentoFormatarSemanaCompacta,
  primeiroNome,
} from "@/lib/funcionario-pagamento-display";
import { pagamentoFimSemana, ymdLocal } from "@/lib/funcionario-pagamento-dates";
import { dashConfirm } from "@/lib/dash-ui";
import { Route as FuncionariosRoute } from "@/routes/painel/funcionarios";

type Card = {
  usuario_id: number;
  nome: string;
  thumb: string;
  dias_trabalhados: number;
  semana_inicio: string;
  valor_diario: number;
  valor_liquido: number;
  total_vales: number;
  total_empreitas: number;
  pago: boolean;
  valor: number | null;
};

type HistoricoRow = {
  id: number;
  usuario_id: number;
  usuario_nome: string;
  semana_inicio: string;
  dias_qtd: number;
  dias_pagos: string;
  valor_bruto: number;
  total_empreitas: number;
  total_vales: number;
  valor: number;
  observacao: string;
};

function formatDm(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}`;
}

function calMinMax() {
  const min = new Date();
  min.setMonth(min.getMonth() - 24);
  const max = new Date();
  max.setDate(max.getDate() + 28);
  return { min: ymdLocal(min), max: ymdLocal(max) };
}

type ResumoFunc = {
  usuario_id: number;
  nome: string;
  qtd_semanas: number;
  total_pago: number;
  total_dias: number;
  ultima_semana_label: string;
};

function defaultDe() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return ymdLocal(d);
}

function chipsSemanas(hojeSemana: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hojeSemana);
  if (!m) return [];
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    return ymdLocal(d);
  });
}

function contarDiasMapa(
  pag: Record<string, unknown> | undefined,
  empDias: number,
): number {
  if (!pag) return 0;
  const keys = ["seg", "ter", "qua", "qui", "sex"] as const;
  const diaria = keys.filter((k) => Number(pag[`dias_${k}`]) === 1).length;
  return diaria + empDias;
}

export function FuncionariosPage() {
  const navigate = useNavigate({ from: FuncionariosRoute.fullPath });
  const search = FuncionariosRoute.useSearch();
  const { user } = useAdminAuth();
  const isAdminVisao = user?.visao === "admin";
  const semana = search.semana ?? ymdLocal(new Date());
  const de = search.de ?? defaultDe();
  const ate = search.ate ?? ymdLocal(new Date());
  const usuarioFiltro = search.usuario ?? 0;
  const usuarioFiltroEfetivo = !isAdminVisao && user?.id ? user.id : usuarioFiltro;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [semanaNav, setSemanaNav] = useState({ anterior: "", proxima: "", hoje: "" });
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [totalHistorico, setTotalHistorico] = useState(0);
  const [funcionarios, setFuncionarios] = useState<{ id: number; nome: string }[]>([]);
  const [semanasMapa, setSemanasMapa] = useState<string[]>([]);
  const [mapaPagamentos, setMapaPagamentos] = useState<
    Record<number, Record<string, Record<string, unknown>>>
  >({});
  const [empreitaDiasMapa, setEmpreitaDiasMapa] = useState<Record<number, Record<string, number>>>(
    {},
  );
  const [resumoFuncionarios, setResumoFuncionarios] = useState<ResumoFunc[]>([]);
  const [totalResumoPeriodo, setTotalResumoPeriodo] = useState(0);

  const [extrasOpen, setExtrasOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [modalUsuarioId, setModalUsuarioId] = useState(0);
  const { min: calMin, max: calMax } = useMemo(() => calMinMax(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const qs = new URLSearchParams({ semana, de, ate });
      if (usuarioFiltroEfetivo > 0) qs.set("usuario_filtro", String(usuarioFiltroEfetivo));
      const res = await fetch(`/api/admin/funcionarios-pagamento?${qs}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        cards?: Card[];
        pendentes?: number;
        semana_anterior?: string;
        semana_proxima?: string;
        hoje_semana?: string;
        historico?: HistoricoRow[];
        total_historico?: number;
        funcionarios?: { id: number; nome: string }[];
        semanas_mapa?: string[];
        mapa_pagamentos?: typeof mapaPagamentos;
        empreita_dias_mapa?: typeof empreitaDiasMapa;
        resumo_funcionarios?: ResumoFunc[];
        total_resumo_periodo?: number;
        updated_at?: string;
      };
      if (!res.ok) throw new Error(json.message ?? "Erro ao carregar.");
      setCards(json.cards ?? []);
      setPendentes(json.pendentes ?? 0);
      setSemanaNav({
        anterior: json.semana_anterior ?? "",
        proxima: json.semana_proxima ?? "",
        hoje: json.hoje_semana ?? "",
      });
      setHistorico(json.historico ?? []);
      setTotalHistorico(json.total_historico ?? 0);
      setFuncionarios(json.funcionarios ?? []);
      setSemanasMapa(json.semanas_mapa ?? []);
      setMapaPagamentos(json.mapa_pagamentos ?? {});
      setEmpreitaDiasMapa(json.empreita_dias_mapa ?? {});
      setResumoFuncionarios(json.resumo_funcionarios ?? []);
      setTotalResumoPeriodo(json.total_resumo_periodo ?? 0);
      if (json.updated_at) setUpdatedAt(json.updated_at);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }, [semana, de, ate, usuarioFiltroEfetivo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (search.funcionario && search.funcionario > 0) {
      setModalUsuarioId(search.funcionario);
    }
  }, [search.funcionario]);

  useEffect(() => {
    document.body.classList.add("dashboard-page--funcionarios-pag");
    return () => document.body.classList.remove("dashboard-page--funcionarios-pag");
  }, []);

  const semanaLabel = pagamentoFormatarSemana(semana);
  const chipList = useMemo(() => chipsSemanas(semanaNav.hoje || semana), [semanaNav.hoje, semana]);

  function abrirModal(uid: number) {
    if (!isAdminVisao) return;
    setModalUsuarioId(uid);
  }

  function fecharModal() {
    setModalUsuarioId(0);
    if (search.funcionario) {
      void navigate({ search: { semana, de, ate, usuario: usuarioFiltro || undefined } });
    }
  }

  return (
    <div className="analytics-page dash-form-page--pro">
      <DashPageHero
        title={isAdminVisao ? "Pagamentos — Funcionários" : "Meus pagamentos"}
        subtitle={
          isAdminVisao
            ? "Clique no funcionário para lançar o pagamento da semana"
            : "Acompanhe os pagamentos fechados (semanas anteriores) e o status da semana atual."
        }
        iconClass="bi-wallet2"
        accent="funcionarios-pag"
        layout="header"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header">
        <div className="dash-func-pag-page">
          {erro ? <div className="alert alert-danger">{erro}</div> : null}
          {loading ? <p className="text-muted py-3">Carregando…</p> : null}

          {!loading ? (
            <>
              <div className="dash-func-pag-semana inv-list-toolbar mb-3">
                <div className="dash-func-pag-semana__row">
                  <div className="dash-func-pag-semana__info">
                    <span className="dash-func-pag-semana__label">Semana</span>
                    <strong className="dash-func-pag-semana__periodo">{semanaLabel}</strong>
                    {pendentes > 0 ? (
                      <span className="dash-func-pag-semana__pendente">
                        {pendentes} pendente{pendentes > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="dash-func-pag-semana__actions">
                    <div className="dash-func-pag-semana__nav btn-group btn-group-sm" role="group">
                      <Link
                        to="/painel/funcionarios"
                        search={{ semana: semanaNav.anterior, de, ate, usuario: usuarioFiltro || undefined }}
                        className="btn btn-outline-secondary"
                      >
                        <i className="bi bi-chevron-left" aria-hidden="true" />
                      </Link>
                      <Link
                        to="/painel/funcionarios"
                        search={{ semana: semanaNav.hoje, de, ate, usuario: usuarioFiltro || undefined }}
                        className="btn btn-outline-secondary"
                      >
                        Hoje
                      </Link>
                      <Link
                        to="/painel/funcionarios"
                        search={{ semana: semanaNav.proxima, de, ate, usuario: usuarioFiltro || undefined }}
                        className="btn btn-outline-secondary"
                      >
                        <i className="bi bi-chevron-right" aria-hidden="true" />
                      </Link>
                    </div>
                    <button
                      type="button"
                      className={`dash-func-pag-semana__toggle${extrasOpen ? " is-open" : ""}`}
                      aria-expanded={extrasOpen}
                      onClick={() => setExtrasOpen((v) => !v)}
                    >
                      <i className="bi bi-chevron-down" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {extrasOpen && isAdminVisao ? (
                  <div className="dash-func-pag-semana__extras">
                    <div className="dash-func-pag-semana__extras-head">
                      {updatedAt ? (
                        <span className="inv-list-stat inv-list-stat--muted">Atualizado {updatedAt}</span>
                      ) : null}
                      <span className="inv-list-toolbar__badge inv-list-toolbar__badge--funcionarios">
                        <i className="bi bi-shield-lock" aria-hidden="true" /> Administração
                      </span>
                    </div>
                    <form
                      className="dash-func-pag-cal"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = (e.currentTarget.elements.namedItem("semana") as HTMLInputElement).value;
                        if (v) void navigate({ search: { semana: v, de, ate, usuario: usuarioFiltro || undefined } });
                      }}
                    >
                      <label className="dash-func-pag-cal__label" htmlFor="input-semana-data">
                        <i className="bi bi-calendar3" aria-hidden="true" /> Ir para semana
                      </label>
                      <input
                        type="date"
                        name="semana"
                        id="input-semana-data"
                        className="form-control form-control-sm dash-func-pag-cal__input"
                        defaultValue={semana}
                        min={calMin}
                        max={calMax}
                        title="Escolha qualquer dia — usamos a segunda-feira dessa semana"
                      />
                    </form>
                    <div className="dash-func-pag-chips">
                      {chipList.map((chipSem) => {
                        const ativa = chipSem === semana;
                        const chipLabel =
                          chipSem === semanaNav.hoje
                            ? "Esta semana"
                            : `${formatDm(chipSem)}–${formatDm(pagamentoFimSemana(chipSem))}`;
                        return (
                          <Link
                            key={chipSem}
                            to="/painel/funcionarios"
                            search={{ semana: chipSem, de, ate, usuario: usuarioFiltro || undefined }}
                            className={`dash-func-pag-chips__item${ativa ? " is-ativa" : ""}`}
                          >
                            {chipLabel}
                          </Link>
                        );
                      })}
                    </div>
                    <p className="dash-func-pag-semana__hint">
                      <i className="bi bi-info-circle" aria-hidden="true" /> Use o calendário ou os atalhos para
                      pagar <strong>semanas passadas</strong> em aberto.
                    </p>
                  </div>
                ) : null}
              </div>

              <section className="dash-edit-modal__panel mb-3">
                <h2 className="dash-edit-modal__panel-title">
                  <i className="bi bi-people-fill" aria-hidden="true" />{" "}
                  {isAdminVisao ? "Funcionários — pagamento semanal" : "Semana atual"}
                </h2>
                {isAdminVisao ? (
                  <p className="small text-secondary mb-3">
                    Defina o <strong>valor por dia</strong>, marque os dias trabalhados (segunda a sexta) e registre{" "}
                    <strong>vales</strong>. O bate-ponto sugere os dias com entrada; você pode ajustar manualmente.
                  </p>
                ) : null}
                {cards.length === 0 ? (
                  <p className="text-secondary mb-0">Nenhum funcionário cadastrado.</p>
                ) : (
                  <div className="dash-func-pag-grid">
                    {cards.map((card) => {
                      const temVales = card.total_vales > 0;
                      const temEmpreita = card.total_empreitas > 0;
                      return (
                        <button
                          key={card.usuario_id}
                          type="button"
                          className={`dash-func-pag-card${card.pago ? " is-pago" : ""}`}
                          onClick={() => abrirModal(card.usuario_id)}
                          disabled={!isAdminVisao}
                        >
                          <span className="dash-func-pag-card__head">
                            <span className="dash-func-pag-card__avatar" aria-hidden="true">
                              {card.nome.charAt(0).toUpperCase()}
                            </span>
                            <span className="dash-func-pag-card__id">
                              <span className="dash-func-pag-card__nome">{card.nome}</span>
                              <span className="dash-func-pag-card__dias">
                                <i className="bi bi-calendar-check" aria-hidden="true" />
                                <strong>{card.dias_trabalhados}</strong>{" "}
                                {card.dias_trabalhados === 1 ? "dia" : "dias"}
                                {card.valor_diario > 0 ? <> · {formatMoeda(card.valor_diario)}/dia</> : null}
                              </span>
                            </span>
                            {card.pago ? (
                              <span className="dash-func-pag-card__badge dash-func-pag-card__badge--ok">
                                <i className="bi bi-check-circle-fill" aria-hidden="true" /> Pago
                              </span>
                            ) : (
                              <span className="dash-func-pag-card__badge dash-func-pag-card__badge--pend">
                                <i className="bi bi-clock-history" aria-hidden="true" /> Em aberto
                              </span>
                            )}
                          </span>
                          {temVales || temEmpreita ? (
                            <span className="dash-func-pag-card__stats">
                              {temEmpreita ? (
                                <span className="dash-func-pag-card__stat dash-func-pag-card__stat--empreita">
                                  <span className="dash-func-pag-card__stat-label">Empreita</span>
                                  <span className="dash-func-pag-card__stat-val">
                                    {formatMoeda(card.total_empreitas)}
                                  </span>
                                </span>
                              ) : null}
                              {temVales ? (
                                <span className="dash-func-pag-card__stat dash-func-pag-card__stat--vales">
                                  <span className="dash-func-pag-card__stat-label">Vales</span>
                                  <span className="dash-func-pag-card__stat-val">
                                    − {formatMoeda(card.total_vales)}
                                  </span>
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          <span className="dash-func-pag-card__footer">
                            <span className="dash-func-pag-card__total">
                              <span className="dash-func-pag-card__total-label">
                                {card.pago ? "Pago" : "A pagar"}
                              </span>
                              <span className="dash-func-pag-card__total-val">
                                {formatMoeda(card.valor_liquido)}
                              </span>
                            </span>
                            <span className="dash-func-pag-card__cta">
                              {card.pago ? (
                                <>
                                  <i className="bi bi-pencil-square" aria-hidden="true" />{" "}
                                  {isAdminVisao ? "Ver / editar" : "Ver detalhes"}
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-lock-fill" aria-hidden="true" />{" "}
                                  {isAdminVisao ? "Fechar semana" : "Em aberto"}
                                </>
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {isAdminVisao ? (
              <section className="dash-edit-modal__panel mb-3 dash-func-pag-controle">
                <h2 className="dash-edit-modal__panel-title">
                  <i className="bi bi-grid-3x3-gap-fill" aria-hidden="true" /> Painel de controle — o que já foi pago
                </h2>
                <p className="small text-secondary mb-3">
                  Visão das últimas <strong>8 semanas</strong> (a coluna destacada é a semana selecionada acima).
                  Verde = pago · cinza = ainda não pagou · clique na célula para abrir ou lançar.
                </p>
                {cards.length === 0 ? (
                  <p className="text-secondary mb-0">Cadastre funcionários para ver o mapa.</p>
                ) : (
                  <>
                    <div className="dash-func-pag-controle__stats row g-2 mb-3">
                      <div className="col-6 col-md-3">
                        <div className="dash-func-pag-controle__stat">
                          <span className="dash-func-pag-controle__stat-label">Total pago (período)</span>
                          <strong>{formatMoeda(totalResumoPeriodo)}</strong>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="dash-func-pag-controle__stat">
                          <span className="dash-func-pag-controle__stat-label">Semanas no histórico</span>
                          <strong>{historico.length}</strong>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="dash-func-pag-controle__stat">
                          <span className="dash-func-pag-controle__stat-label">Funcionários com pagamento</span>
                          <strong>{resumoFuncionarios.length}</strong>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="dash-func-pag-controle__stat dash-func-pag-controle__stat--alert">
                          <span className="dash-func-pag-controle__stat-label">Pendentes esta semana</span>
                          <strong>{pendentes}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="table-responsive dash-func-pag-mapa-wrap dash-func-pag-mapa-shell">
                      <table className="table table-sm dash-func-pag-mapa dash-func-pag-mapa--pro mb-0">
                        <thead>
                          <tr>
                            <th className="dash-func-pag-mapa__col-nome">Funcionário</th>
                            {semanasMapa.map((semCol) => {
                              const isAtual = semCol === semana;
                              return (
                                <th
                                  key={semCol}
                                  className={`dash-func-pag-mapa__col-semana${isAtual ? " is-atual" : ""}`}
                                  title={pagamentoFormatarSemana(semCol)}
                                >
                                  <span className="dash-func-pag-mapa__sem-compact">
                                    {pagamentoFormatarSemanaCompacta(semCol)}
                                  </span>
                                </th>
                              );
                            })}
                            <th className="dash-func-pag-mapa__col-total text-end">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cards.map((cardMap) => {
                            let totalLinha = 0;
                            return (
                              <tr key={cardMap.usuario_id}>
                                <td className="dash-func-pag-mapa__nome">
                                  <div className="dash-func-pag-mapa__func">
                                    <span
                                      className="dash-func-pag-mapa__nome-text"
                                      title={cardMap.nome}
                                    >
                                      {primeiroNome(cardMap.nome)}
                                    </span>
                                    <UserThumb
                                      nome={cardMap.nome}
                                      thumb={cardMap.thumb}
                                      size="sm"
                                      className="dash-func-pag-mapa__avatar"
                                    />
                                  </div>
                                </td>
                                {semanasMapa.map((semCol) => {
                                  const pagCell = mapaPagamentos[cardMap.usuario_id]?.[semCol];
                                  const pagoCell = Boolean(pagCell) && Number(pagCell?.confirmado ?? 1) === 1;
                                  const isAtual = semCol === semana;
                                  if (pagoCell) totalLinha += Number(pagCell?.valor ?? 0);
                                  const empD = empreitaDiasMapa[cardMap.usuario_id]?.[semCol] ?? 0;
                                  const diasQtd = contarDiasMapa(pagCell, empD);
                                  return (
                                    <td
                                      key={semCol}
                                      className={`dash-func-pag-mapa__cel${pagoCell ? " is-pago" : pagCell ? " is-aberto" : " is-vazio"}${isAtual ? " is-col-atual" : ""}`}
                                    >
                                      <Link
                                        to="/painel/funcionarios"
                                        search={{
                                          semana: semCol,
                                          de,
                                          ate,
                                          usuario: usuarioFiltro || undefined,
                                          funcionario: cardMap.usuario_id,
                                        }}
                                        className="dash-func-pag-mapa__link"
                                        title={pagCell ? "Editar pagamento" : "Lançar pagamento"}
                                      >
                                        {pagCell ? (
                                          <>
                                            {pagoCell ? (
                                              <span className="dash-func-pag-mapa__check" aria-hidden="true">
                                                <i className="bi bi-check-lg" />
                                              </span>
                                            ) : (
                                              <span className="dash-func-pag-mapa__dias" aria-hidden="true">
                                                Em aberto
                                              </span>
                                            )}
                                            <span className="dash-func-pag-mapa__valor">
                                              {formatMoeda(Number(pagCell.valor ?? 0))}
                                            </span>
                                            <span className="dash-func-pag-mapa__dias">{diasQtd} dia(s)</span>
                                          </>
                                        ) : (
                                          <span className="dash-func-pag-mapa__vazio">
                                            <i className="bi bi-plus-lg" aria-hidden="true" />
                                          </span>
                                        )}
                                      </Link>
                                    </td>
                                  );
                                })}
                                <td className="text-end dash-func-pag-mapa__total-linha">
                                  {totalLinha > 0 ? (
                                    <strong>{formatMoeda(totalLinha)}</strong>
                                  ) : (
                                    <span className="dash-func-pag-mapa__total-zero">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {resumoFuncionarios.length > 0 ? (
                      <>
                        <h3 className="h6 mt-3 mb-2 fw-bold text-secondary">
                          Resumo por funcionário (período do histórico)
                        </h3>
                        <div className="row g-2">
                          {resumoFuncionarios.map((res) => (
                            <div key={res.usuario_id} className="col-12 col-md-6 col-lg-4">
                              <div className="dash-func-pag-resumo-card">
                                <div className="dash-func-pag-resumo-card__nome">{res.nome}</div>
                                <div className="dash-func-pag-resumo-card__grid">
                                  <div>
                                    <span>Semanas pagas</span>
                                    <strong>{res.qtd_semanas}</strong>
                                  </div>
                                  <div>
                                    <span>Dias pagos</span>
                                    <strong>{res.total_dias}</strong>
                                  </div>
                                  <div className="dash-func-pag-resumo-card__total">
                                    <span>Total</span>
                                    <strong>{formatMoeda(res.total_pago)}</strong>
                                  </div>
                                </div>
                                <p className="small text-secondary mb-0">Último: {res.ultima_semana_label}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </section>
              ) : null}

              <section className="dash-edit-modal__panel">
                <h2 className="dash-edit-modal__panel-title">
                  <i className="bi bi-table" aria-hidden="true" /> Histórico de pagamentos
                </h2>
                <form
                  className="dash-form mb-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void navigate({
                      search: {
                        semana,
                        de: String(fd.get("de") || de),
                        ate: String(fd.get("ate") || ate),
                        usuario: Number(fd.get("usuario") || 0) || undefined,
                      },
                    });
                  }}
                >
                  <input type="hidden" name="semana" value={semana} />
                  <div className="row g-2 align-items-end">
                    <div className="col-12 col-md-4">
                      <label className="dash-edit-modal__label" htmlFor="filtro-usuario">
                        Funcionário
                      </label>
                      <select
                        id="filtro-usuario"
                        name="usuario"
                        className="form-select dash-edit-modal__input"
                        defaultValue={usuarioFiltro || ""}
                      >
                        <option value="">Todos</option>
                        {funcionarios.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="dash-edit-modal__label" htmlFor="filtro-de">
                        De
                      </label>
                      <input
                        type="date"
                        id="filtro-de"
                        name="de"
                        className="form-control dash-edit-modal__input"
                        defaultValue={de}
                      />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="dash-edit-modal__label" htmlFor="filtro-ate">
                        Até
                      </label>
                      <input
                        type="date"
                        id="filtro-ate"
                        name="ate"
                        className="form-control dash-edit-modal__input"
                        defaultValue={ate}
                      />
                    </div>
                    <div className="col-12 col-md-2 d-grid">
                      <button type="submit" className="btn visitas-orc-add-btn">
                        <i className="bi bi-search" aria-hidden="true" /> Filtrar
                      </button>
                    </div>
                  </div>
                </form>
                <div className="table-responsive dash-pag-func-hist-wrap">
                  <table className="table table-sm dash-pag-func-table dash-pag-func-table--hist mb-0">
                    <thead>
                      <tr>
                        <th>Funcionário</th>
                        <th>Semana</th>
                        <th>Dias pagos</th>
                        <th className="text-end">Qtd</th>
                        <th className="text-end">Bruto</th>
                        <th className="text-end">Empreitas</th>
                        <th className="text-end">Vales</th>
                        <th className="text-end">Pago</th>
                        <th>Obs.</th>
                        <th className="text-end">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center text-secondary py-3">
                            Nenhum lançamento no período.
                          </td>
                        </tr>
                      ) : (
                        historico.map((p) => (
                          <tr key={p.id}>
                            <td
                              className="dash-pag-func-table__nome"
                              title={p.usuario_nome}
                            >
                              {primeiroNome(p.usuario_nome)}
                            </td>
                            <td
                              className="dash-pag-func-table__semana"
                              title={pagamentoFormatarSemana(p.semana_inicio)}
                            >
                              {pagamentoFormatarSemanaCompacta(p.semana_inicio)}
                            </td>
                            <td className="dash-pag-func-table__dias">
                              {p.dias_pagos ? (
                                <DiasPagosStrip texto={p.dias_pagos} />
                              ) : (
                                <span className="dash-pag-func-table__empty">—</span>
                              )}
                            </td>
                            <td className="text-end">{p.dias_qtd}</td>
                            <td className="text-end">{formatMoeda(p.valor_bruto)}</td>
                            <td className="text-end">{formatMoeda(p.total_empreitas)}</td>
                            <td className="text-end">{formatMoeda(p.total_vales)}</td>
                            <td className="text-end dash-pag-func-table__pago">{formatMoeda(p.valor)}</td>
                            <td className="dash-pag-func-table__obs">{p.observacao || "—"}</td>
                            <td className="text-end">
                              <div className="dash-pag-func-actions" role="group" aria-label="Ações">
                                <button
                                  type="button"
                                  className="dash-pag-func-act dash-pag-func-act--edit"
                                  title="Editar pagamento"
                                  aria-label="Editar pagamento"
                                  onClick={() => {
                                    void navigate({
                                      search: {
                                        semana: p.semana_inicio,
                                        de,
                                        ate,
                                        usuario: usuarioFiltro || undefined,
                                        funcionario: p.usuario_id,
                                      },
                                    });
                                  }}
                                >
                                  <i className="bi bi-pencil-square" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  className="dash-pag-func-act dash-pag-func-act--delete"
                                  title="Excluir pagamento"
                                  aria-label="Excluir pagamento"
                                  onClick={async () => {
                                    if (
                                      !(await dashConfirm({
                                        title: "Excluir pagamento?",
                                        message: "Deseja excluir este pagamento?",
                                        confirmText: "Excluir",
                                        variant: "danger",
                                      }))
                                    ) {
                                      return;
                                    }
                                    await fetch("/api/admin/funcionarios-pagamento", {
                                      method: "POST",
                                      credentials: "include",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "excluir", id: p.id }),
                                    });
                                    void load();
                                  }}
                                >
                                  <i className="bi bi-trash3" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="dash-pag-func-hist-total mb-0 mt-3">
                  Total filtrado: <strong>{formatMoeda(totalHistorico)}</strong>
                </p>
              </section>
            </>
          ) : null}
        </div>
      </div>

      <FuncionarioPagamentoModal
        open={modalUsuarioId > 0}
        usuarioId={modalUsuarioId}
        semana={semana}
        onClose={fecharModal}
        onSaved={() => void load()}
      />
    </div>
  );
}
