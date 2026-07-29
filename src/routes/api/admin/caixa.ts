import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminRequest } from "@/lib/auth.server";
import { getCaixaDia } from "@/lib/caixa.server";
import { jsonResponse } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/caixa")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }

        const url = new URL(request.url);
        const data =
          url.searchParams.get("data")?.trim() ||
          new Date().toISOString().slice(0, 10);

        try {
          const resumo = await getCaixaDia(data);
          return jsonResponse({ ok: true, resumo });
        } catch (err) {
          console.error("[GET /api/admin/caixa]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
