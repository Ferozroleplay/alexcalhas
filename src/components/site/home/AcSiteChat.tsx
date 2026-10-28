import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { HOME_SITE, waUrl } from "@/data/home-config";
import {
  enviarMensagemPoliane,
  fetchSiteChatPublico,
  type PolianeFicha,
  type PolianePill,
  type SiteChatPublico,
} from "@/lib/site-chat-client";

const FALLBACK: SiteChatPublico = {
  nome: HOME_SITE.chat.nome,
  cargo: HOME_SITE.chat.cargo,
  mensagem: HOME_SITE.chat.mensagem,
  foto_url: HOME_SITE.chat.foto,
};

type Msg = { id: number; from: "in" | "out"; text: string };

function renderMensagem(msg: string, nome: string): ReactNode {
  const withNome = msg.split("{nome}");
  if (withNome.length === 1) return formatNegrito(msg);
  return withNome.map((parte, i) => (
    <span key={i}>
      {formatNegrito(parte)}
      {i < withNome.length - 1 ? <strong>{nome}</strong> : null}
    </span>
  ));
}

function formatNegrito(msg: string): ReactNode {
  const parts = msg.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return msg;
  return parts.map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{p}</span>;
  });
}

function horaAgora(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function jitter(ms: number): number {
  return Math.round(ms * (0.82 + Math.random() * 0.36));
}

function tempoLeitura(texto: string): number {
  return jitter(Math.min(900, 380 + texto.trim().length * 14));
}

function tempoDigitando(texto: string): number {
  const chars = texto.replace(/\s+/g, " ").trim().length;
  return jitter(Math.min(2200, Math.max(600, 380 + chars * 26)));
}

function partirFalas(texto: string): string[] {
  const partes = texto.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  if (partes.length <= 1) return [texto.trim()].filter(Boolean);
  const out: string[] = [];
  for (const p of partes) {
    if (out.length && p.length < 28 && !/^[📍📋👤📞🔧📅🕒📌]/.test(p)) {
      out[out.length - 1] += `\n\n${p}`;
    } else {
      out.push(p);
    }
  }
  return out.slice(0, 4);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Widget de atendimento — Poliane agenda no sistema. */
export function AcSiteChat() {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<SiteChatPublico>(FALLBACK);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ficha, setFicha] = useState<PolianeFicha>({});
  const [pills, setPills] = useState<PolianePill[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fase, setFase] = useState<null | "lendo" | "digitando">(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const seq = useRef(1);

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

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [msgs, pills, enviando, fase, open]);

  const abrirWa = (extra?: string) => {
    const msg = extra?.trim()
      ? extra
      : HOME_SITE.whatsappMsg;
    window.open(waUrl(HOME_SITE.whatsapp, msg), "_blank", "noopener,noreferrer");
  };

  async function enviar(raw: string) {
    const mensagem = raw.trim();
    if (!mensagem || enviando) return;
    if (mensagem === "__whatsapp__") {
      abrirWa();
      return;
    }
    const idOut = seq.current++;
    setMsgs((m) => [...m, { id: idOut, from: "out", text: mensagem }]);
    setTexto("");
    setPills([]);
    setEnviando(true);
    setFase("lendo");
    try {
      const [res] = await Promise.all([
        enviarMensagemPoliane(mensagem, ficha),
        esperar(tempoLeitura(mensagem)),
      ]);
      const falas = partirFalas(res.reply);
      setFicha(res.ficha ?? {});
      for (let i = 0; i < falas.length; i++) {
        setFase("digitando");
        await esperar(tempoDigitando(falas[i]));
        const fala = falas[i];
        setMsgs((m) => [...m, { id: seq.current++, from: "in", text: fala }]);
        if (i < falas.length - 1) {
          setFase("lendo");
          await esperar(jitter(280));
        }
      }
      setPills(res.pills ?? []);
    } catch (e) {
      setFase("digitando");
      await esperar(jitter(700));
      setMsgs((m) => [
        ...m,
        {
          id: seq.current++,
          from: "in",
          text:
            e instanceof Error
              ? e.message
              : "Não consegui concluir agora. Pode falar com a equipe no WhatsApp.",
        },
      ]);
      setPills([{ label: "Falar no WhatsApp", value: "__whatsapp__" }]);
    } finally {
      setFase(null);
      setEnviando(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void enviar(texto);
  }

  const foto = chat.foto_url?.trim() ?? "";

  return (
    <div
      className={`ac-chat${open ? " is-open" : ""}${foto ? " ac-chat--has-photo" : ""}`}
      id="ac-chat"
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
              <img className="ac-chat__avatar" src={foto} alt="" width={48} height={48} aria-hidden="true" />
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
              {fase === "digitando" ? "digitando…" : `${chat.cargo} · online agora`}
            </p>
          </div>
          <button type="button" className="ac-chat__close" aria-label="Fechar chat" onClick={() => setOpen(false)}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>
        <div className="ac-chat__body" ref={threadRef}>
          <div className="ac-chat__thread">
            {partirFalas(chat.mensagem).map((fala, i) => (
              <article key={`hi-${i}`} className="ac-chat__bubble ac-chat__bubble--in">
                <p className="ac-chat__bubble-text">{renderMensagem(fala, chat.nome)}</p>
                <time className="ac-chat__bubble-time">{horaAgora()}</time>
              </article>
            ))}
            {msgs.map((m) => (
              <article key={m.id} className={`ac-chat__bubble ac-chat__bubble--${m.from}`}>
                <p className="ac-chat__bubble-text">{formatNegrito(m.text)}</p>
                <time className="ac-chat__bubble-time">{horaAgora()}</time>
              </article>
            ))}
            {fase === "digitando" ? (
              <div className="ac-chat__typing" aria-label="Digitando">
                <span />
                <span />
                <span />
              </div>
            ) : null}
            {pills.length > 0 && !enviando ? (
              <div className="ac-chat__pills">
                {pills.map((p) => (
                  <button key={`${p.label}-${p.value}`} type="button" className="ac-chat__pill" onClick={() => void enviar(p.value)}>
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <form className="ac-chat__composer" onSubmit={onSubmit}>
          <label className="visually-hidden" htmlFor="ac-chat-input">
            Mensagem
          </label>
          <input
            id="ac-chat-input"
            className="ac-chat__input"
            type="text"
            autoComplete="off"
            placeholder="Escreva sua mensagem…"
            value={texto}
            disabled={enviando}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="ac-chat__send" aria-label="Enviar" disabled={enviando || !texto.trim()}>
            <i className="bi bi-send-fill" aria-hidden="true" />
          </button>
        </form>
      </div>
      <button
        type="button"
        className="ac-chat__toggle"
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
