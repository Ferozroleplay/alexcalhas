import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminRequest } from "@/lib/auth.server";
import { baixarEstoquesConfirmadosPendentes } from "@/lib/estoque-baixa.server";
import { jsonResponse } from "@/lib/http.server";
import {
  createMaterial,
  deleteMaterial,
  findMaterialByNome,
  listMateriais,
  salvarMaterialFornecedoresLiberados,
  setTodosEstoques,
  setTodosEstoquesMinimos,
  updateMaterial,
} from "@/lib/materiais.server";

function parseMoney(raw: unknown): number {
  const v = String(raw ?? "0").replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function parseNum(raw: unknown): number {
  const v = String(raw ?? "0").replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function moneyOr(raw: unknown, fallback = 0): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  return parseMoney(raw);
}

function numOr(raw: unknown, fallback = 0): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  return parseNum(raw);
}

const bodySchema = z.object({
  material: z.string().trim().min(1).max(255),
  valor_custo: z.union([z.number(), z.string()]).optional(),
  valor: z.union([z.number(), z.string()]),
  valor_fornecedor: z.union([z.number(), z.string()]).optional(),
  codigo: z.string().optional(),
  descricao_nfe: z.string().optional(),
  unidade: z.string().optional(),
  departamento: z.string().optional(),
  subdepartamento: z.string().optional(),
  marca: z.string().optional(),
  tipo_material: z.string().optional(),
  referencia: z.string().optional(),
  caracteristica: z.string().optional(),
  situacao: z.string().optional(),
  servico: z.union([z.boolean(), z.number(), z.string()]).optional(),
  situacao_tributaria: z.string().optional(),
  ncm: z.string().optional(),
  ean: z.string().optional(),
  estoque_minimo: z.union([z.number(), z.string()]).optional(),
  capacidade_total: z.union([z.number(), z.string()]).optional(),
  estoque_negativo: z.union([z.boolean(), z.number(), z.string()]).optional(),
  fator: z.union([z.number(), z.string()]).optional(),
  tipo_fator: z.string().optional(),
  chapa_mm: z.string().optional(),
  corte_cm: z.union([z.number(), z.string()]).optional(),
  custo_mercado: z.union([z.number(), z.string()]).optional(),
  custo_formacao: z.union([z.number(), z.string()]).optional(),
  margem_desejada: z.union([z.number(), z.string()]).optional(),
  margem_aplicada: z.union([z.number(), z.string()]).optional(),
  perc_comissao: z.union([z.number(), z.string()]).optional(),
  saldo_loja: z.union([z.number(), z.string()]).optional(),
  saldo_geral: z.union([z.number(), z.string()]).optional(),
  custo_loja: z.union([z.number(), z.string()]).optional(),
  localizacao: z.string().optional(),
  local_mapa: z.string().optional(),
  coluna: z.string().optional(),
  prateleira: z.string().optional(),
  box: z.string().optional(),
  fornecedor_ids: z.array(z.number().int().positive()).optional(),
});

const patchSchema = bodySchema.extend({
  id: z.number().int().positive(),
});

function boolish(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const s = String(v ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "sim";
}

function toPayload(data: z.infer<typeof bodySchema>) {
  return {
    material: data.material,
    valor_custo: moneyOr(data.valor_custo),
    valor: moneyOr(data.valor),
    valor_fornecedor: moneyOr(data.valor_fornecedor),
    codigo: data.codigo,
    descricao_nfe: data.descricao_nfe,
    unidade: data.unidade,
    departamento: data.departamento,
    subdepartamento: data.subdepartamento,
    marca: data.marca,
    tipo_material: data.tipo_material,
    referencia: data.referencia,
    caracteristica: data.caracteristica,
    situacao: data.situacao,
    servico: boolish(data.servico),
    situacao_tributaria: data.situacao_tributaria,
    ncm: data.ncm,
    ean: data.ean,
    estoque_minimo: moneyOr(data.estoque_minimo),
    capacidade_total: moneyOr(data.capacidade_total),
    estoque_negativo: boolish(data.estoque_negativo),
    fator: numOr(data.fator),
    tipo_fator: data.tipo_fator,
    chapa_mm: data.chapa_mm,
    corte_cm: moneyOr(data.corte_cm),
    custo_mercado: moneyOr(data.custo_mercado),
    custo_formacao: moneyOr(data.custo_formacao),
    margem_desejada: moneyOr(data.margem_desejada),
    margem_aplicada: moneyOr(data.margem_aplicada),
    perc_comissao: moneyOr(data.perc_comissao),
    saldo_loja: moneyOr(data.saldo_loja),
    saldo_geral: moneyOr(data.saldo_geral),
    custo_loja: moneyOr(data.custo_loja),
    localizacao: data.localizacao,
    local_mapa: data.local_mapa,
    coluna: data.coluna,
    prateleira: data.prateleira,
    box: data.box,
  };
}

export const Route = createFileRoute("/api/admin/materiais")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        try {
          // Confirmados antigos (sem baixa) — desconta agora, ex.: Simone.
          try {
            await baixarEstoquesConfirmadosPendentes();
          } catch (baixaErr) {
            console.error("[GET materiais] baixa pendente", baixaErr);
          }
          const itens = await listMateriais();
          return jsonResponse({ ok: true, itens });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const raw = await request.json().catch(() => null);
        if (
          raw &&
          typeof raw === "object" &&
          (raw as { acao?: string }).acao === "set_estoques"
        ) {
          const saldo = Number((raw as { saldo?: unknown }).saldo);
          if (!Number.isFinite(saldo) || saldo < 0) {
            return jsonResponse({ ok: false, message: "Saldo inválido." }, 422);
          }
          try {
            const atualizados = await setTodosEstoques(saldo);
            const itens = await listMateriais();
            return jsonResponse({ ok: true, atualizados, itens });
          } catch (err) {
            return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
          }
        }
        if (
          raw &&
          typeof raw === "object" &&
          (raw as { acao?: string }).acao === "set_estoques_minimos"
        ) {
          const minimo = Number((raw as { minimo?: unknown }).minimo);
          if (!Number.isFinite(minimo) || minimo < 0) {
            return jsonResponse({ ok: false, message: "Mínimo inválido." }, 422);
          }
          try {
            const atualizados = await setTodosEstoquesMinimos(minimo);
            const itens = await listMateriais();
            return jsonResponse({ ok: true, atualizados, itens });
          } catch (err) {
            return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
          }
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }
        try {
          const dup = await findMaterialByNome(parsed.data.material);
          if (dup) {
            return jsonResponse({ ok: false, message: "Material já cadastrado." }, 409);
          }
          const item = await createMaterial(toPayload(parsed.data));
          if (parsed.data.fornecedor_ids) {
            await salvarMaterialFornecedoresLiberados(item.id, parsed.data.fornecedor_ids);
          }
          const itens = await listMateriais();
          return jsonResponse({ ok: true, item: itens.find((m) => m.id === item.id) ?? item });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: "Dados inválidos." }, 422);
        }
        try {
          const item = await updateMaterial(parsed.data.id, toPayload(parsed.data));
          if (parsed.data.fornecedor_ids !== undefined) {
            await salvarMaterialFornecedoresLiberados(parsed.data.id, parsed.data.fornecedor_ids);
          }
          const itens = await listMateriais();
          return jsonResponse({ ok: true, item: itens.find((m) => m.id === item.id) ?? item });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Material não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      DELETE: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const url = new URL(request.url);
        const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
        if (!Number.isFinite(id) || id <= 0) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 422);
        }
        try {
          await deleteMaterial(id);
          return jsonResponse({ ok: true });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Material não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
