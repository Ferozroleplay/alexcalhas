import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminVisaoRequest } from "@/lib/auth.server";
import { getDashboardStats } from "@/lib/inventario-stats.server";
import { jsonResponse } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminVisaoRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }

        try {
          const stats = await getDashboardStats();
          return jsonResponse({ ok: true, stats });
        } catch (err) {
          console.error("[GET /api/admin/dashboard]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
