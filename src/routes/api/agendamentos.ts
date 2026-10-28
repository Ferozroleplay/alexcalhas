import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  buildInventarioCreateData,
  dbErrorMessage,
  ensureInventarioTextosCliente,
  horariosLivresVisita,
  inventarioWhereStatus,
  serializeInventario,
} from "@/lib/agendamento.server";
import { formatHoraVisitaExibicao } from "@/lib/inventario-format";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import { getPrisma } from "@/lib/db.server";
import { jsonResponse, PUBLIC_CORS } from "@/lib/http.server";
import {
  listarIdsPendenciaCobranca,
  mapaCobrarPendencia,
} from "@/lib/inventario-pendencia.server";
import {
  calcularResumoRecebimento,
  mapaTotalRecebidoPorInventario,
  statusPermiteRecebimento,
} from "@/lib/inventario-recebimento.server";
import { criarOsToken } from "@/lib/os-token.server";
import { agendamentoSiteSchema } from "@/lib/validation";

const corsJson = (data: unknown, status = 200) =>
  jsonResponse(data, status, PUBLIC_CORS);

const listQuerySchema = z.object({
  status: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

function inventarioBuscaWhere(q: string | undefined) {
  const t = (q ?? "").trim().replace(/^#/, "");
  if (!t) return undefined;
  const digits = t.replace(/\D/g, "");
  const or: Record<string, unknown>[] = [
    { nome: { contains: t } },
    { telefone: { contains: t } },
    { endereco: { contains: t } },
  ];
  const idNum = Number.parseInt(t, 10);
  if (Number.isInteger(idNum) && idNum > 0 && String(idNum) === t) {
    or.push({ id: idNum });
  }
  if (digits.length >= 3) {
    or.push({ telefone: { contains: digits } });
    or.push({ cpfCnpj: { contains: digits } });
  }
  return { OR: or };
}

export const Route = createFileRoute("/api/agendamentos")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: PUBLIC_CORS }),

      GET: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const visaoReq = getAdminSessionFromRequest(request)?.visao;
        if (visaoReq === "contador" || visaoReq === "fornecedor") {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 403);
        }

        const url = new URL(request.url);
        const parsedQuery = listQuerySchema.safeParse({
          status: url.searchParams.get("status") ?? undefined,
          q: url.searchParams.get("q") ?? undefined,
          limit: url.searchParams.get("limit") ?? 250,
        });
        if (!parsedQuery.success) {
          return jsonResponse({ ok: false, message: "Parâmetros inválidos." }, 400);
        }

        const { status, q, limit = 250 } = parsedQuery.data;

        try {
          const prisma = await getPrisma();
          const session = getAdminSessionFromRequest(request);
          const visaoFuncionario = session?.visao === "funcionário";
          const funcionarioId = visaoFuncionario ? session.userId : null;
          const buscaWhere = inventarioBuscaWhere(q);

          let rows;
          if (status === "pendencias") {
            const idsPendencia = await listarIdsPendenciaCobranca({
              limit,
              funcionarioId,
            });
            rows =
              idsPendencia.length === 0
                ? []
                : await prisma.inventario.findMany({
                    where: {
                      AND: [
                        { id: { in: idsPendencia } },
                        ...(buscaWhere ? [buscaWhere] : []),
                      ],
                    },
                    orderBy: { id: "desc" },
                  });
          } else {
            const statusWhere = inventarioWhereStatus(status);
            const visaoWhere = visaoFuncionario
              ? status === "agendado" || !status
                ? { OR: [{ funcionario: funcionarioId }, { funcionario: null }] }
                : { funcionario: funcionarioId }
              : undefined;
            const parts = [statusWhere, visaoWhere, buscaWhere].filter(
              (p): p is NonNullable<typeof p> =>
                p != null && typeof p === "object" && Object.keys(p).length > 0,
            );
            const where =
              parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { AND: parts };
            rows = await prisma.inventario.findMany({
              where: where as never,
              orderBy: { id: "desc" },
              take: limit,
            });
          }

          const idsRecebimento = rows
            .filter((r) => statusPermiteRecebimento(r.status))
            .map((r) => r.id);
          const mapaRecebido = await mapaTotalRecebidoPorInventario(idsRecebimento);
          const cobrar = status === "finalizado" ? await mapaCobrarPendencia(idsRecebimento) : null;

          const items = rows.map((row) => {
              const item = {
                ...serializeInventario(row, { incluirItens: false }),
                osToken: criarOsToken(row.id),
              };
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
            });

          const listados =
            status === "pendencias"
              ? items.filter((i) => (i.saldoPendente ?? 0) > 0.009)
              : status === "finalizado"
                ? items.filter(
                    (i) =>
                      !((i.saldoPendente ?? 0) > 0.009 && (cobrar?.has(i.id) ?? false)),
                  )
                : items;

          return jsonResponse({
            ok: true,
            items: listados,
            truncated: rows.length >= limit,
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
          await ensureInventarioTextosCliente();
          const prisma = await getPrisma();
          const data = parsed.data;
          const dup = await prisma.inventario.findFirst({
            where: {
              status: "agendado",
              numero: data.numero.slice(0, 50),
              bairro: data.bairro.slice(0, 80),
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
          const horaPedido = formatHoraVisitaExibicao(String(data.hora ?? "").trim());
          let hora = horaPedido;
          if (!session) {
            const livres = await horariosLivresVisita(prisma, data.data);
            if (horaPedido && livres.includes(horaPedido)) {
              hora = horaPedido;
            } else if (!horaPedido && livres[0]) {
              hora = livres[0];
            } else if (livres.length === 0) {
              return corsJson(
                {
                  ok: false,
                  message:
                    "Esse dia já está cheio (mínimo 2 horas entre cada visita, das 8h às 18h). Escolha outra data.",
                },
                409,
              );
            } else {
              return corsJson(
                {
                  ok: false,
                  message: "Esse horário não está mais disponível. Escolha outro.",
                  horarios: livres,
                },
                409,
              );
            }
          } else if (!hora) {
            return corsJson({ ok: false, message: "Selecione o horário." }, 422);
          }
          const row = await prisma.inventario.create({
            data: buildInventarioCreateData({ ...data, hora }, funcionarioId),
          });
          return corsJson({
            ok: true,
            id: row.id,
            hora,
            message: "Agendamento recebido.",
          });
        } catch (err) {
          console.error("[POST /api/agendamentos]", err);
          return corsJson({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
