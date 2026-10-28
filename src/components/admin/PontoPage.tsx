import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { DashPageHero, NovaVisitaCta } from "@/components/admin/DashPageHero";
import { formatDataHoraPonto, pontoClasseBadge, pontoLabelTipo } from "@/lib/ponto-display";
import { PONTO_CARGA_DIA_LABEL, PONTO_JORNADA } from "@/lib/ponto-jornada";
import { PONTO_TIMEZONE } from "@/lib/ponto-timezone";
import { dashConfirm, dashToast } from "@/lib/dash-ui";

type Estado = {
  status: string;
  label: string;
  pode_entrada: boolean;
  pode_almoco: boolean;
  pode_retorno: boolean;
  pode_saida: boolean;
};

type Registro = { id: number; tipo: string; registrado_em: string };

function badgeClass(status: string) {
  if (status === "trabalhando") return "on";
  if (status === "almoco") return "almoco";
  return "off";
}

export function PontoPage() {
  const { user } = useAdminAuth();
  const podeExcluir = user?.visao === "admin";
  const isFuncionario = user?.visao === "funcionário";

  const [nome, setNome] = useState("");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [relogio, setRelogio] = useState(
    new Date().toLocaleTimeString("pt-BR", {
      timeZone: PONTO_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ponto", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        nome?: string;
        estado?: Estado;
        historico?: Registro[];
        message?: string;
      };
      if (!res.ok) throw new Error(json.message ?? "Erro ao carregar ponto.");
      setNome(json.nome ?? "");
      setEstado(json.estado ?? null);
      setHistorico(json.historico ?? []);
    } catch (e) {
      dashToast(e instanceof Error ? e.message : "Erro.", "danger");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      setRelogio(
        new Date().toLocaleTimeString("pt-BR", {
          timeZone: PONTO_TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function registrar(tipo: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ponto", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        estado?: Estado;
        historico?: Registro[];
      };
      if (!res.ok) {
        dashToast(json.message ?? "Não foi possível registrar.", "warning");
        return;
      }
      dashToast(json.message ?? "Registrado!", "success");
      if (json.estado) setEstado(json.estado);
      if (json.historico) setHistorico(json.historico);
    } catch {
      dashToast("Erro de comunicação.", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function excluirRegistro(reg: Registro) {
    const { data, hora } = formatDataHoraPonto(reg.registrado_em);
    const msg = `Excluir o registro de ${pontoLabelTipo(reg.tipo)} em ${data} ${hora}? Esta ação não pode ser desfeita.`;
    const ok = await dashConfirm({
      title: "Excluir registro?",
      message: msg,
      confirmText: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/ponto-controle?id=${reg.id}`, {
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
    <div className="dash-form-page dash-form-page--pro dash-ponto-page">
      <DashPageHero
        title="Bate-ponto"
        subtitle={`Jornada ${PONTO_JORNADA.entrada}–${PONTO_JORNADA.almoco} e ${PONTO_JORNADA.retorno}–${PONTO_JORNADA.saida}`}
        iconClass="bi-clock-history"
        layout="form"
        showNovaVisita={false}
        cta={
          <div className="dash-ponto-hero__actions">
            {isFuncionario ? (
              <Link to="/painel/agendar" className="dash-form-page__cta dash-form-page__cta--agendar">
                <i className="bi bi-calendar4-range" aria-hidden="true" />
                <span>Agendar visitas</span>
              </Link>
            ) : null}
            {podeExcluir ? (
              <Link to="/painel/ponto-controle" className="btn btn-sm btn-outline-primary">
                <i className="bi bi-people" aria-hidden="true" /> Controle de todos
              </Link>
            ) : !isFuncionario ? (
              <NovaVisitaCta />
            ) : null}
          </div>
        }
      />

      <div className="dash-page-body dash-page-body--solo">
        {loading ? <p className="text-muted py-3">Carregando…</p> : null}

        {!loading && estado ? (
          <>
            <section className="dash-edit-modal__panel dash-ponto-acoes">
              <div className="dash-ponto-acoes__top">
                <div className="dash-ponto-acoes__meta">
                  <span className="dash-ponto-acoes__user">
                    <i className="bi bi-person-badge" aria-hidden="true" />
                    {nome}
                  </span>
                  <span className="dash-ponto-clock" aria-live="polite">
                    {relogio}
                  </span>
                </div>
                <div
                  className={`dash-ponto-badge dash-ponto-badge--${badgeClass(estado.status)}`}
                  id="ponto-status-badge"
                >
                  <span className="dash-ponto-badge__dot" aria-hidden="true" />
                  <span>{estado.label}</span>
                </div>
              </div>

              <p className="dash-ponto-jornada">
                <span>
                  Manhã <strong>{PONTO_JORNADA.entrada}–{PONTO_JORNADA.almoco}</strong>
                </span>
                <span>
                  Tarde <strong>{PONTO_JORNADA.retorno}–{PONTO_JORNADA.saida}</strong>
                </span>
                <span>
                  Dia completo <strong>{PONTO_CARGA_DIA_LABEL}</strong>
                </span>
              </p>

              <div className="dash-ponto-grid" role="group" aria-label="Registrar ponto">
                <button
                  type="button"
                  className="dash-ponto-card-btn dash-ponto-card-btn--entrada"
                  disabled={busy || !estado.pode_entrada}
                  onClick={() => void registrar("entrada")}
                >
                  <i className="bi bi-box-arrow-in-right" aria-hidden="true" />
                  <span>Entrada</span>
                  <small>{PONTO_JORNADA.entrada}</small>
                </button>
                <button
                  type="button"
                  className="dash-ponto-card-btn dash-ponto-card-btn--almoco"
                  disabled={busy || !estado.pode_almoco}
                  onClick={() => void registrar("almoco")}
                >
                  <i className="bi bi-cup-hot" aria-hidden="true" />
                  <span>Almoço</span>
                  <small>{PONTO_JORNADA.almoco}</small>
                </button>
                <button
                  type="button"
                  className="dash-ponto-card-btn dash-ponto-card-btn--retorno"
                  disabled={busy || !estado.pode_retorno}
                  onClick={() => void registrar("retorno_almoco")}
                >
                  <i className="bi bi-arrow-return-left" aria-hidden="true" />
                  <span>Retorno</span>
                  <small>{PONTO_JORNADA.retorno}</small>
                </button>
                <button
                  type="button"
                  className="dash-ponto-card-btn dash-ponto-card-btn--saida"
                  disabled={busy || !estado.pode_saida}
                  onClick={() => void registrar("saida")}
                >
                  <i className="bi bi-box-arrow-right" aria-hidden="true" />
                  <span>Saída</span>
                  <small>{PONTO_JORNADA.saida}</small>
                </button>
              </div>
            </section>

            <section className="dash-edit-modal__panel dash-ponto-registros">
              <h2 className="dash-edit-modal__panel-title">
                <i className="bi bi-journal-text" aria-hidden="true" />
                Registros
              </h2>
              <div className="table-responsive">
                <table className="table table-sm dash-ponto-log-table mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Hora</th>
                      <th scope="col">Registro</th>
                      {podeExcluir ? (
                        <th scope="col" className="text-end">
                          Ações
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {historico.length === 0 ? (
                      <tr>
                        <td colSpan={podeExcluir ? 4 : 3} className="text-center text-secondary py-4">
                          Nenhum registro ainda. Use os botões acima para marcar o ponto.
                        </td>
                      </tr>
                    ) : (
                      historico.map((reg) => {
                        const { data, hora } = formatDataHoraPonto(reg.registrado_em);
                        return (
                          <tr key={reg.id}>
                            <td className="dash-ponto-log-table__data">{data}</td>
                            <td className="dash-ponto-log-table__hora">{hora}</td>
                            <td>
                              <span className={`dash-ponto-tipo ${pontoClasseBadge(reg.tipo)}`}>
                                {pontoLabelTipo(reg.tipo)}
                              </span>
                            </td>
                            {podeExcluir ? (
                              <td className="text-end">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger dash-ponto-btn-excluir"
                                  title="Excluir registro"
                                  onClick={() => void excluirRegistro(reg)}
                                >
                                  <i className="bi bi-trash" aria-hidden="true" />
                                  <span className="visually-hidden">Excluir</span>
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
