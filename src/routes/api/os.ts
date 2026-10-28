import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage, serializeInventario } from "@/lib/agendamento.server";
import { getPrisma } from "@/lib/db.server";
import { jsonResponse } from "@/lib/http.server";
import { parseOrcamentoJson } from "@/lib/orcamento.server";
import { osTokenValido } from "@/lib/os-token.server";

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

        const token = parsed.data.t?.trim() || "";
        if (token && !osTokenValido(parsed.data.id, token)) {
          return jsonResponse({ ok: false, message: "Link inválido." }, 403);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findUnique({ where: { id: parsed.data.id } });
          if (!row) return jsonResponse({ ok: false, message: "Não encontrado." }, 404);

          const item = serializeInventario(row);
          if (!osTokenValido(parsed.data.id, token)) {
            item.cpfCnpj = null;
          }

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
