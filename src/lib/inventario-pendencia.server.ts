import { getPrisma } from "@/lib/db.server";

let colunaPronta = false;

export async function ensureCobrarPendenciaColumn(): Promise<void> {
  if (colunaPronta) return;
  const prisma = await getPrisma();
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE inventario ADD COLUMN cobrar_pendencia TINYINT NOT NULL DEFAULT 0`,
    );
  } catch {
    /* coluna já existe */
  }
  colunaPronta = true;
}

export async function marcarPendenciaCobranca(inventarioId: number): Promise<void> {
  await ensureCobrarPendenciaColumn();
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(
    `UPDATE inventario SET cobrar_pendencia = 1 WHERE id = ?`,
    inventarioId,
  );
}

export async function listarIdsPendenciaCobranca(opts?: {
  limit?: number;
  funcionarioId?: number | null;
}): Promise<number[]> {
  await ensureCobrarPendenciaColumn();
  const prisma = await getPrisma();
  const limit = Math.min(Math.max(Number(opts?.limit) || 200, 1), 500);
  const funcionarioId = opts?.funcionarioId;
  const filtroFunc =
    funcionarioId != null && Number.isInteger(funcionarioId)
      ? `AND (funcionario = ${funcionarioId} OR funcionario IS NULL)`
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
