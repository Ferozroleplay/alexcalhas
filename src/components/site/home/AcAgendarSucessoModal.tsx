import { useEffect } from "react";

import { HOME_SITE, waUrl } from "@/data/home-config";

type Props = {
  open: boolean;
  onClose: () => void;
  nome?: string;
  dataVisita?: string;
};

function formatDataVisita(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function AcAgendarSucessoModal({ open, onClose, nome, dataVisita }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.classList.add("ac-agendar-sucesso-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("ac-agendar-sucesso-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const primeiroNome = nome?.trim().split(/\s+/)[0];
  const dataFmt = dataVisita ? formatDataVisita(dataVisita) : "";

  return (
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
            {dataFmt ? <> da visita em <strong>{dataFmt}</strong></> : null}.
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

          <button type="button" className="ac-btn ac-btn--primary ac-btn--block ac-agendar-sucesso__btn" onClick={onClose}>
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
    </div>
  );
}
