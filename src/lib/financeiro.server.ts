import { getPrisma } from "@/lib/db.server";
import { listDespesas } from "@/lib/despesas.server";
import { formatYmLocal, parseDataInventarioRow } from "@/lib/financeiro-dates";
import { analisarFornecedorFinanceiro } from "@/lib/fornecedor-controle.server";
import { listarFornecedores } from "@/lib/fornecedores.server";
import { finYmLabel } from "@/lib/financeiro-display";
import { fornecedorRotulo } from "@/lib/fornecedores-display";
import { listarPagamentosHistorico } from "@/lib/funcionario-pagamento.server";
import { somaRecebimentosEntre } from "@/lib/inventario-recebimento.server";

export { finYmLabel };

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function finGlobalStatusBucket(status: string): string {
  const s = status.toLowerCase().trim().replace("ç", "c");
  if (s === "orcamentado") return "orcamentado";
  const known = ["agendado", "orcamentado", "confirmado", "finalizado"];
  return known.includes(s) ? s : "outros";
}

function finGlobalEhFinanceiro(status: string): boolean {
  const b = finGlobalStatusBucket(status);
  return b === "confirmado" || b === "finalizado";
}

function finIncluirNaMargemMesAtual(
  row: Record<string, unknown>,
  bucket: string,
  mesAtualYm: string,
): boolean {
  if (bucket === "confirmado") return true;
  if (bucket !== "finalizado") return false;
  const dt = parseDataInventarioRow(row);
  return dt !== null && formatYmLocal(dt) === mesAtualYm;
}

function parsePartItem(item: Record<string, unknown>) {
  const metros = num(String(item.metros ?? 0).replace(",", "."));
  const vendaUnit = num(String(item.valor ?? 0).replace(",", "."));
  const custoUnit = num(String(item.custo ?? item.valor_custo ?? 0).replace(",", "."));
  return {
    total_venda: metros * vendaUnit,
    total_custo: metros * custoUnit,
  };
}

function finGlobalLinkPorStatus(status: string): string {
  const map: Record<string, string> = {
    agendado: "/painel/visitas",
    orcamentado: "/painel/orcamentado",
    confirmado: "/painel/confirmado",
    finalizado: "/painel/finalizado",
  };
  return map[status] ?? "/painel/confirmado";
}

function finAnosDisponiveisParaTabela(anosComDados: number[], primeiroYm: string | null): number[] {
  const anoAtual = new Date().getFullYear();
  let anoInicio = anoAtual;
  if (primeiroYm) {
    const y = int(primeiroYm.slice(0, 4));
    if (y > 0) anoInicio = Math.min(anoInicio, y);
  }
  for (const y of anosComDados) {
    if (y > 0) anoInicio = Math.min(anoInicio, y);
  }
  const anos: number[] = [];
  for (let y = anoInicio; y <= anoAtual; y++) anos.push(y);
  return anos.length ? anos : [anoAtual];
}

type FinalizadoItem = {
  id: number;
  nome: string;
  valor: number;
  ym: string;
  ano: number;
  mes: number;
};

async function finListarFinalizadosComData(prisma: Awaited<ReturnType<typeof getPrisma>>) {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, nome, valor, \`data-visita\` AS data_visita, \`data-montagem\` AS data_montagem
     FROM inventario WHERE LOWER(TRIM(status)) = 'finalizado'`,
  );
  const lista: FinalizadoItem[] = [];
  for (const row of rows) {
    const dt = parseDataInventarioRow(row);
    if (!dt) continue;
    lista.push({
      id: int(row.id),
      nome: String(row.nome ?? ""),
      valor: num(row.valor),
      ym: formatYmLocal(dt),
      ano: dt.getFullYear(),
      mes: dt.getMonth() + 1,
    });
  }
  return lista;
}

function finObterPrimeiroFinalizadoYm(itens: FinalizadoItem[]): string | null {
  let min: string | null = null;
  for (const it of itens) {
    if (!min || it.ym < min) min = it.ym;
  }
  return min;
}

async function listarMovimentosFinanceiros(limit = 60) {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, nome, status, valor, \`data-visita\` AS data_visita
     FROM inventario
     WHERE LOWER(TRIM(status)) IN ('confirmado', 'finalizado')
     ORDER BY id DESC
     LIMIT 120`,
  );
  const mov: {
    tipo: "faturado" | "confirmado";
    titulo: string;
    detalhe: string;
    valor: number;
    link: string;
  }[] = [];

  for (const row of rows) {
    if (!finGlobalEhFinanceiro(String(row.status ?? ""))) continue;
    const bucket = finGlobalStatusBucket(String(row.status ?? ""));
    const ehFaturado = bucket === "finalizado";
    const id = int(row.id);
    mov.push({
      tipo: ehFaturado ? "faturado" : "confirmado",
      titulo: `${ehFaturado ? "Finalizado" : "Confirmado"} #${id} — ${String(row.nome ?? "")}`,
      detalhe: ehFaturado
        ? "Serviço finalizado — entrou no faturamento"
        : "Serviço confirmado — em faturamento",
      valor: num(row.valor),
      link: finGlobalLinkPorStatus(bucket),
    });
  }

  return mov.slice(0, Math.max(1, limit));
}

export async function resumoFinanceiroGlobal() {
  const prisma = await getPrisma();
  const mesAtualYm = formatYmLocal(new Date());

  const porStatus = {
    confirmado: { qtd: 0, valor: 0, venda_itens: 0, custo_itens: 0 },
    finalizado: { qtd: 0, valor: 0, venda_itens: 0, custo_itens: 0 },
  };
  const porStatusMes = {
    confirmado: { venda_itens: 0, custo_itens: 0 },
    finalizado: { venda_itens: 0, custo_itens: 0 },
  };

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, nome, status, valor, orcamento, \`data-visita\` AS data_visita, \`data-montagem\` AS data_montagem
     FROM inventario`,
  );

  for (const row of rows) {
    if (!finGlobalEhFinanceiro(String(row.status ?? ""))) continue;
    const bucket = finGlobalStatusBucket(String(row.status ?? "")) as "confirmado" | "finalizado";
    const valor = num(row.valor);
    const st = porStatus[bucket];
    st.qtd++;
    st.valor += valor;

    let parts: unknown[] = [];
    try {
      parts = JSON.parse(String(row.orcamento ?? "[]")) as unknown[];
    } catch {
      parts = [];
    }
    if (!Array.isArray(parts)) continue;

    let vendaLinha = 0;
    let custoLinha = 0;
    for (const raw of parts) {
      if (!raw || typeof raw !== "object") continue;
      const item = parsePartItem(raw as Record<string, unknown>);
      vendaLinha += item.total_venda;
      custoLinha += item.total_custo;
      st.venda_itens += item.total_venda;
      st.custo_itens += item.total_custo;
    }

    if (finIncluirNaMargemMesAtual(row, bucket, mesAtualYm)) {
      const sm = porStatusMes[bucket];
      sm.venda_itens += vendaLinha;
      sm.custo_itens += custoLinha;
    }
  }

  const comprasRows = await prisma.$queryRawUnsafe<{ c: unknown; total: unknown }[]>(
    `SELECT COUNT(*) AS c, COALESCE(SUM((metros - COALESCE(metros_devolvidos, 0)) * valor_unitario), 0) AS total
     FROM fornecedor_compras`,
  ).catch(() => [{ c: 0, total: 0 }]);

  const totalCompras = num(comprasRows[0]?.total);
  const margemConfirmado = porStatusMes.confirmado.venda_itens - porStatusMes.confirmado.custo_itens;
  const margemFaturado = porStatusMes.finalizado.venda_itens - porStatusMes.finalizado.custo_itens;

  const porFornecedor: {
    id: number;
    nome: string;
    custo: number;
    venda: number;
    margem: number;
  }[] = [];

  const fornecedores = await listarFornecedores();
  for (const f of fornecedores) {
    const analise = await analisarFornecedorFinanceiro(f.id, "financeiro");
    if (!analise) continue;
    const res = analise.resumo;
    if (res.total_custo <= 0 && res.total_venda <= 0 && res.qtd_compras === 0) continue;
    porFornecedor.push({
      id: f.id,
      nome: fornecedorRotulo(f),
      custo: res.total_custo,
      venda: res.total_venda,
      margem: res.margem,
    });
  }
  porFornecedor.sort((a, b) => b.custo - a.custo);

  const movimentos = await listarMovimentosFinanceiros(60);

  const agora = new Date();
  const anoMes = agora.getFullYear();
  const mesNum = agora.getMonth() + 1;
  const deMes = `${anoMes}-${String(mesNum).padStart(2, "0")}-01`;
  const ultimoDia = new Date(anoMes, mesNum, 0).getDate();
  const ateMes = `${anoMes}-${String(mesNum).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

  const [recebidoMes, despesasMesLista, folhaMesLista] = await Promise.all([
    somaRecebimentosEntre(deMes, ateMes),
    listDespesas({ ano: anoMes, mes: mesNum }),
    listarPagamentosHistorico(deMes, ateMes),
  ]);
  const despesasMes = despesasMesLista.reduce((s, d) => s + d.valor, 0);
  const folhaMes = folhaMesLista.reduce((s, p) => s + p.valor, 0);
  const liquidoMes = recebidoMes - despesasMes - folhaMes;

  return {
    resumo: {
      receita_confirmado: porStatus.confirmado.valor,
      qtd_confirmados: porStatus.confirmado.qtd,
      receita_faturada: porStatus.finalizado.valor,
      qtd_faturados: porStatus.finalizado.qtd,
      custo_itens: porStatus.confirmado.custo_itens + porStatus.finalizado.custo_itens,
      custo_compras: totalCompras,
      margem_confirmado: margemConfirmado,
      margem_faturado: margemFaturado,
      margem: margemConfirmado + margemFaturado,
      margem_mes_label: finYmLabel(mesAtualYm),
      recebido_mes: recebidoMes,
      despesas_mes: despesasMes,
      folha_mes: folhaMes,
      liquido_mes: liquidoMes,
    },
    por_status: porStatus,
    por_fornecedor: porFornecedor,
    movimentos,
  };
}

export async function finResumoFaturadoMensal(ano: number, desdeYm: string | null) {
  const prisma = await getPrisma();
  const itens = await finListarFinalizadosComData(prisma);
  const primeiroYm = finObterPrimeiroFinalizadoYm(itens);
  const anoAtual = new Date().getFullYear();
  if (ano < 2000 || ano > anoAtual + 1) ano = anoAtual;

  let desdeEfetivo = desdeYm || primeiroYm;
  if (desdeEfetivo && !/^\d{4}-\d{2}$/.test(desdeEfetivo)) desdeEfetivo = primeiroYm;

  const curtos = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mesAtualNum = new Date().getMonth() + 1;
  const anoAtualNum = anoAtual;
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    meses.push({
      mes: m,
      ym: `${ano}-${String(m).padStart(2, "0")}`,
      label: `${curtos[m - 1]}/${ano}`,
      valor: 0,
      qtd: 0,
      atual: ano === anoAtualNum && m === mesAtualNum,
    });
  }

  let totalAno = 0;
  let qtdAno = 0;
  const anosSet = new Set<number>();

  for (const it of itens) {
    anosSet.add(it.ano);
    if (desdeEfetivo && it.ym < desdeEfetivo) continue;
    if (it.ano !== ano) continue;
    const slot = meses[it.mes - 1];
    if (slot) {
      slot.valor += it.valor;
      slot.qtd++;
    }
    totalAno += it.valor;
    qtdAno++;
  }

  const anosDisponiveis = finAnosDisponiveisParaTabela([...anosSet], primeiroYm);

  const mesAtualYm = formatYmLocal(new Date());
  let mesAtualValor = 0;
  let mesAtualQtd = 0;
  for (const it of itens) {
    if (desdeEfetivo && it.ym < desdeEfetivo) continue;
    if (it.ym === mesAtualYm) {
      mesAtualValor += it.valor;
      mesAtualQtd++;
    }
  }

  const opcoesDesde: { ym: string; label: string }[] = [];
  if (primeiroYm) {
    const [py, pm] = primeiroYm.split("-").map((x) => int(x));
    const cur = new Date(py, pm - 1, 1);
    const end = new Date();
    end.setDate(1);
    while (cur <= end) {
      const ym = formatYmLocal(cur);
      opcoesDesde.push({ ym, label: finYmLabel(ym) });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  return {
    ano,
    primeiro_finalizado_ym: primeiroYm,
    desde_ym: desdeEfetivo,
    meses,
    total_ano: totalAno,
    qtd_ano: qtdAno,
    anos_disponiveis: anosDisponiveis,
    opcoes_desde: opcoesDesde,
    mes_atual: {
      label: finYmLabel(mesAtualYm),
      valor: mesAtualValor,
      qtd: mesAtualQtd,
    },
  };
}
