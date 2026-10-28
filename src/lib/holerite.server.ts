import { getPrisma } from "@/lib/db.server";
import { pagamentoInicioSemana, ymdFromDb } from "@/lib/funcionario-pagamento-dates";
import {
  dataBrCurta,
  dataEmpreita,
  diasUteisMes,
  limitesMes,
  mesValido,
  montarHoleriteFuncionario,
  type HoleriteEmpreita,
  type HoleriteFuncionario,
} from "@/lib/holerite";
import { pontoHojeIso } from "@/lib/ponto-timezone";

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

export async function montarHoleritesMes(
  mesRaw: string,
  usuarioId = 0,
): Promise<{ mes: string; de: string; ate: string; holerites: HoleriteFuncionario[] }> {
  const hoje = pontoHojeIso();
  const mes = mesValido(mesRaw) ?? hoje.slice(0, 7);
  const { de, ate, ateEsperado } = limitesMes(mes, hoje);
  const diasUteis = diasUteisMes(de, ateEsperado);
  const prisma = await getPrisma();

  const uidFiltro = int(usuarioId);
  const nivel = `nivel IN ('funcionário', 'funcionario')`;
  const userWhere = uidFiltro > 0 ? `${nivel} AND id = ${uidFiltro}` : nivel;

  const funcionarios = await prisma.$queryRawUnsafe<
    { id: unknown; nome: string; valor_diario: unknown }[]
  >(`SELECT id, nome, valor_diario FROM usuarios WHERE ${userWhere} ORDER BY nome ASC`);

  const ids = funcionarios.map((f) => int(f.id)).filter((id) => id > 0);
  const pontoMap = new Map<number, Set<string>>();
  const empMap = new Map<number, HoleriteEmpreita[]>();
  const valeMap = new Map<number, number>();

  if (ids.length > 0) {
    const idList = ids.join(",");
    const pontoRows = await prisma.$queryRawUnsafe<{ usuario_id: unknown; dia: unknown }[]>(
      `SELECT usuario_id, DATE(registrado_em) AS dia FROM funcionario_ponto
       WHERE usuario_id IN (${idList}) AND tipo = 'entrada'
         AND registrado_em >= '${esc(de)} 00:00:00'
         AND registrado_em <= '${esc(ate)} 23:59:59'`,
    );
    for (const row of pontoRows) {
      const uid = int(row.usuario_id);
      const dia = ymdFromDb(row.dia);
      if (!uid || !dia) continue;
      if (!pontoMap.has(uid)) pontoMap.set(uid, new Set());
      pontoMap.get(uid)!.add(dia);
    }

    const semDe = pagamentoInicioSemana(de);
    const empRows = await prisma.$queryRawUnsafe<
      { usuario_id: unknown; semana_inicio: unknown; dia_chave: unknown; valor: unknown; observacao: unknown }[]
    >(
      `SELECT usuario_id, semana_inicio, dia_chave, valor, observacao
       FROM funcionario_pagamento_empreita
       WHERE usuario_id IN (${idList})
         AND semana_inicio >= '${esc(semDe)}'
         AND semana_inicio <= '${esc(ate)}'`,
    ).catch(() => []);

    for (const row of empRows) {
      const uid = int(row.usuario_id);
      const data = dataEmpreita(ymdFromDb(row.semana_inicio), String(row.dia_chave ?? ""));
      if (!uid || !data || data < de || data > ate) continue;
      if (!empMap.has(uid)) empMap.set(uid, []);
      empMap.get(uid)!.push({
        data,
        data_fmt: dataBrCurta(data),
        valor: Math.round(num(row.valor) * 100) / 100,
        observacao: String(row.observacao ?? "").trim(),
      });
    }

    const valeRows = await prisma.$queryRawUnsafe<{ usuario_id: unknown; total: unknown }[]>(
      `SELECT usuario_id, COALESCE(SUM(valor), 0) AS total FROM funcionario_pagamento_vale
       WHERE usuario_id IN (${idList})
         AND data_vale >= '${esc(de)}' AND data_vale <= '${esc(ate)}'
       GROUP BY usuario_id`,
    ).catch(() => []);
    for (const row of valeRows) valeMap.set(int(row.usuario_id), num(row.total));
  }

  const holerites = funcionarios.map((f) => {
    const uid = int(f.id);
    const empreitas = (empMap.get(uid) ?? []).sort((a, b) => a.data.localeCompare(b.data));
    return montarHoleriteFuncionario({
      usuario_id: uid,
      nome: f.nome,
      valor_diario: num(f.valor_diario),
      mes,
      de,
      ate,
      diasUteis,
      diasComPonto: pontoMap.get(uid) ?? new Set(),
      empreitas,
      totalVales: valeMap.get(uid) ?? 0,
    });
  });

  return { mes, de, ate, holerites };
}
