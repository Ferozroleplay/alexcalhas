export type SiteChatPublico = {
  nome: string;
  cargo: string;
  mensagem: string;
  foto_url: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export type PolianeFicha = Record<string, string | number | boolean | undefined>;

export type PolianePill = { label: string; value: string };

export type PolianeResposta = {
  reply: string;
  ficha: PolianeFicha;
  pills: PolianePill[];
  done?: boolean;
};

export async function enviarMensagemPoliane(
  mensagem: string,
  ficha: PolianeFicha,
): Promise<PolianeResposta> {
  const res = await fetch("/api/site-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensagem, ficha }),
  });
  const data = await parseJson<PolianeResposta & { ok?: boolean; message?: string }>(res);
  if (!res.ok || !data.reply) {
    throw new Error(data.message ?? data.reply ?? "Não foi possível falar com a atendente.");
  }
  return {
    reply: data.reply,
    ficha: data.ficha ?? ficha,
    pills: Array.isArray(data.pills) ? data.pills : [],
    done: data.done,
  };
}

export async function fetchSiteChatPublico(): Promise<SiteChatPublico | null> {
  const res = await fetch("/api/site-chat", { cache: "no-store" });
  const data = await parseJson<{ ok?: boolean; chat?: SiteChatPublico }>(res);
  if (!data.ok || !data.chat) return null;
  return data.chat;
}

export async function fetchSiteChatAdmin(): Promise<SiteChatPublico> {
  const res = await fetch("/api/admin/site-chat", { credentials: "include" });
  const data = await parseJson<{ ok?: boolean; chat?: SiteChatPublico; message?: string }>(res);
  if (!res.ok || !data.chat) throw new Error(data.message ?? "Não foi possível carregar o chat.");
  return data.chat;
}

export async function salvarSiteChat(input: {
  nome: string;
  cargo: string;
  mensagem: string;
}): Promise<SiteChatPublico> {
  const res = await fetch("/api/admin/site-chat", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ ok?: boolean; chat?: SiteChatPublico; message?: string }>(res);
  if (!res.ok || !data.chat) throw new Error(data.message ?? "Não foi possível salvar.");
  return data.chat;
}

export async function enviarFotoSiteChat(file: File): Promise<SiteChatPublico> {
  const form = new FormData();
  form.append("arquivo", file);
  const res = await fetch("/api/admin/site-chat/foto", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await parseJson<{ ok?: boolean; chat?: SiteChatPublico; message?: string }>(res);
  if (!res.ok || !data.chat) throw new Error(data.message ?? "Não foi possível enviar a foto.");
  return data.chat;
}

export async function restaurarFotoSiteChat(): Promise<SiteChatPublico> {
  const res = await fetch("/api/admin/site-chat/foto", {
    method: "DELETE",
    credentials: "include",
  });
  const data = await parseJson<{ ok?: boolean; chat?: SiteChatPublico; message?: string }>(res);
  if (!res.ok || !data.chat) throw new Error(data.message ?? "Não foi possível restaurar a foto.");
  return data.chat;
}
