import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest, podeGerenciarUsuarios } from "@/lib/auth.server";
import { jsonResponse } from "@/lib/http.server";
import { hashPasswordPhp } from "@/lib/password.server";
import { createUsuario, listUsuarios, usuarioLoginExists } from "@/lib/usuarios.server";

const NIVEIS = ["admin", "funcionário", "funcionario", "fornecedor", "contador"] as const;

const postSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  usuario: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255),
  senha: z.string().min(4),
  nivel: z.enum(NIVEIS),
});

export const Route = createFileRoute("/api/admin/usuarios")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!podeGerenciarUsuarios(session)) {
          return jsonResponse({ ok: false, message: "Acesso apenas para administrador." }, 403);
        }
        try {
          const itens = await listUsuarios();
          return jsonResponse({ ok: true, itens });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!podeGerenciarUsuarios(session)) {
          return jsonResponse({ ok: false, message: "Acesso apenas para administrador." }, 403);
        }
        const parsed = postSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        try {
          if (await usuarioLoginExists(parsed.data.usuario)) {
            return jsonResponse({ ok: false, message: "Usuário já existe." }, 409);
          }
          const senha = await hashPasswordPhp(parsed.data.senha);
          const nivel =
            parsed.data.nivel === "funcionario" ? "funcionário" : parsed.data.nivel;
          const id = await createUsuario({
            thumb: "nao.png",
            nome: parsed.data.nome,
            usuario: parsed.data.usuario,
            email: parsed.data.email,
            senha,
            nivel,
          });
          const itens = await listUsuarios();
          const item = itens.find((u) => u.id === id);
          return jsonResponse({ ok: true, item });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
