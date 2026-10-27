import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest } from "@/lib/auth.server";
import type { AdminSessionPayload } from "@/lib/auth.server";
import {
  createDespesa,
  deleteDespesa,
  findDespesaById,
  isCategoriaValida,
  isDataValida,
  isFormaValida,
  listDespesas,
  updateDespesa,
} from "@/lib/despesas.server";
import { jsonResponse } from "@/lib/http.server";

function parseMoney(raw: unknown): number {
  const v = String(raw ?? "0").replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const bodySchema = z.object({
  data: z.string().trim().min(1),
  descricao: z.string().trim().min(1).max(255),
  categoria: z.string().trim().min(1),
  valor: z.union([z.number(), z.string()]),
  forma_pagamento: z.string().trim().min(1),
  observacao: z.string().trim().max(2000).optional(),
});

const patchSchema = bodySchema.extend({
  id: z.number().int().positive(),
});

function podeUsarDespesas(session: AdminSessionPayload | null): session is AdminSessionPayload {
  return session?.visao === "admin" || session?.visao === "funcionário";
}

function ehAdminDespesas(session: AdminSessionPayload): boolean {
  return session.visao === "admin";
}

function validarPayload(data: z.infer<typeof bodySchema>): string | null {
  if (!isDataValida(data.data)) return "Informe uma data válida.";
  if (!isCategoriaValida(data.categoria)) return "Categoria inválida.";
  if (!isFormaValida(data.forma_pagamento)) return "Forma de pagamento inválida.";
  if (parseMoney(data.valor) <= 0) return "Informe um valor maior que zero.";
  return null;
}

export const Route = createFileRoute("/api/admin/despesas")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = getAdminSessionFromRequest(request);
        if (!podeUsarDespesas(session)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        try {
          const url = new URL(request.url);
          const ano = Number.parseInt(url.searchParams.get("ano") ?? "", 10);
          const mes = Number.parseInt(url.searchParams.get("mes") ?? "", 10);
          const categoria = url.searchParams.get("categoria")?.trim() || undefined;
          const itens = await listDespesas({
            ano: Number.isFinite(ano) ? ano : undefined,
            mes: Number.isFinite(mes) ? mes : undefined,
            categoria,
            registradoPor: ehAdminDespesas(session) ? undefined : session.userId,
          });
          return jsonResponse({ ok: true, itens });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        const session = getAdminSessionFromRequest(request);
        if (!podeUsarDespesas(session)) return jsonResponse({ ok: false }, 401);
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }
        const erro = validarPayload(parsed.data);
        if (erro) return jsonResponse({ ok: false, message: erro }, 422);
        try {
          const item = await createDespesa({
            data: parsed.data.data,
            descricao: parsed.data.descricao,
            categoria: parsed.data.categoria,
            valor: parseMoney(parsed.data.valor),
            forma_pagamento: parsed.data.forma_pagamento,
            observacao: parsed.data.observacao,
            registrado_por: session.userId,
          });
          return jsonResponse({ ok: true, item });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request }) => {
        const session = getAdminSessionFromRequest(request);
        if (!podeUsarDespesas(session)) return jsonResponse({ ok: false }, 401);
        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }
        const erro = validarPayload(parsed.data);
        if (erro) return jsonResponse({ ok: false, message: erro }, 422);
        try {
          const existente = await findDespesaById(parsed.data.id);
          if (!existente) {
            return jsonResponse({ ok: false, message: "Despesa não encontrada." }, 404);
          }
          if (!ehAdminDespesas(session) && existente.registrado_por !== session.userId) {
            return jsonResponse({ ok: false, message: "Só é possível editar o que você lançou." }, 403);
          }
          const item = await updateDespesa(parsed.data.id, {
            data: parsed.data.data,
            descricao: parsed.data.descricao,
            categoria: parsed.data.categoria,
            valor: parseMoney(parsed.data.valor),
            forma_pagamento: parsed.data.forma_pagamento,
            observacao: parsed.data.observacao,
          });
          return jsonResponse({ ok: true, item });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      DELETE: async ({ request }) => {
        const session = getAdminSessionFromRequest(request);
        if (!podeUsarDespesas(session)) return jsonResponse({ ok: false }, 401);
        const id = Number.parseInt(new URL(request.url).searchParams.get("id") ?? "", 10);
        if (!Number.isFinite(id) || id <= 0) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 422);
        }
        try {
          const existente = await findDespesaById(id);
          if (!existente) {
            return jsonResponse({ ok: false, message: "Despesa não encontrada." }, 404);
          }
          if (!ehAdminDespesas(session) && existente.registrado_por !== session.userId) {
            return jsonResponse({ ok: false, message: "Só é possível excluir o que você lançou." }, 403);
          }
          await deleteDespesa(id);
          return jsonResponse({ ok: true });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
