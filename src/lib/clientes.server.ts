import { getPrisma } from "@/lib/db.server";

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

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function chaveClienteSql(): string {
  return `CASE
    WHEN \`cpf-cnpj\` IS NOT NULL AND TRIM(\`cpf-cnpj\`) <> '' AND \`cpf-cnpj\` <> '00000000000'
      THEN CONCAT('doc:', \`cpf-cnpj\`)
    WHEN telefone IS NOT NULL AND TRIM(telefone) <> ''
      THEN CONCAT('tel:', LOWER(TRIM(telefone)), '|', LOWER(TRIM(nome)))
    ELSE CONCAT('id:', id)
  END`;
}

function whereBusca(busca: string | null): { sql: string; params: string[] } {
  if (!busca?.trim()) return { sql: "1=1", params: [] };
  const like = `%${busca.trim()}%`;
  return {
    sql: `(nome LIKE ? OR telefone LIKE ? OR \`cpf-cnpj\` LIKE ? OR endereco LIKE ? OR bairro LIKE ?)`,
    params: [like, like, like, like, like],
  };
}

export async function listarClientes(
  busca: string | null,
  limite: number,
  offset: number,
): Promise<{ total: number; itens: ClienteResumo[] }> {
  const prisma = await getPrisma();
  const w = whereBusca(busca);
  const chave = chaveClienteSql();
  limite = Math.max(1, Math.min(100, limite));
  offset = Math.max(0, offset);

  const countRows = await prisma.$queryRawUnsafe<{ c: unknown }[]>(
    `SELECT COUNT(*) AS c FROM (
      SELECT 1 FROM inventario WHERE ${w.sql} GROUP BY ${chave}
    ) g`,
    ...w.params,
  );
  const total = int(countRows[0]?.c);

  const rows = await prisma.$queryRawUnsafe<
    {
      ultimo_id: unknown;
      nome: string;
      telefone: string;
      cpf_cnpj: string | null;
      endereco: string | null;
      numero: string | null;
      bairro: string | null;
      cep: string | null;
      total_servicos: unknown;
      qtd_agendado: unknown;
      qtd_orcamentado: unknown;
      qtd_confirmado: unknown;
      qtd_finalizado: unknown;
      ultima_visita: string | null;
    }[]
  >(
    `SELECT
      MAX(id) AS ultimo_id,
      SUBSTRING_INDEX(GROUP_CONCAT(nome ORDER BY id DESC), ',', 1) AS nome,
      SUBSTRING_INDEX(GROUP_CONCAT(telefone ORDER BY id DESC), ',', 1) AS telefone,
      MAX(\`cpf-cnpj\`) AS cpf_cnpj,
      MAX(endereco) AS endereco,
      MAX(numero) AS numero,
      MAX(bairro) AS bairro,
      MAX(cep) AS cep,
      COUNT(*) AS total_servicos,
      SUM(CASE WHEN LOWER(status) = 'agendado' THEN 1 ELSE 0 END) AS qtd_agendado,
      SUM(CASE WHEN LOWER(status) IN ('orcamentado','orçamentado') THEN 1 ELSE 0 END) AS qtd_orcamentado,
      SUM(CASE WHEN LOWER(status) = 'confirmado' THEN 1 ELSE 0 END) AS qtd_confirmado,
      SUM(CASE WHEN LOWER(status) = 'finalizado' THEN 1 ELSE 0 END) AS qtd_finalizado,
      MAX(\`data-visita\`) AS ultima_visita
    FROM inventario
    WHERE ${w.sql}
    GROUP BY ${chave}
    ORDER BY ultimo_id DESC
    LIMIT ? OFFSET ?`,
    ...w.params,
    limite,
    offset,
  );

  return {
    total,
    itens: rows.map((r) => ({
      ultimo_id: int(r.ultimo_id),
      nome: r.nome ?? "",
      telefone: r.telefone ?? "",
      cpf_cnpj: r.cpf_cnpj,
      endereco: r.endereco,
      numero: r.numero,
      bairro: r.bairro,
      cep: r.cep,
      total_servicos: int(r.total_servicos),
      qtd_agendado: int(r.qtd_agendado),
      qtd_orcamentado: int(r.qtd_orcamentado),
      qtd_confirmado: int(r.qtd_confirmado),
      qtd_finalizado: int(r.qtd_finalizado),
      ultima_visita: r.ultima_visita,
    })),
  };
}

async function obterInventarioPorId(id: number): Promise<Record<string, unknown> | null> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM inventario WHERE id = ? LIMIT 1`,
    id,
  );
  return rows[0] ?? null;
}

function chaveDeLinha(row: Record<string, unknown>): { tipo: string; valor: string } {
  const doc = String(row["cpf-cnpj"] ?? "").trim();
  if (doc && doc !== "00000000000") return { tipo: "doc", valor: doc };
  const tel = String(row.telefone ?? "")
    .replace(/\D/g, "")
    .trim();
  const nome = String(row.nome ?? "")
    .trim()
    .toLowerCase();
  if (tel) return { tipo: "tel", valor: `${tel}|${nome}` };
  return { tipo: "id", valor: String(row.id ?? "") };
}

function whereChave(chave: { tipo: string; valor: string }): { sql: string; params: (string | number)[] } {
  if (chave.tipo === "doc") {
    return { sql: "`cpf-cnpj` = ?", params: [chave.valor] };
  }
  if (chave.tipo === "tel") {
    const [tel, nome] = chave.valor.split("|");
    return {
      sql: `REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')','') LIKE ?
            AND LOWER(TRIM(nome)) = ?`,
      params: [`%${tel}%`, nome],
    };
  }
  return { sql: "id = ?", params: [Number(chave.valor)] };
}

export async function obterClienteDetalhe(visitaId: number): Promise<ClienteDetalhe | null> {
  const row = await obterInventarioPorId(visitaId);
  if (!row) return null;
  return {
    id: int(row.id),
    nome: String(row.nome ?? ""),
    telefone: String(row.telefone ?? ""),
    cpf_cnpj: row["cpf-cnpj"] != null ? String(row["cpf-cnpj"]) : null,
    endereco: String(row.endereco ?? ""),
    numero: String(row.numero ?? ""),
    bairro: String(row.bairro ?? ""),
    cep: String(row.cep ?? ""),
    valor: num(row.valor),
  };
}

export type ClienteAviso = {
  nome: string;
  telefone: string;
};

function chaveTelefoneAviso(raw: string): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d;
}

function telefoneAvisoValido(digits: string): boolean {
  return digits.length === 10 || digits.length === 11;
}

/** Um contato por telefone, o mais recente, para aviso em massa no WhatsApp. */
export async function listarClientesAviso(): Promise<ClienteAviso[]> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ nome: string; telefone: string }[]>(
    `SELECT nome, telefone
     FROM inventario
     WHERE telefone IS NOT NULL AND TRIM(telefone) <> ''
     ORDER BY id DESC
     LIMIT 8000`,
  );

  const vistos = new Set<string>();
  const itens: ClienteAviso[] = [];
  for (const row of rows) {
    const chave = chaveTelefoneAviso(row.telefone);
    if (!telefoneAvisoValido(chave) || vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push({
      nome: String(row.nome ?? "").trim() || "Cliente",
      telefone: String(row.telefone ?? "").trim(),
    });
  }
  return itens;
}

export async function historicoCliente(visitaId: number): Promise<ClienteHistoricoItem[]> {
  const base = await obterInventarioPorId(visitaId);
  if (!base) return [];
  const chave = chaveDeLinha(base);
  const w = whereChave(chave);
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<
    {
      id: unknown;
      status: string;
      nome: string;
      telefone: string;
      valor: unknown;
      data_visita: string;
      hora_visita: string;
    }[]
  >(`SELECT id, status, nome, telefone, valor, \`data-visita\` AS data_visita, \`hora-visita\` AS hora_visita
     FROM inventario WHERE ${w.sql} ORDER BY id DESC`, ...w.params);

  return rows.map((r) => ({
    id: int(r.id),
    status: r.status ?? "",
    nome: r.nome ?? "",
    telefone: r.telefone ?? "",
    valor: num(r.valor),
    data_visita: r.data_visita ?? "",
    hora_visita: r.hora_visita ?? "",
  }));
}
