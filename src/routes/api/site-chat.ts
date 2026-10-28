import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { jsonResponse } from "@/lib/http.server";
import { getSiteChat, SITE_CHAT_DEFAULTS } from "@/lib/site-chat.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    },
  },
});
