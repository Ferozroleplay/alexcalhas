import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  backfillInventarioHorasVazias,
  buildInventarioCreateData,
  dbErrorMessage,
  inventarioWhereStatus,
  serializeInventario,
} from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import { getPrisma } from "@/lib/db.server";
import { jsonResponse, PUBLIC_CORS } from "@/lib/http.server";
import {
  calcularResumoRecebimento,
  mapaTotalRecebidoPorInventario,
  statusPermiteRecebimento,
} from "@/lib/inventario-recebimento.server";
import { agendamentoSiteSchema } from "@/lib/validation";

const corsJson = (data: unknown, status = 200) =>
  jsonResponse(data, status, PUBLIC_CORS);

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/agendamentos")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: PUBLIC_CORS }),

      GET: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }

        const url = new URL(request.url);
        const parsedQuery = listQuerySchema.safeParse({
          status: url.searchParams.get("status") ?? undefined,
          limit: url.searchParams.get("limit") ?? 200,
        });
        if (!parsedQuery.success) {
          return jsonResponse({ ok: false, message: "Parâmetros inválidos." }, 400);
        }

        const { status, limit = 200 } = parsedQuery.data;

        try {
          const prisma = await getPrisma();
          const session = getAdminSessionFromRequest(request);
          const statusWhere = inventarioWhereStatus(status);
          const whereBase = { ...statusWhere };
          const where =
            session?.visao === "funcionário"
              ? {
                  AND: [
                    whereBase,
                    {
                      OR: [{ funcionario: session.userId }, { funcionario: null }],
                    },
                  ],
                }
              : whereBase;
          const rows = await prisma.inventario.findMany({
            where: Object.keys(where).length ? (where as never) : undefined,
            orderBy: { id: "desc" },
            take: limit,
          });
          await backfillInventarioHorasVazias(prisma, rows);

          const idsRecebimento = rows
            .filter((r) => statusPermiteRecebimento(r.status))
            .map((r) => r.id);
          const mapaRecebido = await mapaTotalRecebidoPorInventario(idsRecebimento);

          return jsonResponse({
            ok: true,
            items: rows.map((row) => {
              const item = serializeInventario(row);
              if (!statusPermiteRecebimento(row.status)) return item;
              const agg = mapaRecebido[row.id];
              const resumo = calcularResumoRecebimento(Number(item.valor), agg?.total ?? 0);
              return {
                ...item,
                valorRecebido: resumo.valorRecebido,
                saldoPendente: resumo.saldoPendente,
                quitado: resumo.quitado,
                qtdPagamentos: agg?.qtd ?? 0,
              };
            }),
          });
        } catch (err) {
          console.error("[GET /api/agendamentos]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return corsJson({ ok: false, message: "JSON inválido." }, 400);
        }

        const parsed = agendamentoSiteSchema.safeParse(body);
        if (!parsed.success) {
          return corsJson(
            {
              ok: false,
              message: "Dados inválidos.",
              issues: parsed.error.flatten(),
            },
            422,
          );
        }

        try {
          const prisma = await getPrisma();
          const data = parsed.data;
          const dup = await prisma.inventario.findFirst({
            where: {
              status: "agendado",
              numero: data.numero.slice(0, 50),
              bairro: data.bairro.slice(0, 50),
            },
          });
          if (dup) {
            return corsJson(
              { ok: false, message: "Já existe uma visita agendada para esse endereço." },
              409,
            );
          }

          const session = getAdminSessionFromRequest(request);
          const funcionarioId =
            session?.visao === "funcionário" ? session.userId : null;
          const row = await prisma.inventario.create({
            data: buildInventarioCreateData(data, funcionarioId),
          });
          return corsJson({ ok: true, id: row.id, message: "Agendamento recebido." });
        } catch (err) {
          console.error("[POST /api/agendamentos]", err);
          return corsJson({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
