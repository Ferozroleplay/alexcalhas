import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import { resolverFornecedorIdSessao } from "@/lib/fornecedor-dashboard.server";
import { obterEntregaCompleta } from "@/lib/fornecedores.server";
import { jsonResponse } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/nota-entrega")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!session) return jsonResponse({ ok: false }, 401);

        const url = new URL(request.url);
        const notaId = Number.parseInt(url.searchParams.get("nota") ?? "", 10);
        const controleQuery = Number(url.searchParams.get("controle") ?? 0);

        if (!Number.isFinite(notaId) || notaId <= 0) {
          return jsonResponse({ ok: false, message: "Informe o número da nota." }, 400);
        }

        try {
          const entrega = await obterEntregaCompleta(notaId);
          if (!entrega) {
            return jsonResponse({ ok: false, message: "Entrega não encontrada." }, 404);
          }

          if (session.visao === "fornecedor") {
            const fornecedorId = await resolverFornecedorIdSessao(session, controleQuery);
            if (fornecedorId <= 0 || entrega.fornecedor_id !== fornecedorId) {
              return jsonResponse({ ok: false, message: "Entrega não encontrada." }, 404);
            }
          } else if (session.visao !== "admin") {
            return jsonResponse({ ok: false, message: "Sem permissão para ver esta nota." }, 403);
          }

          return jsonResponse({ ok: true, entrega });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
