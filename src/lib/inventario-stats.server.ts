import { getPrisma } from "@/lib/db.server";

const MESES_CURTO = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function parseDataInventario(row: {
  dataMontagem: string | null;
  dataVisita: string;
}): Date | null {
  const candidatos = [row.dataMontagem?.trim() ?? "", row.dataVisita.trim()];
  for (const d of candidatos) {
    if (!d || d === "0000-00-00") continue;
    const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(d);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  return null;
}

function bucketStatus(status: string) {
  const s = status.trim().toLowerCase().replace("ç", "c");
  if (s === "orcamentado") return "orcamentado";
  if (["agendado", "confirmado", "finalizado"].includes(s)) return s;
  return "outros";
}

function parseOrcamentoParts(raw: string | null) {
  if (!raw) return { venda: 0, custo: 0 };
  try {
    const parts = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parts)) return { venda: 0, custo: 0 };
    let venda = 0;
    let custo = 0;
    for (const p of parts) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const metros = Number(o.metros ?? 1) || 1;
      const valor = Number(o.valor ?? 0) || 0;
      venda += metros * valor;
      custo += Number(o.custo ?? 0) || 0;
    }
    return { venda, custo };
  } catch {
    return { venda: 0, custo: 0 };
  }
}

export async function getDashboardStats() {
  const prisma = await getPrisma();
  const now = new Date();
  const mesLabel = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const visitKeys: string[] = [];
  const dailyLabels: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    visitKeys.push(`${day}-${month}-${year}`);
    dailyLabels.push(`${day}/${month}`);
  }

  const [counts, moneyRows, visitRows] = await Promise.all([
    prisma.inventario.groupBy({
      by: ["status"],
      _count: true,
      _sum: { valor: true },
    }),
    prisma.inventario.findMany({
      where: {
        OR: [{ status: "confirmado" }, { status: "finalizado" }],
      },
      select: {
        status: true,
        valor: true,
        orcamento: true,
        dataVisita: true,
        dataMontagem: true,
      },
    }),
    prisma.inventario.findMany({
      where: { dataVisita: { in: visitKeys } },
      select: { dataVisita: true },
    }),
  ]);

  const operacional = { agendado: 0, orcamentado: 0, confirmado: 0, finalizado: 0 };
  let receitaConfirmado = 0;

  for (const row of counts) {
    const b = bucketStatus(row.status);
    const n = Number(row._count) || 0;
    if (b === "agendado") operacional.agendado += n;
    else if (b === "orcamentado") operacional.orcamentado += n;
    else if (b === "confirmado") {
      operacional.confirmado += n;
      receitaConfirmado += Number(row._sum.valor ?? 0);
    } else if (b === "finalizado") {
      operacional.finalizado += n;
    }
  }

  let receitaFaturadaMes = 0;
  let qtdFaturadoMes = 0;
  const porStatusMes = {
    confirmado: { venda: 0, custo: 0 },
    finalizado: { venda: 0, custo: 0 },
  };

  for (const row of moneyRows) {
    const b = bucketStatus(row.status);
    if (b !== "confirmado" && b !== "finalizado") continue;
    const parts = parseOrcamentoParts(row.orcamento);
    const dt = parseDataInventario(row);
    const noMes =
      dt && dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();

    if (b === "confirmado") {
      porStatusMes.confirmado.venda += parts.venda;
      porStatusMes.confirmado.custo += parts.custo;
    }
    if (b === "finalizado" && noMes) {
      receitaFaturadaMes += Number(row.valor);
      qtdFaturadoMes++;
      porStatusMes.finalizado.venda += parts.venda;
      porStatusMes.finalizado.custo += parts.custo;
    }
  }

  const margemMes =
    porStatusMes.confirmado.venda -
    porStatusMes.confirmado.custo +
    (porStatusMes.finalizado.venda - porStatusMes.finalizado.custo);

  const totalGeral = receitaConfirmado + receitaFaturadaMes;

  const countByVisitDate = new Map<string, number>();
  for (const row of visitRows) {
    const dv = row.dataVisita?.trim();
    if (!dv || dv === "0000-00-00") continue;
    countByVisitDate.set(dv, (countByVisitDate.get(dv) ?? 0) + 1);
  }

  const dailyValues: number[] = visitKeys.map((key) => countByVisitDate.get(key) ?? 0);

  return {
    updatedAt: now.toISOString(),
    operacional,
    financeiro: {
      mesLabel,
      confirmado: receitaConfirmado,
      faturadoMes: receitaFaturadaMes,
      faturadoMesQtd: qtdFaturadoMes,
      totalGeral,
      margemMes,
    },
    charts: {
      daily: { labels: dailyLabels, values: dailyValues },
      status: {
        labels: ["Agendado", "Orçamentado", "Confirmado", "Finalizado"],
        values: [
          operacional.agendado,
          operacional.orcamentado,
          operacional.confirmado,
          operacional.finalizado,
        ],
      },
    },
  };
}
