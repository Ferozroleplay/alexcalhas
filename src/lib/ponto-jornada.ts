import { parsePontoDatetime } from "@/lib/ponto-timezone";

/** Jornada padrão: 08:00–12:00 e 13:30–17:00 = 7h30. */
export const PONTO_JORNADA = {
  entrada: "08:00",
  almoco: "12:00",
  retorno: "13:30",
  saida: "17:00",
} as const;

/** 4h de manhã + 3h30 de tarde. */
export const PONTO_MINUTOS_CARGA_DIA = 7.5 * 60;

export const PONTO_MINUTOS_ALMOCO_PADRAO = 90;

/** Atraso pequeno ainda conta como dia completo (diária integral). */
export const PONTO_TOLERANCIA_DIA_COMPLETO_MIN = 10;

export const PONTO_CARGA_DIA_LABEL = "7h 30min";

export function valorHoraFromDiario(valorDiario: number): number {
  if (valorDiario <= 0) return 0;
  return Math.round((valorDiario / (PONTO_MINUTOS_CARGA_DIA / 60)) * 100) / 100;
}

export function ganhoDiaFromPonto(valorDiario: number, minutosTrabalhados: number | null): number {
  if (valorDiario <= 0 || minutosTrabalhados == null || minutosTrabalhados <= 0) return 0;
  const carga = PONTO_MINUTOS_CARGA_DIA;
  const minEfetivo =
    minutosTrabalhados >= carga - PONTO_TOLERANCIA_DIA_COMPLETO_MIN
      ? Math.max(minutosTrabalhados, carga)
      : minutosTrabalhados;
  return Math.round(valorDiario * (minEfetivo / carga) * 100) / 100;
}

export function calcMinutosTrabalhados(
  entrada: string | null,
  almoco: string | null,
  retorno: string | null,
  saida: string | null,
  fimAlternativo?: string | null,
): number | null {
  const fim = saida || fimAlternativo;
  if (!entrada || !fim) return null;
  const e = parsePontoDatetime(entrada).getTime();
  const s = parsePontoDatetime(fim).getTime();
  if (Number.isNaN(e) || Number.isNaN(s) || s <= e) return null;
  if (almoco && retorno) {
    const a = parsePontoDatetime(almoco).getTime();
    const r = parsePontoDatetime(retorno).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(r) && a >= e && r >= a && s >= r) {
      return Math.floor((a - e) / 60000) + Math.floor((s - r) / 60000);
    }
  }
  const total = Math.floor((s - e) / 60000);
  if (total >= 6 * 60) return total - PONTO_MINUTOS_ALMOCO_PADRAO;
  return total;
}
