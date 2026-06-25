import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  dialogClass?: string;
  /** Classe extra no backdrop e no container (ex.: z-index acima de outro modal). */
  layerClass?: string;
  /** Se false, só fecha pelo botão X ou ações explícitas (salvar/cancelar). */
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

/** Modal no estilo Bootstrap (classes do dashboard-saas.css). */
export function AdminModal({
  open,
  onClose,
  dialogClass = "modal-lg",
  layerClass = "",
  closeOnBackdrop = true,
  children,
}: Props) {
  if (!open) return null;

  const layer = layerClass.trim();

  return (
    <>
      <div
        className={`modal-backdrop fade show${layer ? ` ${layer}` : ""}`}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className={`modal fade show d-block dash-edit-modal${layer ? ` ${layer}` : ""}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={`modal-dialog modal-fullscreen-md-down modal-dialog-centered ${dialogClass}`}
        >
          {children}
        </div>
      </div>
    </>
  );
}
