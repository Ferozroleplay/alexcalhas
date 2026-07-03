import { createPortal } from "react-dom";

import type { DashToastItem, DashToastVariant } from "@/lib/dash-ui-store";
import { removeDashToast } from "@/lib/dash-ui-store";

const ICON: Record<DashToastVariant, string> = {
  success: "bi-check-circle-fill",
  danger: "bi-x-circle-fill",
  warning: "bi-exclamation-triangle-fill",
  info: "bi-info-circle-fill",
};

type Props = {
  toasts: DashToastItem[];
};

export function DashToastStack({ toasts }: Props) {
  if (toasts.length === 0) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="dash-toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`dash-toast dash-toast--${t.variant}`}
          role="status"
        >
          <span className="dash-toast__icon" aria-hidden="true">
            <i className={`bi ${ICON[t.variant]}`} />
          </span>
          <p className="dash-toast__message">{t.message}</p>
          <button
            type="button"
            className="dash-toast__close"
            aria-label="Fechar"
            onClick={() => removeDashToast(t.id)}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
