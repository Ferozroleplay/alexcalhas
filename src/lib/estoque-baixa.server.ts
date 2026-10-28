/**
 * Baixa estoque de materiais quando o orçamento vira confirmado (data de montagem).
 */

import { getPrisma } from "@/lib/db.server";
import {
  detectarCorteCm,
  detectarEspessuraChapa,
  materialTemEspessura,
  type EspessuraChapa,
} from "@/lib/orcamento-empresa";
import { parseOrcamentoJson, type OrcamentoLinha } from "@/lib/orcamento.server";
import { listMateriais, type MaterialRow } from "@/lib/materiais.server";

export type BaixaEstoqueItem = {
  materialId: number;
  material: string;
  metros: number;
  saldoAntes: number;
  saldoDepois: number;
};

export type BaixaEstoqueSubstituto = {
  especial: string;
  padrao: string;
  metros: number;
};

export type BaixaEstoqueResultado = {
  baixas: BaixaEstoqueItem[];
  naoEncontrados: { material: string; metros: number }[];
  substitutos: BaixaEstoqueSubstituto[];
  jaBaixado: boolean;
};

type FamiliaEstoque = "chapa" | "condutor" | "moldura" | "outro";

let estoqueBaixadoColReady = false;

async function ensureEstoqueBaixadoColumn(): Promise<void> {
  if (estoqueBaixadoColReady) return;
  const prisma = await getPrisma();
  try {
    await prisma.$queryRawUnsafe(`SELECT estoque_baixado FROM inventario LIMIT 1`);
    estoqueBaixadoColReady = true;
    return;
  } catch {
    /* coluna ainda não existe */
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE inventario ADD COLUMN estoque_baixado TINYINT NOT NULL DEFAULT 0`,
    );
  } catch {
    /* coluna já existe */
  }
  estoqueBaixadoColReady = true;
}

function money(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function normalizarNome(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*/g, " ");
}

function familiaEstoque(nome: string, tipo?: string | null): FamiliaEstoque {
  const blob = `${nome} ${tipo ?? ""}`.toLowerCase();
  if (/mão de obra|mao de obra/.test(blob)) return "outro";
  if (/condutor/.test(blob)) return "condutor";
  if (/moldura/.test(blob)) return "moldura";
  if (/chapa/.test(blob) && /galvalume/.test(blob)) return "chapa";
  return "outro";
}

function plDoNome(nome: string): string | null {
  const m = nome.match(/(\d+)\s*PL/i);
  return m ? m[1] : null;
}

function corteDoMaterial(m: MaterialRow): number {
  if (Number(m.corte_cm) > 0) return Number(m.corte_cm);
  return detectarCorteCm(m.material);
}

function mesmaEspessura(m: MaterialRow, esp: EspessuraChapa | null): boolean {
  if (!esp) return true;
  return (
    detectarEspessuraChapa(m.material, m.chapa_mm) === esp ||
    materialTemEspessura(m.material, esp)
  );
}

function rotuloCorte(nome: string, corte?: number): string {
  const c = corte && corte > 0 ? corte : detectarCorteCm(nome);
  if (c <= 0) return nome;
  const n = Math.abs(c - Math.round(c)) < 0.01 ? String(Math.round(c)) : String(c);
  return `C/${n}`;
}

function escolherDoPool(pool: MaterialRow[]): MaterialRow | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const chapaNome = pool.filter((m) => /^chapa galvalume/i.test(m.material));
  if (chapaNome.length === 1) return chapaNome[0];
  return pool[0];
}

function filtrarFamilia(
  materiais: MaterialRow[],
  fam: FamiliaEstoque,
  esp: EspessuraChapa | null,
  pl: string | null,
): MaterialRow[] {
  let pool = materiais.filter((m) => {
    if (m.servico) return false;
    return familiaEstoque(m.material, m.tipo_material) === fam;
  });
  if (esp) {
    const porEsp = pool.filter((m) => mesmaEspessura(m, esp));
    if (porEsp.length > 0) pool = porEsp;
  }
  if (pl) {
    const porPl = pool.filter((m) => plDoNome(m.material) === pl);
    if (porPl.length > 0) pool = porPl;
  }
  return pool;
}

/** Corte especial (C/22, C/37…) cai no próximo corte padrão cadastrado (C/25, C/40…). */
function proximoCortePadrao(
  corte: number,
  familia: FamiliaEstoque,
  esp: EspessuraChapa | null,
  pl: string | null,
  materiais: MaterialRow[],
): MaterialRow | null {
  if (familia === "outro" || corte <= 0) return null;
  const pool = filtrarFamilia(materiais, familia, esp, pl)
    .filter((m) => corteDoMaterial(m) > corte + 0.049)
    .sort((a, b) => corteDoMaterial(a) - corteDoMaterial(b));
  if (pool.length === 0) return null;
  const menor = corteDoMaterial(pool[0]);
  return escolherDoPool(pool.filter((m) => Math.abs(corteDoMaterial(m) - menor) < 0.05));
}

function resolverMaterial(
  linha: OrcamentoLinha,
  materiais: MaterialRow[],
): { row: MaterialRow; substituto: boolean } | null {
  if (linha.id != null && Number(linha.id) > 0) {
    const byId = materiais.find((m) => m.id === Number(linha.id));
    if (byId && !byId.servico) return { row: byId, substituto: false };
    if (byId?.servico) return null;
  }

  const nome = String(linha.material ?? "").trim();
  if (!nome) return null;
  const nomeN = normalizarNome(nome);

  const exact = materiais.find((m) => !m.servico && normalizarNome(m.material) === nomeN);
  if (exact) return { row: exact, substituto: false };

  const corte = detectarCorteCm(nome);
  const esp = detectarEspessuraChapa(nome) as EspessuraChapa | null;
  if (corte <= 0) return null;

  const fam = familiaEstoque(nome);
  const pl = plDoNome(nome);
  const daFamilia = filtrarFamilia(materiais, fam === "outro" ? "chapa" : fam, esp, pl);

  const exatos = daFamilia.filter((m) => Math.abs(corteDoMaterial(m) - corte) < 0.05);
  const exato = escolherDoPool(exatos);
  if (exato) return { row: exato, substituto: false };

  const proximo = proximoCortePadrao(
    corte,
    fam === "outro" ? "chapa" : fam,
    esp,
    pl,
    materiais,
  );
  if (proximo) return { row: proximo, substituto: true };
  return null;
}

/** Agrupa metros por material e desconta saldo_loja / saldo_geral. */
export async function baixarEstoqueLinhas(
  linhas: OrcamentoLinha[],
): Promise<Omit<BaixaEstoqueResultado, "jaBaixado">> {
  const materiais = await listMateriais();
  const porId = new Map<number, { row: MaterialRow; metros: number }>();
  const naoEncontrados: { material: string; metros: number }[] = [];
  const substitutos: BaixaEstoqueSubstituto[] = [];

  for (const linha of linhas) {
    const metros = money(Number(linha.metros) || 0);
    if (metros <= 0) continue;
    const resolved = resolverMaterial(linha, materiais);
    if (!resolved) {
      const nome = String(linha.material ?? "").trim();
      if (/mão de obra|mao de obra/i.test(nome)) continue;
      naoEncontrados.push({ material: nome, metros });
      continue;
    }
    const { row: mat, substituto } = resolved;
    if (substituto) {
      substitutos.push({
        especial: rotuloCorte(String(linha.material ?? "")),
        padrao: rotuloCorte(mat.material, corteDoMaterial(mat)),
        metros,
      });
    }
    const prev = porId.get(mat.id);
    if (prev) prev.metros = money(prev.metros + metros);
    else porId.set(mat.id, { row: mat, metros });
  }

  const prisma = await getPrisma();
  const baixas: BaixaEstoqueItem[] = [];

  for (const { row, metros } of porId.values()) {
    const saldoAntes = money(Number(row.saldo_loja) || 0);
    const permiteNeg = Boolean(row.estoque_negativo);
    const saldoDepois = permiteNeg
      ? Math.round((saldoAntes - metros) * 100) / 100
      : money(saldoAntes - metros);
    const geralAntes = money(Number(row.saldo_geral) || 0);
    const geralDepois = permiteNeg
      ? Math.round((geralAntes - metros) * 100) / 100
      : money(geralAntes - metros);
    const id = Math.trunc(row.id);

    await prisma.$executeRawUnsafe(
      `UPDATE materiais SET saldo_loja = ${saldoDepois}, saldo_geral = ${geralDepois} WHERE id = ${id} LIMIT 1`,
    );

    baixas.push({
      materialId: id,
      material: row.material,
      metros,
      saldoAntes,
      saldoDepois,
    });
  }

  return { baixas, naoEncontrados, substitutos };
}

/** Baixa estoque de um inventário confirmado (uma vez). */
export async function baixarEstoqueDoInventario(
  inventarioId: number,
  opts?: { forcar?: boolean },
): Promise<BaixaEstoqueResultado> {
  await ensureEstoqueBaixadoColumn();
  const prisma = await getPrisma();
  const invId = Math.trunc(inventarioId);

  const rows = await prisma.$queryRawUnsafe<
    { id: number; orcamento: string | null; estoque_baixado: number | null; status: string }[]
  >(
    `SELECT id, orcamento, estoque_baixado, status FROM inventario WHERE id = ${invId} LIMIT 1`,
  );
  const row = rows[0];
  if (!row) {
    return { baixas: [], naoEncontrados: [], substitutos: [], jaBaixado: false };
  }

  if (!opts?.forcar && Number(row.estoque_baixado) === 1) {
    return { baixas: [], naoEncontrados: [], substitutos: [], jaBaixado: true };
  }

  const linhas = parseOrcamentoJson(row.orcamento);
  const result = await baixarEstoqueLinhas(linhas);

  await prisma.$executeRawUnsafe(
    `UPDATE inventario SET estoque_baixado = 1 WHERE id = ${invId} LIMIT 1`,
  );

  return { ...result, jaBaixado: false };
}

/**
 * Processa confirmados antigos que ainda não baixaram estoque
 * (ex.: orçamento da Simone confirmado antes desta regra).
 */
export async function baixarEstoquesConfirmadosPendentes(): Promise<{
  inventarios: number;
  baixas: BaixaEstoqueItem[];
}> {
  await ensureEstoqueBaixadoColumn();
  const prisma = await getPrisma();

  const pendentes = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT id FROM inventario
     WHERE LOWER(TRIM(status)) = 'confirmado'
       AND COALESCE(estoque_baixado, 0) = 0
     ORDER BY id ASC
     LIMIT 30`,
  );

  const todasBaixas: BaixaEstoqueItem[] = [];
  for (const { id } of pendentes) {
    const r = await baixarEstoqueDoInventario(id);
    todasBaixas.push(...r.baixas);
  }

  return { inventarios: pendentes.length, baixas: todasBaixas };
}
