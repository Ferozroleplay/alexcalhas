import { getPrisma } from "@/lib/db.server";
import { listDespesas } from "@/lib/despesas.server";
import {
  idsComAlgumRecebimento,
  labelRecebimentoTipo,
  listarRecebimentosDoDia,
} from "@/lib/inventario-recebimento.server";
import { parseDataInventario } from "@/lib/inventario-stats.server";
import { parseFormaPagamento } from "@/lib/orcamento.server";

export type CaixaStatus = "aberto" | "fechado";

export type CaixaVendaItem = {
  id: number;
  nome: string;
  status: string;
  forma: string;
  venda: number;
  custo: number;
  lucro: number;
};

export type CaixaDiaResumo = {
  data: string;
  dataLabel: string;
  qtdVendas: number;
  dinheiro: number;
  cartoes: number;
  cheques: number;
  pix: number;
  financeira: number;
  recebimentos: number;
  vendas: number;
  sangriasSuprimentos: number;
  devolucoes: number;
  saldoFinal: number;
  /** Custo dos materiais (valor_custo das linhas). */
  custoMateriais: number;
  /** Despesas cadastradas no dia. */
  despesas: number;
  /** Lucro real = recebimentos − custo − despesas. */
  lucroReal: number;
  margemPct: number;
  vendasDetalhe: CaixaVendaItem[];
  /** Status compartilhado (todos os admins). Ausente = nunca aberto. */
  status: CaixaStatus | null;
};

let tabelaCaixaPronta = false;

async function ensureCaixaDiasTable(): Promise<void> {
  if (tabelaCaixaPronta) return;
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS caixa_dias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data DATE NOT NULL,
      status VARCHAR(20) NOT NULL,
      aberto_por_id INT NULL,
      fechado_por_id INT NULL,
      aberto_em DATETIME NULL,
      fechado_em DATETIME NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_caixa_dias_data (data)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tabelaCaixaPronta = true;
}

function normalizeYmd(dataYmd: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : ymdLocal(new Date());
}

export async function getCaixaStatus(dataYmd: string): Promise<CaixaStatus | null> {
  await ensureCaixaDiasTable();
  const ymd = normalizeYmd(dataYmd);
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status FROM caixa_dias WHERE data = '${ymd}' LIMIT 1`,
  );
  const s = String(rows[0]?.status ?? "").toLowerCase();
  if (s === "aberto" || s === "fechado") return s;
  return null;
}

/** Mapa data → status para marcar o calendário (mês/ano). */
export async function listCaixaStatusMes(
  ano: number,
  mes: number,
): Promise<Record<string, CaixaStatus>> {
  await ensureCaixaDiasTable();
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) return {};
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Array<{ data: Date | string; status: string }>>(
    `SELECT data, status FROM caixa_dias
     WHERE YEAR(data) = ${Math.trunc(ano)} AND MONTH(data) = ${Math.trunc(mes)}`,
  );
  const map: Record<string, CaixaStatus> = {};
  for (const row of rows) {
    // DATE do MySQL vem como UTC midnight — usar ISO evita virar o dia anterior no BR.
    const d =
      row.data instanceof Date && !Number.isNaN(row.data.getTime())
        ? row.data.toISOString().slice(0, 10)
        : String(row.data ?? "").slice(0, 10);
    const s = String(row.status ?? "").toLowerCase();
    if ((s === "aberto" || s === "fechado") && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      map[d] = s;
    }
  }
  return map;
}

export async function setCaixaStatus(
  dataYmd: string,
  status: CaixaStatus,
  usuarioId?: number | null,
): Promise<CaixaStatus> {
  await ensureCaixaDiasTable();
  const ymd = normalizeYmd(dataYmd);
  const uid =
    typeof usuarioId === "number" && Number.isFinite(usuarioId) && usuarioId > 0
      ? Math.trunc(usuarioId)
      : null;
  const prisma = await getPrisma();
  const agora = new Date().toISOString().slice(0, 19).replace("T", " ");

  if (status === "aberto") {
    await prisma.$executeRawUnsafe(`
      INSERT INTO caixa_dias (data, status, aberto_por_id, aberto_em, fechado_por_id, fechado_em)
      VALUES ('${ymd}', 'aberto', ${uid ?? "NULL"}, '${agora}', NULL, NULL)
      ON DUPLICATE KEY UPDATE
        status = 'aberto',
        aberto_por_id = VALUES(aberto_por_id),
        aberto_em = VALUES(aberto_em),
        fechado_por_id = NULL,
        fechado_em = NULL
    `);
  } else {
    await prisma.$executeRawUnsafe(`
      INSERT INTO caixa_dias (data, status, fechado_por_id, fechado_em)
      VALUES ('${ymd}', 'fechado', ${uid ?? "NULL"}, '${agora}')
      ON DUPLICATE KEY UPDATE
        status = 'fechado',
        fechado_por_id = VALUES(fechado_por_id),
        fechado_em = VALUES(fechado_em)
    `);
  }
  return status;
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a: Date, ymd: string): boolean {
  return ymdLocal(a) === ymd;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseLinhasOrcamento(orcamento: string | null): { venda: number; custo: number } {
  if (!orcamento) return { venda: 0, custo: 0 };
  try {
    const parts = JSON.parse(orcamento) as unknown[];
    if (!Array.isArray(parts)) return { venda: 0, custo: 0 };
    let venda = 0;
    let custo = 0;
    for (const p of parts) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const metros = Number(String(o.metros ?? 1).replace(",", ".")) || 1;
      const valor = Number(String(o.valor ?? 0).replace(",", ".")) || 0;
      const custoUnit =
        Number(String(o.custo ?? o.valor_custo ?? 0).replace(",", ".")) || 0;
      venda += metros * valor;
      custo += metros * custoUnit;
    }
    return { venda: round2(venda), custo: round2(custo) };
  } catch {
    return { venda: 0, custo: 0 };
  }
}

function formaLabel(raw: string | null | undefined): string {
  const f = parseFormaPagamento(raw).forma;
  if (f === "pix") return "PIX";
  if (f === "debito") return "Débito";
  if (f === "credito") return "Crédito";
  return "Outros";
}

/** Resumo do caixa para um dia (confirmados + finalizados com data nesse dia). */
export async function getCaixaDia(dataYmd: string): Promise<CaixaDiaResumo> {
  const ymd = normalizeYmd(dataYmd);
  const [y, m, d] = ymd.split("-").map(Number);
  const dataRef = new Date(y, m - 1, d);
  const dataLabel = dataRef.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const status = await getCaixaStatus(ymd);

  const prisma = await getPrisma();
  const rows = await prisma.inventario.findMany({
    select: {
      id: true,
      nome: true,
      status: true,
      valor: true,
      orcamento: true,
      formaPagamento: true,
      dataVisita: true,
      dataMontagem: true,
    },
  });

  let qtdVendas = 0;
  let vendas = 0;
  let custoMateriais = 0;
  const jobsDia: Array<CaixaVendaItem & { formaRaw: string | null }> = [];

  for (const row of rows) {
    const status = row.status.trim().toLowerCase().replace("ç", "c");
    if (status !== "confirmado" && status !== "finalizado") continue;

    const dt = parseDataInventario(row);
    if (!dt || !sameDay(dt, ymd)) continue;

    const linhas = parseLinhasOrcamento(row.orcamento);
    const valorRow = Number(row.valor);
    const venda =
      Number.isFinite(valorRow) && valorRow > 0 ? round2(valorRow) : linhas.venda;
    if (venda <= 0 && linhas.custo <= 0) continue;

    const custo = linhas.custo;
    qtdVendas += 1;
    vendas += venda;
    custoMateriais += custo;

    jobsDia.push({
      id: row.id,
      nome: row.nome,
      status: status === "finalizado" ? "Finalizado" : "Confirmado",
      forma: formaLabel(row.formaPagamento),
      formaRaw: row.formaPagamento,
      venda,
      custo,
      lucro: round2(venda - custo),
    });
  }

  const [pagamentos, idsComPagamento] = await Promise.all([
    listarRecebimentosDoDia(ymd),
    idsComAlgumRecebimento(jobsDia.map((j) => j.id)),
  ]);

  let dinheiro = 0;
  let cartoes = 0;
  let cheques = 0;
  let pix = 0;
  let financeira = 0;
  const vendasDetalhe: CaixaVendaItem[] = [];

  const somarForma = (formaRaw: string | null | undefined, valor: number) => {
    const forma = parseFormaPagamento(formaRaw).forma;
    if (forma === "pix") pix += valor;
    else if (forma === "debito" || forma === "credito") cartoes += valor;
    else dinheiro += valor;
  };

  for (const p of pagamentos) {
    somarForma(p.formaPagamento, p.valor);
    vendasDetalhe.push({
      id: p.inventarioId,
      nome: p.nome,
      status: labelRecebimentoTipo(p.tipo),
      forma: formaLabel(p.formaPagamento),
      venda: p.valor,
      custo: 0,
      lucro: p.valor,
    });
  }

  for (const job of jobsDia) {
    if (idsComPagamento.has(job.id)) continue;
    somarForma(job.formaRaw, job.venda);
    vendasDetalhe.push({
      id: job.id,
      nome: job.nome,
      status: job.status,
      forma: job.forma,
      venda: job.venda,
      custo: job.custo,
      lucro: job.lucro,
    });
  }

  vendasDetalhe.sort((a, b) => b.venda - a.venda);

  const despesasLista = await listDespesas({ ano: y, mes: m });
  const despesas = round2(
    despesasLista.filter((x) => x.data === ymd).reduce((s, x) => s + x.valor, 0),
  );

  const recebimentos = round2(dinheiro + cartoes + cheques + pix + financeira);
  const sangriasSuprimentos = 0;
  const devolucoes = 0;
  const saldoFinal = round2(recebimentos - sangriasSuprimentos - devolucoes);
  const lucroReal = round2(recebimentos - custoMateriais - despesas);
  const margemPct = recebimentos > 0 ? round2((lucroReal / recebimentos) * 100) : 0;

  return {
    data: ymd,
    dataLabel,
    qtdVendas,
    dinheiro: round2(dinheiro),
    cartoes: round2(cartoes),
    cheques,
    pix: round2(pix),
    financeira,
    recebimentos: round2(recebimentos),
    vendas: round2(vendas),
    sangriasSuprimentos,
    devolucoes,
    saldoFinal,
    custoMateriais: round2(custoMateriais),
    despesas,
    lucroReal,
    margemPct,
    vendasDetalhe,
    status,
  };
}
