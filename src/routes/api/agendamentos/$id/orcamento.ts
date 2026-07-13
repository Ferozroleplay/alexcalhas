import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage, serializeInventario } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import { getPrisma } from "@/lib/db.server";
import { jsonResponse } from "@/lib/http.server";
import {
  filtroFuncionarioWhere,
  podeEditarOrcamentoExistente,
  podeEnviarOrcamento,
  sessionEhAdmin,
} from "@/lib/inventario-permissions.server";
import {
  encodeFormaPagamento,
  garantirTotalOrcamentoConsistente,
  inventarioSubtotalOrcamento,
  normalizarModoDesconto,
  mesclarLinhasOrcamento,
  parseOrcamentoJson,
  type OrcamentoLinha,
} from "@/lib/orcamento.server";

const linhaSchema = z.object({
  material: z.string(),
  metros: z.union([z.number(), z.string()]),
  valor: z.union([z.number(), z.string()]),
  valor_custo: z.union([z.number(), z.string()]).optional(),
  id: z.number().optional(),
});

const saveSchema = z.object({
  partData: z.array(linhaSchema).min(1),
  formaPagamento: z.string(),
  qtdParcelas: z.union([z.number(), z.string()]).optional(),
  taxaMaquininhaPct: z.union([z.number(), z.string()]).optional(),
  parcelasSemJuros: z.union([z.number(), z.string()]).optional(),
  descontoModo: z.string().optional(),
  descontoPercent: z.union([z.number(), z.string()]).optional(),
  descontoValor: z.union([z.number(), z.string()]).optional(),
  valor: z.union([z.number(), z.string()]).optional(),
  cpfCnpj: z.string().optional(),
  observacao: z.string().optional(),
});

function normalizeLinhas(raw: z.infer<typeof linhaSchema>[]): OrcamentoLinha[] {
  return raw.map((x) => ({
    material: x.material,
    metros: Number(String(x.metros).replace(",", ".")) || 0,
    valor: Number(String(x.valor).replace(",", ".")) || 0,
    valor_custo:
      x.valor_custo != null ? Number(String(x.valor_custo).replace(",", ".")) : undefined,
    id: x.id,
  }));
}

export const Route = createFileRoute("/api/agendamentos/$id/orcamento")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const session = getAdminSessionFromRequest(request);
        if (!session || !podeEditarOrcamentoExistente(session)) {
          return jsonResponse({ ok: false, message: "Somente administradores." }, 403);
        }

        const id = Number(params.id);
        if (!Number.isFinite(id) || id < 1) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findFirst({
            where: {
              id,
              OR: [
                { status: "orcamentado" },
                { status: "orçamentado" },
                { status: "confirmado" },
              ],
              ...filtroFuncionarioWhere(session),
            },
          });
          if (!row) {
            return jsonResponse({ ok: false, message: "Orçamento não encontrado." }, 404);
          }

          return jsonResponse({
            ok: true,
            dados: {
              partData: parseOrcamentoJson(row.orcamento),
              valor: Number(row.valor),
              descontoPercent: Number(row.descontoPercent),
              observacao: row.observacao ?? "",
              cpfCnpj: row.cpfCnpj ?? "",
              formaPagamento: row.formaPagamento ?? "",
            },
          });
        } catch (err) {
          console.error("[GET orcamento]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const session = getAdminSessionFromRequest(request);
        if (!session || !podeEnviarOrcamento(session)) {
          return jsonResponse({ ok: false, message: "Sem permissão." }, 403);
        }

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

        const parsed = saveSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }

        const forma = encodeFormaPagamento(
          parsed.data.formaPagamento,
          parsed.data.qtdParcelas,
          parsed.data.taxaMaquininhaPct,
          parsed.data.parcelasSemJuros,
        );
        if (!forma) {
          return jsonResponse(
            { ok: false, message: "Selecione PIX, Débito ou Crédito." },
            422,
          );
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findFirst({
            where: { id, status: "agendado" },
          });
          if (!row) {
            return jsonResponse({ ok: false, message: "Visita não encontrada." }, 404);
          }

          const linhas = mesclarLinhasOrcamento(normalizeLinhas(parsed.data.partData));
          const subtotal = inventarioSubtotalOrcamento(linhas);
          const modo = normalizarModoDesconto(parsed.data.descontoModo ?? "percent");
          const resolved = garantirTotalOrcamentoConsistente(
            subtotal,
            modo,
            parsed.data.descontoPercent,
            parsed.data.descontoValor,
            parsed.data.valor,
          );

          const cpfRaw = (parsed.data.cpfCnpj ?? "").replace(/\D/g, "");
          const updated = await prisma.inventario.update({
            where: { id },
            data: {
              status: "orcamentado",
              orcamento: JSON.stringify(linhas),
              valor: resolved.total,
              descontoPercent: resolved.percent,
              formaPagamento: forma,
              observacao: parsed.data.observacao?.trim() || null,
              cpfCnpj: cpfRaw !== "" ? cpfRaw : row.cpfCnpj,
              funcionario: session.userId,
            },
          });

          return jsonResponse({
            ok: true,
            message: "Orçamento gerado com sucesso!",
            item: serializeInventario(updated),
            nome: updated.nome,
            telefone: updated.telefone,
            valor: resolved.total,
          });
        } catch (err) {
          console.error("[POST orcamento]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PUT: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const session = getAdminSessionFromRequest(request);
        if (!session || !sessionEhAdmin(session)) {
          return jsonResponse({ ok: false, message: "Somente administradores." }, 403);
        }

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

        const parsed = saveSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }

        const forma = encodeFormaPagamento(
          parsed.data.formaPagamento,
          parsed.data.qtdParcelas,
          parsed.data.taxaMaquininhaPct,
          parsed.data.parcelasSemJuros,
        );
        if (!forma) {
          return jsonResponse(
            { ok: false, message: "Selecione PIX, Débito ou Crédito." },
            422,
          );
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findFirst({
            where: {
              id,
              OR: [
                { status: "orcamentado" },
                { status: "orçamentado" },
                { status: "confirmado" },
              ],
            },
          });
          if (!row) {
            return jsonResponse({ ok: false, message: "Orçamento não encontrado." }, 404);
          }

          const linhas = mesclarLinhasOrcamento(normalizeLinhas(parsed.data.partData));
          const subtotal = inventarioSubtotalOrcamento(linhas);
          const modo = normalizarModoDesconto(parsed.data.descontoModo ?? "percent");
          const resolved = garantirTotalOrcamentoConsistente(
            subtotal,
            modo,
            parsed.data.descontoPercent,
            parsed.data.descontoValor,
            parsed.data.valor,
          );

          const cpfRaw = (parsed.data.cpfCnpj ?? "").replace(/\D/g, "");
          const updated = await prisma.inventario.update({
            where: { id },
            data: {
              orcamento: JSON.stringify(linhas),
              valor: resolved.total,
              descontoPercent: resolved.percent,
              formaPagamento: forma,
              observacao: parsed.data.observacao?.trim() || null,
              cpfCnpj: cpfRaw !== "" ? cpfRaw : row.cpfCnpj,
            },
          });

          return jsonResponse({
            ok: true,
            message: "Orçamento atualizado com sucesso!",
            item: serializeInventario(updated),
            valor: resolved.total,
          });
        } catch (err) {
          console.error("[PUT orcamento]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
