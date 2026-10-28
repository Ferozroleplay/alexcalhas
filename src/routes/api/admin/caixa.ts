import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminVisaoRequest } from "@/lib/auth.server";
import {
  getCaixaDia,
  listCaixaStatusMes,
  setCaixaStatus,
  type CaixaStatus,
} from "@/lib/caixa.server";
import { jsonResponse } from "@/lib/http.server";

const statusBodySchema = z.object({
  data: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.enum(["abrir", "fechar"]),
});

export const Route = createFileRoute("/api/admin/caixa")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminVisaoRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }

        const url = new URL(request.url);
        const data =
          url.searchParams.get("data")?.trim() ||
          new Date().toISOString().slice(0, 10);
        const anoParam = Number.parseInt(url.searchParams.get("ano") ?? "", 10);
        const mesParam = Number.parseInt(url.searchParams.get("mes") ?? "", 10);

        try {
          const resumo = await getCaixaDia(data);
          const [y, m] = resumo.data.split("-").map(Number);
          const ano = Number.isFinite(anoParam) ? anoParam : y;
          const mes = Number.isFinite(mesParam) ? mesParam : m;
          const statusMes = await listCaixaStatusMes(ano, mes);
          return jsonResponse({ ok: true, resumo, statusMes });
        } catch (err) {
          console.error("[GET /api/admin/caixa]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isAdminVisaoRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }

        const parsed = statusBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }

        const session = getAdminSessionFromRequest(request);
        const status: CaixaStatus = parsed.data.action === "abrir" ? "aberto" : "fechado";

        try {
          const saved = await setCaixaStatus(parsed.data.data, status, session?.userId);
          const [y, m] = parsed.data.data.split("-").map(Number);
          const statusMes = await listCaixaStatusMes(y, m);
          return jsonResponse({ ok: true, status: saved, statusMes });
        } catch (err) {
          console.error("[POST /api/admin/caixa]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
