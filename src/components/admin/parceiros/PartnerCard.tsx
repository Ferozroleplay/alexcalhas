import { useState } from "react";

import { formatarTelefone } from "@/lib/format-br";
import type { ParceiroItem } from "@/lib/parceiros-client";

type Props = {
  parceiro: ParceiroItem;
  onEdit: () => void;
  onDelete: () => void;
};

export function PartnerCard({ parceiro, onEdit, onDelete }: Props) {
  const [src, setSrc] = useState(parceiro.logo_url);
  const wa = parceiro.whatsapp?.replace(/^55/, "") ?? "";

  return (
    <article className="parceiros-partner-card">
      <div className="parceiros-partner-card__visual">
        <span
          className={`parceiros-partner-card__badge parceiros-partner-card__badge--${parceiro.ativo ? "on" : "off"}`}
        >
          {parceiro.ativo ? "Na home" : "Oculto"}
        </span>
        {src ? (
          <img
            src={src}
            alt=""
            className="parceiros-partner-card__logo"
            onError={() => setSrc("")}
          />
        ) : (
          <span className="parceiros-partner-card__logo-placeholder" aria-hidden="true">
            <i className="bi bi-building" />
          </span>
        )}
      </div>

      <div className="parceiros-partner-card__body">
        <h3 className="parceiros-partner-card__name">{parceiro.nome}</h3>
        {wa ? (
          <a
            href={`https://wa.me/${parceiro.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="parceiros-partner-card__wa"
          >
            <i className="bi bi-whatsapp" aria-hidden="true" />
            {formatarTelefone(wa)}
          </a>
        ) : (
          <p className="parceiros-partner-card__wa parceiros-partner-card__wa--empty">Sem WhatsApp</p>
        )}
      </div>

      <footer className="parceiros-partner-card__footer">
        <button type="button" className="parceiros-btn parceiros-btn--secondary" onClick={onEdit}>
          <i className="bi bi-pencil" aria-hidden="true" />
          Editar
        </button>
        <button type="button" className="parceiros-btn parceiros-btn--danger" onClick={onDelete}>
          <i className="bi bi-trash" aria-hidden="true" />
          Excluir
        </button>
      </footer>
    </article>
  );
}
