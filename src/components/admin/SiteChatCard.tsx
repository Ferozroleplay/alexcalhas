import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  enviarFotoSiteChat,
  fetchSiteChatAdmin,
  restaurarFotoSiteChat,
  salvarSiteChat,
  type SiteChatPublico,
} from "@/lib/site-chat-client";

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

export function SiteChatCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [chat, setChat] = useState<SiteChatPublico | null>(null);
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [fotoBusy, setFotoBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchSiteChatAdmin()
      .then((data) => {
        if (!alive) return;
        setChat(data);
        setNome(data.nome);
        setCargo(data.cargo);
        setMensagem(data.mensagem);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErro(e instanceof Error ? e.message : "Erro ao carregar o chat.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onSalvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setOk("");
    try {
      const data = await salvarSiteChat({ nome, cargo, mensagem });
      setChat(data);
      setNome(data.nome);
      setCargo(data.cargo);
      setMensagem(data.mensagem);
      setOk("Atendente do site atualizado.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function onFoto(file: File | null) {
    if (!file) return;
    setFotoBusy(true);
    setErro("");
    setOk("");
    try {
      const data = await enviarFotoSiteChat(file);
      setChat(data);
      setOk("Foto atualizada.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setFotoBusy(false);
    }
  }

  async function onRestaurarFoto() {
    setFotoBusy(true);
    setErro("");
    setOk("");
    try {
      const data = await restaurarFotoSiteChat();
      setChat(data);
      setOk("Foto padrão restaurada.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível restaurar a foto.");
    } finally {
      setFotoBusy(false);
    }
  }

  const previewNome = nome.trim() || "Atendente";
  const previewCargo = cargo.trim() || "Atendimento";
  const previewMsg = mensagem.trim() || "Oi! Em que posso te ajudar hoje?";
  const previewFoto = chat?.foto_url ?? "";

  return (
    <section className="empresa-card empresa-chat">
      <header className="empresa-card__head">
        <span className="empresa-card__icon" aria-hidden="true">
          <i className="bi bi-chat-heart" />
        </span>
        <div>
          <h2 className="empresa-card__title">Atendente do site</h2>
          <p className="empresa-card__desc">
            Foto, nome e mensagem do chat que aparece no canto do site.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="empresa-chat__status">Carregando…</p>
      ) : (
        <form className="empresa-chat__layout" onSubmit={(e) => void onSalvar(e)}>
          <div className="empresa-chat__photo">
            <div className="empresa-chat__avatar-wrap">
              {previewFoto ? (
                <img src={previewFoto} alt="" className="empresa-chat__avatar" />
              ) : (
                <span className="empresa-chat__avatar empresa-chat__avatar--fallback">
                  {previewNome.charAt(0)}
                </span>
              )}
              <span className="empresa-chat__online" aria-hidden="true" />
            </div>
            <input
              ref={fileRef}
              type="file"
              className="visually-hidden"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                void onFoto(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="empresa-chat__photo-btn"
              disabled={fotoBusy}
              onClick={() => fileRef.current?.click()}
            >
              {fotoBusy ? "Enviando…" : "Trocar foto"}
            </button>
            <button
              type="button"
              className="empresa-chat__photo-btn empresa-chat__photo-btn--ghost"
              disabled={fotoBusy}
              onClick={() => void onRestaurarFoto()}
            >
              Foto padrão
            </button>
          </div>

          <div className="empresa-chat__fields">
            <div className="empresa-fields">
              <label className="empresa-field">
                <span className="empresa-field__label">Nome do atendente</span>
                <input
                  className="form-control empresa-input"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              <label className="empresa-field">
                <span className="empresa-field__label">Cargo</span>
                <input
                  className="form-control empresa-input"
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  maxLength={120}
                  placeholder="Atendimento Alex Calhas"
                />
              </label>
              <label className="empresa-field empresa-field--full">
                <span className="empresa-field__label">Mensagem de boas-vindas</span>
                <textarea
                  className="form-control empresa-input"
                  rows={3}
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  maxLength={500}
                  required
                />
                <small className="empresa-chat__hint">
                  Use {"{nome}"} para colocar o nome em destaque na mensagem.
                </small>
              </label>
            </div>

            <div className="empresa-chat__preview" aria-hidden="true">
              <p className="empresa-chat__preview-label">Prévia no site</p>
              <div className="empresa-chat__bubble-preview">
                <div className="empresa-chat__bubble-head">
                  {previewFoto ? <img src={previewFoto} alt="" /> : null}
                  <div>
                    <strong>{previewNome}</strong>
                    <span>{previewCargo} · online agora</span>
                  </div>
                </div>
                <p>{renderMensagem(previewMsg, previewNome)}</p>
              </div>
            </div>

            {erro ? <p className="empresa-chat__erro">{erro}</p> : null}
            {ok ? <p className="empresa-chat__ok">{ok}</p> : null}

            <button type="submit" className="empresa-chat__save" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar atendente"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
