import type { DespesaItem } from "@/lib/despesas";

export type { DespesaItem };
export {
  DESPESA_CATEGORIAS,
  DESPESA_FORMAS,
  formatDespesaDataBr,
  totalDespesas,
} from "@/lib/despesas";

export type DespesaInputClient = {
  data: string;
  descricao: string;
  categoria: string;
  valor: number | string;
  forma_pagamento: string;
  observacao?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function fetchDespesas(params?: {
  ano?: number;
  mes?: number;
  categoria?: string;
}): Promise<DespesaItem[]> {
  const q = new URLSearchParams();
  if (params?.ano) q.set("ano", String(params.ano));
  if (params?.mes) q.set("mes", String(params.mes));
  if (params?.categoria) q.set("categoria", params.categoria);
  const qs = q.toString();
  const res = await fetch(`/api/admin/despesas${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  const data = await parseJson<{ ok?: boolean; itens?: DespesaItem[]; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível carregar despesas.");
  return data.itens ?? [];
}

export async function criarDespesa(dados: DespesaInputClient): Promise<DespesaItem> {
  const res = await fetch("/api/admin/despesas", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  const data = await parseJson<{ ok?: boolean; item?: DespesaItem; message?: string }>(res);
  if (!res.ok || !data.item) throw new Error(data.message ?? "Não foi possível cadastrar.");
  return data.item;
}

export async function salvarDespesa(
  id: number,
  dados: DespesaInputClient,
): Promise<DespesaItem> {
  const res = await fetch("/api/admin/despesas", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...dados }),
  });
  const data = await parseJson<{ ok?: boolean; item?: DespesaItem; message?: string }>(res);
  if (!res.ok || !data.item) throw new Error(data.message ?? "Não foi possível salvar.");
  return data.item;
}

export async function excluirDespesa(id: number): Promise<void> {
  const res = await fetch(`/api/admin/despesas?id=${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await parseJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível excluir.");
}
