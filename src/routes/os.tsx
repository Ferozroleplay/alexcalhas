import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { OrcamentoDocument } from "@/components/os/OrcamentoDocument";
import type { AgendamentoItem } from "@/lib/admin-api";
import { rotuloDocumentoOs } from "@/lib/os-document";
import {
  gerarPdfDoElemento,
  gerarPngDoElemento,
  nomeArquivoOrcamentoPdf,
  nomeArquivoOrcamentoPng,
  PDF_MSG_DONE,
  PDF_MSG_ERROR,
  PNG_MSG_DONE,
  PNG_MSG_ERROR,
} from "@/lib/os-pdf";
import type { OrcamentoLinha } from "@/lib/orcamento.server";

export const Route = createFileRoute("/os")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: Number(s.id) || 0,
    embed: s.embed === "1" || s.embed === 1,
    print: s.print === "1" || s.print === 1,
    download: s.download === "1" || s.download === 1,
    downloadPng: s.downloadPng === "1" || s.downloadPng === 1,
    nome: typeof s.nome === "string" ? s.nome : "",
  }),
  component: OsPage,
  head: () => ({
    meta: [{ title: "Orçamento — Alex Calhas" }],
    links: [{ rel: "stylesheet", href: "/css/os-orcamento.css" }],
  }),
});

function OsPage() {
  const { id, embed, print, download, downloadPng, nome } = Route.useSearch();
  const [item, setItem] = useState<AgendamentoItem | null>(null);
  const [itens, setItens] = useState<OrcamentoLinha[]>([]);
  const [error, setError] = useState("");
  const [baixando, setBaixando] = useState<"pdf" | "png" | null>(null);

  useEffect(() => {
    if (!embed) return;
    document.documentElement.classList.add("os-orc-embed");
    return () => document.documentElement.classList.remove("os-orc-embed");
  }, [embed]);

  useEffect(() => {
    if (!id) {
      setError("ID do orçamento não informado.");
      return;
    }
    fetch(`/api/os?id=${id}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; item?: AgendamentoItem; itens?: OrcamentoLinha[]; message?: string }) => {
        if (!d.ok || !d.item) throw new Error(d.message ?? "Erro");
        setItem(d.item);
        setItens(d.itens ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Orçamento não encontrado."));
  }, [id]);

  useEffect(() => {
    if (!item) return;
    const rotulo = rotuloDocumentoOs(item.status);
    document.title = `${rotulo.paginaTitulo} — Alex Calhas`;
  }, [item]);

  useEffect(() => {
    if (!print || !item) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [print, item]);

  useEffect(() => {
    if (!download || !item) return;
    let cancelled = false;

    void (async () => {
      try {
        await new Promise((r) => window.setTimeout(r, 500));
        if (cancelled) return;
        const el = document.getElementById("orcamento-documento");
        if (!el) throw new Error("Documento não encontrado.");
        const arquivo = nomeArquivoOrcamentoPdf(item.id, nome || item.nome, item.status);
        await gerarPdfDoElemento(el, arquivo);
        if (cancelled) return;
        if (window.parent !== window) {
          window.parent.postMessage({ type: PDF_MSG_DONE, id: item.id }, window.location.origin);
        }
      } catch (err) {
        if (cancelled) return;
        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: PDF_MSG_ERROR,
              id: item.id,
              message: err instanceof Error ? err.message : "Erro ao gerar PDF.",
            },
            window.location.origin,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [download, item, nome]);

  useEffect(() => {
    if (!downloadPng || !item) return;
    let cancelled = false;

    void (async () => {
      try {
        await new Promise((r) => window.setTimeout(r, 500));
        if (cancelled) return;
        const el = document.getElementById("orcamento-documento");
        if (!el) throw new Error("Documento não encontrado.");
        const arquivo = nomeArquivoOrcamentoPng(item.id, nome || item.nome, item.status);
        await gerarPngDoElemento(el, arquivo);
        if (cancelled) return;
        if (window.parent !== window) {
          window.parent.postMessage({ type: PNG_MSG_DONE, id: item.id }, window.location.origin);
        }
      } catch (err) {
        if (cancelled) return;
        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: PNG_MSG_ERROR,
              id: item.id,
              message: err instanceof Error ? err.message : "Erro ao gerar imagem.",
            },
            window.location.origin,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [downloadPng, item, nome]);

  async function handleBaixarPdf() {
    if (!item || baixando) return;
    setBaixando("pdf");
    try {
      const el = document.getElementById("orcamento-documento");
      if (!el) throw new Error("Documento não encontrado.");
      await gerarPdfDoElemento(el, nomeArquivoOrcamentoPdf(item.id, item.nome, item.status));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar PDF.");
    } finally {
      setBaixando(null);
    }
  }

  async function handleBaixarPng() {
    if (!item || baixando) return;
    setBaixando("png");
    try {
      const el = document.getElementById("orcamento-documento");
      if (!el) throw new Error("Documento não encontrado.");
      await gerarPngDoElemento(el, nomeArquivoOrcamentoPng(item.id, item.nome, item.status));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar imagem.");
    } finally {
      setBaixando(null);
    }
  }

  if (error) {
    return (
      <main className="os-orc-body">
        <p style={{ textAlign: "center", padding: 32, color: "#b91c1c" }}>{error}</p>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="os-orc-body">
        <p style={{ textAlign: "center", padding: 32, color: "#64748b" }}>Carregando orçamento…</p>
      </main>
    );
  }

  return (
    <main className={embed ? "os-orc-body os-orc-body--embed" : "os-orc-body"}>
      <OrcamentoDocument item={item} itens={itens} />
      {!embed ? (
        <div className="os-orc-print-actions">
          <button
            type="button"
            className="os-orc-print-btn os-orc-print-btn--pdf"
            onClick={() => void handleBaixarPdf()}
            disabled={baixando != null}
          >
            {baixando === "pdf" ? "Gerando PDF…" : "Baixar PDF"}
          </button>
          <button
            type="button"
            className="os-orc-print-btn os-orc-print-btn--png"
            onClick={() => void handleBaixarPng()}
            disabled={baixando != null}
          >
            {baixando === "png" ? "Gerando imagem…" : "Baixar imagem"}
          </button>
          <button type="button" className="os-orc-print-btn" onClick={() => window.print()} disabled={baixando != null}>
            Imprimir
          </button>
        </div>
      ) : null}
    </main>
  );
}
