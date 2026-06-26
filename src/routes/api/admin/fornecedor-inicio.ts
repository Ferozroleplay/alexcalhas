import { createFileRoute } from "@tanstack/react-router";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import {
  fornecedorDashEntregasPorUsuario,
  fornecedorDashFinanceiro,
  fornecedorDashFormatarDataHora,
  fornecedorDashNomeEmpresa,
  fornecedorDashPercentualRecebidas,
  fornecedorDashPercentualValorRecebido,
  fornecedorDashPercentualPagamentoConfirmado,
  fornecedorDashResumo,
  fornecedorDashUltimasEntregas,
  fornecedorDashValorPendente,
  resolverFornecedorIdSessao,
} from "@/lib/fornecedor-dashboard.server";
import { jsonResponse } from "@/lib/http.server";

export const Route = createFileRoute("/api/admin/fornecedor-inicio")({
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

        try {
          const fornecedorId = await resolverFornecedorIdSessao(session, controleQuery);
          if (fornecedorId <= 0) {
            return jsonResponse({
              ok: true,
              fornecedor_id: 0,
              nome_empresa: "",
              erro: "sem_vinculo",
              resumo: {
                total: 0,
                recebidas: 0,
                aguardando: 0,
                suas_entregas: 0,
                suas_recebidas: 0,
              },
              percentual: 0,
              percentual_valor: 0,
              percentual_pagamento: 0,
              valor_pendente: 0,
              financeiro: {
                valor_enviado: 0,
                valor_recebido: 0,
                valor_aguardando: 0,
                valor_pago: 0,
                valor_pago_confirmado: 0,
              },
              por_usuario: [],
              ultimas: [],
              updated_at: new Date().toLocaleString("pt-BR"),
            });
          }

          const nomeEmpresa = await fornecedorDashNomeEmpresa(fornecedorId);
          const resumo = await fornecedorDashResumo(fornecedorId, session.userId);
          const financeiro = await fornecedorDashFinanceiro(fornecedorId);
          const porUsuario = await fornecedorDashEntregasPorUsuario(fornecedorId);
          const ultimasRaw = await fornecedorDashUltimasEntregas(fornecedorId, 5);
          const ultimas = ultimasRaw.map((e) => ({
            id: e.id,
            status: e.status,
            enviado_em: e.enviado_em,
            enviado_em_fmt: fornecedorDashFormatarDataHora(e.enviado_em),
            qtd_itens: e.qtd_itens,
            total_valor: e.total_valor,
            usuario_nome: e.usuario_nome ?? "—",
          }));

          return jsonResponse({
            ok: true,
            fornecedor_id: fornecedorId,
            nome_empresa: nomeEmpresa,
            resumo,
            financeiro,
            percentual: fornecedorDashPercentualRecebidas(resumo),
            percentual_valor: fornecedorDashPercentualValorRecebido(financeiro),
            percentual_pagamento: fornecedorDashPercentualPagamentoConfirmado(financeiro),
            valor_pendente: fornecedorDashValorPendente(financeiro),
            por_usuario: porUsuario,
            ultimas,
            updated_at: new Date().toLocaleString("pt-BR"),
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
