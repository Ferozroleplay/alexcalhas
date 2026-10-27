import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import { confirmarMontagem, type AgendamentoItem } from "@/lib/admin-api";
import {
  calcularCreditoMaquininha,
  encodeFormaPagamento,
  parseFormaPagamento,
} from "@/lib/orcamento.server";
import { ORCAMENTO_OBS_PRESETS } from "@/lib/os-document";

const PAY_OPTIONS = [
  { value: "pix" as const, label: "PIX", desc: "À vista ou entrada", icon: "bi-qr-code-scan" },
  { value: "debito" as const, label: "Débito", desc: "Cartão na hora", icon: "bi-credit-card" },
  { value: "credito" as const, label: "Crédito", desc: "Parcelado no cartão", icon: "bi-credit-card-2-front" },
];

type FormaPay = "" | "pix" | "debito" | "credito";

type Props = {
  open: boolean;
  onClose: () => void;
  item: AgendamentoItem | null;
  onSaved: (item: AgendamentoItem) => void;
};

function formatBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function temEntrada50(obs: string): boolean {
  return /50%\s*de entrada/i.test(obs);
}

export function ModalConfirmarMontagem({ open, onClose, item, onSaved }: Props) {
  const [dataMontagem, setDataMontagem] = useState("");
  const [forma, setForma] = useState<FormaPay>("");
  const [qtdParcelas, setQtdParcelas] = useState("6");
  const [taxaMaquininha, setTaxaMaquininha] = useState(0);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    const pag = parseFormaPagamento(item.formaPagamento);
    setDataMontagem("");
    setForma(pag.forma);
    setQtdParcelas(String(pag.forma === "credito" ? Math.max(1, pag.qtdParcelas) : 6));
    setTaxaMaquininha(pag.taxaMaquininhaPct);
    setObservacao(item.observacao ?? "");
    setError("");
  }, [open, item]);

  const valor = Number(item?.valor) || 0;
  const qtd = Math.min(12, Math.max(1, Number.parseInt(qtdParcelas, 10) || 1));
  const credito = calcularCreditoMaquininha(valor, qtd, taxaMaquininha);
  const valorParcela = qtd > 0 ? credito.totalFinal / qtd : 0;
  const entrada50 = temEntrada50(observacao);

  const resumo = useMemo(() => {
    if (forma === "credito") {
      const base = qtd > 1 ? `${qtd}x de ${formatBrl(valorParcela)} no cartão` : `Crédito à vista · ${formatBrl(credito.totalFinal)}`;
      return entrada50 ? `${base} · entrada 50% (${formatBrl(valor / 2)})` : base;
    }
    if (forma === "pix") {
      return entrada50
        ? `Pix · entrada 50% (${formatBrl(valor / 2)}) e 50% na montagem`
        : `Pix à vista · ${formatBrl(valor)}`;
    }
    if (forma === "debito") {
      return entrada50
        ? `Débito · entrada 50% (${formatBrl(valor / 2)}) e 50% na montagem`
        : `Débito à vista · ${formatBrl(valor)}`;
    }
    return "";
  }, [forma, qtd, valorParcela, credito.totalFinal, entrada50, valor]);

  function escolherForma(next: FormaPay) {
    setForma(next);
    if (next === "credito" && Number.parseInt(qtdParcelas, 10) < 2) {
      setQtdParcelas("6");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (!dataMontagem) {
      setError("Informe a data de montagem.");
      return;
    }
    if (!forma) {
      setError("Escolha a forma de pagamento.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const formaPagamento = encodeFormaPagamento(forma, qtd, taxaMaquininha);
      const saved = await confirmarMontagem(item.id, dataMontagem, {
        formaPagamento,
        observacao,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open={open} onClose={onClose} dialogClass="modal-lg">
      <div className="modal-content montagem-modal">
        <div className="modal-header">
          <h5 className="modal-title">Confirmar montagem</h5>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error ? <div className="alert alert-danger py-2">{error}</div> : null}
            <p className="small text-muted mb-3">
              Registro #{item?.id}
              {item?.nome ? ` · ${item.nome}` : ""}
              {valor > 0 ? ` · ${formatBrl(valor)}` : ""}
            </p>

            <label className="form-label">Data da montagem</label>
            <input
              type="date"
              className="form-control mb-3"
              required
              value={dataMontagem}
              onChange={(e) => setDataMontagem(e.target.value)}
            />

            <p className="form-label mb-2">Forma de pagamento</p>
            <div className="visitas-orc-pay-grid mb-3" role="radiogroup" aria-label="Forma de pagamento">
              {PAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={forma === opt.value}
                  className={`visitas-orc-pay-card${forma === opt.value ? " visitas-orc-pay-card--active" : ""}`}
                  onClick={() => escolherForma(opt.value)}
                >
                  <span className="visitas-orc-pay-card__icon" aria-hidden="true">
                    <i className={`bi ${opt.icon}`} />
                  </span>
                  <span className="visitas-orc-pay-card__name">{opt.label}</span>
                  <span className="visitas-orc-pay-card__desc">
                    {opt.value === "credito" && forma === "credito" ? `${qtd}x no cartão` : opt.desc}
                  </span>
                </button>
              ))}
            </div>

            {forma === "credito" ? (
              <div className="mb-3">
                <label className="form-label" htmlFor="montagem-parcelas">
                  Parcelas no cartão
                </label>
                <select
                  id="montagem-parcelas"
                  className="form-select"
                  value={String(qtd)}
                  onChange={(e) => setQtdParcelas(e.target.value)}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "À vista no crédito" : `${n}x de ${formatBrl(credito.totalFinal / n)}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <p className="form-label mb-2">Condição</p>
            <div className="visitas-orc-obs-grid" role="group" aria-label="Condição de pagamento">
              {ORCAMENTO_OBS_PRESETS.map((preset) => {
                const ativo =
                  observacao.replace(/\s+/g, " ").trim() === preset.text.replace(/\s+/g, " ").trim();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`visitas-orc-obs-card${ativo ? " is-active" : ""}`}
                    title={preset.text}
                    onClick={() => setObservacao(preset.text)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <textarea
              className="form-control mt-2"
              rows={3}
              maxLength={500}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="50% de entrada, saldo na instalação, cartão em quantas vezes…"
            />
            {resumo ? <p className="small text-muted mt-2 mb-0">{resumo}</p> : null}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn visitas-orc-save-btn" disabled={saving}>
              {saving ? <Loader2 className="spin" size={18} /> : null}
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </AdminModal>
  );
}
