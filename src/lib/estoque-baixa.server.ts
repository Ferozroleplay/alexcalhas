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

export type BaixaEstoqueResultado = {
  baixas: BaixaEstoqueItem[];
  naoEncontrados: { material: string; metros: number }[];
  jaBaixado: boolean;
};

let estoqueBaixadoColReady = false;

async function ensureEstoqueBaixadoColumn(): Promise<void> {
  if (estoqueBaixadoColReady) return;
  const prisma = await getPrisma();
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

function resolverMaterial(
  linha: OrcamentoLinha,
  materiais: MaterialRow[],
): MaterialRow | null {
  if (linha.id != null && Number(linha.id) > 0) {
    const byId = materiais.find((m) => m.id === Number(linha.id));
    if (byId) return byId;
  }

  const nome = String(linha.material ?? "").trim();
  if (!nome) return null;

  const exact = materiais.find(
    (m) => m.material.trim().toLowerCase() === nome.toLowerCase(),
  );
  if (exact) return exact;

  const corte = detectarCorteCm(nome);
  const esp = detectarEspessuraChapa(nome) as EspessuraChapa | null;

  let pool = materiais.filter((m) => {
    if (corte <= 0) return true;
    const c = Number(m.corte_cm) > 0 ? Number(m.corte_cm) : detectarCorteCm(m.material);
    return Math.abs(c - corte) < 0.05;
  });

  if (esp) {
    const porEsp = pool.filter(
      (m) =>
        detectarEspessuraChapa(m.material, m.chapa_mm) === esp ||
        materialTemEspessura(m.material, esp),
    );
    if (porEsp.length > 0) pool = porEsp;
  }

  const chapas = pool.filter((m) =>
    /galvalume|chapa/i.test(`${m.material} ${m.tipo_material ?? ""}`),
  );
  if (chapas.length === 1) return chapas[0];
  if (chapas.length > 1) return chapas[0];
  if (pool.length === 1) return pool[0];
  return null;
}

/** Agrupa metros por material e desconta saldo_loja / saldo_geral. */
export async function baixarEstoqueLinhas(
  linhas: OrcamentoLinha[],
): Promise<Omit<BaixaEstoqueResultado, "jaBaixado">> {
  const materiais = await listMateriais();
  const porId = new Map<number, { row: MaterialRow; metros: number }>();
  const naoEncontrados: { material: string; metros: number }[] = [];

  for (const linha of linhas) {
    const metros = money(Number(linha.metros) || 0);
    if (metros <= 0) continue;
    const mat = resolverMaterial(linha, materiais);
    if (!mat) {
      naoEncontrados.push({ material: String(linha.material ?? ""), metros });
      continue;
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

    await prisma.$executeRawUnsafe(
      `UPDATE materiais SET saldo_loja = ?, saldo_geral = ? WHERE id = ?`,
      saldoDepois,
      geralDepois,
      row.id,
    );

    baixas.push({
      materialId: row.id,
      material: row.material,
      metros,
      saldoAntes,
      saldoDepois,
    });
  }

  return { baixas, naoEncontrados };
}

/** Baixa estoque de um inventário confirmado (uma vez). */
export async function baixarEstoqueDoInventario(
  inventarioId: number,
): Promise<BaixaEstoqueResultado> {
  await ensureEstoqueBaixadoColumn();
  const prisma = await getPrisma();

  const rows = await prisma.$queryRawUnsafe<
    { id: number; orcamento: string | null; estoque_baixado: number | null; status: string }[]
  >(
    `SELECT id, orcamento, estoque_baixado, status FROM inventario WHERE id = ? LIMIT 1`,
    inventarioId,
  );
  const row = rows[0];
  if (!row) {
    return { baixas: [], naoEncontrados: [], jaBaixado: false };
  }

  if (Number(row.estoque_baixado) === 1) {
    return { baixas: [], naoEncontrados: [], jaBaixado: true };
  }

  const linhas = parseOrcamentoJson(row.orcamento);
  const result = await baixarEstoqueLinhas(linhas);

  await prisma.$executeRawUnsafe(
    `UPDATE inventario SET estoque_baixado = 1 WHERE id = ?`,
    inventarioId,
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
     ORDER BY id ASC`,
  );

  const todasBaixas: BaixaEstoqueItem[] = [];
  for (const { id } of pendentes) {
    const r = await baixarEstoqueDoInventario(id);
    todasBaixas.push(...r.baixas);
  }

  return { inventarios: pendentes.length, baixas: todasBaixas };
}
