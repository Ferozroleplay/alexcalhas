import { getPrisma } from "@/lib/db.server";
import { createDespesa, deleteDespesa, findDespesaById, isFormaValida, updateDespesa } from "@/lib/despesas.server";
import {
  pagamentoFimSemana,
  pagamentoInicioSemana,
  ymdFromDb,
  ymdLocal,
} from "@/lib/funcionario-pagamento-dates";

export { pagamentoFimSemana, pagamentoInicioSemana };

const DIAS_CHAVES = ["seg", "ter", "qua", "qui", "sex"] as const;
export type DiaChave = (typeof DIAS_CHAVES)[number];

const DIAS_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

export function pagamentoFormatarSemana(semanaInicio: string): string {
  const ini = pagamentoInicioSemana(ymdFromDb(semanaInicio) || semanaInicio);
  const fmt = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("pt-BR");
  };
  return `${fmt(ini)} a ${fmt(pagamentoFimSemana(ini))}`;
}

export function pagamentoParseValor(raw: string | number): number {
  if (typeof raw === "number") return Math.max(0, Math.round(raw * 100) / 100);
  const v = String(raw).replace(/R\$\s?/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

function pagamentoCalcularBrutoSemana(valorDiario: number, diasDiariaCount: number, totalEmpreitas: number) {
  return Math.round(Math.max(0, diasDiariaCount * valorDiario + totalEmpreitas) * 100) / 100;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function liquidoDe(bruto: number, vales: number) {
  return Math.max(0, round2(bruto - vales));
}

function centavosIguais(a: number, b: number) {
  return Math.abs(a - b) <= 0.009;
}

/** Diária + empreitas − vales. Se o valor salvo foi um ajuste manual, ele permanece. */
function resolverValorLiquido(pag: Record<string, unknown> | null, bruto: number, vales: number): number {
  const auto = liquidoDe(bruto, vales);
  if (!pag) return auto;
  const salvo = num(pag.valor);
  const brutoSalvo = num(pag.valor_bruto);
  const autoSalvo = liquidoDe(brutoSalvo, num(pag.total_vales));
  if (centavosIguais(salvo, autoSalvo)) return auto;
  // Semana gravada no bruto, antes de descontar o vale (ou com o desconto ignorado).
  if (vales > 0 && (centavosIguais(salvo, brutoSalvo) || centavosIguais(salvo, bruto))) return auto;
  return salvo;
}

function liquidoSegueFormula(pag: Record<string, unknown> | null, bruto: number, vales: number) {
  return centavosIguais(resolverValorLiquido(pag, bruto, vales), liquidoDe(bruto, vales));
}

function diasUteisSemana(semanaInicio: string) {
  const inicio = pagamentoInicioSemana(semanaInicio);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inicio)!;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return DIAS_CHAVES.map((chave, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const data = ymdLocal(d);
    return {
      chave,
      data,
      label: `${DIAS_LABELS[i]} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
    };
  });
}

function diasFromRegistro(pag: Record<string, unknown> | null): Record<DiaChave, number> {
  const out = Object.fromEntries(DIAS_CHAVES.map((k) => [k, 0])) as Record<DiaChave, number>;
  if (!pag) return out;
  for (const k of DIAS_CHAVES) {
    out[k] = int(pag[`dias_${k}`]) === 1 ? 1 : 0;
  }
  return out;
}

function contarDiasMarcados(dias: Record<DiaChave, number | boolean>) {
  return DIAS_CHAVES.filter((k) => Boolean(dias[k])).length;
}

export async function listarFuncionarios() {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: unknown; nome: string; thumb: string }[]>(
    `SELECT id, nome, thumb FROM usuarios WHERE nivel IN ('funcionário', 'funcionario') ORDER BY nome ASC`,
  );
  return rows.map((r) => ({ id: int(r.id), nome: r.nome, thumb: String(r.thumb ?? "nao.png") }));
}

let colunaDespesaPronta = false;

async function ensurePagamentoDespesaColuna(prisma: Awaited<ReturnType<typeof getPrisma>>) {
  if (colunaDespesaPronta) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE funcionario_pagamento_semanal ADD COLUMN despesa_id INT NULL`,
    );
  } catch {
    /* coluna já existe */
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE funcionario_pagamento_semanal ADD COLUMN confirmado TINYINT NOT NULL DEFAULT 1`,
    );
  } catch {
    /* coluna já existe */
  }
  colunaDespesaPronta = true;
}

function pagamentoEstaPago(pag: Record<string, unknown> | null): boolean {
  if (!pag) return false;
  if (pag.confirmado == null) return true;
  return int(pag.confirmado) === 1;
}

function hojeBrasil(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function lancarDespesaDoPagamento(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  adminId: number,
  uid: number,
  sem: string,
  valorLiq: number,
  observacao: string,
) {
  await ensurePagamentoDespesaColuna(prisma);
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT p.id, p.despesa_id, u.nome AS funcionario_nome
     FROM funcionario_pagamento_semanal p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.usuario_id = ${uid} AND p.semana_inicio = '${esc(sem)}' LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return;
  const pagId = int(row.id);
  const despesaId = int(row.despesa_id);
  const nome = String(row.funcionario_nome ?? "Funcionário");
  const descricao = `Pagamento de ${nome} — ${pagamentoFormatarSemana(sem)}`.slice(0, 255);
  const obs = observacao.trim();

  if (valorLiq <= 0) {
    if (despesaId > 0) {
      await deleteDespesa(despesaId);
      await prisma.$executeRawUnsafe(
        `UPDATE funcionario_pagamento_semanal SET despesa_id = NULL WHERE id = ${pagId}`,
      );
    }
    return;
  }

  if (despesaId > 0) {
    const atual = await findDespesaById(despesaId);
    if (atual) {
      await updateDespesa(despesaId, {
        data: atual.data,
        descricao,
        categoria: "folha",
        valor: valorLiq,
        forma_pagamento: isFormaValida(atual.forma_pagamento) ? atual.forma_pagamento : "pix",
        observacao: obs,
      });
      return;
    }
  }

  const criada = await createDespesa({
    data: hojeBrasil(),
    descricao,
    categoria: "folha",
    valor: valorLiq,
    forma_pagamento: "pix",
    observacao: obs,
    registrado_por: adminId,
  });
  await prisma.$executeRawUnsafe(
    `UPDATE funcionario_pagamento_semanal SET despesa_id = ${criada.id} WHERE id = ${pagId}`,
  );
}

async function buscarPagamentoUsuarioSemana(prisma: Awaited<ReturnType<typeof getPrisma>>, uid: number, sem: string) {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM funcionario_pagamento_semanal WHERE usuario_id = ${uid} AND semana_inicio = '${esc(sem)}' LIMIT 1`,
  );
  return rows[0] ?? null;
}

async function totalValesSemana(prisma: Awaited<ReturnType<typeof getPrisma>>, uid: number, sem: string) {
  const rows = await prisma.$queryRawUnsafe<{ total: unknown }[]>(
    `SELECT COALESCE(SUM(valor), 0) AS total FROM funcionario_pagamento_vale
     WHERE usuario_id = ${uid} AND semana_inicio = '${esc(sem)}'`,
  ).catch(() => [{ total: 0 }]);
  return num(rows[0]?.total);
}

async function alinharValorPagamento(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  pag: Record<string, unknown> | null,
  bruto: number,
  totalVales: number,
  totalEmpreitas: number,
  liquido: number,
) {
  if (!pag || !liquidoSegueFormula(pag, bruto, totalVales)) return;
  const id = int(pag.id);
  if (id <= 0) return;
  if (
    centavosIguais(num(pag.valor), liquido) &&
    centavosIguais(num(pag.total_vales), totalVales) &&
    centavosIguais(num(pag.total_empreitas), totalEmpreitas) &&
    centavosIguais(num(pag.valor_bruto), bruto)
  ) {
    return;
  }
  await prisma.$executeRawUnsafe(
    `UPDATE funcionario_pagamento_semanal SET
      valor = '${liquido.toFixed(2)}',
      total_vales = '${totalVales.toFixed(2)}',
      total_empreitas = '${totalEmpreitas.toFixed(2)}',
      valor_bruto = '${bruto.toFixed(2)}'
     WHERE id = ${id}`,
  );
  pag.valor = liquido;
  pag.total_vales = totalVales;
  pag.total_empreitas = totalEmpreitas;
  pag.valor_bruto = bruto;
  const despesaId = int(pag.despesa_id);
  if (despesaId > 0) {
    if (liquido > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE despesas SET valor = '${liquido.toFixed(2)}' WHERE id = ${despesaId}`,
      );
    } else {
      await deleteDespesa(despesaId);
      await prisma.$executeRawUnsafe(
        `UPDATE funcionario_pagamento_semanal SET despesa_id = NULL WHERE id = ${int(pag.id)}`,
      );
      pag.despesa_id = null;
    }
  }
}

async function recalcularPagamentoAutomatico(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  uid: number,
  sem: string,
) {
  const pag = await buscarPagamentoUsuarioSemana(prisma, uid, sem);
  if (!pag) return;
  const totalVales = await totalValesSemana(prisma, uid, sem);
  const totalEmpreitas = await totalEmpreitasSemana(prisma, uid, sem);
  const diasDiaria = contarDiasMarcados(diasFromRegistro(pag));
  const bruto = pagamentoCalcularBrutoSemana(num(pag.valor_diario), diasDiaria, totalEmpreitas);
  const liquido = resolverValorLiquido(pag, bruto, totalVales);
  await alinharValorPagamento(prisma, pag, bruto, totalVales, totalEmpreitas, liquido);
}

async function totalEmpreitasSemana(prisma: Awaited<ReturnType<typeof getPrisma>>, uid: number, sem: string) {
  const rows = await prisma.$queryRawUnsafe<{ total: unknown }[]>(
    `SELECT COALESCE(SUM(valor), 0) AS total FROM funcionario_pagamento_empreita
     WHERE usuario_id = ${uid} AND semana_inicio = '${esc(sem)}'`,
  ).catch(() => [{ total: 0 }]);
  return num(rows[0]?.total);
}

async function empreitaMapaPorDia(prisma: Awaited<ReturnType<typeof getPrisma>>, uid: number, sem: string) {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, dia_chave, valor, observacao FROM funcionario_pagamento_empreita
     WHERE usuario_id = ${uid} AND semana_inicio = '${esc(sem)}'`,
  ).catch(() => []);
  const map: Partial<Record<DiaChave, { id: number; valor: number; observacao: string }>> = {};
  for (const row of rows) {
    const chave = String(row.dia_chave ?? "").trim().toLowerCase() as DiaChave;
    if (!DIAS_CHAVES.includes(chave)) continue;
    map[chave] = { id: int(row.id), valor: num(row.valor), observacao: String(row.observacao ?? "") };
  }
  return map;
}

async function sugerirDiasBatePontoLote(ids: number[], semanaInicio: string) {
  const prisma = await getPrisma();
  const sem = pagamentoInicioSemana(semanaInicio);
  const inicio = sem;
  const fim = pagamentoFimSemana(sem);
  const diasSem = diasUteisSemana(sem);
  const dataPorChave = Object.fromEntries(diasSem.map((d) => [d.data, d.chave])) as Record<string, DiaChave>;

  const map: Record<number, Record<DiaChave, boolean>> = {};
  for (const id of ids) {
    map[id] = Object.fromEntries(DIAS_CHAVES.map((k) => [k, false])) as Record<DiaChave, boolean>;
  }
  if (ids.length === 0) return map;

  const idList = ids.join(",");
  const rows = await prisma.$queryRawUnsafe<{ usuario_id: unknown; dia: string }[]>(
    `SELECT usuario_id, DATE(registrado_em) AS dia FROM funcionario_ponto
     WHERE usuario_id IN (${idList}) AND tipo = 'entrada'
       AND registrado_em >= '${esc(inicio)} 00:00:00' AND registrado_em <= '${esc(fim)} 23:59:59'`,
  ).catch(() => []);

  for (const row of rows) {
    const uid = int(row.usuario_id);
    const dia = ymdFromDb(row.dia);
    const chave = dataPorChave[dia];
    if (uid > 0 && chave && map[uid]) map[uid][chave] = true;
  }
  return map;
}

export type PagamentoCard = {
  usuario_id: number;
  nome: string;
  thumb: string;
  dias_trabalhados: number;
  semana_inicio: string;
  semana_label: string;
  pagamento_id: number | null;
  valor: number | null;
  valor_diario: number;
  valor_bruto: number;
  valor_liquido: number;
  total_vales: number;
  total_empreitas: number;
  pago: boolean;
};

export async function montarCardsSemana(semanaInicio: string): Promise<PagamentoCard[]> {
  const prisma = await getPrisma();
  await ensurePagamentoDespesaColuna(prisma);
  const sem = pagamentoInicioSemana(semanaInicio);
  const funcionarios = await listarFuncionarios();
  if (funcionarios.length === 0) return [];

  const ids = funcionarios.map((f) => f.id);
  const idList = ids.join(",");
  const semEsc = esc(sem);

  const pagRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM funcionario_pagamento_semanal WHERE semana_inicio = '${semEsc}' AND usuario_id IN (${idList})`,
  );
  const pagMap = new Map<number, Record<string, unknown>>();
  for (const r of pagRows) pagMap.set(int(r.usuario_id), r);

  const valesRows = await prisma.$queryRawUnsafe<{ usuario_id: unknown; total: unknown }[]>(
    `SELECT usuario_id, COALESCE(SUM(valor), 0) AS total FROM funcionario_pagamento_vale
     WHERE semana_inicio = '${semEsc}' AND usuario_id IN (${idList}) GROUP BY usuario_id`,
  ).catch(() => []);
  const valesMap = new Map<number, number>();
  for (const r of valesRows) valesMap.set(int(r.usuario_id), num(r.total));

  const empRows = await prisma.$queryRawUnsafe<{ usuario_id: unknown; total: unknown }[]>(
    `SELECT usuario_id, COALESCE(SUM(valor), 0) AS total FROM funcionario_pagamento_empreita
     WHERE semana_inicio = '${semEsc}' AND usuario_id IN (${idList}) GROUP BY usuario_id`,
  ).catch(() => []);
  const empMap = new Map<number, number>();
  for (const r of empRows) empMap.set(int(r.usuario_id), num(r.total));

  const vdRows = await prisma.$queryRawUnsafe<{ id: unknown; valor_diario: unknown }[]>(
    `SELECT id, valor_diario FROM usuarios WHERE id IN (${idList})`,
  );
  const vdMap = new Map<number, number>();
  for (const r of vdRows) vdMap.set(int(r.id), num(r.valor_diario));

  const sugestaoMap = await sugerirDiasBatePontoLote(ids, sem);
  const empDiasRows = await prisma.$queryRawUnsafe<{ usuario_id: unknown; qtd: unknown }[]>(
    `SELECT usuario_id, COUNT(*) AS qtd FROM funcionario_pagamento_empreita
     WHERE semana_inicio = '${semEsc}' AND usuario_id IN (${idList})
       AND dia_chave IS NOT NULL AND TRIM(dia_chave) <> ''
     GROUP BY usuario_id`,
  ).catch(() => []);
  const empDiasMap = new Map<number, number>();
  for (const r of empDiasRows) empDiasMap.set(int(r.usuario_id), int(r.qtd));

  const cards: PagamentoCard[] = [];
  for (const f of funcionarios) {
    const pag = pagMap.get(f.id) ?? null;
    let valorDiario = pag ? num(pag.valor_diario) : vdMap.get(f.id) ?? 0;
    if (valorDiario <= 0) valorDiario = vdMap.get(f.id) ?? 0;

    const totalVales = valesMap.get(f.id) ?? 0;
    const totalEmpreitas = empMap.get(f.id) ?? 0;
    const empDiasQtd = empDiasMap.get(f.id) ?? 0;

    let diasCount: number;
    let valorBruto: number;

    if (pag) {
      const diasDiaria = contarDiasMarcados(diasFromRegistro(pag));
      diasCount = diasDiaria + empDiasQtd;
      valorBruto = pagamentoCalcularBrutoSemana(valorDiario, diasDiaria, totalEmpreitas);
    } else {
      const sug = sugestaoMap[f.id] ?? (Object.fromEntries(DIAS_CHAVES.map((k) => [k, false])) as Record<DiaChave, boolean>);
      const diasDiaria = DIAS_CHAVES.filter((k) => sug[k]).length;
      diasCount = diasDiaria + empDiasQtd;
      valorBruto = pagamentoCalcularBrutoSemana(valorDiario, diasDiaria, totalEmpreitas);
    }
    const valorLiquido = resolverValorLiquido(pag, valorBruto, totalVales);
    await alinharValorPagamento(prisma, pag, valorBruto, totalVales, totalEmpreitas, valorLiquido);

    cards.push({
      usuario_id: f.id,
      nome: f.nome,
      thumb: f.thumb,
      dias_trabalhados: diasCount,
      semana_inicio: sem,
      semana_label: pagamentoFormatarSemana(sem),
      pagamento_id: pag ? int(pag.id) : null,
      valor: pag ? valorLiquido : null,
      valor_diario: valorDiario,
      valor_bruto: valorBruto,
      total_vales: totalVales,
      total_empreitas: totalEmpreitas,
      valor_liquido: valorLiquido,
      pago: pagamentoEstaPago(pag),
    });
  }

  return cards.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type DiaUi = {
  chave: DiaChave;
  label: string;
  tipo: "diaria" | "empreita" | "nenhum";
  marcado: boolean;
  sugerido: boolean;
  empreita_valor: number;
  empreita_id: number | null;
};

export type ValeUi = {
  id: number;
  valor: number;
  data_vale: string;
  data_fmt: string;
  observacao: string;
};

export type PagamentoModalData = {
  nome: string;
  usuario_id: number;
  semana_inicio: string;
  semana_label: string;
  pagamento_id: number | null;
  valor_diario: number;
  dias: DiaUi[];
  dias_trabalhados: number;
  valor_diaria_bruto: number;
  total_empreitas: number;
  valor_bruto: number;
  total_vales: number;
  valor_liquido: number;
  observacao: string;
  pago: boolean;
  vales: ValeUi[];
};

export async function montarDadosSemana(usuarioId: number, semanaInicio: string): Promise<PagamentoModalData | null> {
  const prisma = await getPrisma();
  await ensurePagamentoDespesaColuna(prisma);
  const uid = int(usuarioId);
  if (uid <= 0) return null;

  const sem = pagamentoInicioSemana(semanaInicio);
  const pag = await buscarPagamentoUsuarioSemana(prisma, uid, sem);

  const userRows = await prisma.$queryRawUnsafe<{ nome: string; valor_diario: unknown }[]>(
    `SELECT nome, valor_diario FROM usuarios WHERE id = ${uid} LIMIT 1`,
  );
  if (!userRows[0]) return null;
  const nome = userRows[0].nome;

  let valorDiario = pag ? num(pag.valor_diario) : num(userRows[0].valor_diario);
  if (valorDiario <= 0 && pag) valorDiario = num(userRows[0].valor_diario);

  const sugestaoMap = await sugerirDiasBatePontoLote([uid], sem);
  const sugeridos = sugestaoMap[uid] ?? (Object.fromEntries(DIAS_CHAVES.map((k) => [k, false])) as Record<DiaChave, boolean>);
  const empreitaPorDia = await empreitaMapaPorDia(prisma, uid, sem);

  let diasMarcados: Record<DiaChave, number>;
  if (pag) {
    diasMarcados = diasFromRegistro(pag);
  } else {
    diasMarcados = Object.fromEntries(
      DIAS_CHAVES.map((k) => [k, sugeridos[k] && !empreitaPorDia[k] ? 1 : 0]),
    ) as Record<DiaChave, number>;
  }
  for (const k of DIAS_CHAVES) {
    if (empreitaPorDia[k]) diasMarcados[k] = 0;
  }

  const diasDiariaCount = contarDiasMarcados(diasMarcados);
  const diasTotaisCount = diasDiariaCount + Object.keys(empreitaPorDia).length;
  const totalVales = await totalValesSemana(prisma, uid, sem);
  const totalEmpreitas = await totalEmpreitasSemana(prisma, uid, sem);
  const valorDiariaBruto = Math.round(diasDiariaCount * valorDiario * 100) / 100;
  const valorBruto = pagamentoCalcularBrutoSemana(valorDiario, diasDiariaCount, totalEmpreitas);
  const valorLiquido = resolverValorLiquido(pag, valorBruto, totalVales);
  await alinharValorPagamento(prisma, pag, valorBruto, totalVales, totalEmpreitas, valorLiquido);

  const dias: DiaUi[] = diasUteisSemana(sem).map((dia) => {
    const emp = empreitaPorDia[dia.chave];
    let tipo: DiaUi["tipo"] = "nenhum";
    let marcado = false;
    if (emp) tipo = "empreita";
    else if (diasMarcados[dia.chave]) {
      tipo = "diaria";
      marcado = true;
    }
    return {
      chave: dia.chave,
      label: dia.label,
      tipo,
      marcado,
      sugerido: sugeridos[dia.chave] && tipo === "nenhum",
      empreita_valor: emp?.valor ?? 0,
      empreita_id: emp?.id ?? null,
    };
  });

  const valesRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, valor, observacao, data_vale FROM funcionario_pagamento_vale
     WHERE usuario_id = ${uid} AND semana_inicio = '${esc(sem)}' ORDER BY data_vale DESC, id DESC`,
  ).catch(() => []);

  const vales: ValeUi[] = valesRows.map((v) => {
    const dv = ymdFromDb(v.data_vale);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dv);
    const dataFmt = m
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("pt-BR")
      : dv;
    return {
      id: int(v.id),
      valor: num(v.valor),
      data_vale: dv,
      data_fmt: dataFmt,
      observacao: String(v.observacao ?? ""),
    };
  });

  return {
    nome,
    usuario_id: uid,
    semana_inicio: sem,
    semana_label: pagamentoFormatarSemana(sem),
    pagamento_id: pag ? int(pag.id) : null,
    valor_diario: valorDiario,
    dias,
    dias_trabalhados: diasTotaisCount,
    valor_diaria_bruto: valorDiariaBruto,
    total_empreitas: totalEmpreitas,
    valor_bruto: valorBruto,
    total_vales: totalVales,
    valor_liquido: valorLiquido,
    observacao: pag ? String(pag.observacao ?? "") : "",
    pago: pagamentoEstaPago(pag),
    vales,
  };
}

export async function salvarPagamento(
  adminId: number,
  usuarioId: number,
  semanaInicio: string,
  valor: number,
  observacao: string,
  valorDiario: number,
  dias: Record<DiaChave, boolean>,
  idEdit?: number | null,
  confirmar = false,
): Promise<{ ok: boolean; message: string }> {
  const prisma = await getPrisma();
  await ensurePagamentoDespesaColuna(prisma);
  const uid = int(usuarioId);
  const sem = pagamentoInicioSemana(semanaInicio);
  const vd = Math.max(0, pagamentoParseValor(valorDiario));

  await prisma.$executeRawUnsafe(`UPDATE usuarios SET valor_diario = '${vd.toFixed(2)}' WHERE id = ${uid}`);

  const empreitaPorDia = await empreitaMapaPorDia(prisma, uid, sem);
  const diasMarcados: Record<DiaChave, number> = Object.fromEntries(
    DIAS_CHAVES.map((k) => [k, dias[k] && !empreitaPorDia[k] ? 1 : 0]),
  ) as Record<DiaChave, number>;

  const diasDiariaCount = contarDiasMarcados(diasMarcados);
  const diasTotaisCount = diasDiariaCount + Object.keys(empreitaPorDia).length;
  const totalVales = await totalValesSemana(prisma, uid, sem);
  const totalEmpreitas = await totalEmpreitasSemana(prisma, uid, sem);
  const valorBruto = pagamentoCalcularBrutoSemana(vd, diasDiariaCount, totalEmpreitas);
  const valorLiq = pagamentoParseValor(valor);

  const semEsc = esc(sem);
  const obsEsc = esc(observacao);
  const diasSql = DIAS_CHAVES.map((k) => `dias_${k} = ${diasMarcados[k] ? 1 : 0}`).join(", ");
  const jaPago = pagamentoEstaPago(await buscarPagamentoUsuarioSemana(prisma, uid, sem));
  const confirmado = confirmar || jaPago ? 1 : 0;

  if (idEdit && idEdit > 0) {
    const id = int(idEdit);
    await prisma.$executeRawUnsafe(
      `UPDATE funcionario_pagamento_semanal SET
        usuario_id = ${uid}, semana_inicio = '${semEsc}', valor_diario = '${vd.toFixed(2)}',
        ${diasSql}, dias_trabalhados = ${diasTotaisCount},
        valor_bruto = '${valorBruto.toFixed(2)}', total_vales = '${totalVales.toFixed(2)}',
        total_empreitas = '${totalEmpreitas.toFixed(2)}', valor = '${valorLiq.toFixed(2)}',
        observacao = '${obsEsc}', lancado_por = ${int(adminId)}, confirmado = ${confirmado}
       WHERE id = ${id}`,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO funcionario_pagamento_semanal (
        usuario_id, semana_inicio, valor_diario,
        dias_seg, dias_ter, dias_qua, dias_qui, dias_sex,
        dias_trabalhados, valor_bruto, total_vales, total_empreitas, valor, observacao, lancado_por, confirmado
      ) VALUES (
        ${uid}, '${semEsc}', '${vd.toFixed(2)}',
        ${diasMarcados.seg}, ${diasMarcados.ter}, ${diasMarcados.qua}, ${diasMarcados.qui}, ${diasMarcados.sex},
        ${diasTotaisCount}, '${valorBruto.toFixed(2)}', '${totalVales.toFixed(2)}', '${totalEmpreitas.toFixed(2)}',
        '${valorLiq.toFixed(2)}', '${obsEsc}', ${int(adminId)}, ${confirmado}
      )
      ON DUPLICATE KEY UPDATE
        valor_diario = VALUES(valor_diario),
        dias_seg = VALUES(dias_seg), dias_ter = VALUES(dias_ter), dias_qua = VALUES(dias_qua),
        dias_qui = VALUES(dias_qui), dias_sex = VALUES(dias_sex),
        dias_trabalhados = VALUES(dias_trabalhados), valor_bruto = VALUES(valor_bruto),
        total_vales = VALUES(total_vales), total_empreitas = VALUES(total_empreitas),
        valor = VALUES(valor), observacao = VALUES(observacao), lancado_por = VALUES(lancado_por),
        confirmado = VALUES(confirmado),
        atualizado_em = CURRENT_TIMESTAMP`,
    );
  }

  if (confirmado === 1) {
    await lancarDespesaDoPagamento(prisma, adminId, uid, sem, valorLiq, observacao);
    return {
      ok: true,
      message: confirmar
        ? "Pagamento confirmado. Ficou pago e entrou nas despesas."
        : "Pagamento atualizado.",
    };
  }
  return { ok: true, message: "Semana salva. Ainda está em aberto." };
}

export async function excluirPagamento(id: number): Promise<boolean> {
  const prisma = await getPrisma();
  await ensurePagamentoDespesaColuna(prisma);
  const rows = await prisma.$queryRawUnsafe<{ despesa_id: unknown }[]>(
    `SELECT despesa_id FROM funcionario_pagamento_semanal WHERE id = ${int(id)} LIMIT 1`,
  );
  const despesaId = int(rows[0]?.despesa_id);
  await prisma.$executeRawUnsafe(`DELETE FROM funcionario_pagamento_semanal WHERE id = ${int(id)} LIMIT 1`);
  if (despesaId > 0) await deleteDespesa(despesaId);
  return true;
}

export async function valeSalvar(
  adminId: number,
  usuarioId: number,
  semanaInicio: string,
  valor: number,
  observacao: string,
  dataVale?: string,
): Promise<{ ok: boolean; message: string }> {
  const prisma = await getPrisma();
  const uid = int(usuarioId);
  const sem = pagamentoInicioSemana(semanaInicio);
  const v = pagamentoParseValor(valor);
  if (v <= 0) return { ok: false, message: "Informe o valor do vale." };
  const dv = dataVale && /^\d{4}-\d{2}-\d{2}$/.test(dataVale) ? dataVale : ymdLocal(new Date());
  await prisma.$executeRawUnsafe(
    `INSERT INTO funcionario_pagamento_vale (usuario_id, semana_inicio, valor, observacao, data_vale, lancado_por)
     VALUES (${uid}, '${esc(sem)}', '${v.toFixed(2)}', '${esc(observacao)}', '${esc(dv)}', ${int(adminId)})`,
  );
  await recalcularPagamentoAutomatico(prisma, uid, sem);
  return { ok: true, message: "Vale registrado!" };
}

export async function valeExcluir(id: number): Promise<boolean> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ usuario_id: unknown; semana_inicio: unknown }[]>(
    `SELECT usuario_id, semana_inicio FROM funcionario_pagamento_vale WHERE id = ${int(id)} LIMIT 1`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM funcionario_pagamento_vale WHERE id = ${int(id)} LIMIT 1`);
  const row = rows[0];
  if (row) {
    const sem = ymdFromDb(row.semana_inicio);
    if (sem) await recalcularPagamentoAutomatico(prisma, int(row.usuario_id), sem);
  }
  return true;
}

export async function empreitaToggleDia(
  adminId: number,
  usuarioId: number,
  semanaInicio: string,
  diaChave: DiaChave,
  valor: number,
  observacao: string,
): Promise<{ ok: boolean; message: string }> {
  const prisma = await getPrisma();
  const uid = int(usuarioId);
  const sem = esc(pagamentoInicioSemana(semanaInicio));
  const ch = esc(diaChave);
  if (!DIAS_CHAVES.includes(diaChave)) return { ok: false, message: "Dia inválido." };

  await prisma.$executeRawUnsafe(
    `DELETE FROM funcionario_pagamento_empreita WHERE usuario_id = ${uid} AND semana_inicio = '${sem}' AND dia_chave = '${ch}'`,
  );

  const v = pagamentoParseValor(valor);
  if (v <= 0) return { ok: true, message: "Empreita removida do dia." };

  await prisma.$executeRawUnsafe(
    `INSERT INTO funcionario_pagamento_empreita (usuario_id, semana_inicio, dia_chave, valor, observacao, lancado_por)
     VALUES (${uid}, '${sem}', '${ch}', '${v.toFixed(2)}', '${esc(observacao)}', ${int(adminId)})`,
  );
  return { ok: true, message: "Empreita do dia registrada!" };
}

export function gerarSemanasAnteriores(semanaReferencia: string, quantidade = 8): string[] {
  const ref = pagamentoInicioSemana(semanaReferencia);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ref)!;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const qtd = Math.max(1, Math.min(16, quantidade));
  const semanas: string[] = [];
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    semanas.push(ymdLocal(d));
  }
  return semanas;
}

export async function buscarMapaPagamentosSemanas(semanasInicio: string[]) {
  const prisma = await getPrisma();
  if (semanasInicio.length === 0) return {} as Record<number, Record<string, { id: number; valor: number; dias_seg: number; dias_ter: number; dias_qua: number; dias_qui: number; dias_sex: number }>>;
  const inClause = semanasInicio.map((s) => `'${esc(pagamentoInicioSemana(s))}'`).join(",");
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM funcionario_pagamento_semanal WHERE semana_inicio IN (${inClause})`,
  );
  const map: Record<number, Record<string, Record<string, unknown>>> = {};
  for (const row of rows) {
    const uid = int(row.usuario_id);
    const sem = ymdFromDb(row.semana_inicio);
    if (!sem) continue;
    if (!map[uid]) map[uid] = {};
    map[uid][sem] = { ...row, semana_inicio: sem };
  }
  return map;
}

export async function buscarMapaEmpreitaDiasPorSemana(semanasInicio: string[], usuarioIds: number[]) {
  const prisma = await getPrisma();
  const map: Record<number, Record<string, number>> = {};
  if (semanasInicio.length === 0 || usuarioIds.length === 0) return map;
  const semEsc = semanasInicio.map((s) => `'${esc(pagamentoInicioSemana(s))}'`).join(",");
  const ids = [...new Set(usuarioIds)].join(",");
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT usuario_id, semana_inicio, COUNT(*) AS qtd FROM funcionario_pagamento_empreita
     WHERE semana_inicio IN (${semEsc}) AND usuario_id IN (${ids})
       AND dia_chave IS NOT NULL AND TRIM(dia_chave) <> ''
     GROUP BY usuario_id, semana_inicio`,
  ).catch(() => []);
  for (const row of rows) {
    const uid = int(row.usuario_id);
    const sem = ymdFromDb(row.semana_inicio);
    if (!sem) continue;
    if (!map[uid]) map[uid] = {};
    map[uid][sem] = int(row.qtd);
  }
  return map;
}

export async function resumoFuncionariosPeriodo(dataDe: string, dataAte: string) {
  const prisma = await getPrisma();
  const de = esc(pagamentoInicioSemana(dataDe));
  const ate = esc(pagamentoInicioSemana(dataAte));
  const empMap = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT usuario_id, semana_inicio, COUNT(*) AS qtd FROM funcionario_pagamento_empreita
     WHERE semana_inicio >= '${de}' AND semana_inicio <= '${ate}'
       AND dia_chave IS NOT NULL AND TRIM(dia_chave) <> ''
     GROUP BY usuario_id, semana_inicio`,
  ).catch(() => []);
  const empDias: Record<number, Record<string, number>> = {};
  for (const r of empMap) {
    const uid = int(r.usuario_id);
    if (!empDias[uid]) empDias[uid] = {};
    const semEmp = ymdFromDb(r.semana_inicio);
    if (semEmp) empDias[uid][semEmp] = int(r.qtd);
  }

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT p.*, u.nome AS funcionario_nome FROM funcionario_pagamento_semanal p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.semana_inicio >= '${de}' AND p.semana_inicio <= '${ate}'
     ORDER BY u.nome ASC, p.semana_inicio ASC`,
  );

  const byUser = new Map<
    number,
    { nome: string; qtd_semanas: number; total_pago: number; total_dias: number; ultima_semana: string }
  >();

  for (const row of rows) {
    const uid = int(row.usuario_id);
    const sem = ymdFromDb(row.semana_inicio);
    if (!sem || !pagamentoEstaPago(row)) continue;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        nome: String(row.funcionario_nome),
        qtd_semanas: 0,
        total_pago: 0,
        total_dias: 0,
        ultima_semana: "",
      });
    }
    const item = byUser.get(uid)!;
    const diasDiaria = contarDiasMarcados(diasFromRegistro(row));
    const empD = empDias[uid]?.[sem] ?? 0;
    item.qtd_semanas++;
    item.total_pago += num(row.valor);
    item.total_dias += diasDiaria + empD;
    if (sem > item.ultima_semana) item.ultima_semana = sem;
  }

  return [...byUser.entries()]
    .map(([usuario_id, item]) => ({
      usuario_id,
      nome: item.nome,
      qtd_semanas: item.qtd_semanas,
      total_pago: Math.round(item.total_pago * 100) / 100,
      total_dias: item.total_dias,
      ultima_semana_label: item.ultima_semana ? pagamentoFormatarSemana(item.ultima_semana) : "—",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function descricaoDiasPagos(
  pag: Record<string, unknown>,
  semanaInicio: string,
  usuarioId: number,
): Promise<string> {
  const prisma = await getPrisma();
  const sem = pagamentoInicioSemana(ymdFromDb(semanaInicio) || semanaInicio);
  const empreitaChaves = Object.keys(await empreitaMapaPorDia(prisma, usuarioId, sem));
  const partes: string[] = [];
  for (const dia of diasUteisSemana(sem)) {
    const col = `dias_${dia.chave}`;
    if (int(pag[col]) === 1) partes.push(dia.label);
    else if (empreitaChaves.includes(dia.chave)) partes.push(`${dia.label} (empreita)`);
  }
  return partes.join(", ");
}

export async function listarPagamentosHistorico(de: string, ate: string, usuarioId?: number) {
  const prisma = await getPrisma();
  let where = `p.semana_inicio >= '${esc(pagamentoInicioSemana(de))}' AND p.semana_inicio <= '${esc(pagamentoInicioSemana(ate))}'`;
  if (usuarioId && usuarioId > 0) where += ` AND p.usuario_id = ${int(usuarioId)}`;

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT p.*, u.nome AS funcionario_nome FROM funcionario_pagamento_semanal p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE ${where}
     ORDER BY p.semana_inicio DESC, u.nome ASC LIMIT 500`,
  );

  const empPeriodo = await buscarMapaEmpreitaDiasPorPeriodo(de, ate);

  const out = [];
  for (const r of rows) {
    const uid = int(r.usuario_id);
    const sem = ymdFromDb(r.semana_inicio);
    if (!sem) continue;
    const diasDiaria = contarDiasMarcados(diasFromRegistro(r));
    const empDias = empPeriodo[uid]?.[sem] ?? 0;
    out.push({
      id: int(r.id),
      usuario_id: uid,
      usuario_nome: String(r.funcionario_nome ?? ""),
      semana_inicio: sem,
      dias_trabalhados: int(r.dias_trabalhados),
      dias_qtd: diasDiaria + empDias,
      dias_pagos: await descricaoDiasPagos(r, sem, uid),
      valor_bruto: num(r.valor_bruto),
      total_empreitas: num(r.total_empreitas),
      total_vales: num(r.total_vales),
      valor: num(r.valor),
      observacao: String(r.observacao ?? ""),
    });
  }
  return out;
}

async function buscarMapaEmpreitaDiasPorPeriodo(dataDe: string, dataAte: string) {
  const prisma = await getPrisma();
  const de = esc(pagamentoInicioSemana(dataDe));
  const ate = esc(pagamentoInicioSemana(dataAte));
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT usuario_id, semana_inicio, COUNT(*) AS qtd FROM funcionario_pagamento_empreita
     WHERE semana_inicio >= '${de}' AND semana_inicio <= '${ate}'
       AND dia_chave IS NOT NULL AND TRIM(dia_chave) <> ''
     GROUP BY usuario_id, semana_inicio`,
  ).catch(() => []);
  const map: Record<number, Record<string, number>> = {};
  for (const r of rows) {
    const uid = int(r.usuario_id);
    const sem = ymdFromDb(r.semana_inicio);
    if (!sem) continue;
    if (!map[uid]) map[uid] = {};
    map[uid][sem] = int(r.qtd);
  }
  return map;
}
