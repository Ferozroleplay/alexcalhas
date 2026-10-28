import { getPrisma } from "@/lib/db.server";
import {
  RECEBIMENTO_TIPOS,
  labelRecebimentoTipo,
  formatPagoEmExibicao,
  normalizarValorPagamento,
} from "@/lib/inventario-recebimento-display";
import { parseMoneyBr } from "@/lib/orcamento.server";

export { RECEBIMENTO_TIPOS, labelRecebimentoTipo, formatPagoEmExibicao };
export type RecebimentoTipo = (typeof RECEBIMENTO_TIPOS)[number];

export type InventarioRecebimentoRow = {
  id: number;
  inventario_id: number;
  valor: number;
  tipo: RecebimentoTipo;
  pago_em: string;
  observacao: string | null;
  registrado_por: number | null;
};

export type RecebimentoResumo = {
  valorRecebido: number;
  saldoPendente: number;
  quitado: boolean;
  qtdPagamentos: number;
};

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

let tabelaPronta = false;

export async function ensureInventarioRecebimentoTable(): Promise<void> {
  if (tabelaPronta) return;
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ t: string }[]>(
    `SHOW TABLES LIKE 'inventario_recebimento'`,
  );
  if (rows.length === 0) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE inventario_recebimento (
        id INT NOT NULL AUTO_INCREMENT,
        inventario_id INT NOT NULL,
        valor DECIMAL(10,2) NOT NULL,
        tipo VARCHAR(20) NOT NULL DEFAULT 'sinal',
        pago_em DATETIME NOT NULL,
        observacao VARCHAR(255) NULL,
        registrado_por INT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_inventario_recebimento_inv (inventario_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
  tabelaPronta = true;
}

export function normalizarRecebimentoTipo(raw: string): RecebimentoTipo {
  const t = raw.trim().toLowerCase();
  return RECEBIMENTO_TIPOS.includes(t as RecebimentoTipo) ? (t as RecebimentoTipo) : "sinal";
}

/** Converte input datetime-local (YYYY-MM-DDTHH:mm) ou ISO → MySQL DATETIME. */
export function pagoEmParaSql(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const local = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    return `${local[1]}-${local[2]}-${local[3]} ${local[4]}:${local[5]}:${local[6] ?? "00"}`;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function pagoEmParaInputLocal(raw: string | Date): string {
  const d = raw instanceof Date ? raw : new Date(String(raw).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function calcularResumoRecebimento(valorOrcamento: number, valorRecebido: number): RecebimentoResumo {
  const total = Math.max(0, Math.round(valorOrcamento * 100) / 100);
  const recebido = Math.max(0, Math.round(valorRecebido * 100) / 100);
  const saldo = Math.max(0, Math.round((total - recebido) * 100) / 100);
  return {
    valorRecebido: recebido,
    saldoPendente: saldo,
    quitado: total > 0 && recebido >= total - 0.009,
    qtdPagamentos: 0,
  };
}

function pagoEmTexto(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${raw.getFullYear()}-${p(raw.getMonth() + 1)}-${p(raw.getDate())} ${p(raw.getHours())}:${p(raw.getMinutes())}:${p(raw.getSeconds())}`;
  }
  const s = String(raw ?? "").trim();
  return s;
}

function mapRow(r: Record<string, unknown>): InventarioRecebimentoRow {
  return {
    id: int(r.id),
    inventario_id: int(r.inventario_id),
    valor: num(r.valor),
    tipo: normalizarRecebimentoTipo(String(r.tipo ?? "sinal")),
    pago_em: pagoEmTexto(r.pago_em),
    observacao: r.observacao != null ? String(r.observacao) : null,
    registrado_por: r.registrado_por != null ? int(r.registrado_por) : null,
  };
}

export async function mapaTotalRecebidoPorInventario(
  inventarioIds: number[],
): Promise<Record<number, { total: number; qtd: number }>> {
  const out: Record<number, { total: number; qtd: number }> = {};
  if (inventarioIds.length === 0) return out;

  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const ids = inventarioIds.filter((id) => id > 0);
  if (ids.length === 0) return out;

  const rows = await prisma.$queryRawUnsafe<{ inventario_id: unknown; total: unknown; qtd: unknown }[]>(
    `SELECT inventario_id, COALESCE(SUM(valor), 0) AS total, COUNT(*) AS qtd
     FROM inventario_recebimento
     WHERE inventario_id IN (${ids.join(",")})
     GROUP BY inventario_id`,
  );

  for (const r of rows) {
    const id = int(r.inventario_id);
    out[id] = { total: num(r.total), qtd: int(r.qtd) };
  }
  return out;
}

export async function listarRecebimentosInventario(
  inventarioId: number,
  valorOrcamento: number,
): Promise<{
  recebimentos: InventarioRecebimentoRow[];
  resumo: RecebimentoResumo;
}> {
  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const invId = int(inventarioId);
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, inventario_id, valor, tipo, pago_em, observacao, registrado_por
     FROM inventario_recebimento
     WHERE inventario_id = ${invId}
     ORDER BY pago_em DESC, id DESC`,
  );
  const recebimentos = rows.map(mapRow);
  const valorRecebido = recebimentos.reduce((s, r) => s + r.valor, 0);
  const resumo = {
    ...calcularResumoRecebimento(valorOrcamento, valorRecebido),
    qtdPagamentos: recebimentos.length,
  };
  return { recebimentos, resumo };
}

/** Número a partir de "295,99", "295.99" ou "1.750,00". */
export function valorPagamentoNumero(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return parseMoneyBr(raw);
  return parseMoneyBr(normalizarValorPagamento(String(raw ?? "")));
}

export async function criarRecebimentoInventario(input: {
  inventarioId: number;
  valor: unknown;
  tipo: string;
  pagoEm: string;
  observacao?: string;
  registradoPor?: number | null;
}): Promise<{ ok: boolean; message: string; id?: number }> {
  const invId = int(input.inventarioId);
  const valor = valorPagamentoNumero(input.valor);
  if (invId <= 0) return { ok: false, message: "Registro inválido." };
  if (valor <= 0) return { ok: false, message: "Informe um valor maior que zero." };

  const pagoSql = pagoEmParaSql(input.pagoEm);
  if (!pagoSql) return { ok: false, message: "Data ou hora do pagamento inválida." };

  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const tipo = esc(normalizarRecebimentoTipo(input.tipo));
  const obs = esc((input.observacao ?? "").trim().slice(0, 255));
  const reg = input.registradoPor != null && input.registradoPor > 0 ? int(input.registradoPor) : null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO inventario_recebimento (inventario_id, valor, tipo, pago_em, observacao, registrado_por)
     VALUES (${invId}, '${valor.toFixed(2)}', '${tipo}', '${esc(pagoSql)}', ${obs ? `'${obs}'` : "NULL"}, ${reg ?? "NULL"})`,
  );

  const last = await prisma.$queryRawUnsafe<{ id: unknown }[]>(`SELECT LAST_INSERT_ID() AS id`);
  return { ok: true, message: "Pagamento registrado.", id: int(last[0]?.id) };
}

export async function atualizarRecebimentoInventario(input: {
  recebimentoId: number;
  inventarioId: number;
  valor: unknown;
  tipo: string;
  pagoEm: string;
  observacao?: string;
}): Promise<{ ok: boolean; message: string }> {
  const id = int(input.recebimentoId);
  const invId = int(input.inventarioId);
  const valor = valorPagamentoNumero(input.valor);
  if (id <= 0 || invId <= 0) return { ok: false, message: "Pagamento inválido." };
  if (valor <= 0) return { ok: false, message: "Informe um valor maior que zero." };

  const pagoSql = pagoEmParaSql(input.pagoEm);
  if (!pagoSql) return { ok: false, message: "Data ou hora do pagamento inválida." };

  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const tipo = esc(normalizarRecebimentoTipo(input.tipo));
  const obs = esc((input.observacao ?? "").trim().slice(0, 255));
  const existe = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT id FROM inventario_recebimento WHERE id = ${id} AND inventario_id = ${invId} LIMIT 1`,
  );
  if (!existe.length) return { ok: false, message: "Pagamento não encontrado." };

  await prisma.$executeRawUnsafe(
    `UPDATE inventario_recebimento
     SET valor = '${valor.toFixed(2)}',
         tipo = '${tipo}',
         pago_em = '${esc(pagoSql)}',
         observacao = ${obs ? `'${obs}'` : "NULL"}
     WHERE id = ${id} AND inventario_id = ${invId}
     LIMIT 1`,
  );
  return { ok: true, message: "Pagamento atualizado." };
}

export async function excluirRecebimentoInventario(
  recebimentoId: number,
  inventarioId: number,
): Promise<{ ok: boolean; message: string }> {
  const id = int(recebimentoId);
  const invId = int(inventarioId);
  if (id <= 0) return { ok: false, message: "Pagamento inválido." };

  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const res = await prisma.$executeRawUnsafe(
    `DELETE FROM inventario_recebimento WHERE id = ${id} AND inventario_id = ${invId} LIMIT 1`,
  );
  const n = typeof res === "number" ? res : 0;
  if (n === 0) return { ok: false, message: "Pagamento não encontrado." };
  return { ok: true, message: "Pagamento removido." };
}

export function statusPermiteRecebimento(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "orcamentado" ||
    s === "orçamentado" ||
    s === "confirmado" ||
    s === "finalizado"
  );
}

export function agoraPagoEmLocal(): string {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return s.slice(0, 16).replace(" ", "T");
}

export type RecebimentoDoDia = {
  id: number;
  inventarioId: number;
  valor: number;
  tipo: RecebimentoTipo;
  pagoEm: string;
  nome: string;
  formaPagamento: string | null;
  status: string;
};

/** Pagamentos com DATE(pago_em) no dia (horário gravado no lançamento). */
export async function listarRecebimentosDoDia(ymd: string): Promise<RecebimentoDoDia[]> {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "";
  if (!dia) return [];

  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT r.id, r.inventario_id, r.valor, r.tipo, r.pago_em,
            i.nome, i.forma_pagamento AS forma_pagamento, i.status
     FROM inventario_recebimento r
     INNER JOIN inventario i ON i.id = r.inventario_id
     WHERE DATE(r.pago_em) = '${esc(dia)}'
     ORDER BY r.pago_em ASC, r.id ASC`,
  );

  return rows.map((r) => ({
    id: int(r.id),
    inventarioId: int(r.inventario_id),
    valor: num(r.valor),
    tipo: normalizarRecebimentoTipo(String(r.tipo ?? "sinal")),
    pagoEm: pagoEmTexto(r.pago_em),
    nome: String(r.nome ?? ""),
    formaPagamento: r.forma_pagamento != null ? String(r.forma_pagamento) : null,
    status: String(r.status ?? ""),
  }));
}

export async function somaRecebimentosEntre(deYmd: string, ateYmd: string): Promise<number> {
  const de = /^\d{4}-\d{2}-\d{2}$/.test(deYmd) ? deYmd : "";
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(ateYmd) ? ateYmd : "";
  if (!de || !ate) return 0;

  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ total: unknown }[]>(
    `SELECT COALESCE(SUM(valor), 0) AS total
     FROM inventario_recebimento
     WHERE DATE(pago_em) >= '${esc(de)}' AND DATE(pago_em) <= '${esc(ate)}'`,
  );
  return num(rows[0]?.total);
}

/** IDs de serviços que já têm pelo menos um pagamento lançado. */
export async function idsComAlgumRecebimento(inventarioIds: number[]): Promise<Set<number>> {
  const ids = inventarioIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return new Set();

  await ensureInventarioRecebimentoTable();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ inventario_id: unknown }[]>(
    `SELECT DISTINCT inventario_id
     FROM inventario_recebimento
     WHERE inventario_id IN (${ids.join(",")})`,
  );
  return new Set(rows.map((r) => int(r.inventario_id)).filter((id) => id > 0));
}
