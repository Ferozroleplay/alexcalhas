import type { CarrinhoItemEntrega } from "@/lib/fornecedor-carrinho.server";
import type { MaterialLiberadoRow } from "@/lib/fornecedor-materiais.server";
import type { FornecedorControlePainel } from "@/lib/fornecedor-controle.server";
import type {
  EntregaDetalhe,
  EntregaListaRow,
  FornecedorInput,
  FornecedorRow,
} from "@/lib/fornecedores.server";

export type { EntregaDetalhe, EntregaListaRow, FornecedorRow };
export type { FornecedorControlePainel };

export type FornecedoresPainelData = {
  pendentes_total: number;
  fornecedores: FornecedorRow[];
  entregas: EntregaListaRow[];
  entrega?: EntregaDetalhe;
  controle?: FornecedorControlePainel;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export type { CarrinhoItemEntrega, MaterialLiberadoRow };

export type FornecedorPortalData = {
  fornecedor_id: number;
  nome_empresa?: string;
  erro?: string;
  entregas: EntregaListaRow[];
  entrega?: EntregaDetalhe;
  materiais?: MaterialLiberadoRow[];
  carrinho?: CarrinhoItemEntrega[];
};

export async function fetchFornecedorPortal(params: {
  controle?: number;
  status?: "enviado" | "recebido" | "todas";
  ver?: number;
}): Promise<FornecedorPortalData> {
  const qs = new URLSearchParams();
  if (params.controle) qs.set("controle", String(params.controle));
  if (params.status) qs.set("status", params.status);
  if (params.ver) qs.set("ver", String(params.ver));

  const res = await fetch(`/api/admin/fornecedor-portal?${qs}`, { credentials: "include" });
  const data = await parseJson<FornecedorPortalData & { ok?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Erro ao carregar.");
  return data;
}

type FornecedorPortalActionBody =
  | {
      action: "adicionar_item";
      material_id: number;
      metros: string | number;
      valor_unitario: string | number;
      observacao?: string;
    }
  | { action: "remover_item"; temp_id: string }
  | { action: "enviar_entrega"; observacao_entrega?: string }
  | { action: "confirmar_pagamento"; entrega_id: number; item_ids?: number[] };

export async function postFornecedorPortalAction(
  body: FornecedorPortalActionBody,
  controle?: number,
): Promise<{
  ok: boolean;
  message: string;
  carrinho?: CarrinhoItemEntrega[];
  entrega_id?: number;
}> {
  const qs = new URLSearchParams();
  if (controle) qs.set("controle", String(controle));

  const res = await fetch(`/api/admin/fornecedor-portal?${qs}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{
    ok?: boolean;
    message?: string;
    carrinho?: CarrinhoItemEntrega[];
    entrega_id?: number;
  }>(res);
  if (!res.ok) throw new Error(data.message ?? "Erro na operação.");
  return {
    ok: Boolean(data.ok),
    message: data.message ?? "",
    carrinho: data.carrinho,
    entrega_id: data.entrega_id,
  };
}

export async function fetchFornecedoresPainel(params: {
  status?: "enviado" | "recebido" | "todas";
  ver?: number;
  controle?: number;
}): Promise<FornecedoresPainelData> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.ver) qs.set("ver", String(params.ver));
  if (params.controle) qs.set("controle", String(params.controle));

  const res = await fetch(`/api/admin/fornecedores?${qs}`, { credentials: "include" });
  const data = await parseJson<FornecedoresPainelData & { ok?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Erro ao carregar entregas.");
  return data;
}

export async function fetchEntregaDetalhe(
  verId: number,
  opts?: { controle?: number },
): Promise<EntregaDetalhe> {
  const qs = new URLSearchParams({ nota: String(verId) });
  if (opts?.controle && opts.controle > 0) qs.set("controle", String(opts.controle));
  const res = await fetch(`/api/admin/nota-entrega?${qs}`, { credentials: "include" });
  const data = await parseJson<{ ok?: boolean; entrega?: EntregaDetalhe; message?: string }>(res);
  if (!res.ok || !data.entrega) throw new Error(data.message ?? "Entrega não encontrada.");
  return data.entrega;
}

type ActionBody =
  | { action: "cadastrar"; dados: FornecedorInput }
  | { action: "editar"; id: number; dados: FornecedorInput }
  | { action: "excluir"; id: number }
  | { action: "receber_itens"; entrega_id: number; item_ids: number[]; pagamento_status: "pago" | "pendente" }
  | { action: "receber_entrega"; entrega_id: number; pagamento_status: "pago" | "pendente" }
  | { action: "pagar_itens"; entrega_id: number; item_ids: number[] }
  | { action: "atualizar_pagamento"; entrega_id: number; pagamento_status: "pago" | "pendente" }
  | { action: "excluir_entrega"; entrega_id: number }
  | {
      action: "lancar_compra";
      fornecedor_id: number;
      material_id: number;
      metros: string | number;
      valor_unitario: string | number;
      observacao?: string;
      atualizar_custo_material?: boolean;
    }
  | { action: "excluir_compra"; compra_id: number; fornecedor_id: number }
  | {
      action: "devolver_compra";
      compra_id: number;
      fornecedor_id: number;
      metros_devolver: string | number;
      motivo?: string;
    };

export async function postFornecedoresAction(body: ActionBody): Promise<{ ok: boolean; message: string }> {
  const res = await fetch("/api/admin/fornecedores", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Erro na operação.");
  return { ok: Boolean(data.ok), message: data.message ?? "" };
}
