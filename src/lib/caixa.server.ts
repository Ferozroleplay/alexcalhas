import { getPrisma } from "@/lib/db.server";
import { listDespesas } from "@/lib/despesas.server";
import { parseDataInventario } from "@/lib/inventario-stats.server";
import { parseFormaPagamento } from "@/lib/orcamento.server";

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
  /** Lucro real = vendas − custo − despesas. */
  lucroReal: number;
  margemPct: number;
  vendasDetalhe: CaixaVendaItem[];
};

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
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : ymdLocal(new Date());
  const [y, m, d] = ymd.split("-").map(Number);
  const dataRef = new Date(y, m - 1, d);
  const dataLabel = dataRef.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

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

  let dinheiro = 0;
  let cartoes = 0;
  let cheques = 0;
  let pix = 0;
  let financeira = 0;
  let qtdVendas = 0;
  let vendas = 0;
  let custoMateriais = 0;
  const vendasDetalhe: CaixaVendaItem[] = [];

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

    const forma = parseFormaPagamento(row.formaPagamento).forma;
    if (forma === "pix") pix += venda;
    else if (forma === "debito" || forma === "credito") cartoes += venda;
    else dinheiro += venda;

    vendasDetalhe.push({
      id: row.id,
      nome: row.nome,
      status: status === "finalizado" ? "Finalizado" : "Confirmado",
      forma: formaLabel(row.formaPagamento),
      venda,
      custo,
      lucro: round2(venda - custo),
    });
  }

  vendasDetalhe.sort((a, b) => b.venda - a.venda);

  const despesasLista = await listDespesas({ ano: y, mes: m });
  const despesas = round2(
    despesasLista.filter((x) => x.data === ymd).reduce((s, x) => s + x.valor, 0),
  );

  const recebimentos = vendas;
  const sangriasSuprimentos = 0;
  const devolucoes = 0;
  const saldoFinal = round2(
    dinheiro + cartoes + cheques + pix + financeira - sangriasSuprimentos - devolucoes,
  );
  const lucroReal = round2(vendas - custoMateriais - despesas);
  const margemPct = vendas > 0 ? round2((lucroReal / vendas) * 100) : 0;

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
  };
}
