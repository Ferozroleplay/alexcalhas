import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  adminSessionCookieHeader,
  authenticateUsuario,
  buildAdminSessionPayload,
  createAdminSessionToken,
  redirectAposLogin,
  sessionToPublic,
} from "@/lib/auth.server";
import { getAuthSecret } from "@/lib/config.server";
import { dbErrorMessage } from "@/lib/agendamento.server";
import { jsonResponse } from "@/lib/http.server";

const bodySchema = z.object({
  usuario: z.string().trim().min(1, "Informe o usuário"),
  password: z.string().min(1, "Informe a senha"),
});

function loginRedirect(location: string, setCookie?: string) {
  const headers = new Headers({ Location: location });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(null, { status: 303, headers });
}

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type") ?? "";
        const formPost = !contentType.includes("application/json");

        if (!getAuthSecret()) {
          if (formPost) return loginRedirect("/?painel=login&erro=config");
          const onVercel = Boolean(process.env.VERCEL);
          return jsonResponse(
            {
              ok: false,
              message: onVercel
                ? "AUTH_SECRET não está no servidor. Na Vercel: Settings → Environment Variables → AUTH_SECRET (marque Production e Preview) → Salvar → Deployments → Redeploy. Confira em /api/health"
                : "AUTH_SECRET não encontrado. Crie o .env na raiz (copie de .env.example), defina AUTH_SECRET e reinicie o npm run dev.",
            },
            503,
          );
        }

        let usuario = "";
        let password = "";
        if (formPost) {
          const form = await request.formData().catch(() => null);
          usuario = String(form?.get("usuario") ?? "");
          password = String(form?.get("senha") ?? form?.get("password") ?? "");
        } else {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonResponse({ ok: false, message: "JSON inválido." }, 400);
          }
          const parsed = bodySchema.safeParse(body);
          if (!parsed.success) {
            return jsonResponse({ ok: false, message: "Usuário e senha são obrigatórios." }, 422);
          }
          usuario = parsed.data.usuario;
          password = parsed.data.password;
        }

        if (!usuario.trim() || !password) {
          if (formPost) return loginRedirect("/?painel=login&erro=vazio");
          return jsonResponse({ ok: false, message: "Usuário e senha são obrigatórios." }, 422);
        }

        try {
          const user = await authenticateUsuario(usuario, password);
          if (!user) {
            if (formPost) return loginRedirect("/?painel=login&erro=credenciais");
            return jsonResponse({ ok: false, message: "Usuário ou senha inválidos." }, 401);
          }

          const payload = await buildAdminSessionPayload(user);
          const token = createAdminSessionToken(payload);
          if (!token) {
            if (formPost) return loginRedirect("/?painel=login&erro=config");
            return jsonResponse({ ok: false, message: "Não foi possível criar a sessão." }, 503);
          }

          const [, setCookie] = adminSessionCookieHeader(token);
          const redirect = redirectAposLogin(payload);
          if (formPost) return loginRedirect(redirect, setCookie);

          return jsonResponse(
            {
              ok: true,
              user: sessionToPublic({ ...payload, exp: Date.now() + 1 }),
              redirect,
            },
            200,
            { "Set-Cookie": setCookie },
          );
        } catch (err) {
          console.error("[POST /api/admin/login]", err);
          if (formPost) return loginRedirect("/?painel=login&erro=servidor");
          const message = dbErrorMessage(err);
          const status = message.includes("MySQL") || message.includes("Senha") ? 503 : 500;
          return jsonResponse({ ok: false, message }, status);
        }
      },
    },
  },
});
