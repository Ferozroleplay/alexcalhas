import { pagamentoInicioSemana, ymdLocal } from "@/lib/funcionario-pagamento-dates";

const DIA_OFFSET: Record<string, number> = {
  seg: 0,
  ter: 1,
  qua: 2,
  qui: 3,
  sex: 4,
};

export type HoleriteLinha = {
  codigo: string;
  descricao: string;
  referencia: string;
  provento: number;
  desconto: number;
};

export type HoleriteEmpreita = {
  data: string;
  data_fmt: string;
  valor: number;
  observacao: string;
};

export type HoleriteFuncionario = {
  usuario_id: number;
  codigo: string;
  nome: string;
  funcao: string;
  valor_diario: number;
  mes: string;
  mes_label: string;
  de: string;
  ate: string;
  dias_uteis: number;
  dias_diaria: number;
  dias_empreita: number;
  dias_falta: number;
  valor_diarias: number;
  valor_comissao: number;
  valor_faltas: number;
  valor_vales: number;
  total_proventos: number;
  total_descontos: number;
  liquido: number;
  linhas: HoleriteLinha[];
  faltas: string[];
  empreitas: HoleriteEmpreita[];
};

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymdFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

export function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function dataBrCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

/** Páscoa no calendário gregoriano. */
export function pascoaYmd(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymdFromParts(year, month, day);
}

export function feriadosBrasil(year: number): Set<string> {
  const e = pascoaYmd(year);
  return new Set([
    ymdFromParts(year, 1, 1),
    addDaysYmd(e, -48),
    addDaysYmd(e, -47),
    addDaysYmd(e, -2),
    ymdFromParts(year, 4, 21),
    ymdFromParts(year, 5, 1),
    addDaysYmd(e, 60),
    ymdFromParts(year, 7, 9),
    ymdFromParts(year, 9, 7),
    ymdFromParts(year, 10, 12),
    ymdFromParts(year, 11, 2),
    ymdFromParts(year, 11, 15),
    ymdFromParts(year, 11, 20),
    ymdFromParts(year, 12, 25),
  ]);
}

export function mesValido(mes: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${pad2(month)}`;
}

export function limitesMes(mes: string, hoje: string): { de: string; ate: string; ateEsperado: string } {
  const ok = mesValido(mes);
  const base = ok ?? hoje.slice(0, 7);
  const year = Number(base.slice(0, 4));
  const month = Number(base.slice(5, 7));
  const de = ymdFromParts(year, month, 1);
  const last = new Date(year, month, 0).getDate();
  const ate = ymdFromParts(year, month, last);
  let ateEsperado = ate;
  if (hoje < de) ateEsperado = addDaysYmd(de, -1);
  else if (hoje < ate) ateEsperado = hoje;
  return { de, ate, ateEsperado };
}

export function mesLabel(mes: string): string {
  const ok = mesValido(mes);
  if (!ok) return mes;
  const [y, m] = ok.split("-");
  return `${m}/${y}`;
}

/** Seg–sex, sem feriado, até ateEsperado. */
export function diasUteisMes(de: string, ateEsperado: string): string[] {
  if (!de || !ateEsperado || ateEsperado < de) return [];
  const year = Number(de.slice(0, 4));
  const feriados = feriadosBrasil(year);
  if (de.slice(0, 4) !== ateEsperado.slice(0, 4)) {
    feriadosBrasil(Number(ateEsperado.slice(0, 4))).forEach((d) => feriados.add(d));
  }
  const out: string[] = [];
  let cursor = de;
  while (cursor <= ateEsperado) {
    const [y, mo, d] = cursor.split("-").map(Number);
    const wd = new Date(y, mo - 1, d).getDay();
    if (wd !== 0 && wd !== 6 && !feriados.has(cursor)) out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

export function dataEmpreita(semanaInicio: string, diaChave: string): string {
  const sem = pagamentoInicioSemana(semanaInicio);
  const offset = DIA_OFFSET[diaChave.trim().toLowerCase()];
  if (offset == null) return "";
  return addDaysYmd(sem, offset);
}

export function montarHoleriteFuncionario(input: {
  usuario_id: number;
  nome: string;
  valor_diario: number;
  mes: string;
  de: string;
  ate: string;
  diasUteis: string[];
  diasComPonto: Set<string>;
  empreitas: HoleriteEmpreita[];
  totalVales: number;
}): HoleriteFuncionario {
  const valorDiario = money(input.valor_diario);
  const empreitaPorDia = new Map(input.empreitas.map((e) => [e.data, e]));
  const diasDiaria: string[] = [];
  const diasFalta: string[] = [];
  const diasEmpreita: string[] = [];

  for (const dia of input.diasUteis) {
    if (empreitaPorDia.has(dia)) {
      diasEmpreita.push(dia);
      continue;
    }
    if (input.diasComPonto.has(dia)) diasDiaria.push(dia);
    else diasFalta.push(dia);
  }

  const valorDiarias = money(diasDiaria.length * valorDiario);
  const valorComissao = money(input.empreitas.reduce((s, e) => s + e.valor, 0));
  const valorFaltas = money(diasFalta.length * valorDiario);
  const valorVales = money(input.totalVales);
  const totalProventos = money(valorDiarias + valorComissao);
  const totalDescontos = money(valorVales);
  const liquido = money(Math.max(0, totalProventos - totalDescontos));

  const linhas: HoleriteLinha[] = [
    {
      codigo: "001",
      descricao: "DIÁRIAS",
      referencia: `${diasDiaria.length},00 × ${valorDiario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      provento: valorDiarias,
      desconto: 0,
    },
  ];
  if (valorComissao > 0) {
    linhas.push({
      codigo: "400",
      descricao: "COMISSÃO",
      referencia: `${input.empreitas.length},00 empreita${input.empreitas.length === 1 ? "" : "s"}`,
      provento: valorComissao,
      desconto: 0,
    });
  }
  linhas.push({
    codigo: "002",
    descricao: "FALTAS",
    referencia: `${diasFalta.length},00 dia${diasFalta.length === 1 ? "" : "s"}`,
    provento: 0,
    desconto: 0,
  });
  if (valorVales > 0) {
    linhas.push({
      codigo: "003",
      descricao: "VALES",
      referencia: "adiantamento",
      provento: 0,
      desconto: valorVales,
    });
  }

  return {
    usuario_id: input.usuario_id,
    codigo: String(input.usuario_id).padStart(4, "0"),
    nome: input.nome,
    funcao: "Funcionário",
    valor_diario: valorDiario,
    mes: input.mes,
    mes_label: mesLabel(input.mes),
    de: input.de,
    ate: input.ate,
    dias_uteis: input.diasUteis.length,
    dias_diaria: diasDiaria.length,
    dias_empreita: diasEmpreita.length,
    dias_falta: diasFalta.length,
    valor_diarias: valorDiarias,
    valor_comissao: valorComissao,
    valor_faltas: valorFaltas,
    valor_vales: valorVales,
    total_proventos: totalProventos,
    total_descontos: totalDescontos,
    liquido,
    linhas,
    faltas: diasFalta.map(dataBrCurta),
    empreitas: input.empreitas,
  };
}
