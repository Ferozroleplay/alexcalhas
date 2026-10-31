import { createFileRoute } from "@tanstack/react-router";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { ehDiaVisita } from "@/lib/agendamento-horarios";
import {
  dataBrParaInput,
  dataInputParaDb,
  dataVisitaParaIso,
  dbErrorMessage,
  ensureInventarioTextosCliente,
  normalizarHoraVisitaDb,
  serializeInventario,
} from "@/lib/agendamento.server";
import { resolveHoraVisitaInventario } from "@/lib/inventario-format";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import { getPrisma } from "@/lib/db.server";
import { jsonResponse } from "@/lib/http.server";
import { podeEditarClienteInventario } from "@/lib/inventario-permissions.server";

const patchSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  telefone: z.string().trim().max(50),
  cpfCnpj: z.string().trim().max(20).optional(),
  endereco: z.string().trim().max(180),
  bairro: z.string().trim().max(80),
  numero: z.string().trim().max(50),
  cep: z.string().trim().max(50).optional(),
  data: z.string().trim().optional(),
  hora: z.string().trim().max(50).optional(),
  dataMontagem: z.string().trim().optional(),
  observacao: z.string().trim().max(1000).optional(),
});

export const Route = createFileRoute("/api/agendamentos/$id/cliente")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const session = getAdminSessionFromRequest(request);
        if (!session) return jsonResponse({ ok: false, message: "Não autorizado." }, 401);

        const id = Number(params.id);
        if (!Number.isFinite(id) || id < 1) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findUnique({ where: { id } });
          if (!row) return jsonResponse({ ok: false, message: "Registro não encontrado." }, 404);
          if (!podeEditarClienteInventario(session, row)) {
            return jsonResponse({ ok: false, message: "Sem permissão." }, 403);
          }

          let cpf = (row.cpfCnpj ?? "").replace(/\D/g, "");
          if (cpf === "00000000000") cpf = "";

          return jsonResponse({
            ok: true,
            dados: {
              id: row.id,
              nome: row.nome,
              telefone: row.telefone,
              cpfCnpj: cpf,
              endereco: row.endereco,
              bairro: row.bairro,
              numero: row.numero,
              cep: row.cep,
              dataVisita: dataBrParaInput(row.dataVisita),
              horaVisita: resolveHoraVisitaInventario({
                horaVisita: row.horaVisita,
                dataVisita: row.dataVisita,
                status: row.status,
              }),
              dataMontagem: row.dataMontagem ? dataBrParaInput(row.dataMontagem) : "",
              observacao: row.observacao ?? "",
              status: row.status,
            },
          });
        } catch (err) {
          console.error("[GET cliente]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const session = getAdminSessionFromRequest(request);
        if (!session) return jsonResponse({ ok: false, message: "Não autorizado." }, 401);

        const id = Number(params.id);
        if (!Number.isFinite(id) || id < 1) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, message: "JSON inválido." }, 400);
        }

        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findUnique({ where: { id } });
          if (!row) return jsonResponse({ ok: false, message: "Registro não encontrado." }, 404);
          if (!podeEditarClienteInventario(session, row)) {
            return jsonResponse({ ok: false, message: "Sem permissão." }, 403);
          }

          await ensureInventarioTextosCliente();
          const d = parsed.data;
          const cpfRaw = (d.cpfCnpj ?? "").replace(/\D/g, "");
          const cpfCnpj = cpfRaw !== "" ? cpfRaw : "00000000000";

          const update: Prisma.InventarioUpdateInput = {
            nome: d.nome,
            telefone: d.telefone,
            cpfCnpj,
            endereco: d.endereco,
            bairro: d.bairro,
            numero: d.numero,
            cep: (d.cep ?? "").slice(0, 50),
          };

          if (row.status === "agendado") {
            if (d.data) update.dataVisita = dataInputParaDb(d.data);
            if (d.hora) update.horaVisita = normalizarHoraVisitaDb(d.hora);
            if (d.observacao !== undefined) {
              update.observacao = d.observacao.trim() || null;
            }

            const dup = await prisma.inventario.findFirst({
              where: {
                status: "agendado",
                numero: d.numero,
                bairro: d.bairro,
                NOT: { id },
              },
            });
            if (dup) {
              return jsonResponse(
                { ok: false, message: "Já existe outra visita agendada para esse endereço." },
                409,
              );
            }
          }

          const st = row.status.toLowerCase();
          if (
            ["confirmado", "orcamentado", "orçamentado"].includes(st) &&
            d.dataMontagem?.trim()
          ) {
            const isoMontagem = dataVisitaParaIso(d.dataMontagem);
            if (!isoMontagem || !ehDiaVisita(isoMontagem)) {
              return jsonResponse(
                { ok: false, message: "Não montamos em fim de semana nem feriado. Escolha um dia útil." },
                422,
              );
            }
            update.dataMontagem = dataInputParaDb(d.dataMontagem);
          }

          const updated = await prisma.inventario.update({
            where: { id },
            data: update,
          });

          return jsonResponse({
            ok: true,
            message: "Dados do cliente atualizados com sucesso!",
            item: serializeInventario(updated),
          });
        } catch (err) {
          console.error("[PATCH cliente]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
