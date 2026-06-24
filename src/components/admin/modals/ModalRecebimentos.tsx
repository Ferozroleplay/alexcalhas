import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import { useAdminAuth } from "@/components/admin/admin-auth";
import {
  excluirRecebimentoInventario,
  fetchRecebimentosInventario,
  registrarRecebimentoInventario,
  type AgendamentoItem,
  type InventarioRecebimentoItem,
  type RecebimentoResumo,
} from "@/lib/admin-api";
import { dashConfirm, dashToast } from "@/lib/dash-ui";
import { formatMoeda } from "@/lib/financeiro-display";
import {
  formatPagoEmExibicao,
  labelRecebimentoTipo,
  RECEBIMENTO_TIPOS,
} from "@/lib/inventario-recebimento-display";

type Props = {
  open: boolean;
  onClose: () => void;
  item: AgendamentoItem | null;
  onSaved: (patch: Pick<AgendamentoItem, "valorRecebido" | "saldoPendente" | "quitado" | "qtdPagamentos">) => void;
};

function agoraInputLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ModalRecebimentos({ open, onClose, item, onSaved }: Props) {
  const { user } = useAdminAuth();
  const isAdmin = user?.visao === "admin";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [valorOrcamento, setValorOrcamento] = useState(0);
  const [resumo, setResumo] = useState<RecebimentoResumo | null>(null);
  const [lista, setLista] = useState<InventarioRecebimentoItem[]>([]);

  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState("sinal");
  const [pagoEm, setPagoEm] = useState(agoraInputLocal());
  const [observacao, setObservacao] = useState("");

  const load = useCallback(async () => {
    if (!item?.id) return;
    setLoading(true);
    setErro("");
    try {
      const data = await fetchRecebimentosInventario(item.id);
      setValorOrcamento(data.valor_orcamento);
      setResumo(data.resumo);
      setLista(data.recebimentos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [item?.id]);

  useEffect(() => {
    if (!open || !item) {
      setLista([]);
      setResumo(null);
      setValor("");
      setTipo("sinal");
      setPagoEm(agoraInputLocal());
      setObservacao("");
      return;
    }
    void load();
  }, [open, item, load]);

  function aplicarResumo(r: RecebimentoResumo) {
    setResumo(r);
    onSaved({
      valorRecebido: r.valorRecebido,
      saldoPendente: r.saldoPendente,
      quitado: r.quitado,
      qtdPagamentos: r.qtdPagamentos,
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setSaving(true);
    setErro("");
    try {
      const data = await registrarRecebimentoInventario(item.id, {
        valor,
        tipo,
        pago_em: pagoEm,
        observacao: observacao.trim() || undefined,
      });
      setLista(data.recebimentos);
      aplicarResumo(data.resumo);
      setValor("");
      setTipo("sinal");
      setPagoEm(agoraInputLocal());
      setObservacao("");
      dashToast("Pagamento registrado.", "success");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function excluir(rec: InventarioRecebimentoItem) {
    if (!item) return;
    const ok = await dashConfirm({
      title: "Excluir pagamento?",
      message: `Remover ${formatMoeda(rec.valor)} de ${formatPagoEmExibicao(rec.pago_em)}?`,
      confirmText: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const data = await excluirRecebimentoInventario(item.id, rec.id);
      setLista(data.recebimentos);
      aplicarResumo(data.resumo);
      dashToast("Pagamento removido.", "success");
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Erro.", "danger");
    }
  }

  const titulo = item ? `Pagamentos — ${item.nome}` : "Pagamentos do cliente";

  return (
    <AdminModal open={open} onClose={onClose} dialogClass="modal-lg">
      <div className="modal-content visitas-orc-modal__content">
        <div className="modal-header visitas-orc-modal__header flex-shrink-0">
          <div className="visitas-orc-modal__head">
            <span className="visitas-orc-modal__head-icon" aria-hidden="true">
              <i className="bi bi-cash-coin" />
            </span>
            <div>
              <h4 className="modal-title visitas-orc-modal__title mb-0">Recebimentos</h4>
              <p className="visitas-orc-modal__subtitle mb-0">{titulo}</p>
            </div>
          </div>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
        </div>

        <div className="modal-body dash-edit-modal__body">
          {erro ? <div className="alert alert-danger py-2">{erro}</div> : null}
          {loading ? (
            <p className="text-muted mb-0 d-flex align-items-center gap-2">
              <Loader2 className="spin" size={18} /> Carregando…
            </p>
          ) : (
            <>
              {resumo ? (
                <div className="inv-receb-resumo mb-3">
                  <div className="inv-receb-resumo__item">
                    <span className="inv-receb-resumo__label">Orçamento</span>
                    <strong>R$ {formatMoeda(valorOrcamento)}</strong>
                  </div>
                  <div className="inv-receb-resumo__item">
                    <span className="inv-receb-resumo__label">Recebido</span>
                    <strong className="inv-receb-resumo__ok">R$ {formatMoeda(resumo.valorRecebido)}</strong>
                  </div>
                  <div className="inv-receb-resumo__item">
                    <span className="inv-receb-resumo__label">Devendo</span>
                    <strong
                      className={
                        resumo.quitado
                          ? "inv-receb-resumo__ok"
                          : resumo.saldoPendente > 0
                            ? "inv-receb-resumo__pendente"
                            : ""
                      }
                    >
                      R$ {formatMoeda(resumo.saldoPendente)}
                    </strong>
                  </div>
                </div>
              ) : null}

              <form className="dash-form mb-3" onSubmit={(e) => void salvar(e)}>
                <h3 className="dash-edit-modal__panel-title h6 mb-2">
                  <i className="bi bi-plus-circle" aria-hidden="true" /> Registrar pagamento
                </h3>
                <div className="row g-2 align-items-end">
                  <div className="col-6 col-md-3">
                    <label className="dash-edit-modal__label" htmlFor="rec-valor">
                      Valor (R$)
                    </label>
                    <input
                      id="rec-valor"
                      type="text"
                      inputMode="decimal"
                      required
                      className="form-control dash-edit-modal__input"
                      placeholder="1.750,00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                    />
                  </div>
                  <div className="col-6 col-md-3">
                    <label className="dash-edit-modal__label" htmlFor="rec-tipo">
                      Tipo
                    </label>
                    <select
                      id="rec-tipo"
                      className="form-select dash-edit-modal__input"
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value)}
                    >
                      {RECEBIMENTO_TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {labelRecebimentoTipo(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-4">
                    <label className="dash-edit-modal__label" htmlFor="rec-pago-em">
                      Data e hora do pagamento
                    </label>
                    <input
                      id="rec-pago-em"
                      type="datetime-local"
                      required
                      className="form-control dash-edit-modal__input"
                      value={pagoEm}
                      onChange={(e) => setPagoEm(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-2 d-grid">
                    <button type="submit" className="btn dash-edit-modal__btn-save" disabled={saving}>
                      {saving ? "Salvando…" : "Salvar"}
                    </button>
                  </div>
                  <div className="col-12">
                    <label className="dash-edit-modal__label" htmlFor="rec-obs">
                      Observação (opcional)
                    </label>
                    <input
                      id="rec-obs"
                      type="text"
                      className="form-control dash-edit-modal__input"
                      placeholder="Pix, comprovante, banco…"
                      maxLength={255}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                    />
                  </div>
                </div>
              </form>

              <h3 className="dash-edit-modal__panel-title h6 mb-2">
                <i className="bi bi-clock-history" aria-hidden="true" /> Histórico
              </h3>
              {lista.length === 0 ? (
                <p className="text-muted small mb-0">Nenhum pagamento registrado ainda.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm inv-receb-hist mb-0">
                    <thead>
                      <tr>
                        <th>Data e hora</th>
                        <th>Tipo</th>
                        <th className="text-end">Valor</th>
                        <th>Obs.</th>
                        {isAdmin ? <th className="text-end" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((rec) => (
                        <tr key={rec.id}>
                          <td>{formatPagoEmExibicao(rec.pago_em)}</td>
                          <td>{labelRecebimentoTipo(rec.tipo)}</td>
                          <td className="text-end">R$ {formatMoeda(rec.valor)}</td>
                          <td className="inv-receb-hist__obs">{rec.observacao || "—"}</td>
                          {isAdmin ? (
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                title="Excluir"
                                onClick={() => void excluir(rec)}
                              >
                                <i className="bi bi-trash3" aria-hidden="true" />
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer visitas-orc-modal__footer flex-shrink-0">
          <button type="button" className="btn dash-edit-modal__btn-cancel" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
