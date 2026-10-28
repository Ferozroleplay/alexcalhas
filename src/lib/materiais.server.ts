import { getPrisma } from "@/lib/db.server";

export type MaterialRow = {
  id: number;
  material: string;
  valor_custo: number;
  valor: number;
  fornecedor_id: number | null;
  visivel_fornecedor: boolean;
  valor_fornecedor: number;
  fornecedor_ids: number[];
  qtd_fornecedores: number;
  fornecedores_nomes: string[];
  codigo: string;
  descricao_nfe: string;
  unidade: string;
  departamento: string;
  subdepartamento: string;
  marca: string;
  tipo_material: string;
  referencia: string;
  caracteristica: string;
  situacao: string;
  servico: boolean;
  situacao_tributaria: string;
  ncm: string;
  ean: string;
  estoque_minimo: number;
  capacidade_total: number;
  estoque_negativo: boolean;
  fator: number;
  tipo_fator: string;
  chapa_mm: string;
  corte_cm: number;
  custo_mercado: number;
  custo_formacao: number;
  margem_desejada: number;
  margem_aplicada: number;
  perc_comissao: number;
  saldo_loja: number;
  saldo_geral: number;
  custo_loja: number;
  localizacao: string;
  local_mapa: string;
  coluna: string;
  prateleira: string;
  box: string;
};

export type MaterialPayload = {
  material: string;
  valor_custo: number;
  valor: number;
  valor_fornecedor?: number;
  codigo?: string;
  descricao_nfe?: string;
  unidade?: string;
  departamento?: string;
  subdepartamento?: string;
  marca?: string;
  tipo_material?: string;
  referencia?: string;
  caracteristica?: string;
  situacao?: string;
  servico?: boolean;
  situacao_tributaria?: string;
  ncm?: string;
  ean?: string;
  estoque_minimo?: number;
  capacidade_total?: number;
  estoque_negativo?: boolean;
  fator?: number;
  tipo_fator?: string;
  chapa_mm?: string;
  corte_cm?: number;
  custo_mercado?: number;
  custo_formacao?: number;
  margem_desejada?: number;
  margem_aplicada?: number;
  perc_comissao?: number;
  saldo_loja?: number;
  saldo_geral?: number;
  custo_loja?: number;
  localizacao?: string;
  local_mapa?: string;
  coluna?: string;
  prateleira?: string;
  box?: string;
};

type DbMaterialRow = Record<string, unknown> & {
  id: number;
  material: string | null;
  valor_custo: unknown;
  valor: unknown;
  fornecedor_id: number | null;
  visivel_fornecedor: number;
  valor_fornecedor: unknown;
};

type LiberacaoRow = {
  material_id: number;
  fornecedor_id: number;
  razao_social: string;
  nome_fantasia: string | null;
};

const SELECT_COLS = `
  id, material, valor_custo, valor, fornecedor_id, visivel_fornecedor, valor_fornecedor,
  codigo, descricao_nfe, unidade, departamento, subdepartamento, marca, tipo_material,
  referencia, caracteristica, situacao, servico, situacao_tributaria, ncm, ean,
  estoque_minimo, capacidade_total, estoque_negativo, fator, tipo_fator, chapa_mm, corte_cm,
  custo_mercado, custo_formacao, margem_desejada, margem_aplicada, perc_comissao,
  saldo_loja, saldo_geral, custo_loja, localizacao, local_mapa, coluna, prateleira, box
`;

let colsReady = false;

function fornecedorRotulo(row: { razao_social: string; nome_fantasia: string | null }): string {
  const nf = row.nome_fantasia?.trim();
  const rs = row.razao_social?.trim();
  return nf || rs || "Fornecedor";
}

function num(v: unknown): number {
  if (typeof v === "bigint") return num(Number(v));
  if (
    v !== null &&
    typeof v === "object" &&
    "toNumber" in v &&
    typeof (v as { toNumber: () => number }).toNumber === "function"
  ) {
    return num((v as { toNumber: () => number }).toNumber());
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

function money(v: unknown): number {
  return Math.round(num(v) * 100) / 100;
}

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

async function ensureExtraColumns(): Promise<void> {
  if (colsReady) return;
  const prisma = await getPrisma();
  try {
    await prisma.$queryRawUnsafe(`SELECT box FROM materiais LIMIT 1`);
    colsReady = true;
    return;
  } catch {
    /* colunas antigas — aplica ALTER abaixo */
  }
  const alters = [
    "MODIFY COLUMN material VARCHAR(255) NULL",
    "ADD COLUMN codigo VARCHAR(40) NULL",
    "ADD COLUMN descricao_nfe VARCHAR(255) NULL",
    "ADD COLUMN unidade VARCHAR(10) NOT NULL DEFAULT 'M'",
    "ADD COLUMN departamento VARCHAR(80) NULL",
    "ADD COLUMN subdepartamento VARCHAR(80) NULL",
    "ADD COLUMN marca VARCHAR(80) NULL",
    "ADD COLUMN tipo_material VARCHAR(80) NULL",
    "ADD COLUMN referencia VARCHAR(80) NULL",
    "ADD COLUMN caracteristica VARCHAR(120) NULL",
    "ADD COLUMN situacao VARCHAR(40) NOT NULL DEFAULT 'liberado'",
    "ADD COLUMN servico TINYINT NOT NULL DEFAULT 0",
    "ADD COLUMN situacao_tributaria VARCHAR(80) NULL",
    "ADD COLUMN ncm VARCHAR(20) NULL",
    "ADD COLUMN ean VARCHAR(40) NULL",
    "ADD COLUMN estoque_minimo DECIMAL(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN capacidade_total DECIMAL(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN estoque_negativo TINYINT NOT NULL DEFAULT 0",
    "ADD COLUMN fator DECIMAL(12,4) NOT NULL DEFAULT 0",
    "ADD COLUMN tipo_fator VARCHAR(20) NOT NULL DEFAULT 'multiplicacao'",
    "ADD COLUMN chapa_mm VARCHAR(10) NULL",
    "ADD COLUMN corte_cm DECIMAL(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN custo_mercado DECIMAL(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN custo_formacao DECIMAL(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN margem_desejada DECIMAL(8,2) NOT NULL DEFAULT 0",
    "ADD COLUMN margem_aplicada DECIMAL(8,2) NOT NULL DEFAULT 0",
    "ADD COLUMN perc_comissao DECIMAL(8,2) NOT NULL DEFAULT 0",
    "ADD COLUMN saldo_loja DECIMAL(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN saldo_geral DECIMAL(12,2) NOT NULL DEFAULT 0",
    "ADD COLUMN custo_loja DECIMAL(10,2) NOT NULL DEFAULT 0",
    "ADD COLUMN localizacao VARCHAR(120) NULL",
    "ADD COLUMN local_mapa VARCHAR(120) NULL",
    "ADD COLUMN coluna VARCHAR(40) NULL",
    "ADD COLUMN prateleira VARCHAR(40) NULL",
    "ADD COLUMN box VARCHAR(40) NULL",
  ];
  for (const clause of alters) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE materiais ${clause}`);
    } catch {
      /* coluna já existe ou MODIFY ok */
    }
  }
  colsReady = true;
}

function rowToMaterial(
  r: DbMaterialRow,
  lib: { ids: number[]; nomes: string[] },
): MaterialRow {
  return {
    id: int(r.id),
    material: str(r.material),
    valor_custo: money(r.valor_custo),
    valor: money(r.valor),
    fornecedor_id: r.fornecedor_id != null ? int(r.fornecedor_id) : null,
    visivel_fornecedor: int(r.visivel_fornecedor) === 1,
    valor_fornecedor: money(r.valor_fornecedor),
    fornecedor_ids: lib.ids,
    qtd_fornecedores: lib.ids.length,
    fornecedores_nomes: lib.nomes,
    codigo: str(r.codigo),
    descricao_nfe: str(r.descricao_nfe),
    unidade: str(r.unidade) || "M",
    departamento: str(r.departamento),
    subdepartamento: str(r.subdepartamento),
    marca: str(r.marca),
    tipo_material: str(r.tipo_material),
    referencia: str(r.referencia),
    caracteristica: str(r.caracteristica),
    situacao: str(r.situacao) || "liberado",
    servico: int(r.servico) === 1,
    situacao_tributaria: str(r.situacao_tributaria),
    ncm: str(r.ncm),
    ean: str(r.ean),
    estoque_minimo: money(r.estoque_minimo),
    capacidade_total: money(r.capacidade_total),
    estoque_negativo: int(r.estoque_negativo) === 1,
    fator: num(r.fator),
    tipo_fator: str(r.tipo_fator) || "multiplicacao",
    chapa_mm: str(r.chapa_mm),
    corte_cm: money(r.corte_cm),
    custo_mercado: money(r.custo_mercado),
    custo_formacao: money(r.custo_formacao),
    margem_desejada: money(r.margem_desejada),
    margem_aplicada: money(r.margem_aplicada),
    perc_comissao: money(r.perc_comissao),
    saldo_loja: money(r.saldo_loja),
    saldo_geral: money(r.saldo_geral),
    custo_loja: money(r.custo_loja),
    localizacao: str(r.localizacao),
    local_mapa: str(r.local_mapa),
    coluna: str(r.coluna),
    prateleira: str(r.prateleira),
    box: str(r.box),
  };
}

async function queryMateriais(): Promise<DbMaterialRow[]> {
  await ensureExtraColumns();
  const prisma = await getPrisma();
  return prisma.$queryRawUnsafe<DbMaterialRow[]>(
    `SELECT ${SELECT_COLS} FROM materiais ORDER BY material ASC`,
  );
}

async function loadLiberacaoMap(): Promise<Map<number, { ids: number[]; nomes: string[] }>> {
  const prisma = await getPrisma();
  const map = new Map<number, { ids: number[]; nomes: string[] }>();
  try {
    const rows = await prisma.$queryRawUnsafe<LiberacaoRow[]>(
      `SELECT mfl.material_id, mfl.fornecedor_id, f.razao_social, f.nome_fantasia
       FROM material_fornecedor_liberacao mfl
       INNER JOIN fornecedores f ON f.id = mfl.fornecedor_id
       ORDER BY mfl.material_id ASC, f.razao_social ASC`,
    );
    for (const row of rows) {
      const mid = int(row.material_id);
      const fid = int(row.fornecedor_id);
      if (mid <= 0 || fid <= 0) continue;
      if (!map.has(mid)) map.set(mid, { ids: [], nomes: [] });
      const entry = map.get(mid)!;
      entry.ids.push(fid);
      entry.nomes.push(fornecedorRotulo(row));
    }
  } catch {
    /* tabela opcional */
  }
  return map;
}

function normPayload(data: MaterialPayload) {
  return {
    material: data.material.trim().slice(0, 255),
    valor_custo: money(data.valor_custo),
    valor: money(data.valor),
    valor_fornecedor: money(data.valor_fornecedor ?? 0),
    codigo: (data.codigo ?? "").trim().slice(0, 40),
    descricao_nfe: (data.descricao_nfe ?? "").trim().slice(0, 255),
    unidade: (data.unidade ?? "M").trim().slice(0, 10) || "M",
    departamento: (data.departamento ?? "").trim().slice(0, 80),
    subdepartamento: (data.subdepartamento ?? "").trim().slice(0, 80),
    marca: (data.marca ?? "").trim().slice(0, 80),
    tipo_material: (data.tipo_material ?? "").trim().slice(0, 80),
    referencia: (data.referencia ?? "").trim().slice(0, 80),
    caracteristica: (data.caracteristica ?? "").trim().slice(0, 120),
    situacao: (data.situacao ?? "liberado").trim().slice(0, 40) || "liberado",
    servico: data.servico ? 1 : 0,
    situacao_tributaria: (data.situacao_tributaria ?? "").trim().slice(0, 80),
    ncm: (data.ncm ?? "").trim().slice(0, 20),
    ean: (data.ean ?? "").trim().slice(0, 40),
    estoque_minimo: money(data.estoque_minimo ?? 0),
    capacidade_total: money(data.capacidade_total ?? 0),
    estoque_negativo: data.estoque_negativo ? 1 : 0,
    fator: num(data.fator ?? 0),
    tipo_fator: (data.tipo_fator ?? "multiplicacao").trim().slice(0, 20) || "multiplicacao",
    chapa_mm: (data.chapa_mm ?? "").trim().slice(0, 10),
    corte_cm: money(data.corte_cm ?? 0),
    custo_mercado: money(data.custo_mercado ?? 0),
    custo_formacao: money(data.custo_formacao ?? 0),
    margem_desejada: money(data.margem_desejada ?? 0),
    margem_aplicada: money(data.margem_aplicada ?? 0),
    perc_comissao: money(data.perc_comissao ?? 0),
    saldo_loja: money(data.saldo_loja ?? 0),
    saldo_geral: money(data.saldo_geral ?? 0),
    custo_loja: money(data.custo_loja ?? 0),
    localizacao: (data.localizacao ?? "").trim().slice(0, 120),
    local_mapa: (data.local_mapa ?? "").trim().slice(0, 120),
    coluna: (data.coluna ?? "").trim().slice(0, 40),
    prateleira: (data.prateleira ?? "").trim().slice(0, 40),
    box: (data.box ?? "").trim().slice(0, 40),
  };
}

export async function listMateriais(): Promise<MaterialRow[]> {
  const [rows, libMap] = await Promise.all([queryMateriais(), loadLiberacaoMap()]);
  return rows.map((r) => rowToMaterial(r, libMap.get(int(r.id)) ?? { ids: [], nomes: [] }));
}

export async function findMaterialByNome(material: string): Promise<DbMaterialRow | null> {
  await ensureExtraColumns();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<DbMaterialRow[]>(
    `SELECT ${SELECT_COLS} FROM materiais WHERE material = ? LIMIT 1`,
    material,
  );
  return rows[0] ?? null;
}

export async function findMaterialById(id: number): Promise<DbMaterialRow | null> {
  await ensureExtraColumns();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<DbMaterialRow[]>(
    `SELECT ${SELECT_COLS} FROM materiais WHERE id = ? LIMIT 1`,
    id,
  );
  return rows[0] ?? null;
}

export async function createMaterial(data: MaterialPayload): Promise<MaterialRow> {
  await ensureExtraColumns();
  const p = normPayload(data);
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(
    `INSERT INTO materiais (
      material, valor_custo, valor, valor_fornecedor,
      codigo, descricao_nfe, unidade, departamento, subdepartamento, marca, tipo_material,
      referencia, caracteristica, situacao, servico, situacao_tributaria, ncm, ean,
      estoque_minimo, capacidade_total, estoque_negativo, fator, tipo_fator, chapa_mm, corte_cm,
      custo_mercado, custo_formacao, margem_desejada, margem_aplicada, perc_comissao,
      saldo_loja, saldo_geral, custo_loja, localizacao, local_mapa, coluna, prateleira, box
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    p.material,
    p.valor_custo,
    p.valor,
    p.valor_fornecedor,
    p.codigo || null,
    p.descricao_nfe || null,
    p.unidade,
    p.departamento || null,
    p.subdepartamento || null,
    p.marca || null,
    p.tipo_material || null,
    p.referencia || null,
    p.caracteristica || null,
    p.situacao,
    p.servico,
    p.situacao_tributaria || null,
    p.ncm || null,
    p.ean || null,
    p.estoque_minimo,
    p.capacidade_total,
    p.estoque_negativo,
    p.fator,
    p.tipo_fator,
    p.chapa_mm || null,
    p.corte_cm,
    p.custo_mercado,
    p.custo_formacao,
    p.margem_desejada,
    p.margem_aplicada,
    p.perc_comissao,
    p.saldo_loja,
    p.saldo_geral,
    p.custo_loja,
    p.localizacao || null,
    p.local_mapa || null,
    p.coluna || null,
    p.prateleira || null,
    p.box || null,
  );
  const found = await findMaterialByNome(p.material);
  if (!found) throw new Error("Não foi possível cadastrar o material.");
  return rowToMaterial(found, { ids: [], nomes: [] });
}

export async function updateMaterial(id: number, data: MaterialPayload): Promise<MaterialRow> {
  await ensureExtraColumns();
  const p = normPayload(data);
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(
    `UPDATE materiais SET
      material=?, valor_custo=?, valor=?, valor_fornecedor=?,
      codigo=?, descricao_nfe=?, unidade=?, departamento=?, subdepartamento=?, marca=?, tipo_material=?,
      referencia=?, caracteristica=?, situacao=?, servico=?, situacao_tributaria=?, ncm=?, ean=?,
      estoque_minimo=?, capacidade_total=?, estoque_negativo=?, fator=?, tipo_fator=?, chapa_mm=?, corte_cm=?,
      custo_mercado=?, custo_formacao=?, margem_desejada=?, margem_aplicada=?, perc_comissao=?,
      saldo_loja=?, saldo_geral=?, custo_loja=?, localizacao=?, local_mapa=?, coluna=?, prateleira=?, box=?
     WHERE id=?`,
    p.material,
    p.valor_custo,
    p.valor,
    p.valor_fornecedor,
    p.codigo || null,
    p.descricao_nfe || null,
    p.unidade,
    p.departamento || null,
    p.subdepartamento || null,
    p.marca || null,
    p.tipo_material || null,
    p.referencia || null,
    p.caracteristica || null,
    p.situacao,
    p.servico,
    p.situacao_tributaria || null,
    p.ncm || null,
    p.ean || null,
    p.estoque_minimo,
    p.capacidade_total,
    p.estoque_negativo,
    p.fator,
    p.tipo_fator,
    p.chapa_mm || null,
    p.corte_cm,
    p.custo_mercado,
    p.custo_formacao,
    p.margem_desejada,
    p.margem_aplicada,
    p.perc_comissao,
    p.saldo_loja,
    p.saldo_geral,
    p.custo_loja,
    p.localizacao || null,
    p.local_mapa || null,
    p.coluna || null,
    p.prateleira || null,
    p.box || null,
    id,
  );
  const found = await findMaterialById(id);
  if (!found) {
    const err = new Error("Material não encontrado.");
    (err as { code?: string }).code = "P2025";
    throw err;
  }
  const libMap = await loadLiberacaoMap();
  return rowToMaterial(found, libMap.get(id) ?? { ids: [], nomes: [] });
}

/** Define saldo_loja e saldo_geral de todos os materiais (ex.: 100 metros). */
export async function setTodosEstoques(saldo: number): Promise<number> {
  await ensureExtraColumns();
  const prisma = await getPrisma();
  const qtd = Math.max(0, Math.round(Number(saldo) * 100) / 100);
  const n = await prisma.$executeRawUnsafe(
    `UPDATE materiais SET saldo_loja = ?, saldo_geral = ?`,
    qtd,
    qtd,
  );
  return typeof n === "number" ? n : Number(n) || 0;
}

/** Define estoque_minimo de todos (ex.: 2 metros para alerta). */
export async function setTodosEstoquesMinimos(minimo: number): Promise<number> {
  await ensureExtraColumns();
  const prisma = await getPrisma();
  const qtd = Math.max(0, Math.round(Number(minimo) * 100) / 100);
  const n = await prisma.$executeRawUnsafe(`UPDATE materiais SET estoque_minimo = ?`, qtd);
  return typeof n === "number" ? n : Number(n) || 0;
}

export async function salvarMaterialFornecedoresLiberados(
  materialId: number,
  fornecedorIds: number[],
): Promise<void> {
  const prisma = await getPrisma();
  const ids = [...new Set(fornecedorIds.map((id) => Number(id)).filter((id) => id > 0))];
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM material_fornecedor_liberacao WHERE material_id = ?`,
      materialId,
    );
    for (const fid of ids) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO material_fornecedor_liberacao (material_id, fornecedor_id) VALUES (?, ?)`,
        materialId,
        fid,
      );
    }
  } catch {
    /* tabela opcional */
  }
  await prisma.$executeRawUnsafe(
    `UPDATE materiais SET visivel_fornecedor = ? WHERE id = ?`,
    ids.length > 0 ? 1 : 0,
    materialId,
  );
}

export async function deleteMaterial(id: number): Promise<void> {
  await ensureExtraColumns();
  const prisma = await getPrisma();
  const exists = await findMaterialById(id);
  if (!exists) {
    const err = new Error("Material não encontrado.");
    (err as { code?: string }).code = "P2025";
    throw err;
  }
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM material_fornecedor_liberacao WHERE material_id = ?`,
      id,
    );
  } catch {
    /* opcional */
  }
  await prisma.$executeRawUnsafe(`DELETE FROM materiais WHERE id = ?`, id);
}
