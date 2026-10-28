import { createFileRoute } from "@tanstack/react-router";

import { consultarDocumento } from "@/lib/consulta-cnpj.server";
import { jsonResponse } from "@/lib/http.server";

/** Consulta CPF/CNPJ na landing (sem login). */
export const Route = createFileRoute("/api/consulta-documento")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const documento = url.searchParams.get("documento") ?? url.searchParams.get("doc") ?? "";
        const payload = await consultarDocumento(documento, { incluirCadastro: false });
        const code = payload.status === "sucesso" ? 200 : 400;
        return jsonResponse(payload, code);
      },
    },
  },
});
