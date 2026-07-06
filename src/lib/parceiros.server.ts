import type { HomePartner } from "@/data/home-config";
import { getPrisma } from "@/lib/db.server";
import { telefoneWhatsappLink } from "@/lib/format-br";
import { logoPublicUrl } from "@/lib/parceiros-upload.server";

export type ParceiroAdmin = {
  id: number;
  nome: string;
  logo: string | null;
  logo_url: string;
  whatsapp: string | null;
  whatsapp_formatado: string;
  ativo: boolean;
  ordem: number;
};

type DbParceiroRow = {
  id: number | bigint;
  nome: string;
  logo: string | null;
  whatsapp: string | null;
  ativo: number;
  ordem: number;
};

let tabelaPronta = false;

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

function escSql(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function normalizarWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits.replace(/^0+/, "")}`;
}

async function ensureParceirosTable(): Promise<void> {
  if (tabelaPronta) return;
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS parceiros_site (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      logo VARCHAR(255) NULL,
      whatsapp VARCHAR(30) NULL,
      ativo TINYINT NOT NULL DEFAULT 1,
      ordem INT NOT NULL DEFAULT 0,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tabelaPronta = true;
}

function mapAdmin(row: DbParceiroRow): ParceiroAdmin {
  const wa = row.whatsapp?.trim() ?? "";
  const logo = row.logo?.trim() || null;
  return {
    id: int(row.id),
    nome: row.nome,
    logo,
    logo_url: logo ? logoPublicUrl(logo) : "",
    whatsapp: wa || null,
    whatsapp_formatado: wa ? wa.replace(/^55/, "") : "",
    ativo: int(row.ativo) === 1,
    ordem: int(row.ordem),
  };
}

function mapPublico(row: DbParceiroRow): HomePartner | null {
  const logo = row.logo?.trim();
  if (!logo) return null;
  const wa = row.whatsapp?.trim();
  return {
    name: row.nome,
    logo: logoPublicUrl(logo),
    ...(wa ? { url: telefoneWhatsappLink(wa) } : {}),
  };
}

async function queryParceiros(where = ""): Promise<DbParceiroRow[]> {
  await ensureParceirosTable();
  const prisma = await getPrisma();
  return prisma.$queryRawUnsafe<DbParceiroRow[]>(
    `SELECT id, nome, logo, whatsapp, ativo, ordem
     FROM parceiros_site
     ${where}
     ORDER BY ordem ASC, nome ASC`,
  );
}

export async function findParceiroById(id: number): Promise<DbParceiroRow | null> {
  await ensureParceirosTable();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<DbParceiroRow[]>(
    `SELECT id, nome, logo, whatsapp, ativo, ordem
     FROM parceiros_site WHERE id = ${int(id)} LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function listParceirosAdmin(): Promise<ParceiroAdmin[]> {
  const rows = await queryParceiros();
  return rows.map(mapAdmin);
}

export async function listParceirosPublicos(): Promise<HomePartner[]> {
  const rows = await queryParceiros("WHERE ativo = 1");
  return rows.map(mapPublico).filter((p): p is HomePartner => p !== null);
}

export async function createParceiro(data: {
  nome: string;
  whatsapp?: string;
  ativo?: boolean;
}): Promise<ParceiroAdmin> {
  await ensureParceirosTable();
  const prisma = await getPrisma();
  const nome = data.nome.trim();
  const wa = data.whatsapp ? normalizarWhatsapp(data.whatsapp) : "";
  const ativo = data.ativo === false ? 0 : 1;

  const maxRows = await prisma.$queryRawUnsafe<{ m: number | bigint }[]>(
    `SELECT COALESCE(MAX(ordem), 0) AS m FROM parceiros_site`,
  );
  const ordem = int(maxRows[0]?.m ?? 0) + 1;

  await prisma.$executeRawUnsafe(
    `INSERT INTO parceiros_site (nome, whatsapp, ativo, ordem)
     VALUES ('${escSql(nome)}', ${wa ? `'${escSql(wa)}'` : "NULL"}, ${ativo}, ${ordem})`,
  );

  const inserted = await prisma.$queryRawUnsafe<{ id: number | bigint }[]>(
    `SELECT LAST_INSERT_ID() AS id`,
  );
  const id = int(inserted[0]?.id);
  const row = await findParceiroById(id);
  if (!row) throw new Error("Não foi possível cadastrar o parceiro.");
  return mapAdmin(row);
}

export async function updateParceiro(
  id: number,
  data: {
    nome?: string;
    whatsapp?: string;
    ativo?: boolean;
    ordem?: number;
  },
): Promise<ParceiroAdmin> {
  const atual = await findParceiroById(id);
  if (!atual) throw new Error("Parceiro não encontrado.");

  const prisma = await getPrisma();
  const sets: string[] = [];

  if (data.nome !== undefined) sets.push(`nome = '${escSql(data.nome.trim())}'`);
  if (data.whatsapp !== undefined) {
    const wa = data.whatsapp.trim();
    sets.push(`whatsapp = ${wa ? `'${escSql(normalizarWhatsapp(wa))}'` : "NULL"}`);
  }
  if (data.ativo !== undefined) sets.push(`ativo = ${data.ativo ? 1 : 0}`);
  if (data.ordem !== undefined) sets.push(`ordem = ${int(data.ordem)}`);

  if (sets.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE parceiros_site SET ${sets.join(", ")} WHERE id = ${int(id)}`,
    );
  }

  const row = await findParceiroById(id);
  if (!row) throw new Error("Parceiro não encontrado.");
  return mapAdmin(row);
}

/** Logo anterior para remoção do disco; `null` se não havia logo. Lança se o parceiro não existir. */
export async function setParceiroLogo(id: number, arquivo: string): Promise<string | null> {
  const atual = await findParceiroById(id);
  if (!atual) throw new Error("Parceiro não encontrado.");

  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(
    `UPDATE parceiros_site SET logo = '${escSql(arquivo)}' WHERE id = ${int(id)}`,
  );
  return atual.logo?.trim() || null;
}

export async function deleteParceiro(id: number): Promise<{ logo: string | null } | null> {
  const atual = await findParceiroById(id);
  if (!atual) return null;

  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`DELETE FROM parceiros_site WHERE id = ${int(id)}`);
  return { logo: atual.logo?.trim() || null };
}
