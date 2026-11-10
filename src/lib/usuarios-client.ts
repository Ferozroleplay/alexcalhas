/** Cliente HTTP — evita puxar admin-api inteiro na rota de usuários. */

export type UsuarioItem = {
  id: number;
  thumb: string;
  nome: string;
  usuario: string;
  email: string;
  nivel: string;
  fornecedor_id: number | null;
  fornecedor_nome?: string | null;
  thumb_url?: string | null;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function fetchUsuarios(): Promise<UsuarioItem[]> {
  const res = await fetch("/api/admin/usuarios", { credentials: "include" });
  const data = await parseJson<{ ok?: boolean; itens?: UsuarioItem[]; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível carregar usuários.");
  return data.itens ?? [];
}

export async function fetchUsuario(id: number): Promise<UsuarioItem> {
  const res = await fetch(`/api/admin/usuarios/${id}`, { credentials: "include" });
  const data = await parseJson<{ ok?: boolean; item?: UsuarioItem; message?: string }>(res);
  if (!res.ok || !data.item) throw new Error(data.message ?? "Usuário não encontrado.");
  return data.item;
}

export async function atualizarUsuario(
  id: number,
  payload: {
    nome: string;
    email: string;
    senha?: string;
    nivel: string;
    fornecedor_id?: number | null;
  },
): Promise<UsuarioItem> {
  const res = await fetch(`/api/admin/usuarios/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ ok?: boolean; item?: UsuarioItem; message?: string }>(res);
  if (!res.ok || !data.item) throw new Error(data.message ?? "Erro ao atualizar usuário.");
  return data.item;
}

export async function enviarThumbUsuario(id: number, file: File): Promise<{ thumb: string }> {
  const form = new FormData();
  form.append("arquivo", file);
  const res = await fetch(`/api/admin/usuarios/${id}/thumb`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await parseJson<{ ok?: boolean; thumb?: string; message?: string }>(res);
  if (!res.ok || !data.thumb) throw new Error(data.message ?? "Erro ao enviar foto.");
  return { thumb: data.thumb };
}

export async function excluirUsuario(id: number): Promise<string> {
  const res = await fetch(`/api/admin/usuarios/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await parseJson<{ ok?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível excluir o usuário.");
  return data.message ?? "Usuário excluído.";
}

export async function impersonarUsuario(targetId: number): Promise<{ redirect: string }> {
  const res = await fetch("/api/admin/impersonar", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
  const data = await parseJson<{ ok?: boolean; redirect?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível entrar como este usuário.");
  return { redirect: data.redirect ?? "/painel" };
}

export async function sairImpersonacao(): Promise<{ redirect: string }> {
  const res = await fetch("/api/admin/impersonar?sair=1", {
    method: "POST",
    credentials: "include",
  });
  const data = await parseJson<{ ok?: boolean; redirect?: string; message?: string }>(res);
  if (!res.ok) throw new Error(data.message ?? "Não foi possível voltar ao admin.");
  return { redirect: data.redirect ?? "/painel/usuarios" };
}

export async function criarUsuario(payload: {
  nome: string;
  usuario: string;
  email: string;
  senha: string;
  nivel: string;
  fornecedor_id?: number | null;
}): Promise<UsuarioItem> {
  const res = await fetch("/api/admin/usuarios", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJson<{ ok?: boolean; item?: UsuarioItem; message?: string }>(res);
  if (!res.ok || !data.item) throw new Error(data.message ?? "Erro ao cadastrar usuário.");
  return data.item;
}
