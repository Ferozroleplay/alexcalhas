import { useEffect } from "react";
import { createPortal } from "react-dom";

import { HOME_SITE, waUrl } from "@/data/home-config";

type Props = {
  open: boolean;
  onClose: () => void;
  nome?: string;
  dataVisita?: string;
  horaVisita?: string;
};

function formatDataVisita(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function getAgendarPortalRoot(): HTMLElement {
  if (typeof document === "undefined") {
    return null as unknown as HTMLElement;
  }
  let root = document.getElementById("ac-agendar-portal");
  if (!root) {
    root = document.createElement("div");
    root.id = "ac-agendar-portal";
    document.body.appendChild(root);
  }
  return root;
}

export function AcAgendarSucessoModal({ open, onClose, nome, dataVisita, horaVisita }: Props) {
  useEffect(() => {
    if (!open) return;

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.body.classList.add("ac-agendar-sucesso-open");
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.classList.remove("ac-agendar-sucesso-open");
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const primeiroNome = nome?.trim().split(/\s+/)[0];
  const dataFmt = dataVisita ? formatDataVisita(dataVisita) : "";
  const horaFmt = horaVisita?.trim() ?? "";

  return createPortal(
    <div
      className="ac-agendar-sucesso is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ac-agendar-sucesso-title"
    >
      <div className="ac-agendar-sucesso__backdrop" aria-hidden="true" onClick={onClose} />
      <div className="ac-agendar-sucesso__dialog">
        <button type="button" className="ac-agendar-sucesso__close" aria-label="Fechar" onClick={onClose}>
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>

        <div className="ac-agendar-sucesso__hero" aria-hidden="true">
          <span className="ac-agendar-sucesso__icon-wrap">
            <i className="bi bi-calendar-check" />
          </span>
        </div>

        <div className="ac-agendar-sucesso__body">
          <p className="ac-agendar-sucesso__kicker">Tudo certo!</p>
          <h2 className="ac-agendar-sucesso__title" id="ac-agendar-sucesso-title">
            {primeiroNome ? `${primeiroNome}, sua visita foi agendada` : "Sua visita foi agendada"}
          </h2>
          <p className="ac-agendar-sucesso__text">
            Recebemos sua solicitação com sucesso. Em breve um profissional da{" "}
            <strong>Alex Calhas</strong> entrará em contato para confirmar os detalhes
            {dataFmt ? (
              <>
                {" "}
                da visita em <strong>{dataFmt}</strong>
                {horaFmt ? (
                  <>
                    {" "}
                    às <strong>{horaFmt}</strong>
                  </>
                ) : null}
              </>
            ) : null}
            .
          </p>

          <ul className="ac-agendar-sucesso__steps">
            <li>
              <span className="ac-agendar-sucesso__step-num">1</span>
              <span>Pedido registrado no sistema</span>
            </li>
            <li>
              <span className="ac-agendar-sucesso__step-num">2</span>
              <span>Nossa equipe analisa sua solicitação</span>
            </li>
            <li>
              <span className="ac-agendar-sucesso__step-num">3</span>
              <span>Um profissional entra em contato com você</span>
            </li>
          </ul>

          <button
            type="button"
            className="ac-btn ac-btn--primary ac-btn--block ac-agendar-sucesso__btn"
            onClick={onClose}
          >
            Entendi, obrigado!
          </button>

          <p className="ac-agendar-sucesso__wa">
            Precisa falar agora?{" "}
            <a href={waUrl(HOME_SITE.whatsapp, HOME_SITE.whatsappMsg)} target="_blank" rel="noopener noreferrer">
              Chamar no WhatsApp
            </a>
          </p>
        </div>
      </div>
    </div>,
    getAgendarPortalRoot(),
  );
}
