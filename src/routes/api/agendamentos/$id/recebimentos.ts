import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage, serializeInventario } from "@/lib/agendamento.server";
import { quantidadeLinhaOrcamento, totalLinhaOrcamento } from "@/lib/os-document";
import { splitMaterialOrcamentoLabel } from "@/lib/orcamento.server";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import { getPrisma } from "@/lib/db.server";
import { formatMoeda } from "@/lib/financeiro-display";
import { jsonResponse } from "@/lib/http.server";
import {
  atualizarRecebimentoInventario,
  criarRecebimentoInventario,
  excluirRecebimentoInventario,
  listarRecebimentosInventario,
  pagoEmParaSql,
  statusPermiteRecebimento,
  valorPagamentoNumero,
} from "@/lib/inventario-recebimento.server";
import { podeEnviarOrcamento, sessionEhAdmin } from "@/lib/inventario-permissions.server";

const postSchema = z.object({
  valor: z.union([z.string(), z.number()]),
  tipo: z.string().trim().max(20).optional(),
  pago_em: z.string().trim().min(1),
  observacao: z.string().trim().max(255).optional(),
});

const patchSchema = postSchema.extend({
  recebimento_id: z.number().int().positive(),
});

export const Route = createFileRoute("/api/agendamentos/$id/recebimentos")({
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
          if (!statusPermiteRecebimento(row.status)) {
            return jsonResponse({ ok: false, message: "Recebimentos só em orçamentado, confirmado ou finalizado." }, 400);
          }

          const cliente = serializeInventario(row);
          const valorOrcamento = Number(cliente.valor) || 0;
          const data = await listarRecebimentosInventario(id, valorOrcamento);
          return jsonResponse({
            ok: true,
            valor_orcamento: valorOrcamento,
            cliente: {
              id: cliente.id,
              nome: cliente.nome,
              cpfCnpj: cliente.cpfCnpj,
              telefone: cliente.telefone,
              endereco: cliente.endereco,
              numero: cliente.numero,
              bairro: cliente.bairro,
              cep: cliente.cep,
              dataMontagem: cliente.dataMontagem,
              formaPagamento: cliente.formaPagamento,
              servicos: (cliente.orcamentoItens ?? []).slice(0, 12).flatMap((linha) => {
                const partes = splitMaterialOrcamentoLabel(linha.material);
                const nome = partes.titulo || linha.material.trim();
                if (!nome) return [];
                const qtd = quantidadeLinhaOrcamento(linha);
                const qtdTxt = qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
                const detalhe = [partes.perfil, `${qtdTxt} m`].filter(Boolean).join(" · ");
                return [{ nome, detalhe, valor: totalLinhaOrcamento(linha) }];
              }),
            },
            recebimentos: data.recebimentos,
            resumo: data.resumo,
          });
        } catch (err) {
          console.error("[GET recebimentos]", err);
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

        const parsed = postSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }

        if (!pagoEmParaSql(parsed.data.pago_em)) {
          return jsonResponse({ ok: false, message: "Data ou hora inválida." }, 422);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findUnique({ where: { id } });
          if (!row) return jsonResponse({ ok: false, message: "Registro não encontrado." }, 404);
          if (!statusPermiteRecebimento(row.status)) {
            return jsonResponse({ ok: false, message: "Recebimentos só em orçamentado, confirmado ou finalizado." }, 400);
          }

          const valorOrcamento = Number(serializeInventario(row).valor) || 0;
          const valorNum = valorPagamentoNumero(parsed.data.valor);
          const atual = await listarRecebimentosInventario(id, valorOrcamento);
          if (valorNum > atual.resumo.saldoPendente + 0.009) {
            return jsonResponse(
              {
                ok: false,
                message: `O valor passa do saldo. Ainda falta R$ ${formatMoeda(atual.resumo.saldoPendente)}.`,
              },
              400,
            );
          }

          const res = await criarRecebimentoInventario({
            inventarioId: id,
            valor: valorNum,
            tipo: parsed.data.tipo ?? "sinal",
            pagoEm: parsed.data.pago_em,
            observacao: parsed.data.observacao,
            registradoPor: session.userId,
          });
          if (!res.ok) return jsonResponse({ ok: false, message: res.message }, 400);

          const data = await listarRecebimentosInventario(id, valorOrcamento);
          return jsonResponse({
            ok: true,
            message: res.message,
            recebimento_id: res.id ?? 0,
            recebimentos: data.recebimentos,
            resumo: data.resumo,
          });
        } catch (err) {
          console.error("[POST recebimentos]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request, params }) => {
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

        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }
        if (!pagoEmParaSql(parsed.data.pago_em)) {
          return jsonResponse({ ok: false, message: "Data ou hora inválida." }, 422);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findUnique({ where: { id } });
          if (!row) return jsonResponse({ ok: false, message: "Registro não encontrado." }, 404);
          if (!statusPermiteRecebimento(row.status)) {
            return jsonResponse({ ok: false, message: "Recebimentos só em orçamentado, confirmado ou finalizado." }, 400);
          }

          const valorOrcamento = Number(serializeInventario(row).valor) || 0;
          const valorNum = valorPagamentoNumero(parsed.data.valor);
          const atual = await listarRecebimentosInventario(id, valorOrcamento);
          const existente = atual.recebimentos.find((r) => r.id === parsed.data.recebimento_id);
          if (!existente) {
            return jsonResponse({ ok: false, message: "Pagamento não encontrado." }, 404);
          }
          const teto = atual.resumo.saldoPendente + existente.valor;
          if (valorNum > teto + 0.009) {
            return jsonResponse(
              {
                ok: false,
                message: `O valor passa do saldo. O máximo deste pagamento é R$ ${formatMoeda(teto)}.`,
              },
              400,
            );
          }

          const res = await atualizarRecebimentoInventario({
            recebimentoId: parsed.data.recebimento_id,
            inventarioId: id,
            valor: valorNum,
            tipo: parsed.data.tipo ?? existente.tipo,
            pagoEm: parsed.data.pago_em,
            observacao: parsed.data.observacao,
          });
          if (!res.ok) return jsonResponse({ ok: false, message: res.message }, 400);

          const data = await listarRecebimentosInventario(id, valorOrcamento);
          return jsonResponse({
            ok: true,
            message: res.message,
            recebimentos: data.recebimentos,
            resumo: data.resumo,
          });
        } catch (err) {
          console.error("[PATCH recebimentos]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        const session = getAdminSessionFromRequest(request);
        if (!session || !sessionEhAdmin(session)) {
          return jsonResponse({ ok: false, message: "Somente admin pode excluir pagamentos." }, 403);
        }

        const id = Number(params.id);
        const url = new URL(request.url);
        const recId = Number(url.searchParams.get("recebimentoId"));
        if (!Number.isFinite(id) || id < 1 || !Number.isFinite(recId) || recId < 1) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 400);
        }

        try {
          const prisma = await getPrisma();
          const row = await prisma.inventario.findUnique({ where: { id } });
          if (!row) return jsonResponse({ ok: false, message: "Registro não encontrado." }, 404);

          const res = await excluirRecebimentoInventario(recId, id);
          if (!res.ok) return jsonResponse({ ok: false, message: res.message }, 400);

          const valorOrcamento = Number(serializeInventario(row).valor) || 0;
          const data = await listarRecebimentosInventario(id, valorOrcamento);
          return jsonResponse({
            ok: true,
            message: res.message,
            recebimentos: data.recebimentos,
            resumo: data.resumo,
          });
        } catch (err) {
          console.error("[DELETE recebimentos]", err);
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
