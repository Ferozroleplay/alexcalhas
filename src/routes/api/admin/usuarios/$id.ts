import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest, podeGerenciarUsuarios } from "@/lib/auth.server";
import { jsonResponse } from "@/lib/http.server";
import { hashPasswordPhp } from "@/lib/password.server";
import { thumbPublicUrl } from "@/lib/usuario-thumb.server";
import { getUsuarioById, updateUsuario } from "@/lib/usuarios.server";

const NIVEIS = ["admin", "funcionário", "funcionario", "fornecedor", "contador"] as const;

function lerId(valor: string): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const patchSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  senha: z.string().min(4).optional().or(z.literal("")),
  nivel: z.enum(NIVEIS),
  fornecedor_id: z.number().int().positive().nullable().optional(),
});

function normalizarNivel(nivel: string): string {
  return nivel === "funcionario" ? "funcionário" : nivel;
}

export const Route = createFileRoute("/api/admin/usuarios/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!podeGerenciarUsuarios(session)) {
          return jsonResponse({ ok: false, message: "Acesso apenas para administrador." }, 403);
        }
        const id = lerId(params.id);
        if (!id) return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        try {
          const item = await getUsuarioById(id);
          if (!item) return jsonResponse({ ok: false, message: "Usuário não encontrado." }, 404);
          return jsonResponse({
            ok: true,
            item: {
              ...item,
              thumb_url: item.thumb !== "nao.png" ? thumbPublicUrl(item.thumb) : null,
            },
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request, params }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!podeGerenciarUsuarios(session)) {
          return jsonResponse({ ok: false, message: "Acesso apenas para administrador." }, 403);
        }
        const id = lerId(params.id);
        if (!id) return jsonResponse({ ok: false, message: "ID inválido." }, 400);

        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);

        const nivel = normalizarNivel(parsed.data.nivel);
        const fornecedor_id =
          nivel === "fornecedor" ? (parsed.data.fornecedor_id ?? null) : null;
        if (nivel === "fornecedor" && !fornecedor_id) {
          return jsonResponse(
            { ok: false, message: "Selecione a empresa fornecedora para este perfil." },
            422,
          );
        }

        try {
          const atual = await getUsuarioById(id);
          if (!atual) return jsonResponse({ ok: false, message: "Usuário não encontrado." }, 404);

          const senhaNova = parsed.data.senha?.trim();
          const senhaHash = senhaNova ? await hashPasswordPhp(senhaNova) : undefined;

          await updateUsuario(id, {
            nome: parsed.data.nome,
            email: parsed.data.email,
            senha: senhaHash,
            nivel,
            fornecedor_id,
          });

          const item = await getUsuarioById(id);
          return jsonResponse({
            ok: true,
            item: item
              ? {
                  ...item,
                  thumb_url: item.thumb !== "nao.png" ? thumbPublicUrl(item.thumb) : null,
                }
              : null,
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
