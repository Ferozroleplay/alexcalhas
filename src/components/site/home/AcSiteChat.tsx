import { useEffect, useState } from "react";

import { HOME_SITE, waUrl } from "@/data/home-config";
import { fetchSiteChatPublico, type SiteChatPublico } from "@/lib/site-chat-client";

const FALLBACK: SiteChatPublico = {
  nome: HOME_SITE.chat.nome,
  cargo: HOME_SITE.chat.cargo,
  mensagem: HOME_SITE.chat.mensagem,
  foto_url: HOME_SITE.chat.foto,
};

function renderMensagem(msg: string, nome: string) {
  const parts = msg.split("{nome}");
  if (parts.length === 1) return msg;
  return parts.map((parte, i) => (
    <span key={i}>
      {parte}
      {i < parts.length - 1 ? <strong>{nome}</strong> : null}
    </span>
  ));
}

/** Widget de atendimento (estilo PHP `chat-widget.php`). */
export function AcSiteChat() {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<SiteChatPublico>(FALLBACK);

  useEffect(() => {
    let alive = true;
    void fetchSiteChatPublico()
      .then((data) => {
        if (alive && data) setChat(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onWa = () => {
    window.open(waUrl(HOME_SITE.whatsapp, HOME_SITE.whatsappMsg), "_blank", "noopener,noreferrer");
  };

  const onAgendar = () => {
    setOpen(false);
    document.getElementById("contato")?.scrollIntoView({ behavior: "smooth" });
  };

  const foto = chat.foto_url?.trim() ?? "";

  return (
    <div
      className={`ac-chat${open ? " is-open" : ""}${foto ? " ac-chat--has-photo" : ""}`}
      id="ac-chat"
      data-wa-number={HOME_SITE.whatsapp}
      data-agendar-url="/#contato"
      data-atendente={chat.nome}
    >
      <div
        className="ac-chat__panel"
        id="ac-chat-panel"
        role="dialog"
        aria-labelledby="ac-chat-title"
        aria-hidden={!open}
        hidden={!open}
      >
        <header className="ac-chat__header">
          <div className="ac-chat__agent">
            {foto ? (
              <img
                className="ac-chat__avatar"
                src={foto}
                alt=""
                width={48}
                height={48}
                aria-hidden="true"
              />
            ) : (
              <span className="ac-chat__avatar ac-chat__avatar--initials" aria-hidden="true">
                {chat.nome.charAt(0)}
              </span>
            )}
            <span className="ac-chat__status" aria-hidden="true" />
          </div>
          <div className="ac-chat__header-text">
            <h2 id="ac-chat-title" className="ac-chat__title">
              {chat.nome}
            </h2>
            <p className="ac-chat__subtitle">
              {chat.cargo} · online agora
            </p>
          </div>
          <button type="button" className="ac-chat__close" id="ac-chat-close" aria-label="Fechar chat" onClick={() => setOpen(false)}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>
        <div className="ac-chat__body">
          <div className="ac-chat__thread">
            <article className="ac-chat__bubble ac-chat__bubble--in">
              <p className="ac-chat__bubble-text">{renderMensagem(chat.mensagem, chat.nome)}</p>
              <time className="ac-chat__bubble-time" dateTime={new Date().toISOString()}>
                Agora
              </time>
            </article>
            <p className="ac-chat__hint" id="ac-chat-hint">
              Escolha uma opção abaixo.
            </p>
            <div className="ac-chat__pills" id="ac-chat-pills">
              <button type="button" className="ac-chat__pill" data-flow="whatsapp" onClick={onWa}>
                Falar no WhatsApp
              </button>
              <button type="button" className="ac-chat__pill" data-flow="orcamento" onClick={onAgendar}>
                Agendar visita
              </button>
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="ac-chat__toggle"
        id="ac-chat-toggle"
        aria-expanded={open}
        aria-controls="ac-chat-panel"
        aria-label={`Falar com ${chat.nome}`}
        onClick={() => setOpen((v) => !v)}
      >
        {foto ? (
          <img className="ac-chat__toggle-photo" src={foto} alt="" width={58} height={58} />
        ) : (
          <i className="bi bi-chat-dots-fill ac-chat__icon-open" aria-hidden="true" />
        )}
        <i className="bi bi-x-lg ac-chat__icon-close" aria-hidden="true" />
        <span className="ac-chat__toggle-badge" aria-hidden="true" />
      </button>
    </div>
  );
}
