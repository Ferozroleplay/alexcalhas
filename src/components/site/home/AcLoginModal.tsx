import { useEffect } from "react";

import { HOME_SITE } from "@/data/home-config";

const ERROS: Record<string, string> = {
  credenciais: "Usuário ou senha inválidos.",
  vazio: "Informe usuário e senha.",
  config: "Não foi possível criar a sessão. Reinicie o servidor.",
  servidor: "Falha ao conectar. Tente de novo.",
};

type Props = {
  open: boolean;
  onClose: () => void;
  erro?: string;
};

export function AcLoginModal({ open, onClose, erro }: Props) {
  const alert = erro ? (ERROS[erro] ?? "Não foi possível entrar.") : "";

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.classList.add("ac-login-open");
    const t = setTimeout(() => document.getElementById("ac-login-usuario")?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("ac-login-open");
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ac-login-modal is-open"
      id="ac-login-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ac-login-title"
      aria-hidden="false"
    >
      <div className="ac-login-modal__backdrop" data-ac-login-close tabIndex={-1} onClick={onClose} />
      <div className="ac-login-modal__dialog">
        <button type="button" className="ac-login-modal__close" data-ac-login-close aria-label="Fechar" onClick={onClose}>
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>
        <div className="ac-login-modal__brand">
          <img src={HOME_SITE.img.logoHeader} width={96} height={40} alt="Alex Calhas" />
        </div>
        <h2 className="ac-login-modal__title" id="ac-login-title">
          Acesso ao painel
        </h2>
        <p className="ac-login-modal__subtitle">Entre com seu usuário e senha</p>

        <div className="ac-login-modal__alert" id="ac-login-alert" role="alert" hidden={!alert}>
          {alert}
        </div>

        <form
          id="ac-login-form"
          className="ac-login-modal__form"
          method="post"
          action="/api/admin/login"
          noValidate
        >
          <div className="ac-form-group">
            <label htmlFor="ac-login-usuario">Usuário</label>
            <input
              type="text"
              id="ac-login-usuario"
              name="usuario"
              autoComplete="username"
              required
            />
          </div>
          <div className="ac-form-group">
            <label htmlFor="ac-login-senha">Senha</label>
            <input
              type="password"
              id="ac-login-senha"
              name="senha"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            className="ac-btn ac-btn--primary ac-btn--block ac-login-modal__submit"
            id="ac-login-submit"
          >
            <span className="ac-login-modal__submit-text">Entrar</span>
          </button>
        </form>
      </div>
    </div>
  );
}
