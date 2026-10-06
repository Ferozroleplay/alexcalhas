import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  ReciboRecebimentoDocument,
  type ReciboCliente,
} from "@/components/admin/ReciboRecebimentoDocument";
import type { InventarioRecebimentoItem, RecebimentoResumo } from "@/lib/admin-api";
import { gerarPdfNoConteudo } from "@/lib/os-pdf";
import { RECIBO_PDF_DONE, RECIBO_PDF_ERROR, nomeArquivoReciboPdf } from "@/lib/recibo-pdf";

export const Route = createFileRoute("/recibo")({
  validateSearch: (s: Record<string, unknown>) => {
    const downloadRaw = s.download;
    const download =
      downloadRaw === "1" ||
      downloadRaw === 1 ||
      downloadRaw === true ||
      downloadRaw === "true";
    return {
      inventario: Number(s.inventario) || 0,
      pagamento: Number(s.pagamento) || 0,
      download,
    };
  },
  component: ReciboPage,
  head: () => ({
    meta: [{ title: "Recibo — Alex Calhas" }],
    links: [{ rel: "stylesheet", href: "/css/recibo.css" }],
  }),
});

type ReciboPayload = {
  cliente: ReciboCliente;
  pagamento: InventarioRecebimentoItem;
  valorOrcamento: number;
  resumo: RecebimentoResumo;
};

function ReciboPage() {
  const { inventario, pagamento, download } = Route.useSearch();
  const [data, setData] = useState<ReciboPayload | null>(null);
  const [error, setError] = useState("");
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    if (!download) return;
    document.documentElement.classList.add("recibo-embed");
    return () => document.documentElement.classList.remove("recibo-embed");
  }, [download]);

  useEffect(() => {
    if (!inventario || !pagamento) {
      setError("Recibo não informado.");
      return;
    }
    fetch(`/api/agendamentos/${inventario}/recebimentos`, { credentials: "include" })
      .then(async (r) => {
        const body = (await r.json()) as {
          ok?: boolean;
          message?: string;
          cliente?: ReciboCliente;
          recebimentos?: InventarioRecebimentoItem[];
          resumo?: RecebimentoResumo;
          valor_orcamento?: number;
        };
        if (!r.ok || !body.ok || !body.cliente || !body.resumo) {
          throw new Error(body.message ?? "Não foi possível abrir o recibo.");
        }
        const item = (body.recebimentos ?? []).find((rec) => rec.id === pagamento);
        if (!item) throw new Error("Pagamento não encontrado.");
        setData({
          cliente: body.cliente,
          pagamento: item,
          valorOrcamento: body.valor_orcamento ?? 0,
          resumo: body.resumo,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Recibo não encontrado."));
  }, [inventario, pagamento]);

  useEffect(() => {
    if (!download || !data) return;
    let cancelled = false;
    void (async () => {
      try {
        await new Promise((r) => window.setTimeout(r, 400));
        if (cancelled) return;
        const el = document.getElementById("recibo-documento");
        if (!el) throw new Error("Documento não encontrado.");
        const arquivo = nomeArquivoReciboPdf(data.cliente.id, data.cliente.nome, data.pagamento.tipo);
        await gerarPdfNoConteudo(el, arquivo);
        if (cancelled) return;
        if (window.parent !== window) {
          window.parent.postMessage(
            { type: RECIBO_PDF_DONE, id: data.pagamento.id },
            window.location.origin,
          );
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Erro ao gerar o recibo.";
        setError(message);
        if (window.parent !== window) {
          window.parent.postMessage(
            { type: RECIBO_PDF_ERROR, id: data.pagamento.id, message },
            window.location.origin,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [download, data]);

  async function handleBaixar() {
    if (!data || baixando) return;
    setBaixando(true);
    try {
      const el = document.getElementById("recibo-documento");
      if (!el) throw new Error("Documento não encontrado.");
      await gerarPdfNoConteudo(
        el,
        nomeArquivoReciboPdf(data.cliente.id, data.cliente.nome, data.pagamento.tipo),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar o recibo.");
    } finally {
      setBaixando(false);
    }
  }

  if (error) {
    return (
      <main className="recibo-body">
        <p style={{ textAlign: "center", padding: 32, color: "#b91c1c" }}>{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="recibo-body">
        <p style={{ textAlign: "center", padding: 32, color: "#5a6b63" }}>Gerando recibo…</p>
      </main>
    );
  }

  return (
    <main className={download ? "recibo-body recibo-body--embed" : "recibo-body"}>
      <ReciboRecebimentoDocument
        cliente={data.cliente}
        pagamento={data.pagamento}
        valorOrcamento={data.valorOrcamento}
        resumo={data.resumo}
      />
      {download ? null : (
        <div className="recibo-actions">
          <button type="button" onClick={() => void handleBaixar()} disabled={baixando}>
            {baixando ? "Gerando PDF…" : "Baixar"}
          </button>
        </div>
      )}
    </main>
  );
}
