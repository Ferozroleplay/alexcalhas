import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { INVENTARIO_STATUS } from "@/lib/agendamento-constants";
import { dbErrorMessage, serializeInventario } from "@/lib/agendamento.server";
import {
  funcionarioPodeVerInventario,
  getAdminSessionFromRequest,
  isAdminRequest,
} from "@/lib/auth.server";
import { getPrisma } from "@/lib/db.server";
import { baixarEstoqueDoInventario } from "@/lib/estoque-baixa.server";
import { jsonResponse } from "@/lib/http.server";
import { marcarPendenciaCobranca } from "@/lib/inventario-pendencia.server";
import {
  agoraPagoEmLocal,
  calcularResumoRecebimento,
  criarRecebimentoInventario,
  listarRecebimentosInventario,
} from "@/lib/inventario-recebimento.server";

const patchSchema = z.object({
  status: z.enum(INVENTARIO_STATUS),
  pagou: z.boolean().optional(),
});

export const Route = createFileRoute("/api/agendamentos/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }

        const session = getAdminSessionFromRequest(request);
        if (!session || session.visao !== "admin") {
          return jsonResponse({ ok: false, message: "Somente admin pode cancelar." }, 403);
        }

        const id = Number(params.id);
        if (!Number.isFinite(id) || id < 1) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        }

        try {
          const prisma = await getPrisma();
          await prisma.inventario.delete({ where: { id } });
          return jsonResponse({ ok: true });
        } catch (err) {
          console.error("[DELETE /api/agendamentos/$id]", err);
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Agendamento não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }

        const id = Number(params.id);
        if (!Number.isFinite(id) || id < 1) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, message: "JSON inválido." }, 400);
        }

        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Status inválido." }, 422);
        }

        const allowed: Record<string, string[]> = {
          agendado: ["orcamentado"],
          orcamentado: ["confirmado"],
          "orçamentado": ["confirmado"],
          confirmado: ["finalizado"],
        };

        try {
          const prisma = await getPrisma();
          const session = getAdminSessionFromRequest(request);
          const row = await prisma.inventario.findUnique({ where: { id } });
          if (!row) {
            return jsonResponse({ ok: false, message: "Agendamento não encontrado." }, 404);
          }
          if (!funcionarioPodeVerInventario(session, row.funcionario)) {
            return jsonResponse({ ok: false, message: "Não autorizado." }, 403);
          }
          const st = row.status;
          const next = parsed.data.status;
          const can = allowed[st]?.includes(next);
          if (!can && st !== next) {
            return jsonResponse({ ok: false, message: "Transição de status inválida." }, 422);
          }

          if (next === "finalizado" && parsed.data.pagou) {
            const cliente = serializeInventario(row);
            const valorOrcamento = Number(cliente.valor) || 0;
            const atual = await listarRecebimentosInventario(id, valorOrcamento);
            const resumo = calcularResumoRecebimento(valorOrcamento, atual.resumo.valorRecebido);
            if (resumo.saldoPendente > 0.009) {
              const baixa = await criarRecebimentoInventario({
                inventarioId: id,
                valor: resumo.saldoPendente,
                tipo: "saldo",
                pagoEm: agoraPagoEmLocal(),
                observacao: "Quitação ao finalizar o serviço",
                registradoPor: session?.userId ?? null,
              });
              if (!baixa.ok) {
                return jsonResponse({ ok: false, message: baixa.message }, 400);
              }
            }
          }

          const updated = await prisma.inventario.update({
            where: { id },
            data: { status: next },
          });

          if (next === "finalizado" && parsed.data.pagou !== true) {
            try {
              await marcarPendenciaCobranca(id);
            } catch (pendenciaErr) {
              console.error("[PATCH /api/agendamentos/$id] marcar pendência", pendenciaErr);
            }
          }

          if (
            (next === "confirmado" && st !== "confirmado") ||
            (next === "finalizado" && st !== "finalizado")
          ) {
            try {
              await baixarEstoqueDoInventario(id);
            } catch (estoqueErr) {
              console.error("[PATCH /api/agendamentos/$id] baixa estoque", estoqueErr);
            }
          }

          return jsonResponse({ ok: true, item: serializeInventario(updated) });
        } catch (err) {
          console.error("[PATCH /api/agendamentos/$id]", err);
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Agendamento não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
