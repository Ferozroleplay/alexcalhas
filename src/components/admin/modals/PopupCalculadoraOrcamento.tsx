import { useEffect, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import { CalculadoraBobinaWidget } from "@/components/admin/CalculadoraBobinaWidget";
import { formatBrl } from "@/lib/calculadora-bobina";
import { dashToast } from "@/lib/dash-ui";
import type { OrcamentoLinha } from "@/lib/orcamento.server";

type Props = {
  open: boolean;
  onClose: () => void;
  onImportar: (linhas: OrcamentoLinha[]) => void;
};

export function PopupCalculadoraOrcamento({ open, onClose, onImportar }: Props) {
  const [custoCm2, setCustoCm2] = useState(0);
  const [importOk, setImportOk] = useState("");

  useEffect(() => {
    if (!open) setImportOk("");
  }, [open]);

  function handleImportar(linhas: OrcamentoLinha[]) {
    onImportar(linhas);
    const n = linhas.length;
    const msg =
      n === 1 ? "Item adicionado ao orçamento!" : `${n} itens adicionados ao orçamento!`;
    dashToast(msg, "success");
    setImportOk(msg);
    window.setTimeout(() => setImportOk(""), 3500);
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      layerClass="visitas-orc-calculadora-layer"
      dialogClass="visitas-orc-calculadora-modal__dialog modal-xl"
    >
      <div className="modal-content visitas-orc-calculadora-modal">
        <div className="modal-header visitas-orc-calculadora-modal__header flex-shrink-0">
          <button
            type="button"
            className="btn-close visitas-orc-calculadora-modal__close"
            aria-label="Fechar"
            onClick={onClose}
          />
          <div className="visitas-orc-calculadora-modal__head">
            <span className="visitas-orc-calculadora-modal__icon" aria-hidden="true">
              <i className="bi bi-calculator" />
            </span>
            <div className="visitas-orc-calculadora-modal__head-text">
              <h5 className="modal-title mb-0">Calculadora de bobina</h5>
              <p className="visitas-orc-calculadora-modal__subtitle mb-0">
                Calcule os cortes e importe os itens para o orçamento.
              </p>
            </div>
          </div>
          <div
            className="metric-card metric-card--static metric-card--finance visitas-orc-calculadora-modal__custo-card"
            aria-live="polite"
          >
            <div className="metric-card__top">
              <span className="metric-card__label">Custo por cm²</span>
              <span className="metric-card__icon metric-card__icon--green" aria-hidden="true">
                <i className="bi bi-aspect-ratio" />
              </span>
            </div>
            <div className="metric-card__value">{formatBrl(custoCm2)}</div>
            <span className="metric-card__hint">Base para calcular o custo total de cada corte</span>
          </div>
        </div>
        {importOk ? (
          <div className="visitas-orc-calculadora-modal__import-ok" role="status">
            <i className="bi bi-check-circle-fill" aria-hidden="true" />
            <span>{importOk}</span>
          </div>
        ) : null}
        <div className="modal-body visitas-orc-calculadora-modal__body p-0">
          <CalculadoraBobinaWidget
            variant="modal"
            idPrefix="orc-bobina"
            onImportarOrcamento={handleImportar}
            onCustoCm2Change={setCustoCm2}
          />
        </div>
      </div>
    </AdminModal>
  );
}
