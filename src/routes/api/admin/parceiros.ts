import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminRequest } from "@/lib/auth.server";
import { jsonResponse } from "@/lib/http.server";
import {
  createParceiro,
  deleteParceiro,
  listParceirosAdmin,
  updateParceiro,
} from "@/lib/parceiros.server";
import { removerLogoParceiroArquivo } from "@/lib/parceiros-upload.server";

const postSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  whatsapp: z.string().max(30).optional(),
  ativo: z.boolean().optional(),
});

const patchSchema = z.object({
  id: z.number().int().positive(),
  nome: z.string().trim().min(1).max(120).optional(),
  whatsapp: z.string().max(30).optional(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().min(0).optional(),
});

export const Route = createFileRoute("/api/admin/parceiros")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        try {
          const itens = await listParceirosAdmin();
          return jsonResponse({ ok: true, itens });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const parsed = postSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Informe o nome do parceiro." }, 422);
        }
        const wa = parsed.data.whatsapp?.replace(/\D/g, "") ?? "";
        if (wa && wa.length < 10) {
          return jsonResponse({ ok: false, message: "WhatsApp inválido." }, 422);
        }
        try {
          const item = await createParceiro({
            nome: parsed.data.nome,
            whatsapp: parsed.data.whatsapp,
            ativo: parsed.data.ativo,
          });
          return jsonResponse({ ok: true, item });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }
        if (parsed.data.whatsapp !== undefined) {
          const wa = parsed.data.whatsapp.replace(/\D/g, "");
          if (wa && wa.length < 10) {
            return jsonResponse({ ok: false, message: "WhatsApp inválido." }, 422);
          }
        }
        try {
          const item = await updateParceiro(parsed.data.id, {
            nome: parsed.data.nome,
            whatsapp: parsed.data.whatsapp,
            ativo: parsed.data.ativo,
            ordem: parsed.data.ordem,
          });
          return jsonResponse({ ok: true, item });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Parceiro não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      DELETE: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const url = new URL(request.url);
        const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
        if (!Number.isFinite(id) || id <= 0) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 422);
        }
        try {
          const removido = await deleteParceiro(id);
          if (!removido) {
            return jsonResponse({ ok: false, message: "Parceiro não encontrado." }, 404);
          }
          if (removido.logo) await removerLogoParceiroArquivo(removido.logo);
          return jsonResponse({ ok: true });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Parceiro não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
