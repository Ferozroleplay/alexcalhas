import { createFileRoute } from "@tanstack/react-router";

import { lerUsuarioFoto } from "@/lib/usuario-thumb.server";

export const Route = createFileRoute("/api/media/usuario-foto")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = Number(new URL(request.url).searchParams.get("id") ?? 0);
        if (!Number.isInteger(id) || id <= 0) {
          return new Response("Não encontrado", { status: 404 });
        }

        try {
          const foto = await lerUsuarioFoto(id);
          if (!foto) return new Response("Não encontrado", { status: 404 });
          return new Response(Buffer.from(foto.dados), {
            status: 200,
            headers: {
              "Content-Type": foto.mime,
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch {
          return new Response("Erro ao carregar imagem", { status: 502 });
        }
      },
    },
  },
});
