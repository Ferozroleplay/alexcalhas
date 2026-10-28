import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminVisaoRequest } from "@/lib/auth.server";
import { listarClientesAviso } from "@/lib/clientes.server";
import { jsonResponse } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/clientes-aviso")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminVisaoRequest(request)) return jsonResponse({ ok: false }, 401);
        try {
          const itens = await listarClientesAviso();
          return jsonResponse({ ok: true, total: itens.length, itens });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
