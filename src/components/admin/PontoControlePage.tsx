import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { DashPageHero } from "@/components/admin/DashPageHero";
import { InvPagination, paginateItems } from "@/components/admin/inventario-ui";
import { HoleriteDocument } from "@/components/admin/HoleriteDocument";
import { PontoEditarJornadaModal } from "@/components/admin/PontoEditarJornadaModal";
import { PontoFolhaDocument } from "@/components/admin/PontoFolhaDocument";
import { PontoFuncCell, PontoJornadaHoras } from "@/components/admin/PontoFuncCell";
import { AdminModal } from "@/components/admin/modals/AdminModal";
import type { HoleriteFuncionario } from "@/lib/holerite";
import { mesLabel } from "@/lib/holerite";
import { gerarPdfsHolerite } from "@/lib/holerite-pdf";
import { gerarPdfsPontoFolha } from "@/lib/ponto-folha-pdf";
import {
  formatDataHoraPonto,
  pontoClasseBadge,
  pontoLabelTipo,
} from "@/lib/ponto-display";
import { Route as PontoControleRoute } from "@/routes/painel/ponto-controle";
import { dashConfirm, dashToast } from "@/lib/dash-ui";
import { PONTO_CARGA_DIA_LABEL, PONTO_JORNADA } from "@/lib/ponto-jornada";
import { pontoDiaChave, pontoHojeIso } from "@/lib/ponto-timezone";

type PontoJornada = {
  usuario_id: number;
  usuario_nome: string;
  thumb: string;
  data: string;
  data_fmt: string;
  entrada_fmt: string;
  almoco_fmt: string;
  retorno_fmt: string;
  saida_fmt: string;
  entrada_id: number | null;
  almoco_id: number | null;
  retorno_id: number | null;
  saida_id: number | null;
  intervalo_fmt: string;
  total_fmt: string;
  minutos_trabalhados: number | null;
  valor_diario: number;
  valor_hora_fmt: string;
  ganho_dia_fmt: string;
  ganho_parcial: boolean;
  aberto: boolean;
  status_label: string;
};

type PontoRegistroAdmin = {
  id: number;
  usuario_id: number;
  usuario_nome: string;
  thumb: string;
  tipo: string;
  registrado_em: string;
};

type FuncionarioOpt = { id: number; nome: string; thumb: string };

const PONTO_DETALHE_POR_PAGINA = 20;

export function PontoControlePage() {
  const { user, ready } = useAdminAuth();
  const navigate = useNavigate({ from: PontoControleRoute.fullPath });
  const search = PontoControleRoute.useSearch();

  const hoje = pontoHojeIso();
  const primeiroMes = `${hoje.slice(0, 8)}01`;
  const usuarioFiltro = search.usuario ?? 0;
  const de = search.de ?? primeiroMes;
  const ate = search.ate ?? hoje;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpt[]>([]);
  const [jornadas, setJornadas] = useState<PontoJornada[]>([]);
  const [registros, setRegistros] = useState<PontoRegistroAdmin[]>([]);
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [detalhePage, setDetalhePage] = useState(1);
  const [editarOpen, setEditarOpen] = useState(false);
  const [editarJornada, setEditarJornada] = useState<{
    usuario_id: number;
    usuario_nome: string;
    data: string;
    data_fmt: string;
    entrada_id?: number | null;
    almoco_id?: number | null;
    retorno_id?: number | null;
    saida_id?: number | null;
  } | null>(null);
  const [editarRegistroId, setEditarRegistroId] = useState<number | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const isAdmin = user?.visao === "admin";
  const isContador = user?.visao === "contador";
  const podeEditar = isAdmin;

  const [fUsuario, setFUsuario] = useState(String(usuarioFiltro || ""));
  const [fDe, setFDe] = useState(de);
  const [fAte, setFAte] = useState(ate);
  const [fMes, setFMes] = useState(de.slice(0, 7));
  const [holerites, setHolerites] = useState<HoleriteFuncionario[]>([]);
  const [holeriteOpen, setHoleriteOpen] = useState(false);
  const [holeriteUsuario, setHoleriteUsuario] = useState("");

  const detalheTotalPaginas = Math.max(
    1,
    Math.ceil(registros.length / PONTO_DETALHE_POR_PAGINA),
  );
  const detalhePageSafe = Math.min(detalhePage, detalheTotalPaginas);
  const registrosPagina = useMemo(
    () => paginateItems(registros, detalhePageSafe, PONTO_DETALHE_POR_PAGINA),
    [registros, detalhePageSafe],
  );

  useEffect(() => {
    setDetalhePage(1);
  }, [registros.length, usuarioFiltro, de, ate]);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const qs = new URLSearchParams();
      if (usuarioFiltro > 0) qs.set("usuario", String(usuarioFiltro));
      qs.set("de", de);
      qs.set("ate", ate);
      const res = await fetch(`/api/admin/ponto-controle?${qs}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        updated_at?: string;
        funcionarios?: FuncionarioOpt[];
        jornadas?: PontoJornada[];
        registros?: PontoRegistroAdmin[];
      };
      if (!res.ok) throw new Error(json.message ?? "Erro ao carregar.");
      setUpdatedAt(json.updated_at ?? "");
      setFuncionarios(json.funcionarios ?? []);
      setJornadas(json.jornadas ?? []);
      setRegistros(json.registros ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [usuarioFiltro, de, ate]);

  useEffect(() => {
    if (!ready) return;
    if (user && user.visao !== "admin" && user.visao !== "contador") {
      void navigate({ to: "/painel/ponto" });
      return;
    }
    void load();
  }, [load, ready, user, navigate]);

  useEffect(() => {
    setFUsuario(String(usuarioFiltro || ""));
    setFDe(de);
    setFAte(ate);
    setFMes(de.slice(0, 7) || ate.slice(0, 7));
  }, [usuarioFiltro, de, ate]);

  useEffect(() => {
    document.body.classList.add("dashboard-page--ponto");
    return () => document.body.classList.remove("dashboard-page--ponto");
  }, []);

  function aplicarFiltros(e: React.FormEvent) {
    e.preventDefault();
    void navigate({
      search: {
        usuario: fUsuario ? Number(fUsuario) : undefined,
        de: fDe || undefined,
        ate: fAte || undefined,
      },
    });
  }

  async function baixarPdf() {
    if (gerandoPdf) return;
    const ids = [...new Set(jornadas.map((j) => j.usuario_id))];
    if (ids.length === 0) {
      dashToast("Nenhuma jornada neste período.", "warning");
      return;
    }
    setGerandoPdf(true);
    try {
      const folhas = ids.map((id) => {
        const el = document.getElementById(`ponto-folha-${id}`);
        const nome = jornadas.find((j) => j.usuario_id === id)?.usuario_nome ?? "funcionario";
        if (!el) throw new Error(`Não foi possível montar a folha de ${nome}.`);
        return { el, nome, de, ate };
      });
      const qtd = await gerarPdfsPontoFolha(folhas);
      dashToast(
        qtd === 1
          ? "Folha de ponto baixada."
          : `${qtd} folhas baixadas (uma por funcionário).`,
        "success",
      );
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Erro ao gerar o PDF.", "danger");
    } finally {
      setGerandoPdf(false);
    }
  }

  function abrirHolerite() {
    const mes = fMes.trim() || de.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      dashToast("Escolha o mês do holerite.", "warning");
      return;
    }
    if (funcionarios.length === 0) {
      dashToast("Nenhum funcionário para gerar o holerite.", "warning");
      return;
    }
    setHoleriteUsuario(fUsuario || String(funcionarios[0]?.id ?? ""));
    setHoleriteOpen(true);
  }

  async function baixarHolerite() {
    if (gerandoPdf) return;
    const mes = fMes.trim() || de.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      dashToast("Escolha o mês do holerite.", "warning");
      return;
    }
    const uid = Number(holeriteUsuario) || 0;
    if (uid <= 0) {
      dashToast("Escolha o funcionário do holerite.", "warning");
      return;
    }
    setGerandoPdf(true);
    try {
      const qs = new URLSearchParams({ mes, usuario: String(uid) });
      const res = await fetch(`/api/admin/holerite?${qs}`, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        holerites?: HoleriteFuncionario[];
      };
      if (!res.ok) throw new Error(json.message ?? "Não foi possível montar o holerite.");
      const lista = json.holerites ?? [];
      if (lista.length === 0) {
        dashToast("Nenhum funcionário para gerar o holerite.", "warning");
        return;
      }
      flushSync(() => {
        setHolerites(lista);
      });
      const folhas = lista.map((h) => {
        const el = document.getElementById(`holerite-folha-${h.usuario_id}`);
        if (!el) throw new Error(`Não foi possível montar o holerite de ${h.nome}.`);
        return { el, nome: h.nome, mes: h.mes };
      });
      const qtd = await gerarPdfsHolerite(folhas);
      setHoleriteOpen(false);
      dashToast(
        qtd === 1 ? "Holerite baixado." : `${qtd} holerites baixados (um por funcionário).`,
        "success",
      );
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Erro ao gerar o holerite.", "danger");
    } finally {
      setGerandoPdf(false);
    }
  }

  async function excluirJornada(j: PontoJornada) {
    const qtd = registros.filter(
      (r) => r.usuario_id === j.usuario_id && pontoDiaChave(r.registrado_em) === j.data,
    ).length;
    const msg =
      qtd > 0
        ? `Excluir todos os ${qtd} registro(s) de ${j.usuario_nome} em ${j.data_fmt}? Esta ação não pode ser desfeita.`
        : `Excluir a jornada de ${j.usuario_nome} em ${j.data_fmt}?`;
    const ok = await dashConfirm({
      title: "Excluir jornada?",
      message: msg,
      confirmText: "Excluir tudo",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const qs = new URLSearchParams({
        usuario: String(j.usuario_id),
        data: j.data,
      });
      const res = await fetch(`/api/admin/ponto-controle?${qs}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(json.message ?? "Não foi possível excluir.");
      dashToast(json.message ?? "Jornada excluída.", "success");
      void load();
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Erro.", "danger");
    }
  }

  function abrirEditarJornada(j: PontoJornada) {
    setEditarJornada({
      usuario_id: j.usuario_id,
      usuario_nome: j.usuario_nome,
      data: j.data,
      data_fmt: j.data_fmt,
      entrada_id: j.entrada_id,
      almoco_id: j.almoco_id,
      retorno_id: j.retorno_id,
      saida_id: j.saida_id,
    });
    setEditarRegistroId(null);
    setEditarOpen(true);
  }

  function abrirEditarRegistro(r: PontoRegistroAdmin) {
    const { data } = formatDataHoraPonto(r.registrado_em);
    const dia = pontoDiaChave(r.registrado_em);
    const jornadaMatch = jornadas.find(
      (j) =>
        j.usuario_id === r.usuario_id &&
        j.data === dia &&
        [j.entrada_id, j.almoco_id, j.retorno_id, j.saida_id].includes(r.id),
    );
    setEditarJornada({
      usuario_id: r.usuario_id,
      usuario_nome: r.usuario_nome,
      data: dia,
      data_fmt: data,
      entrada_id: jornadaMatch?.entrada_id ?? null,
      almoco_id: jornadaMatch?.almoco_id ?? null,
      retorno_id: jornadaMatch?.retorno_id ?? null,
      saida_id: jornadaMatch?.saida_id ?? null,
    });
    setEditarRegistroId(r.id);
    setEditarOpen(true);
  }

  async function excluirRegistro(r: PontoRegistroAdmin) {
    const { data, hora } = formatDataHoraPonto(r.registrado_em);
    const msg = `Excluir o registro de ${pontoLabelTipo(r.tipo)} de ${r.usuario_nome} em ${data} ${hora}? Esta ação não pode ser desfeita.`;
    const ok = await dashConfirm({
      title: "Excluir registro?",
      message: msg,
      confirmText: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/ponto-controle?id=${r.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(json.message ?? "Não foi possível excluir.");
      dashToast(json.message ?? "Registro excluído.", "success");
      void load();
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Erro.", "danger");
    }
  }

  return (
    <div className="analytics-page dash-form-page--pro">
      <DashPageHero
        title={isContador ? "Ponto mensal" : "Controle de ponto"}
        subtitle={
          isContador
            ? `Jornada ${PONTO_JORNADA.entrada}–${PONTO_JORNADA.almoco} e ${PONTO_JORNADA.retorno}–${PONTO_JORNADA.saida} (${PONTO_CARGA_DIA_LABEL}). Baixe o PDF do período.`
            : `Jornada ${PONTO_JORNADA.entrada}–${PONTO_JORNADA.almoco} e ${PONTO_JORNADA.retorno}–${PONTO_JORNADA.saida} · dia completo ${PONTO_CARGA_DIA_LABEL}`
        }
        iconClass="bi-clock-history"
        accent="ponto"
        layout="header"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header">
        <div className="dash-ponto-admin">
          {erro ? <div className="alert alert-danger">{erro}</div> : null}
          {loading ? <p className="text-muted py-3">Carregando…</p> : null}

          {!loading ? (
            <>
              <div className="inv-list-toolbar mb-3">
                <div className="inv-list-toolbar__stats">
                  <span className="inv-list-stat">
                    Atualizado em <strong>{updatedAt}</strong>
                  </span>
                  <span className="inv-list-stat">{jornadas.length} jornada(s) no período</span>
                </div>
                <span className="inv-list-toolbar__badge inv-list-toolbar__badge--ponto">
                  <i className={`bi ${isContador ? "bi-calculator" : "bi-shield-lock"}`} aria-hidden="true" />
                  {isContador ? "Contador" : "Administração"}
                </span>
              </div>

              <section className="dash-edit-modal__panel mb-3">
                <h2 className="dash-edit-modal__panel-title">
                  <i className="bi bi-funnel" aria-hidden="true" /> Filtros
                </h2>
                <form className="dash-form" onSubmit={aplicarFiltros}>
                  <div className="row g-2 align-items-end">
                    <div className="col-12 col-md-3">
                      <label className="dash-edit-modal__label" htmlFor="filtro-usuario">
                        Funcionário
                      </label>
                      <select
                        id="filtro-usuario"
                        className="form-select dash-edit-modal__input"
                        value={fUsuario}
                        onChange={(e) => setFUsuario(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {funcionarios.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="dash-edit-modal__label" htmlFor="filtro-de">
                        De
                      </label>
                      <input
                        type="date"
                        id="filtro-de"
                        className="form-control dash-edit-modal__input"
                        value={fDe}
                        onChange={(e) => setFDe(e.target.value)}
                      />
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="dash-edit-modal__label" htmlFor="filtro-ate">
                        Até
                      </label>
                      <input
                        type="date"
                        id="filtro-ate"
                        className="form-control dash-edit-modal__input"
                        value={fAte}
                        onChange={(e) => setFAte(e.target.value)}
                      />
                    </div>
                    <div className="col-12 col-md-2 d-grid">
                      <button type="submit" className="btn visitas-orc-add-btn">
                        <i className="bi bi-search" aria-hidden="true" /> Filtrar
                      </button>
                    </div>
                    <div className="col-12 col-md-3 d-grid">
                      <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={gerandoPdf || jornadas.length === 0}
                        onClick={() => void baixarPdf()}
                      >
                        <i className="bi bi-file-earmark-pdf" aria-hidden="true" />{" "}
                        {gerandoPdf ? "Gerando…" : "PDF do período"}
                      </button>
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="dash-edit-modal__label" htmlFor="filtro-mes-holerite">
                        Mês holerite
                      </label>
                      <input
                        type="month"
                        id="filtro-mes-holerite"
                        className="form-control dash-edit-modal__input"
                        value={fMes}
                        onChange={(e) => setFMes(e.target.value)}
                      />
                    </div>
                    <div className="col-6 col-md-3 d-grid">
                      <button
                        type="button"
                        className="btn visitas-orc-add-btn"
                        disabled={gerandoPdf || !fMes}
                        onClick={abrirHolerite}
                      >
                        <i className="bi bi-receipt" aria-hidden="true" />{" "}
                        {gerandoPdf ? "Gerando…" : "Holerite do mês"}
                      </button>
                    </div>
                  </div>
                </form>
              </section>

              <section className="dash-edit-modal__panel mb-3">
                <h2 className="dash-edit-modal__panel-title">
                  <i className="bi bi-table" aria-hidden="true" /> Jornadas no período
                </h2>
                <div className="table-responsive dash-ponto-table-shell">
                  <table className="table table-sm dash-ponto-table dash-ponto-table--pro mb-0">
                    <thead>
                      <tr>
                        <th className="dash-ponto-table__col-func">Funcionário</th>
                        <th className="text-center">Data</th>
                        <th className="text-center">Entrada</th>
                        <th className="text-center">Almoço</th>
                        <th className="text-center">Retorno</th>
                        <th className="text-center">Saída</th>
                        <th className="text-center">Intervalo</th>
                        <th className="text-center">Trabalhado</th>
                        <th className="text-center">R$/h</th>
                        <th className="text-center">Ganho no dia</th>
                        <th className="text-center">Status</th>
                        {podeEditar ? (
                          <th className="text-end dash-ponto-table__col-acoes">Ações</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {jornadas.length === 0 ? (
                        <tr>
                          <td colSpan={podeEditar ? 12 : 11} className="dash-ponto-table__empty">
                            Nenhum registro encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        jornadas.map((j) => (
                          <tr key={`${j.usuario_id}-${j.data}-${j.entrada_id ?? j.entrada_fmt}`}>
                            <td className="dash-ponto-table__col-func">
                              <PontoFuncCell nome={j.usuario_nome} thumb={j.thumb} />
                            </td>
                            <td className="text-center dash-ponto-cel--data">{j.data_fmt}</td>
                            <PontoJornadaHoras
                              entrada={j.entrada_fmt}
                              almoco={j.almoco_fmt}
                              retorno={j.retorno_fmt}
                              saida={j.saida_fmt}
                              intervalo={j.intervalo_fmt}
                              total={j.total_fmt}
                            />
                            <td className="text-center dash-ponto-cel--valor" title={j.valor_diario > 0 ? `Diária cadastrada: ${j.valor_diario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${PONTO_CARGA_DIA_LABEL})` : "Cadastre o valor diário em Pagamentos"}>
                              <span className="dash-ponto-valor-h">{j.valor_hora_fmt}</span>
                            </td>
                            <td className="text-center dash-ponto-cel--valor">
                              <strong
                                className={`dash-ponto-ganho${j.ganho_parcial ? " dash-ponto-ganho--parcial" : ""}`}
                                title={
                                  j.ganho_parcial
                                    ? "Estimativa até o momento (jornada em aberto)"
                                    : j.ganho_dia_fmt !== "—"
                                      ? `Proporcional às horas trabalhadas (base ${PONTO_CARGA_DIA_LABEL}/dia)`
                                      : undefined
                                }
                              >
                                {j.ganho_dia_fmt}
                              </strong>
                              {j.ganho_parcial ? (
                                <span className="dash-ponto-ganho__hint">est.</span>
                              ) : null}
                            </td>
                            <td className="text-center">
                              {j.aberto ? (
                                <span className="dash-ponto-status dash-ponto-status--aberto">
                                  {j.status_label}
                                </span>
                              ) : (
                                <span className="dash-ponto-status dash-ponto-status--ok">Encerrado</span>
                              )}
                            </td>
                            {podeEditar ? (
                            <td className="text-end dash-ponto-table__col-acoes">
                              <div className="dash-pag-func-actions" role="group" aria-label="Ações da jornada">
                                <button
                                  type="button"
                                  className="dash-pag-func-act dash-pag-func-act--edit"
                                  title="Corrigir horários das batidas"
                                  aria-label={`Corrigir horários de ${j.usuario_nome} em ${j.data_fmt}`}
                                  onClick={() => abrirEditarJornada(j)}
                                >
                                  <i className="bi bi-pencil-square" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  className="dash-pag-func-act dash-pag-func-act--delete"
                                  title="Excluir jornada inteira"
                                  aria-label={`Excluir jornada de ${j.usuario_nome} em ${j.data_fmt}`}
                                  onClick={() => void excluirJornada(j)}
                                >
                                  <i className="bi bi-trash3" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                            ) : null}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {registros.length > 0 ? (
                <section
                  className={`dash-edit-modal__panel dash-ponto-detalhe${detalheOpen ? " is-open" : ""}`}
                >
                  <div className="dash-ponto-detalhe__head">
                    <button
                      type="button"
                      className={`dash-ponto-detalhe__toggle${detalheOpen ? " is-open" : ""}`}
                      aria-expanded={detalheOpen}
                      aria-controls="ponto-detalhe-corpo"
                      onClick={() => setDetalheOpen((v) => !v)}
                      title={detalheOpen ? "Recolher detalhe" : "Ver todos os registros"}
                    >
                      <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                    <h2 className="dash-edit-modal__panel-title dash-ponto-detalhe__title mb-0">
                      <i className="bi bi-list-check" aria-hidden="true" /> Todos os registros (detalhe)
                    </h2>
                    <span className="dash-ponto-detalhe__meta">
                      {registros.length} registro{registros.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {detalheOpen ? (
                    <div id="ponto-detalhe-corpo" className="dash-ponto-detalhe__body">
                      <div className="table-responsive dash-ponto-table-shell">
                        <table className="table table-sm dash-ponto-table dash-ponto-table--pro mb-0">
                          <thead>
                            <tr>
                              <th className="text-center dash-ponto-table__col-id">#</th>
                              <th className="dash-ponto-table__col-func">Funcionário</th>
                              <th className="text-center">Tipo</th>
                              <th className="text-center">Data e hora</th>
                              {podeEditar ? <th className="text-end">Ações</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {registrosPagina.map((r) => {
                              const { data, hora } = formatDataHoraPonto(r.registrado_em);
                              return (
                                <tr key={r.id} data-ponto-id={r.id}>
                                  <td className="text-center dash-ponto-table__id">{r.id}</td>
                                  <td className="dash-ponto-table__col-func">
                                    <PontoFuncCell nome={r.usuario_nome} thumb={r.thumb} />
                                  </td>
                                  <td className="text-center">
                                    <span className={`dash-ponto-tipo ${pontoClasseBadge(r.tipo)}`}>
                                      {pontoLabelTipo(r.tipo)}
                                    </span>
                                  </td>
                                  <td className="text-center dash-ponto-table__cel-datetime">
                                    <div className="dash-ponto-datetime">
                                      <span className="dash-ponto-datetime__data">{data}</span>
                                      <span className="dash-ponto-datetime__hora">{hora}</span>
                                    </div>
                                  </td>
                                  {podeEditar ? (
                                  <td className="text-end">
                                    <div className="dash-pag-func-actions" role="group" aria-label="Ações do registro">
                                      <button
                                        type="button"
                                        className="dash-pag-func-act dash-pag-func-act--edit"
                                        title="Corrigir horário"
                                        aria-label="Corrigir horário"
                                        onClick={() => abrirEditarRegistro(r)}
                                      >
                                        <i className="bi bi-pencil-square" aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        className="dash-pag-func-act dash-pag-func-act--delete"
                                        title="Excluir registro"
                                        aria-label="Excluir registro"
                                        onClick={() => void excluirRegistro(r)}
                                      >
                                        <i className="bi bi-trash3" aria-hidden="true" />
                                      </button>
                                    </div>
                                  </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {detalheTotalPaginas > 1 ? (
                        <InvPagination
                          page={detalhePageSafe}
                          totalPages={detalheTotalPaginas}
                          total={registros.length}
                          perPage={PONTO_DETALHE_POR_PAGINA}
                          onPageChange={setDetalhePage}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <p className="dash-ponto-detalhe__hint mb-0">
                      {podeEditar
                        ? "Clique na seta para ver cada batida, corrigir horários ou excluir registros."
                        : "Clique na seta para ver cada batida do período."}
                    </p>
                  )}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="ponto-folha-offscreen" aria-hidden="true">
        <PontoFolhaDocument de={de} ate={ate} jornadas={jornadas} />
        <HoleriteDocument holerites={holerites} />
      </div>

      <AdminModal
        open={holeriteOpen}
        onClose={() => {
          if (!gerandoPdf) setHoleriteOpen(false);
        }}
        dialogClass="modal-md"
        closeOnBackdrop={!gerandoPdf}
      >
        <div className="modal-content visitas-orc-modal__content">
          <div className="modal-header visitas-orc-modal__header flex-shrink-0">
            <div className="visitas-orc-modal__head">
              <span className="visitas-orc-modal__head-icon" aria-hidden="true">
                <i className="bi bi-receipt" />
              </span>
              <div>
                <h4 className="modal-title visitas-orc-modal__title mb-0">Holerite do mês</h4>
                <p className="visitas-orc-modal__subtitle mb-0">
                  Referente a {mesLabel(fMes.trim() || de.slice(0, 7))}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Fechar"
              disabled={gerandoPdf}
              onClick={() => setHoleriteOpen(false)}
            />
          </div>
          <div className="modal-body dash-edit-modal__body">
            <label className="dash-edit-modal__label" htmlFor="holerite-escolher-func">
              Funcionário
            </label>
            <select
              id="holerite-escolher-func"
              className="form-select dash-edit-modal__input"
              value={holeriteUsuario}
              disabled={gerandoPdf}
              onChange={(e) => setHoleriteUsuario(e.target.value)}
            >
              {funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-footer visitas-orc-modal__footer flex-shrink-0">
            <button
              type="button"
              className="btn dash-edit-modal__btn-cancel"
              disabled={gerandoPdf}
              onClick={() => setHoleriteOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn dash-edit-modal__btn-save"
              disabled={gerandoPdf || !holeriteUsuario}
              onClick={() => void baixarHolerite()}
            >
              <i className="bi bi-download" aria-hidden="true" />{" "}
              {gerandoPdf ? "Gerando…" : "Baixar holerite"}
            </button>
          </div>
        </div>
      </AdminModal>

      <PontoEditarJornadaModal
        open={editarOpen}
        onClose={() => {
          setEditarOpen(false);
          setEditarJornada(null);
          setEditarRegistroId(null);
        }}
        jornada={editarJornada}
        registros={registros}
        registroId={editarRegistroId}
        onSaved={() => void load()}
      />
    </div>
  );
}
