import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { jsonResponse } from "@/lib/http.server";
import { atenderPoliane } from "@/lib/poliane.server";
import { getSiteChat, SITE_CHAT_DEFAULTS } from "@/lib/site-chat.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
} as const;

export const Route = createFileRoute("/api/site-chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async () => {
        try {
          const chat = await getSiteChat();
          return jsonResponse({ ok: true, chat }, 200, CORS);
        } catch (err) {
          console.error("[GET /api/site-chat]", err);
          return jsonResponse(
            { ok: true, chat: SITE_CHAT_DEFAULTS, message: dbErrorMessage(err) },
            200,
            CORS,
          );
        }
      },

      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, message: "JSON inválido." }, 400, CORS);
        }
        const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        const mensagem = typeof o.mensagem === "string" ? o.mensagem.trim().slice(0, 800) : "";
        if (mensagem.length < 1) {
          return jsonResponse({ ok: false, message: "Escreva uma mensagem." }, 400, CORS);
        }
        try {
          const result = await atenderPoliane(mensagem, o.ficha);
          return jsonResponse({ ok: true, ...result }, 200, CORS);
        } catch (err) {
          console.error("[POST /api/site-chat]", err);
          return jsonResponse(
            {
              ok: false,
              message: dbErrorMessage(err),
              reply:
                "Não consegui concluir agora. Pode falar com a equipe no WhatsApp que eles te atendem.",
            },
            503,
            CORS,
          );
        }
      },
    },
  },
});
