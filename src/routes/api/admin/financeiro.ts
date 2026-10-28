import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminVisaoRequest } from "@/lib/auth.server";
import { finResumoFaturadoMensal, resumoFinanceiroGlobal } from "@/lib/financeiro.server";
import { jsonResponse } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/financeiro")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminVisaoRequest(request)) return jsonResponse({ ok: false }, 401);
        const url = new URL(request.url);
        const ano = Math.max(2000, Number(url.searchParams.get("ano") ?? new Date().getFullYear()));
        const desde = url.searchParams.get("desde")?.trim() || null;

        try {
          const global = await resumoFinanceiroGlobal();
          const mensal = await finResumoFaturadoMensal(ano, desde);
          return jsonResponse({
            ok: true,
            updated_at: new Date().toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            ...global,
            resumo: {
              ...global.resumo,
              receita_faturada: mensal.total_ano,
              total_geral: global.resumo.receita_confirmado + mensal.total_ano,
            },
            faturado_mensal: mensal,
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
