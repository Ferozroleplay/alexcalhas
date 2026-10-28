import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminRequest } from "@/lib/auth.server";
import { jsonResponse } from "@/lib/http.server";
import { getSiteChat, getSiteChatFotoStored, setSiteChatFoto } from "@/lib/site-chat.server";
import {
  fotoChatPublicUrl,
  removerFotoChatArquivo,
  salvarFotoChatUpload,
  SITE_CHAT_FOTO_PADRAO,
} from "@/lib/site-chat-upload.server";

export const Route = createFileRoute("/api/admin/site-chat/foto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonResponse({ ok: false, message: "FormData inválido." }, 400);
        }

        const file = form.get("arquivo");
        if (!(file instanceof File) || !file.size) {
          return jsonResponse({ ok: false, message: "Envie uma imagem." }, 422);
        }

        try {
          const saved = await salvarFotoChatUpload(file);
          if ("erro" in saved) {
            return jsonResponse({ ok: false, message: saved.erro }, 422);
          }
          const anterior = await setSiteChatFoto(saved.arquivo);
          if (anterior) await removerFotoChatArquivo(anterior);
          const chat = await getSiteChat();
          return jsonResponse({
            ok: true,
            foto_url: fotoChatPublicUrl(saved.arquivo),
            chat,
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      DELETE: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        try {
          const anterior = await getSiteChatFotoStored();
          await setSiteChatFoto(SITE_CHAT_FOTO_PADRAO);
          if (anterior) await removerFotoChatArquivo(anterior);
          const chat = await getSiteChat();
          return jsonResponse({ ok: true, chat });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
