import { useEffect, useMemo, useRef, useState } from "react";

import { DashPageHero } from "@/components/admin/DashPageHero";
import { aplicarAvisoCliente, AVISO_MODELOS } from "@/lib/aviso-clientes";
import { fetchClientesAviso, type ClienteAviso } from "@/lib/clientes-client";
import { dashAlert, dashConfirm } from "@/lib/dash-ui";
import { formatarTelefone } from "@/lib/format-br";
import { abrirJanelaAvisoFila, abrirWhatsappComTexto, abrirWhatsappFila, fecharJanelaAvisoFila } from "@/lib/whatsapp-orcamento";

const JANELA_WA = "alexcalhas_aviso";
const INTERVALOS_SEG = [6, 8, 10, 12, 15, 20] as const;

function chaveTel(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.replace(/^0+/, "");
}

function minutosEstimados(qtd: number, intervaloSeg: number): number {
  return Math.max(1, Math.ceil((qtd * intervaloSeg) / 60));
}

export function AvisosPage() {
  const [itens, setItens] = useState<ClienteAviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState(AVISO_MODELOS[0].texto);
  const [busca, setBusca] = useState("");
  const [indice, setIndice] = useState(0);
  const [enviados, setEnviados] = useState<Set<string>>(() => new Set());
  const [intervaloSeg, setIntervaloSeg] = useState(10);
  const [rodando, setRodando] = useState(false);
  const [contaRegressiva, setContaRegressiva] = useState<number | null>(null);
  const [bloqueado, setBloqueado] = useState(false);

  const rodandoRef = useRef(false);
  const indiceRef = useRef(0);
  const enviadosRef = useRef(enviados);
  const textoRef = useRef(texto);
  const intervaloRef = useRef(intervaloSeg);
  const filtradosRef = useRef<ClienteAviso[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    void fetchClientesAviso()
      .then((data) => {
        if (!vivo) return;
        setItens(data.itens);
        setErro("");
      })
      .catch((e) => {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : "Não foi possível carregar os clientes.");
        setItens([]);
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = busca.replace(/\D/g, "");
    if (!q) return itens;
    return itens.filter((c) => {
      const nome = c.nome.toLowerCase();
      const tel = c.telefone.replace(/\D/g, "");
      return nome.includes(q) || (qDigits.length >= 3 && tel.includes(qDigits));
    });
  }, [itens, busca]);

  const atual = filtrados[indice] ?? filtrados[0] ?? null;
  const chaveAtual = atual ? chaveTel(atual.telefone) : "";
  const preview = atual ? aplicarAvisoCliente(texto, atual.nome) : aplicarAvisoCliente(texto, "cliente");
  const enviadosN = [...enviados].filter((k) => filtrados.some((c) => chaveTel(c.telefone) === k)).length;
  const restantesN = filtrados.length - enviadosN;

  useEffect(() => {
    indiceRef.current = indice;
  }, [indice]);
  useEffect(() => {
    enviadosRef.current = enviados;
  }, [enviados]);
  useEffect(() => {
    textoRef.current = texto;
  }, [texto]);
  useEffect(() => {
    intervaloRef.current = intervaloSeg;
  }, [intervaloSeg]);
  useEffect(() => {
    filtradosRef.current = filtrados;
  }, [filtrados]);

  useEffect(() => {
    if (indice >= filtrados.length) setIndice(0);
  }, [filtrados.length, indice]);

  useEffect(() => {
    return () => {
      pararTimers();
      rodandoRef.current = false;
    };
  }, []);

  function pararTimers() {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function pararFila() {
    rodandoRef.current = false;
    setRodando(false);
    setBloqueado(false);
    setContaRegressiva(null);
    pararTimers();
  }

  function proximoNaoEnviado(from: number): number {
    const list = filtradosRef.current;
    if (list.length === 0) return -1;
    for (let step = 0; step < list.length; step++) {
      const i = (from + step) % list.length;
      if (!enviadosRef.current.has(chaveTel(list[i].telefone))) return i;
    }
    return -1;
  }

  function dispararIndice(i: number, modo: "fila" | "unico"): "ok" | "bloqueado" | "invalido" {
    const c = filtradosRef.current[i];
    if (!c) return "invalido";
    const msg = aplicarAvisoCliente(textoRef.current, c.nome);
    const abriu =
      modo === "fila"
        ? abrirWhatsappFila(c.telefone, msg, c.nome)
        : abrirWhatsappComTexto(c.telefone, msg, JANELA_WA);
    setIndice(i);
    if (!abriu) return "bloqueado";
    setEnviados((prev) => new Set(prev).add(chaveTel(c.telefone)));
    return "ok";
  }

  function agendarProximo() {
    pararTimers();
    if (!rodandoRef.current) return;
    const next = proximoNaoEnviado(indiceRef.current + 1);
    if (next < 0) {
      pararFila();
      void dashAlert({
        title: "Fila concluída",
        message: "Todos os clientes da lista já tiveram o WhatsApp aberto.",
        variant: "success",
      });
      return;
    }
    const totalMs = intervaloRef.current * 1000;
    const inicio = Date.now();
    setContaRegressiva(intervaloRef.current);
    tickRef.current = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((totalMs - (Date.now() - inicio)) / 1000));
      setContaRegressiva(left);
    }, 200);
    timeoutRef.current = window.setTimeout(() => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (!rodandoRef.current) return;
      const status = dispararIndice(next, "fila");
      if (status === "bloqueado") {
        rodandoRef.current = false;
        setRodando(false);
        setBloqueado(true);
        setContaRegressiva(null);
        return;
      }
      agendarProximo();
    }, totalMs);
  }

  function irPara(delta: number) {
    if (filtrados.length === 0 || rodandoRef.current) return;
    setIndice((i) => (i + delta + filtrados.length) % filtrados.length);
  }

  function enviarAtual() {
    if (!atual) return;
    if (!texto.trim()) {
      void dashAlert({ message: "Escreva a mensagem antes de enviar.", variant: "warning" });
      return;
    }
    const i = filtrados.indexOf(atual);
    const status = dispararIndice(i < 0 ? indice : i, "unico");
    if (status === "bloqueado") {
      void dashAlert({
        message: "O navegador bloqueou o WhatsApp. Permita pop-ups nesta página.",
        variant: "warning",
      });
      return;
    }
    if (!rodandoRef.current && filtrados.length > 1) {
      setTimeout(() => irPara(1), 250);
    }
  }

  async function iniciarTodos() {
    if (rodandoRef.current) return;
    if (!texto.trim()) {
      void dashAlert({ message: "Escreva a mensagem antes de enviar.", variant: "warning" });
      return;
    }
    if (filtrados.length === 0) return;
    const falta = filtrados.filter((c) => !enviados.has(chaveTel(c.telefone))).length;
    if (falta === 0) {
      void dashAlert({ message: "Todos desta lista já foram abertos.", variant: "info" });
      return;
    }
    if (!abrirJanelaAvisoFila()) {
      void dashAlert({
        title: "Permita a janela",
        message: "O navegador bloqueou. Clique no ícone de pop-up na barra de endereço, permita neste site, e tente de novo. É só uma janela — o resto troca nela.",
        variant: "warning",
      });
      return;
    }
    const ok = await dashConfirm({
      title: "Enviar para todos?",
      message: `Abre o WhatsApp de ${falta} clientes, um a cada ${intervaloSeg} segundos (cerca de ${minutosEstimados(falta, intervaloSeg)} min). Em cada conversa você clica Enviar. Pode pausar a qualquer hora.`,
      confirmText: "Começar agora",
      cancelText: "Cancelar",
      variant: "primary",
      icon: "bi-whatsapp",
      hint: "Usa o WhatsApp instalado no computador. Na primeira vez, permita abrir o aplicativo.",
    });
    if (!ok) {
      fecharJanelaAvisoFila();
      return;
    }
    const start = proximoNaoEnviado(indice);
    if (start < 0) return;
    rodandoRef.current = true;
    setRodando(true);
    setBloqueado(false);
    const status = dispararIndice(start, "fila");
    if (status === "bloqueado") {
      pararFila();
      void dashAlert({
        message: "Telefone inválido. Pule este cliente e clique em Continuar.",
        variant: "warning",
      });
      return;
    }
    agendarProximo();
  }

  function continuarFila() {
    if (rodandoRef.current) return;
    if (!texto.trim()) {
      void dashAlert({ message: "Escreva a mensagem antes de enviar.", variant: "warning" });
      return;
    }
    const start = proximoNaoEnviado(indice);
    if (start < 0) {
      void dashAlert({ message: "Todos desta lista já foram abertos.", variant: "info" });
      return;
    }
    if (!abrirJanelaAvisoFila()) {
      setBloqueado(true);
      void dashAlert({
        title: "Permita a janela",
        message: "O navegador bloqueou. Clique no ícone de pop-up na barra de endereço, permita neste site, e clique em Continuar.",
        variant: "warning",
      });
      return;
    }
    rodandoRef.current = true;
    setRodando(true);
    setBloqueado(false);
    const status = dispararIndice(start, "fila");
    if (status === "bloqueado") {
      rodandoRef.current = false;
      setRodando(false);
      setBloqueado(true);
      return;
    }
    agendarProximo();
  }

  async function copiar(textoCopia: string, ok: string) {
    try {
      await navigator.clipboard.writeText(textoCopia);
      void dashAlert({ message: ok, variant: "success" });
    } catch {
      void dashAlert({ message: "Não deu para copiar. Selecione o texto na tela.", variant: "warning" });
    }
  }

  return (
    <div className="analytics-page dash-form-page--pro avisos-page">
      <DashPageHero
        title="Avisos aos clientes"
        subtitle="Escreve o recado e manda no WhatsApp do computador, um cliente após o outro. Deixe a janelinha aberta e clique Enviar em cada conversa."
        iconClass="bi-megaphone"
        accent="clientes"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header">
        {erro ? (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        ) : null}

        <div className="avisos-grid">
          <section className="dash-form-card avisos-card">
            <header className="avisos-card__head">
              <p className="avisos-kicker">Mensagem</p>
              <h2>O que vai no WhatsApp</h2>
            </header>
            <div className="avisos-modelos" role="group" aria-label="Modelos">
              {AVISO_MODELOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`avisos-modelo${texto === m.texto ? " is-on" : ""}`}
                  onClick={() => setTexto(m.texto)}
                  disabled={rodando}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <label className="avisos-label" htmlFor="aviso-texto">
              Texto <span>use {"{nome}"} e {"{saudacao}"}</span>
            </label>
            <textarea
              id="aviso-texto"
              rows={9}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={rodando}
            />
            <p className="avisos-label">Prévia para {atual ? atual.nome.split(/\s+/)[0] : "o cliente"}</p>
            <pre className="avisos-preview">{preview}</pre>
            <div className="avisos-actions">
              <button type="button" className="analytics-btn analytics-btn--outline" onClick={() => void copiar(preview, "Mensagem copiada.")}>
                Copiar mensagem
              </button>
              <button
                type="button"
                className="analytics-btn analytics-btn--outline"
                onClick={() =>
                  void copiar(
                    filtrados.map((c) => c.telefone.replace(/\D/g, "")).join("\n"),
                    `${filtrados.length} números copiados.`,
                  )
                }
                disabled={filtrados.length === 0}
              >
                Copiar números
              </button>
            </div>
          </section>

          <section className="dash-form-card avisos-card">
            <header className="avisos-card__head avisos-card__head--row">
              <div>
                <p className="avisos-kicker">Fila</p>
                <h2>
                  {loading ? "Carregando…" : `${enviadosN} de ${filtrados.length} enviados`}
                </h2>
              </div>
            </header>

            <div className="avisos-auto">
              <p className="avisos-label" id="aviso-intervalo-label">
                Intervalo entre cada envio
              </p>
              <div className="avisos-intervalos" role="group" aria-labelledby="aviso-intervalo-label">
                {INTERVALOS_SEG.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`avisos-modelo${intervaloSeg === s ? " is-on" : ""}`}
                    onClick={() => setIntervaloSeg(s)}
                  >
                    {s}s
                  </button>
                ))}
              </div>
              <p className="avisos-auto__hint">
                {restantesN > 0
                  ? `${restantesN} restantes · cerca de ${minutosEstimados(restantesN, intervaloSeg)} min`
                  : loading
                    ? "Buscando telefones…"
                    : "Ninguém pendente nesta lista"}
              </p>
              <div className="avisos-actions avisos-actions--fila">
                {rodando ? (
                  <button type="button" className="analytics-btn analytics-btn--outline" onClick={pararFila}>
                    Pausar
                  </button>
                ) : bloqueado || enviadosN > 0 ? (
                  <button
                    type="button"
                    className="analytics-btn analytics-btn--primary"
                    onClick={continuarFila}
                    disabled={restantesN === 0 || !texto.trim()}
                  >
                    <i className="bi bi-whatsapp" aria-hidden="true" /> Continuar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="analytics-btn analytics-btn--primary"
                    onClick={() => void iniciarTodos()}
                    disabled={filtrados.length === 0 || !texto.trim()}
                  >
                    <i className="bi bi-whatsapp" aria-hidden="true" /> Enviar para todos
                  </button>
                )}
                {enviadosN > 0 && !rodando ? (
                  <button type="button" className="analytics-btn analytics-btn--outline" onClick={() => setEnviados(new Set())}>
                    Zerar marcados
                  </button>
                ) : null}
              </div>
              {rodando && contaRegressiva != null ? (
                <p className="avisos-auto__cd" role="status">
                  Próximo em <strong>{contaRegressiva}s</strong> — clique Enviar no WhatsApp
                </p>
              ) : bloqueado ? (
                <p className="avisos-auto__cd avisos-auto__cd--warn" role="status">
                  Não abriu. Clique em Continuar e permita o WhatsApp se o navegador perguntar.
                </p>
              ) : (
                <p className="avisos-auto__hint">
                  Abre uma janelinha e troca o cliente nela. Precisa do WhatsApp neste computador — na primeira vez, permita abrir o aplicativo.
                </p>
              )}
            </div>

            <label className="avisos-label" htmlFor="aviso-busca">
              Buscar na lista
            </label>
            <input
              id="aviso-busca"
              type="search"
              placeholder="Nome ou telefone"
              value={busca}
              disabled={rodando}
              onChange={(e) => {
                setBusca(e.target.value);
                setIndice(0);
              }}
            />

            {atual ? (
              <div className="avisos-atual">
                <p className="avisos-atual__nome">{atual.nome}</p>
                <p className="avisos-atual__tel">{formatarTelefone(atual.telefone)}</p>
                <p className="avisos-atual__pos">
                  {Math.min(indice + 1, filtrados.length)} / {filtrados.length}
                  {enviados.has(chaveAtual) ? " · já aberto" : ""}
                </p>
                <div className="avisos-actions avisos-actions--fila">
                  <button type="button" className="analytics-btn analytics-btn--outline" onClick={() => irPara(-1)} disabled={rodando || filtrados.length < 2}>
                    Anterior
                  </button>
                  <button type="button" className="analytics-btn analytics-btn--primary" onClick={enviarAtual} disabled={rodando}>
                    <i className="bi bi-whatsapp" aria-hidden="true" /> Enviar no WhatsApp
                  </button>
                  <button type="button" className="analytics-btn analytics-btn--outline" onClick={() => irPara(1)} disabled={rodando || filtrados.length < 2}>
                    Próximo
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-muted mb-0 py-3">{loading ? "Buscando telefones…" : "Nenhum cliente com telefone válido."}</p>
            )}

            <ul className="avisos-lista">
              {filtrados.slice(0, 80).map((c, i) => {
                const k = chaveTel(c.telefone);
                return (
                  <li key={`${k}-${i}`}>
                    <button
                      type="button"
                      className={`avisos-lista__item${i === indice ? " is-on" : ""}`}
                      onClick={() => {
                        if (!rodando) setIndice(i);
                      }}
                    >
                      <span className={`avisos-lista__dot${enviados.has(k) ? " is-sent" : ""}`} />
                      <span className="avisos-lista__nome">{c.nome}</span>
                      <span className="avisos-lista__tel">{formatarTelefone(c.telefone)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtrados.length > 80 ? (
              <p className="avisos-lista__more">Mostrando 80 de {filtrados.length}. Use a busca para achar alguém.</p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
