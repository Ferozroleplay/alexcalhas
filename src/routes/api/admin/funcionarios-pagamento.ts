import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { getAdminSessionFromRequest, isAdminRequest } from "@/lib/auth.server";
import { ymdLocal } from "@/lib/funcionario-pagamento-dates";
import {
  empreitaToggleDia,
  excluirPagamento,
  listarFuncionarios,
  listarPagamentosHistorico,
  montarCardsSemana,
  montarDadosSemana,
  pagamentoInicioSemana,
  pagamentoParseValor,
  buscarMapaEmpreitaDiasPorSemana,
  buscarMapaPagamentosSemanas,
  gerarSemanasAnteriores,
  resumoFuncionariosPeriodo,
  salvarPagamento,
  valeExcluir,
  valeSalvar,
  type DiaChave,
} from "@/lib/funcionario-pagamento.server";
import { jsonResponse } from "@/lib/http.server";

const diasSchema = z.object({
  seg: z.boolean(),
  ter: z.boolean(),
  qua: z.boolean(),
  qui: z.boolean(),
  sex: z.boolean(),
});

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("salvar"),
    usuario_id: z.number().int().positive(),
    semana_inicio: z.string(),
    valor: z.union([z.number(), z.string()]),
    valor_diario: z.union([z.number(), z.string()]),
    observacao: z.string().optional(),
    id: z.number().int().positive().optional(),
    dias: diasSchema,
    confirmar: z.boolean().optional(),
  }),
  z.object({ action: z.literal("excluir"), id: z.number().int().positive() }),
  z.object({
    action: z.literal("vale_salvar"),
    usuario_id: z.number().int().positive(),
    semana_inicio: z.string(),
    valor: z.union([z.number(), z.string()]),
    observacao: z.string().optional(),
    data_vale: z.string().optional(),
  }),
  z.object({ action: z.literal("vale_excluir"), id: z.number().int().positive() }),
  z.object({
    action: z.literal("empreita_dia"),
    usuario_id: z.number().int().positive(),
    semana_inicio: z.string(),
    dia_chave: z.enum(["seg", "ter", "qua", "qui", "sex"]),
    valor: z.union([z.number(), z.string()]),
    observacao: z.string().optional(),
  }),
]);

function semanaNav(semana: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(semana)!;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const anterior = new Date(base);
  anterior.setDate(anterior.getDate() - 7);
  const proxima = new Date(base);
  proxima.setDate(proxima.getDate() + 7);
  return {
    semana_anterior: ymdLocal(anterior),
    semana_proxima: ymdLocal(proxima),
    hoje_semana: pagamentoInicioSemana(ymdLocal(new Date())),
  };
}

export const Route = createFileRoute("/api/admin/funcionarios-pagamento")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!session) return jsonResponse({ ok: false }, 401);

        const url = new URL(request.url);
        const semana = pagamentoInicioSemana(url.searchParams.get("semana") ?? ymdLocal(new Date()));
        const usuarioId = Number(url.searchParams.get("usuario") ?? 0);
        const modal = url.searchParams.get("modal") === "1";

        try {
          // Funcionário: somente leitura, somente o próprio histórico.
          if (session.visao === "funcionário") {
            const de =
              url.searchParams.get("de")?.trim() ||
              ymdLocal(new Date(Date.now() - 180 * 86400000));
            const ate = url.searchParams.get("ate")?.trim() || ymdLocal(new Date());

            const uid = session.userId;

            if (modal) {
              return jsonResponse(
                { ok: false, message: "Acesso apenas na visão administrador." },
                403,
              );
            }

            const cardsAll = await montarCardsSemana(semana);
            const historico = await listarPagamentosHistorico(de, ate, uid);

            const cards = cardsAll.filter((c) => c.usuario_id === uid);
            const totalHistorico = historico.reduce((s, h) => s + h.valor, 0);

            return jsonResponse({
              ok: true,
              semana,
              updated_at: new Date().toLocaleString("pt-BR"),
              ...semanaNav(semana),
              cards,
              pendentes: cards.filter((c) => !c.pago).length,
              historico,
              total_historico: totalHistorico,
              funcionarios: [{ id: uid, nome: session.nome }],
              semanas_mapa: [],
              mapa_pagamentos: { [uid]: {} },
              empreita_dias_mapa: { [uid]: {} },
              resumo_funcionarios: [],
              total_resumo_periodo: totalHistorico,
              filtro: { de, ate, usuario: uid },
            });
          }

          // Admin: visão de administração completa.
          if (session.visao !== "admin") {
            return jsonResponse({ ok: false, message: "Acesso apenas na visão administrador." }, 403);
          }

          if (modal && usuarioId > 0) {
            const dados = await montarDadosSemana(usuarioId, semana);
            if (!dados) return jsonResponse({ ok: false, message: "Funcionário não encontrado." }, 404);
            return jsonResponse({ ok: true, dados });
          }

          const de =
            url.searchParams.get("de")?.trim() ||
            ymdLocal(new Date(Date.now() - 90 * 86400000));
          const ate = url.searchParams.get("ate")?.trim() || ymdLocal(new Date());
          const filtroUser = Number(url.searchParams.get("usuario_filtro") ?? 0);

          const [cards, historico, funcionarios] = await Promise.all([
            montarCardsSemana(semana),
            listarPagamentosHistorico(de, ate, filtroUser > 0 ? filtroUser : undefined),
            listarFuncionarios(),
          ]);

          const semanasMapa = gerarSemanasAnteriores(semana, 8);
          const idsMapa = cards.map((c) => c.usuario_id);
          const [mapaPagamentos, empreitaDiasMapa, resumoFuncionarios] = await Promise.all([
            buscarMapaPagamentosSemanas(semanasMapa),
            buscarMapaEmpreitaDiasPorSemana(semanasMapa, idsMapa),
            resumoFuncionariosPeriodo(de, ate),
          ]);

          const pendentes = cards.filter((c) => !c.pago).length;
          const totalResumo = resumoFuncionarios.reduce((s, r) => s + r.total_pago, 0);
          const totalHistorico = historico.reduce((s, h) => s + h.valor, 0);

          return jsonResponse({
            ok: true,
            semana,
            updated_at: new Date().toLocaleString("pt-BR"),
            ...semanaNav(semana),
            cards,
            pendentes,
            historico,
            total_historico: totalHistorico,
            funcionarios,
            semanas_mapa: semanasMapa,
            mapa_pagamentos: mapaPagamentos,
            empreita_dias_mapa: empreitaDiasMapa,
            resumo_funcionarios: resumoFuncionarios,
            total_resumo_periodo: totalResumo,
            filtro: { de, ate, usuario: filtroUser },
          });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const session = getAdminSessionFromRequest(request);
        if (!session || session.visao !== "admin") {
          return jsonResponse({ ok: false, message: "Acesso apenas na visão administrador." }, 403);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, message: "JSON inválido." }, 400);
        }

        const parsed = postSchema.safeParse(body);
        if (!parsed.success) return jsonResponse({ ok: false, message: "Dados inválidos." }, 400);

        try {
          const adminId = session.userId;

          if (parsed.data.action === "excluir") {
            await excluirPagamento(parsed.data.id);
            return jsonResponse({ ok: true, message: "Pagamento excluído." });
          }

          if (parsed.data.action === "vale_excluir") {
            await valeExcluir(parsed.data.id);
            return jsonResponse({ ok: true, message: "Vale excluído." });
          }

          if (parsed.data.action === "vale_salvar") {
            const d = parsed.data;
            const res = await valeSalvar(
              adminId,
              d.usuario_id,
              d.semana_inicio,
              pagamentoParseValor(d.valor),
              d.observacao ?? "",
              d.data_vale,
            );
            if (!res.ok) return jsonResponse({ ok: false, message: res.message }, 400);
            const dados = await montarDadosSemana(d.usuario_id, d.semana_inicio);
            return jsonResponse({ ok: true, message: res.message, dados });
          }

          if (parsed.data.action === "empreita_dia") {
            const d = parsed.data;
            const res = await empreitaToggleDia(
              adminId,
              d.usuario_id,
              d.semana_inicio,
              d.dia_chave as DiaChave,
              pagamentoParseValor(d.valor),
              d.observacao ?? "",
            );
            if (!res.ok) return jsonResponse({ ok: false, message: res.message }, 400);
            const dados = await montarDadosSemana(d.usuario_id, d.semana_inicio);
            return jsonResponse({ ok: true, message: res.message, dados });
          }

          const d = parsed.data;
          const res = await salvarPagamento(
            adminId,
            d.usuario_id,
            d.semana_inicio,
            pagamentoParseValor(d.valor),
            d.observacao ?? "",
            pagamentoParseValor(d.valor_diario),
            d.dias as Record<DiaChave, boolean>,
            d.id,
            d.confirmar === true,
          );
          return jsonResponse({ ok: res.ok, message: res.message }, res.ok ? 200 : 400);
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
