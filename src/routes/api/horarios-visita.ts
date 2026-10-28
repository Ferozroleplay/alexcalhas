import { createFileRoute } from "@tanstack/react-router";

import { horariosLivresNoMes, horariosLivresVisita } from "@/lib/agendamento.server";
import { getPrisma } from "@/lib/db.server";
import { jsonResponse } from "@/lib/http.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
} as const;

export const Route = createFileRoute("/api/horarios-visita")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mes = (url.searchParams.get("mes") ?? "").trim();
        const data = (url.searchParams.get("data") ?? "").trim();

        try {
          const prisma = await getPrisma();
          if (/^\d{4}-\d{2}$/.test(mes)) {
            const dias = await horariosLivresNoMes(prisma, mes);
            return jsonResponse({ ok: true, mes, dias }, 200, CORS);
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            return jsonResponse({ ok: false, message: "Data inválida." }, 400, CORS);
          }
          const horarios = await horariosLivresVisita(prisma, data);
          return jsonResponse({ ok: true, data, horarios }, 200, CORS);
        } catch (err) {
          console.error("[GET /api/horarios-visita]", err);
          return jsonResponse({ ok: false, message: "Não foi possível carregar os horários." }, 503, CORS);
        }
      },
    },
  },
});
