import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminRequest } from "@/lib/auth.server";
import { jsonResponse } from "@/lib/http.server";
import { getSiteChat, updateSiteChat } from "@/lib/site-chat.server";

const patchSchema = z.object({
  nome: z.string().trim().min(1).max(80).optional(),
  cargo: z.string().trim().max(120).optional(),
  mensagem: z.string().trim().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/admin/site-chat")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        try {
          const chat = await getSiteChat();
          return jsonResponse({ ok: true, chat });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }
        try {
          const chat = await updateSiteChat(parsed.data);
          return jsonResponse({ ok: true, chat });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
