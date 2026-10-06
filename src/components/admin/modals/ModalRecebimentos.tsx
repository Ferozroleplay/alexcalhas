import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import { useAdminAuth } from "@/components/admin/admin-auth";
import {
  atualizarRecebimentoInventario,
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
  normalizarValorPagamento,
  parsePagoEm,
  RECEBIMENTO_TIPOS,
} from "@/lib/inventario-recebimento-display";
import { parseMoneyBr } from "@/lib/orcamento.server";
import { abrirRecibo, baixarPdfRecibo } from "@/lib/recibo-pdf";

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

function pagoEmParaCampo(raw: string): string {
  const d = parsePagoEm(raw);
  if (!d) return agoraInputLocal();
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
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [gerandoReciboId, setGerandoReciboId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
      setEditandoId(null);
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

  function preencherValor(n: number) {
    if (n <= 0) return;
    setValor(n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }

  async function gerarRecibo(recebimentoId: number) {
    if (!item || gerandoReciboId) return;
    setGerandoReciboId(recebimentoId);
    dashToast("Gerando o recibo…", "info");
    try {
      await baixarPdfRecibo(item.id, recebimentoId);
      dashToast("Recibo PDF baixado. Envie o arquivo no WhatsApp do cliente.", "success");
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Não foi possível gerar o recibo.", "danger");
    } finally {
      setGerandoReciboId(null);
    }
  }

  function limparFormulario() {
    setValor("");
    setTipo("sinal");
    setPagoEm(agoraInputLocal());
    setObservacao("");
    setEditandoId(null);
  }

  function iniciarEdicao(rec: InventarioRecebimentoItem) {
    setEditandoId(rec.id);
    setValor(rec.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setTipo(rec.tipo);
    setPagoEm(pagoEmParaCampo(rec.pago_em));
    setObservacao(rec.observacao?.trim() ?? "");
    setErro("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const valorEmEdicao = editandoId ? (lista.find((r) => r.id === editandoId)?.valor ?? 0) : 0;
  const tetoPagamento = (resumo?.saldoPendente ?? valorOrcamento) + valorEmEdicao;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const valorNum = parseMoneyBr(normalizarValorPagamento(valor));
    if (valorNum <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    if (valorNum > tetoPagamento + 0.009) {
      setErro(`O valor passa do saldo. O máximo é R$ ${formatMoeda(tetoPagamento)}.`);
      return;
    }
    const tipoSalvo = tipo;
    const editando = editandoId;
    setSaving(true);
    setErro("");
    try {
      const payload = {
        valor: valorNum,
        tipo: tipoSalvo,
        pago_em: pagoEm,
        observacao: observacao.trim() || undefined,
      };
      const data = editando
        ? await atualizarRecebimentoInventario(item.id, editando, payload)
        : await registrarRecebimentoInventario(item.id, payload);
      setLista(data.recebimentos);
      aplicarResumo(data.resumo);
      limparFormulario();
      setSaving(false);
      if (!editando && tipoSalvo === "sinal" && "recebimentoId" in data && data.recebimentoId > 0) {
        await gerarRecibo(data.recebimentoId);
      } else {
        dashToast(editando ? "Pagamento atualizado." : "Pagamento registrado.", "success");
      }
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
      if (editandoId === rec.id) limparFormulario();
      dashToast("Pagamento removido.", "success");
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Erro.", "danger");
    }
  }

  const titulo = item ? `Pagamentos — ${item.nome}` : "Pagamentos do cliente";

  return (
    <AdminModal open={open} onClose={onClose} dialogClass="modal-lg" closeOnBackdrop={false}>
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

              <form ref={formRef} className="dash-form inv-receb-form mb-3" onSubmit={(e) => void salvar(e)}>
                <h3 className="dash-edit-modal__panel-title h6 mb-2">
                  <i className={`bi ${editandoId ? "bi-pencil" : "bi-plus-circle"}`} aria-hidden="true" />{" "}
                  {editandoId ? "Corrigir pagamento" : "Registrar pagamento"}
                </h3>
                <div className="inv-receb-form__grid">
                  <div>
                    <label className="dash-edit-modal__label" htmlFor="rec-valor">
                      Valor (R$)
                    </label>
                    <input
                      id="rec-valor"
                      type="text"
                      inputMode="decimal"
                      required
                      className="form-control dash-edit-modal__input"
                      placeholder="0,00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      onBlur={() => setValor((atual) => normalizarValorPagamento(atual))}
                    />
                  </div>
                  <div>
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
                  <div className="inv-receb-form__quando">
                    <label className="dash-edit-modal__label" htmlFor="rec-pago-em">
                      Data e hora
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
                  <div className="inv-receb-form__save">
                    <button type="submit" className="btn dash-edit-modal__btn-save" disabled={saving}>
                      {saving ? "Salvando…" : editandoId ? "Atualizar" : "Salvar"}
                    </button>
                    {editandoId ? (
                      <button type="button" className="btn dash-edit-modal__btn-cancel" onClick={limparFormulario}>
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
                {valorOrcamento > 0 && tetoPagamento > 0 ? (
                  <div className="inv-receb-atalhos">
                    {(resumo?.valorRecebido ?? 0) <= 0 ? (
                      <button
                        type="button"
                        onClick={() => preencherValor(Math.round(valorOrcamento * 50) / 100)}
                      >
                        Entrada 50% · R${" "}
                        {formatMoeda(Math.round(valorOrcamento * 50) / 100)}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => preencherValor(tetoPagamento)}>
                      Valor restante · R$ {formatMoeda(tetoPagamento)}
                    </button>
                  </div>
                ) : null}
                <div className="inv-receb-form__obs">
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
                        <th className="text-end">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((rec) => (
                        <tr key={rec.id} className={editandoId === rec.id ? "is-editing" : ""}>
                          <td>{formatPagoEmExibicao(rec.pago_em)}</td>
                          <td>{labelRecebimentoTipo(rec.tipo)}</td>
                          <td className="text-end">R$ {formatMoeda(rec.valor)}</td>
                          <td className="inv-receb-hist__obs">{rec.observacao || "—"}</td>
                          <td className="text-end">
                            <div className="inv-receb-hist__acoes">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                title="Editar pagamento"
                                onClick={() => iniciarEdicao(rec)}
                              >
                                <i className="bi bi-pencil" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                title="Abrir recibo"
                                onClick={() => {
                                  if (!item) return;
                                  try {
                                    abrirRecibo(item.id, rec.id);
                                  } catch (err) {
                                    dashToast(
                                      err instanceof Error ? err.message : "Não foi possível abrir o recibo.",
                                      "danger",
                                    );
                                  }
                                }}
                              >
                                PDF
                              </button>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  title="Excluir"
                                  onClick={() => void excluir(rec)}
                                >
                                  <i className="bi bi-trash3" aria-hidden="true" />
                                </button>
                              ) : null}
                            </div>
                          </td>
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
