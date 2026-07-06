import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminRequest } from "@/lib/auth.server";
import { jsonResponse } from "@/lib/http.server";
import { findParceiroById, setParceiroLogo } from "@/lib/parceiros.server";
import {
  logoPublicUrl,
  removerLogoParceiroArquivo,
  salvarLogoParceiroUpload,
} from "@/lib/parceiros-upload.server";

function lerId(valor: string): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const Route = createFileRoute("/api/admin/parceiros/$id/logo")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const id = lerId(params.id);
        if (!id) return jsonResponse({ ok: false, message: "ID inválido." }, 400);

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
          const parceiro = await findParceiroById(id);
          if (!parceiro) {
            return jsonResponse({ ok: false, message: "Parceiro não encontrado." }, 404);
          }

          const saved = await salvarLogoParceiroUpload(file);
          if ("erro" in saved) {
            return jsonResponse({ ok: false, message: saved.erro }, 422);
          }

          const logoAnterior = await setParceiroLogo(id, saved.arquivo);
          if (logoAnterior) await removerLogoParceiroArquivo(logoAnterior);

          return jsonResponse({
            ok: true,
            logo: saved.arquivo,
            logo_url: logoPublicUrl(saved.arquivo),
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
