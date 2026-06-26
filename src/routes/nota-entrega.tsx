import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { FornecedorNotaImpressao } from "@/components/admin/FornecedorNotaImpressao";
import { fetchEntregaDetalhe } from "@/lib/fornecedores-client";
import type { EntregaDetalhe } from "@/lib/fornecedores.server";

const searchSchema = z.object({
  nota: z.coerce.number().optional().catch(undefined),
});

export const Route = createFileRoute("/nota-entrega")({
  validateSearch: searchSchema,
  component: NotaEntregaPage,
  head: () => ({
    meta: [{ title: "Nota de entrega — Alex Calhas" }],
    links: [
      { rel: "stylesheet", href: "/admin/fornecedor-nota-print.css" },
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
      },
    ],
  }),
});

function NotaEntregaPage() {
  const { nota } = Route.useSearch();
  const [entrega, setEntrega] = useState<EntregaDetalhe | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!nota || nota <= 0) {
      setErro("Informe o número da nota na URL (?nota=ID).");
      return;
    }
    void fetchEntregaDetalhe(nota)
      .then(setEntrega)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar a nota."));
  }, [nota]);

  if (erro) {
    return <p className="forn-nota__erro">{erro}</p>;
  }

  if (!entrega) {
    return <p className="forn-nota__loading">Carregando nota de entrega…</p>;
  }

  return <FornecedorNotaImpressao entrega={entrega} />;
}
