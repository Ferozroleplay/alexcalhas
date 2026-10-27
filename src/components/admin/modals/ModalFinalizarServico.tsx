import { Loader2 } from "lucide-react";
import { useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import { finalizarServico, type AgendamentoItem } from "@/lib/admin-api";
import { dashToast } from "@/lib/dash-ui";

type Props = {
  open: boolean;
  item: AgendamentoItem | null;
  onClose: () => void;
  onSaved: () => void;
};

function formatBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ModalFinalizarServico({ open, item, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState<"pagou" | "pendente" | null>(null);
  const [error, setError] = useState("");

  const valor = Number(item?.valor) || 0;
  const recebido = Number(item?.valorRecebido) || 0;
  const saldo = Number(item?.saldoPendente ?? Math.max(0, valor - recebido));

  async function confirmar(pagou: boolean) {
    if (!item || saving) return;
    setSaving(pagou ? "pagou" : "pendente");
    setError("");
    try {
      await finalizarServico(item.id, { pagou });
      dashToast(
        pagou
          ? "Serviço finalizado."
          : "Serviço finalizado. Foi para Pendências para cobrança.",
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao finalizar.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <AdminModal open={open} onClose={onClose} dialogClass="modal-md">
      <div className="modal-content">
        <div className="modal-header">
          <h5 className="modal-title">Finalizar serviço</h5>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="modal-body">
          {error ? <div className="alert alert-danger py-2">{error}</div> : null}
          <p className="mb-2">
            <strong>{item?.nome}</strong>
            {item?.id ? ` · #${item.id}` : ""}
          </p>
          <p className="small text-muted mb-3">
            Total {formatBrl(valor)}
            {saldo > 0.009
              ? ` · recebido ${formatBrl(recebido)} · falta ${formatBrl(saldo)}`
              : " · já quitado no sistema"}
          </p>
          <p className="mb-0">O cliente já pagou?</p>
        </div>
        <div className="modal-footer flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving != null}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-outline-warning"
            disabled={saving != null}
            onClick={() => void confirmar(false)}
          >
            {saving === "pendente" ? <Loader2 className="spin" size={18} /> : null}
            Não pagou
          </button>
          <button
            type="button"
            className="btn visitas-orc-save-btn"
            disabled={saving != null}
            onClick={() => void confirmar(true)}
          >
            {saving === "pagou" ? <Loader2 className="spin" size={18} /> : null}
            Já pagou
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
