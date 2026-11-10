import { getPrisma } from "@/lib/db.server";

let colunaPronta = false;

export async function ensureCobrarPendenciaColumn(): Promise<void> {
  if (colunaPronta) return;
  const prisma = await getPrisma();
  try {
    await prisma.$queryRawUnsafe(`SELECT cobrar_pendencia FROM inventario LIMIT 1`);
    colunaPronta = true;
    return;
  } catch {
    /* coluna ainda não existe */
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE inventario ADD COLUMN cobrar_pendencia TINYINT NOT NULL DEFAULT 0`,
    );
  } catch {
    /* coluna já existe */
  }
  colunaPronta = true;
}

let colunaPagarPronta = false;

export async function ensurePagarEmColumn(): Promise<void> {
  if (colunaPagarPronta) return;
  const prisma = await getPrisma();
  try {
    await prisma.$queryRawUnsafe(`SELECT pagar_em FROM inventario LIMIT 1`);
    colunaPagarPronta = true;
    return;
  } catch {
    /* coluna ainda não existe */
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE inventario ADD COLUMN pagar_em VARCHAR(20) NULL`);
  } catch {
    /* coluna já existe */
  }
  colunaPagarPronta = true;
}

export async function marcarPendenciaCobranca(
  inventarioId: number,
  pagarEm?: string | null,
): Promise<void> {
  await ensureCobrarPendenciaColumn();
  await ensurePagarEmColumn();
  const prisma = await getPrisma();
  if (pagarEm) {
    await prisma.$executeRawUnsafe(
      `UPDATE inventario SET cobrar_pendencia = 1, pagar_em = ? WHERE id = ?`,
      pagarEm,
      inventarioId,
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    `UPDATE inventario SET cobrar_pendencia = 1 WHERE id = ?`,
    inventarioId,
  );
}

export async function mapaPagarEm(ids: number[]): Promise<Map<number, string>> {
  const safe = ids.filter((id) => Number.isInteger(id) && id > 0);
  const mapa = new Map<number, string>();
  if (safe.length === 0) return mapa;
  await ensurePagarEmColumn();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: number; pagar_em: string | null }[]>(
    `SELECT id, pagar_em FROM inventario WHERE id IN (${safe.join(",")})`,
  );
  for (const row of rows) {
    const data = String(row.pagar_em ?? "").trim();
    if (data) mapa.set(Number(row.id), data);
  }
  return mapa;
}

export async function listarIdsPendenciaCobranca(opts?: {
  limit?: number;
  funcionarioId?: number | null;
}): Promise<number[]> {
  await ensureCobrarPendenciaColumn();
  const prisma = await getPrisma();
  const limit = Math.min(Math.max(Number(opts?.limit) || 1000, 1), 2000);
  const funcionarioId = opts?.funcionarioId;
  const filtroFunc =
    funcionarioId != null && Number.isInteger(funcionarioId)
      ? `AND funcionario = ${funcionarioId}`
      : "";
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT id FROM inventario
     WHERE LOWER(TRIM(status)) = 'finalizado'
       AND COALESCE(cobrar_pendencia, 0) = 1
       ${filtroFunc}
     ORDER BY id DESC
     LIMIT ${limit}`,
  );
  return rows.map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0);
}

export async function mapaCobrarPendencia(ids: number[]): Promise<Set<number>> {
  const safe = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (safe.length === 0) return new Set();
  await ensureCobrarPendenciaColumn();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: number; cobrar_pendencia: number | null }[]>(
    `SELECT id, cobrar_pendencia FROM inventario WHERE id IN (${safe.join(",")})`,
  );
  return new Set(
    rows.filter((r) => Number(r.cobrar_pendencia) === 1).map((r) => Number(r.id)),
  );
}
