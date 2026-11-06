import { useCallback, useEffect, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import {
  formatMoeda,
  formatValorInput,
  parseValorInput,
} from "@/lib/funcionario-pagamento-display";
import type { DiaChave, PagamentoModalData } from "@/lib/funcionario-pagamento.server";
import { dashAlert, dashConfirm, dashToast } from "@/lib/dash-ui";

type Props = {
  open: boolean;
  onClose: () => void;
  usuarioId: number;
  semana: string;
  onSaved: () => void;
};

function recalcLocal(d: PagamentoModalData, valorPagoManual: boolean): PagamentoModalData {
  const diasDiaria = d.dias.filter((x) => x.tipo === "diaria" && x.marcado).length;
  const empDias = d.dias.filter((x) => x.tipo === "empreita").length;
  const valorBruto = Math.round((diasDiaria * d.valor_diario + d.total_empreitas) * 100) / 100;
  const valorLiquido = valorPagoManual ? d.valor_liquido : Math.max(0, Math.round((valorBruto - d.total_vales) * 100) / 100);
  return {
    ...d,
    dias_trabalhados: diasDiaria + empDias,
    valor_diaria_bruto: Math.round(diasDiaria * d.valor_diario * 100) / 100,
    valor_bruto: valorBruto,
    valor_liquido: valorLiquido,
  };
}

export function FuncionarioPagamentoModal({ open, onClose, usuarioId, semana, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dados, setDados] = useState<PagamentoModalData | null>(null);
  const [modo, setModo] = useState<"diaria" | "empreita">("diaria");
  const [empreitaValorDia, setEmpreitaValorDia] = useState("");
  const [valorPagoManual, setValorPagoManual] = useState(false);
  const [valeValor, setValeValor] = useState("");
  const [valeObs, setValeObs] = useState("");

  const load = useCallback(async () => {
    if (!usuarioId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/funcionarios-pagamento?semana=${encodeURIComponent(semana)}&usuario=${usuarioId}&modal=1`,
        { credentials: "include" },
      );
      const json = (await res.json()) as { ok?: boolean; dados?: PagamentoModalData; message?: string };
      if (!res.ok || !json.dados) throw new Error(json.message ?? "Erro ao carregar.");
      setDados(json.dados);
      setValorPagoManual(false);
      setModo("diaria");
      setEmpreitaValorDia("");
    } catch (e) {
      void dashAlert(e instanceof Error ? e.message : "Erro.");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [usuarioId, semana, onClose]);

  useEffect(() => {
    if (open && usuarioId > 0) void load();
    if (!open) setDados(null);
  }, [open, usuarioId, load]);

  async function onDiaClick(dia: PagamentoModalData["dias"][0]) {
    if (!dados) return;

    if (modo === "empreita") {
      const valorEmp = parseValorInput(empreitaValorDia);
      const toggleOff = dia.tipo === "empreita";
      setSaving(true);
      try {
        const res = await fetch("/api/admin/funcionarios-pagamento", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "empreita_dia",
            usuario_id: dados.usuario_id,
            semana_inicio: dados.semana_inicio,
            dia_chave: dia.chave,
            valor: toggleOff ? 0 : valorEmp,
            observacao: "",
          }),
        });
        const json = (await res.json()) as { ok?: boolean; dados?: PagamentoModalData; message?: string };
        if (!res.ok || !json.dados) throw new Error(json.message ?? "Erro.");
        const next = valorPagoManual ? { ...json.dados, valor_liquido: dados.valor_liquido } : json.dados;
        setDados(next);
      } catch (e) {
        void dashAlert(e instanceof Error ? e.message : "Erro.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (dia.tipo === "empreita") return;
    const marcado = !dia.marcado;
    const dias = dados.dias.map((d) =>
      d.chave === dia.chave
        ? { ...d, tipo: marcado ? ("diaria" as const) : ("nenhum" as const), marcado }
        : d,
    );
    setDados(recalcLocal({ ...dados, dias }, valorPagoManual));
  }

  async function registrarVale() {
    if (!dados) return;
    const valor = parseValorInput(valeValor);
    if (valor <= 0) {
      void dashAlert("Informe o valor do vale.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/funcionarios-pagamento", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vale_salvar",
          usuario_id: dados.usuario_id,
          semana_inicio: dados.semana_inicio,
          valor,
          observacao: valeObs,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; dados?: PagamentoModalData; message?: string };
      if (!res.ok || !json.dados) throw new Error(json.message ?? "Erro.");
      setDados(valorPagoManual ? { ...json.dados, valor_liquido: dados.valor_liquido } : json.dados);
      setValeValor("");
      setValeObs("");
    } catch (e) {
      void dashAlert(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  async function excluirVale(id: number) {
    if (!dados) return;
    const okExcluir = await dashConfirm({
      title: "Excluir vale?",
      message: "Excluir este vale?",
      confirmText: "Excluir",
      variant: "danger",
    });
    if (!okExcluir) return;
    setSaving(true);
    try {
      await fetch("/api/admin/funcionarios-pagamento", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vale_excluir", id }),
      });
      await load();
    } catch {
      void dashAlert("Erro ao excluir vale.");
    } finally {
      setSaving(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!dados) return;
    setSaving(true);
    try {
      const dias: Record<DiaChave, boolean> = {
        seg: dados.dias.find((d) => d.chave === "seg")?.marcado ?? false,
        ter: dados.dias.find((d) => d.chave === "ter")?.marcado ?? false,
        qua: dados.dias.find((d) => d.chave === "qua")?.marcado ?? false,
        qui: dados.dias.find((d) => d.chave === "qui")?.marcado ?? false,
        sex: dados.dias.find((d) => d.chave === "sex")?.marcado ?? false,
      };
      const res = await fetch("/api/admin/funcionarios-pagamento", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "salvar",
          usuario_id: dados.usuario_id,
          semana_inicio: dados.semana_inicio,
          valor: dados.valor_liquido,
          valor_diario: dados.valor_diario,
          observacao: dados.observacao,
          id: dados.pagamento_id ?? undefined,
          dias,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(json.message ?? "Erro ao salvar.");
      dashToast(json.message ?? "Pagamento salvo. Entrou nas despesas.");
      onClose();
      onSaved();
    } catch (err) {
      void dashAlert(err instanceof Error ? err.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open={open} onClose={onClose} dialogClass="modal-lg dash-func-pag-modal">
      {loading || !dados ? (
        <div className="modal-content p-5 text-center text-muted">
          {loading ? "Carregando…" : null}
        </div>
      ) : (
        <div className="modal-content">
          <div className="modal-header dash-edit-modal__header dash-func-pag-modal__header">
            <div className="dash-edit-modal__head dash-func-pag-modal__head">
              <span className="dash-edit-modal__head-icon" aria-hidden="true">
                <i className="bi bi-wallet2" />
              </span>
              <div className="dash-func-pag-modal__head-text">
                <div className="dash-func-pag-modal__title-row">
                  <span className="dash-func-pag-modal__badge">{dados.semana_label}</span>
                  <h4 className="modal-title dash-edit-modal__title mb-0">{dados.nome}</h4>
                </div>
                <p className="dash-edit-modal__subtitle mb-0">Pagamento semanal</p>
              </div>
            </div>
            <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
          </div>

          <form onSubmit={(e) => void salvar(e)}>
            <div className="dash-func-pag-modal__resumo-bar" aria-live="polite">
              <div className="dash-func-pag-modal__resumo-pill">
                <span>Dias</span>
                <strong>{dados.dias_trabalhados}</strong>
              </div>
              <div className="dash-func-pag-modal__resumo-pill">
                <span>Diária</span>
                <strong>{formatMoeda(dados.valor_diario)}</strong>
              </div>
              <div className="dash-func-pag-modal__resumo-pill dash-func-pag-modal__resumo-pill--empreita">
                <span>Empreitas</span>
                <strong>{formatMoeda(dados.total_empreitas)}</strong>
              </div>
              <div className="dash-func-pag-modal__resumo-pill">
                <span>Bruto</span>
                <strong>{formatMoeda(dados.valor_bruto)}</strong>
              </div>
              <div className="dash-func-pag-modal__resumo-pill dash-func-pag-modal__resumo-pill--vale">
                <span>Vales</span>
                <strong>{formatMoeda(dados.total_vales)}</strong>
              </div>
              <div className="dash-func-pag-modal__resumo-pill dash-func-pag-modal__resumo-pill--liquido">
                <span>A pagar</span>
                <strong>{formatMoeda(dados.valor_liquido)}</strong>
              </div>
            </div>

            <div className="modal-body dash-edit-modal__body dash-func-pag-modal__body">
              <div className="dash-func-pag-modal__grid">
                <section className="dash-edit-modal__panel dash-func-pag-modal__panel">
                  <h6 className="dash-edit-modal__panel-title">
                    <i className="bi bi-calendar-week" aria-hidden="true" /> Semana
                  </h6>
                  <div className="dash-func-pag-modal__diaria">
                    <label className="dash-edit-modal__label" htmlFor="modal-pag-valor-diario">
                      Valor por dia
                    </label>
                    <div className="input-group dash-func-pag-modal__input-group">
                      <span className="input-group-text">R$</span>
                      <input
                        id="modal-pag-valor-diario"
                        type="text"
                        className="form-control dash-edit-modal__input"
                        inputMode="decimal"
                        value={formatValorInput(dados.valor_diario)}
                        onChange={(e) => {
                          const vd = parseValorInput(e.target.value);
                          setDados(recalcLocal({ ...dados, valor_diario: vd }, valorPagoManual));
                        }}
                      />
                    </div>
                    <p className="dash-func-pag-modal__hint">Salvo no cadastro do funcionário.</p>
                  </div>

                  <fieldset className="dash-func-pag-dias">
                    <legend className="dash-edit-modal__label">Dias trabalhados</legend>
                    <div className="dash-func-pag-modo" role="group" aria-label="Modo de marcação">
                      <button
                        type="button"
                        className={`dash-func-pag-modo__btn${modo === "diaria" ? " is-ativo" : ""}`}
                        data-modo="diaria"
                        onClick={() => setModo("diaria")}
                      >
                        <i className="bi bi-sun" aria-hidden="true" /> Diária
                      </button>
                      <button
                        type="button"
                        className={`dash-func-pag-modo__btn${modo === "empreita" ? " is-ativo" : ""}`}
                        data-modo="empreita"
                        onClick={() => setModo("empreita")}
                      >
                        <i className="bi bi-hammer" aria-hidden="true" /> Empreita
                      </button>
                    </div>

                    {modo === "empreita" ? (
                      <div className="dash-func-pag-empreita-valor">
                        <label className="dash-edit-modal__label" htmlFor="modal-pag-valor-empreita-dia">
                          Valor da empreita (por dia marcado)
                        </label>
                        <div className="input-group dash-func-pag-modal__input-group input-group-sm">
                          <span className="input-group-text">R$</span>
                          <input
                            id="modal-pag-valor-empreita-dia"
                            type="text"
                            className="form-control dash-edit-modal__input"
                            inputMode="decimal"
                            value={empreitaValorDia}
                            onChange={(e) => setEmpreitaValorDia(e.target.value)}
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="dash-func-pag-dias__grid">
                      {dados.dias.map((dia) => {
                        const labelParts = dia.label.trim().split(/\s+/);
                        const weekday = labelParts[0] ?? dia.chave;
                        const datePart = labelParts.slice(1).join(" ");
                        const cls = [
                          "dash-func-pag-dias__item",
                          dia.tipo === "empreita" ? " is-empreita" : "",
                          dia.marcado ? " is-checked" : "",
                          dia.sugerido ? " is-sugerido" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <button
                            key={dia.chave}
                            type="button"
                            className={cls}
                            disabled={saving}
                            onClick={() => void onDiaClick(dia)}
                          >
                            <span className="dash-func-pag-dias__check" aria-hidden="true">
                              <i className="bi bi-check-lg" />
                            </span>
                            <span className="dash-func-pag-dias__weekday">{weekday}</span>
                            {datePart ? (
                              <span className="dash-func-pag-dias__date">{datePart}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <p className="dash-func-pag-modal__hint dash-func-pag-dias__legend">
                      Verde = diária · Roxo = empreita · Clique no dia conforme o modo selecionado.
                    </p>
                  </fieldset>
                </section>

                <section className="dash-edit-modal__panel dash-func-pag-modal__panel dash-func-pag-modal__panel--vales">
                  <div className="dash-func-pag-vales__head">
                    <h6 className="dash-edit-modal__panel-title mb-0">
                      <i className="bi bi-cash-coin" aria-hidden="true" /> Vales
                    </h6>
                    <span className="dash-func-pag-vales__count">{dados.vales.length}</span>
                  </div>
                  <div className="dash-func-pag-vales__table-wrap">
                    <table className="table table-sm dash-func-pag-vales__table mb-0">
                      <thead>
                        <tr>
                          <th>Valor</th>
                          <th>Data</th>
                          <th>Obs.</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {dados.vales.length === 0 ? (
                          <tr className="dash-func-pag-vales__empty">
                            <td colSpan={4}>Nenhum vale nesta semana.</td>
                          </tr>
                        ) : (
                          dados.vales.map((v) => (
                            <tr key={v.id}>
                              <td>{formatMoeda(v.valor)}</td>
                              <td>{v.data_fmt}</td>
                              <td className="small">{v.observacao || "—"}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => void excluirVale(v.id)}
                                  disabled={saving}
                                  aria-label="Excluir vale"
                                >
                                  <i className="bi bi-trash" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="dash-func-pag-vales__add">
                    <div className="dash-func-pag-vales__add-field">
                      <label className="dash-edit-modal__label" htmlFor="modal-vale-valor">
                        Novo vale
                      </label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">R$</span>
                        <input
                          id="modal-vale-valor"
                          type="text"
                          className="form-control"
                          value={valeValor}
                          onChange={(e) => setValeValor(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div className="dash-func-pag-vales__add-field">
                      <label className="dash-edit-modal__label" htmlFor="modal-vale-obs">
                        Observação
                      </label>
                      <input
                        id="modal-vale-obs"
                        type="text"
                        className="form-control form-control-sm"
                        value={valeObs}
                        onChange={(e) => setValeObs(e.target.value)}
                        placeholder="Opcional"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm dash-func-pag-vales__add-btn"
                      disabled={saving}
                      onClick={() => void registrarVale()}
                    >
                      <i className="bi bi-plus-circle" aria-hidden="true" /> Adicionar
                    </button>
                  </div>
                </section>
              </div>

              <section className="dash-edit-modal__panel dash-func-pag-modal__panel dash-func-pag-modal__panel--fechar">
                <h6 className="dash-edit-modal__panel-title">
                  <i className="bi bi-check2-circle" aria-hidden="true" /> Fechar pagamento
                </h6>
                <div className="row g-2">
                  <div className="col-12 col-md-5">
                    <label className="dash-edit-modal__label" htmlFor="modal-pag-valor">
                      Valor a pagar
                    </label>
                    <div className="input-group dash-func-pag-modal__input-group dash-func-pag-modal__input-group--destaque">
                      <span className="input-group-text">R$</span>
                      <input
                        id="modal-pag-valor"
                        type="text"
                        className="form-control dash-edit-modal__input"
                        required
                        value={formatValorInput(dados.valor_liquido)}
                        onChange={(e) => {
                          setValorPagoManual(true);
                          setDados({
                            ...dados,
                            valor_liquido: parseValorInput(e.target.value),
                          });
                        }}
                      />
                    </div>
                    <p className="dash-func-pag-modal__hint">
                      Diária + empreitas − vales (pode ajustar). Ao salvar, fica pago e entra nas despesas.
                    </p>
                  </div>
                  <div className="col-12 col-md-7">
                    <label className="dash-edit-modal__label" htmlFor="modal-pag-obs">
                      Observação
                    </label>
                    <input
                      id="modal-pag-obs"
                      type="text"
                      className="form-control dash-edit-modal__input"
                      maxLength={500}
                      value={dados.observacao}
                      onChange={(e) => setDados({ ...dados, observacao: e.target.value })}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="modal-footer dash-edit-modal__footer dash-func-pag-modal__footer">
              <button type="button" className="btn dash-edit-modal__btn-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn dash-edit-modal__btn-save visitas-orc-add-btn" disabled={saving}>
                <i className="bi bi-check-lg" aria-hidden="true" />{" "}
                {saving ? "Salvando…" : "Salvar pagamento"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminModal>
  );
}
