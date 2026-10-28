export type ClienteResumo = {
  ultimo_id: number;
  nome: string;
  telefone: string;
  cpf_cnpj: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cep: string | null;
  total_servicos: number;
  qtd_agendado: number;
  qtd_orcamentado: number;
  qtd_confirmado: number;
  qtd_finalizado: number;
  ultima_visita: string | null;
};

export type ClienteDetalhe = {
  id: number;
  nome: string;
  telefone: string;
  cpf_cnpj: string | null;
  endereco: string;
  numero: string;
  bairro: string;
  cep: string;
  valor: number;
};

export type ClienteHistoricoItem = {
  id: number;
  status: string;
  nome: string;
  telefone: string;
  valor: number;
  data_visita: string;
  hora_visita: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function fetchClientes(params: {
  q?: string;
  pag?: number;
}): Promise<{
  itens: ClienteResumo[];
  total: number;
  pag: number;
  paginas: number;
}> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.pag) qs.set("pag", String(params.pag));
  const res = await fetch(`/api/admin/clientes?${qs}`, { credentials: "include" });
  const data = await parseJson<{
    ok?: boolean;
    itens?: ClienteResumo[];
    total?: number;
    pag?: number;
    paginas?: number;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message ?? "Erro ao carregar clientes.");
  return {
    itens: data.itens ?? [],
    total: data.total ?? 0,
    pag: data.pag ?? 1,
    paginas: data.paginas ?? 1,
  };
}

export type ClienteAviso = {
  nome: string;
  telefone: string;
};

export async function fetchClientesAviso(): Promise<{ total: number; itens: ClienteAviso[] }> {
  const res = await fetch("/api/admin/clientes-aviso", { credentials: "include" });
  const data = await parseJson<{
    ok?: boolean;
    total?: number;
    itens?: ClienteAviso[];
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(data.message ?? "Erro ao carregar os telefones.");
  return { total: data.total ?? 0, itens: data.itens ?? [] };
}

export async function fetchClienteDetalhe(verId: number): Promise<{
  detalhe: ClienteDetalhe;
  historico: ClienteHistoricoItem[];
}> {
  const res = await fetch(`/api/admin/clientes?ver=${verId}`, { credentials: "include" });
  const data = await parseJson<{
    ok?: boolean;
    detalhe?: ClienteDetalhe;
    historico?: ClienteHistoricoItem[];
    message?: string;
  }>(res);
  if (!res.ok || !data.detalhe) throw new Error(data.message ?? "Cliente não encontrado.");
  return { detalhe: data.detalhe, historico: data.historico ?? [] };
}
