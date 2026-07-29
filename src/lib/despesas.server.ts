import { getPrisma } from "@/lib/db.server";
import {
  isCategoriaValida,
  isFormaValida,
  labelCategoria,
  labelForma,
  type DespesaInput,
  type DespesaItem,
} from "@/lib/despesas";

export type { DespesaInput, DespesaItem };
export {
  DESPESA_CATEGORIAS,
  DESPESA_FORMAS,
  isCategoriaValida,
  isDataValida,
  isFormaValida,
  totalDespesas,
} from "@/lib/despesas";

type DbRow = {
  id: number | bigint;
  data: Date | string;
  descricao: string;
  categoria: string;
  valor: number | string;
  forma_pagamento: string;
  observacao: string | null;
};

let tabelaPronta = false;

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function money(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function escSql(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function formatDataIso(raw: Date | string): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function mapItem(row: DbRow): DespesaItem {
  const categoria = String(row.categoria ?? "outros");
  const forma = String(row.forma_pagamento ?? "pix");
  return {
    id: int(row.id),
    data: formatDataIso(row.data),
    descricao: String(row.descricao ?? ""),
    categoria,
    categoria_label: labelCategoria(categoria),
    valor: money(row.valor),
    forma_pagamento: forma,
    forma_pagamento_label: labelForma(forma),
    observacao: String(row.observacao ?? "").trim(),
  };
}

async function ensureDespesasTable(): Promise<void> {
  if (tabelaPronta) return;
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS despesas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data DATE NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      categoria VARCHAR(80) NOT NULL,
      valor DECIMAL(10, 2) NOT NULL,
      forma_pagamento VARCHAR(20) NOT NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_despesas_data (data),
      INDEX idx_despesas_categoria (categoria)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tabelaPronta = true;
}

export async function listDespesas(opts?: {
  ano?: number;
  mes?: number;
  categoria?: string;
}): Promise<DespesaItem[]> {
  await ensureDespesasTable();
  const prisma = await getPrisma();
  const where: string[] = [];

  if (opts?.ano && opts.ano > 2000 && opts.ano < 2100) {
    where.push(`YEAR(data) = ${Math.trunc(opts.ano)}`);
  }
  if (opts?.mes && opts.mes >= 1 && opts.mes <= 12) {
    where.push(`MONTH(data) = ${Math.trunc(opts.mes)}`);
  }
  if (opts?.categoria && isCategoriaValida(opts.categoria)) {
    where.push(`categoria = '${escSql(opts.categoria)}'`);
  }

  const sql = `
    SELECT id, data, descricao, categoria, valor, forma_pagamento, observacao
    FROM despesas
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY data DESC, id DESC
  `;
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(sql);
  return rows.map(mapItem);
}

export async function findDespesaById(id: number): Promise<DespesaItem | null> {
  await ensureDespesasTable();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT id, data, descricao, categoria, valor, forma_pagamento, observacao
     FROM despesas WHERE id = ${Math.trunc(id)} LIMIT 1`,
  );
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function createDespesa(input: DespesaInput): Promise<DespesaItem> {
  await ensureDespesasTable();
  const prisma = await getPrisma();
  const obs = (input.observacao ?? "").trim();
  await prisma.$executeRawUnsafe(`
    INSERT INTO despesas (data, descricao, categoria, valor, forma_pagamento, observacao)
    VALUES (
      '${escSql(input.data)}',
      '${escSql(input.descricao.trim().slice(0, 255))}',
      '${escSql(input.categoria)}',
      ${money(input.valor).toFixed(2)},
      '${escSql(input.forma_pagamento)}',
      ${obs ? `'${escSql(obs.slice(0, 2000))}'` : "NULL"}
    )
  `);
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT id, data, descricao, categoria, valor, forma_pagamento, observacao
     FROM despesas ORDER BY id DESC LIMIT 1`,
  );
  if (!rows[0]) throw new Error("Não foi possível cadastrar a despesa.");
  return mapItem(rows[0]);
}

export async function updateDespesa(id: number, input: DespesaInput): Promise<DespesaItem> {
  await ensureDespesasTable();
  const prisma = await getPrisma();
  const obs = (input.observacao ?? "").trim();
  await prisma.$executeRawUnsafe(`
    UPDATE despesas SET
      data = '${escSql(input.data)}',
      descricao = '${escSql(input.descricao.trim().slice(0, 255))}',
      categoria = '${escSql(input.categoria)}',
      valor = ${money(input.valor).toFixed(2)},
      forma_pagamento = '${escSql(input.forma_pagamento)}',
      observacao = ${obs ? `'${escSql(obs.slice(0, 2000))}'` : "NULL"}
    WHERE id = ${Math.trunc(id)}
  `);
  const item = await findDespesaById(id);
  if (!item) throw new Error("Despesa não encontrada.");
  return item;
}

export async function deleteDespesa(id: number): Promise<void> {
  await ensureDespesasTable();
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`DELETE FROM despesas WHERE id = ${Math.trunc(id)}`);
}
