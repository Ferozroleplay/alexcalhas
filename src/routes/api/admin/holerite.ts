import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import {
  getAdminSessionFromRequest,
  isAdminRequest,
  podeVerHistoricoPonto,
} from "@/lib/auth.server";
import { montarHoleritesMes } from "@/lib/holerite.server";
import { jsonResponse } from "@/lib/http.server";
import { mesValido } from "@/lib/holerite";
import { pontoHojeIso } from "@/lib/ponto-timezone";

export const Route = createFileRoute("/api/admin/holerite")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!session || !podeVerHistoricoPonto(session)) {
          return jsonResponse({ ok: false, message: "Sem permissão para o holerite." }, 403);
        }

        const url = new URL(request.url);
        const hoje = pontoHojeIso();
        const mes = mesValido(url.searchParams.get("mes") ?? "") ?? hoje.slice(0, 7);
        const usuario = Number(url.searchParams.get("usuario") ?? 0);

        try {
          const { de, ate, holerites } = await montarHoleritesMes(mes, usuario);
          return jsonResponse({ ok: true, mes, de, ate, holerites });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
