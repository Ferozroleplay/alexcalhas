import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import {
  adicionarItemCarrinhoEntrega,
  carrinhoCookieHeader,
  clearCarrinhoCookieHeader,
  enviarCarrinhoEntrega,
  getCarrinhoFromRequest,
  removerItemCarrinhoEntrega,
  type CarrinhoItemEntrega,
} from "@/lib/fornecedor-carrinho.server";
import { fornecedorDashNomeEmpresa, resolverFornecedorIdSessao } from "@/lib/fornecedor-dashboard.server";
import { listarMateriaisLiberadosFornecedor } from "@/lib/fornecedor-materiais.server";
import {
  confirmarPagamentoFornecedor,
  listarEntregasAdmin,
  listarFornecedores,
  obterEntregaCompleta,
} from "@/lib/fornecedores.server";
import { jsonResponse } from "@/lib/http.server";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adicionar_item"),
    material_id: z.number().int().positive(),
    metros: z.union([z.string(), z.number()]),
    valor_unitario: z.union([z.string(), z.number()]),
    observacao: z.string().optional().default(""),
  }),
  z.object({
    action: z.literal("remover_item"),
    temp_id: z.string().min(1),
  }),
  z.object({
    action: z.literal("enviar_entrega"),
    observacao_entrega: z.string().optional().default(""),
  }),
  z.object({
    action: z.literal("confirmar_pagamento"),
    entrega_id: z.number().int().positive(),
    item_ids: z.array(z.number().int().positive()).optional(),
  }),
]);

function jsonWithCookies(
  data: Record<string, unknown>,
  status: number,
  cookies: Array<[string, string]>,
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const c of cookies) headers.append(c[0], c[1]);
  return new Response(JSON.stringify(data), { status, headers });
}

async function portalFornecedorId(
  session: NonNullable<ReturnType<typeof getAdminSessionFromRequest>>,
  controleQuery: number,
) {
  return resolverFornecedorIdSessao(session, controleQuery);
}

export const Route = createFileRoute("/api/admin/fornecedor-portal")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!session || session.visao !== "fornecedor") {
          return jsonResponse({ ok: false, message: "Disponível na visão fornecedor." }, 403);
        }

        const url = new URL(request.url);
        const controleQuery = Number(url.searchParams.get("controle") ?? 0);
        const ver = Number.parseInt(url.searchParams.get("ver") ?? "", 10);
        let status = url.searchParams.get("status") ?? "todas";
        if (!["enviado", "recebido", "todas"].includes(status)) status = "todas";

        try {
          const fornecedorId = await portalFornecedorId(session, controleQuery);
          if (fornecedorId <= 0) {
            return jsonResponse({
              ok: true,
              fornecedor_id: 0,
              erro: "sem_vinculo",
              entregas: [],
              materiais: [],
              carrinho: [],
            });
          }

          if (ver > 0) {
            const entrega = await obterEntregaCompleta(ver);
            if (!entrega || entrega.fornecedor_id !== fornecedorId) {
              return jsonResponse({ ok: false, message: "Entrega não encontrada." }, 404);
            }
            return jsonResponse({ ok: true, fornecedor_id: fornecedorId, entrega });
          }

          const filtro =
            status === "enviado" ? "enviado" : status === "recebido" ? "recebido" : "todas";
          const entregas = await listarEntregasAdmin(filtro, fornecedorId);
          const fornecedores = await listarFornecedores();
          const fornecedor = fornecedores.find((f) => f.id === fornecedorId) ?? null;
          const nomeEmpresa =
            fornecedor?.nome_fantasia || fornecedor?.razao_social || (await fornecedorDashNomeEmpresa(fornecedorId));
          const materiais = await listarMateriaisLiberadosFornecedor(fornecedorId);
          const carrinho = getCarrinhoFromRequest(request, fornecedorId);

          return jsonResponse({
            ok: true,
            fornecedor_id: fornecedorId,
            nome_empresa: nomeEmpresa,
            fornecedor,
            entregas,
            materiais,
            carrinho,
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!session || session.visao !== "fornecedor") {
          return jsonResponse({ ok: false, message: "Disponível na visão fornecedor." }, 403);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, message: "JSON inválido." }, 400);
        }

        const parsed = postSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 400);
        }

        const url = new URL(request.url);
        const controleQuery = Number(url.searchParams.get("controle") ?? 0);

        try {
          const fornecedorId = await portalFornecedorId(session, controleQuery);
          if (fornecedorId <= 0) {
            return jsonResponse({ ok: false, message: "Conta sem empresa vinculada." }, 403);
          }

          const cookies: Array<[string, string]> = [];

          if (parsed.data.action === "adicionar_item") {
            const res = await adicionarItemCarrinhoEntrega(request, fornecedorId, parsed.data);
            if (res.setCookie) cookies.push(carrinhoCookieHeader(res.setCookie));
            return jsonWithCookies(
              { ok: res.ok, message: res.message, carrinho: res.carrinho },
              res.ok ? 200 : 400,
              cookies,
            );
          }

          if (parsed.data.action === "remover_item") {
            const res = await removerItemCarrinhoEntrega(
              request,
              fornecedorId,
              parsed.data.temp_id,
            );
            if (res.setCookie) cookies.push(carrinhoCookieHeader(res.setCookie));
            return jsonWithCookies(
              { ok: res.ok, message: res.message, carrinho: res.carrinho },
              200,
              cookies,
            );
          }

          if (parsed.data.action === "confirmar_pagamento") {
            const res = await confirmarPagamentoFornecedor(
              parsed.data.entrega_id,
              fornecedorId,
              parsed.data.item_ids,
            );
            return jsonWithCookies({ ok: res.ok, message: res.message }, res.ok ? 200 : 400, cookies);
          }

          const res = await enviarCarrinhoEntrega(
            request,
            fornecedorId,
            session.userId,
            parsed.data.observacao_entrega,
          );
          if (res.clearCookie) cookies.push(clearCarrinhoCookieHeader());
          return jsonWithCookies(
            {
              ok: res.ok,
              message: res.message,
              entrega_id: res.entrega_id,
              carrinho: [] as CarrinhoItemEntrega[],
            },
            res.ok ? 200 : 400,
            cookies,
          );
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
