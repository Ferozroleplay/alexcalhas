import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage, serializeInventario } from "@/lib/agendamento.server";
import { getPrisma } from "@/lib/db.server";
import { jsonResponse } from "@/lib/http.server";
import { parseOrcamentoJson } from "@/lib/orcamento.server";

const querySchema = z.object({
  id: z.coerce.number().int().positive(),
  t: z.string().trim().max(64).optional(),
});

export const Route = createFileRoute("/api/os")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          id: url.searchParams.get("id"),
          t: url.searchParams.get("t") ?? undefined,
        });
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findUnique({ where: { id: parsed.data.id } });
          if (!row) {
            return jsonResponse({ ok: false, message: "Este orçamento não está disponível." }, 404);
          }

          const item = serializeInventario(row);

          const itens = parseOrcamentoJson(row.orcamento);
          return jsonResponse({
            ok: true,
            item,
            itens,
          });
        } catch (err) {
          console.error("[GET /api/os]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
