export type ParceiroItem = {
  id: number;
  nome: string;
  logo: string | null;
  logo_url: string;
  whatsapp: string | null;
  whatsapp_formatado: string;
  ativo: boolean;
  ordem: number;
};

export type ParceiroInput = {
  nome: string;
  whatsapp?: string;
  ativo?: boolean;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function fetchParceiros(): Promise<ParceiroItem[]> {
  const res = await fetch("/api/admin/parceiros", { credentials: "include" });
  const data = await parseJson<{ ok?: boolean; itens?: ParceiroItem[]; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível carregar parceiros.");
  return data.itens ?? [];
}

export async function criarParceiro(dados: ParceiroInput): Promise<ParceiroItem> {
  const res = await fetch("/api/admin/parceiros", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...dados, ativo: dados.ativo ?? true }),
  });
  const data = await parseJson<{ ok?: boolean; item?: ParceiroItem; message?: string }>(res);
  if (!res.ok || !data.item) throw new Error(data.message ?? "Não foi possível cadastrar.");
  return data.item;
}

export async function salvarParceiro(
  id: number,
  dados: Partial<ParceiroInput> & { ordem?: number },
): Promise<ParceiroItem> {
  const res = await fetch("/api/admin/parceiros", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...dados }),
  });
  const data = await parseJson<{ ok?: boolean; item?: ParceiroItem; message?: string }>(res);
  if (!res.ok || !data.item) throw new Error(data.message ?? "Não foi possível salvar.");
  return data.item;
}

export async function excluirParceiro(id: number): Promise<void> {
  const res = await fetch(`/api/admin/parceiros?id=${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await parseJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível excluir.");
}

export async function enviarLogoParceiro(
  id: number,
  file: File,
): Promise<{ logo_url: string }> {
  const form = new FormData();
  form.append("arquivo", file);
  const res = await fetch(`/api/admin/parceiros/${id}/logo`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await parseJson<{ ok?: boolean; logo_url?: string; message?: string }>(res);
  if (!res.ok || !data.logo_url) throw new Error(data.message ?? "Não foi possível enviar a imagem.");
  return { logo_url: data.logo_url };
}
