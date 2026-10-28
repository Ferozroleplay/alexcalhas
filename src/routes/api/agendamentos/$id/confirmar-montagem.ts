import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dataInputParaDb, dbErrorMessage, serializeInventario } from "@/lib/agendamento.server";
import {
  funcionarioPodeVerInventario,
  getAdminSessionFromRequest,
  isAdminRequest,
} from "@/lib/auth.server";
import { getPrisma } from "@/lib/db.server";
import { baixarEstoqueDoInventario } from "@/lib/estoque-baixa.server";
import { jsonResponse } from "@/lib/http.server";
import { parseFormaPagamento } from "@/lib/orcamento.server";

const bodySchema = z.object({
  dataMontagem: z.string().trim().min(1),
  formaPagamento: z.string().trim().min(1).max(20),
  observacao: z.string().max(2000).optional(),
});

export const Route = createFileRoute("/api/agendamentos/$id/confirmar-montagem")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
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

        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Informe a data e a forma de pagamento." }, 422);
        }
        if (!parseFormaPagamento(parsed.data.formaPagamento).forma) {
          return jsonResponse({ ok: false, message: "Escolha PIX, débito ou crédito." }, 422);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findFirst({
            where: {
              id,
              OR: [{ status: "orcamentado" }, { status: "orçamentado" }],
            },
          });
          if (!row) {
            return jsonResponse({ ok: false, message: "Serviço não encontrado." }, 404);
          }
          const session = getAdminSessionFromRequest(request);
          if (!funcionarioPodeVerInventario(session, row.funcionario)) {
            return jsonResponse({ ok: false, message: "Não autorizado." }, 403);
          }

          const updated = await prisma.inventario.update({
            where: { id },
            data: {
              status: "confirmado",
              dataMontagem: dataInputParaDb(parsed.data.dataMontagem),
              formaPagamento: parsed.data.formaPagamento,
              observacao: parsed.data.observacao?.trim() ? parsed.data.observacao.trim() : row.observacao,
            },
          });

          // Sai do estoque (Materiais) os metros do orçamento.
          let estoqueMsg = "";
          try {
            const baixa = await baixarEstoqueDoInventario(id);
            if (baixa.jaBaixado) {
              estoqueMsg = " Estoque já tinha sido baixado neste serviço.";
            } else if (baixa.baixas.length > 0) {
              const totalM = baixa.baixas.reduce((s, b) => s + b.metros, 0);
              estoqueMsg = ` Estoque: −${totalM.toLocaleString("pt-BR")} m.`;
              if (baixa.substitutos.length > 0) {
                const txt = baixa.substitutos
                  .map((s) => `${s.especial} no ${s.padrao}`)
                  .join(", ");
                estoqueMsg += ` Cortes especiais: ${txt}.`;
              }
              if (baixa.naoEncontrados.length > 0) {
                const nomes = baixa.naoEncontrados.map((n) => n.material).join(", ");
                estoqueMsg += ` Sem cadastro no estoque: ${nomes}.`;
              }
            } else if (baixa.naoEncontrados.length > 0) {
              const nomes = baixa.naoEncontrados.map((n) => n.material).join(", ");
              estoqueMsg = ` Atenção: não achei no estoque: ${nomes}.`;
            }
          } catch (estoqueErr) {
            console.error("[POST confirmar-montagem] baixa estoque", estoqueErr);
            estoqueMsg = " Atenção: não foi possível baixar o estoque automaticamente.";
          }

          return jsonResponse({
            ok: true,
            message: `Serviço confirmado com sucesso!${estoqueMsg}`,
            item: serializeInventario(updated),
          });
        } catch (err) {
          console.error("[POST confirmar-montagem]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
