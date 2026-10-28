import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminVisaoRequest } from "@/lib/auth.server";
import { historicoCliente, listarClientes, obterClienteDetalhe } from "@/lib/clientes.server";
import { jsonResponse } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/clientes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminVisaoRequest(request)) return jsonResponse({ ok: false }, 401);
        const url = new URL(request.url);
        const ver = Number.parseInt(url.searchParams.get("ver") ?? "", 10);

        if (Number.isFinite(ver) && ver > 0) {
          try {
            const detalhe = await obterClienteDetalhe(ver);
            if (!detalhe) {
              return jsonResponse({ ok: false, message: "Cliente não encontrado." }, 404);
            }
            const historico = await historicoCliente(ver);
            return jsonResponse({ ok: true, detalhe, historico });
          } catch (err) {
            return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
          }
        }

        const q = url.searchParams.get("q")?.trim() || null;
        const pag = Math.max(1, Number(url.searchParams.get("pag") ?? 1));
        const porPagina = Math.min(100, Math.max(1, Number(url.searchParams.get("por_pagina") ?? 15)));
        try {
          const { total, itens } = await listarClientes(q, porPagina, (pag - 1) * porPagina);
          return jsonResponse({
            ok: true,
            total,
            pag,
            por_pagina: porPagina,
            paginas: Math.max(1, Math.ceil(total / porPagina)),
            itens,
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
