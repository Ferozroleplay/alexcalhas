export const RECEBIMENTO_TIPOS = ["sinal", "parcela", "saldo", "outro"] as const;

export function labelRecebimentoTipo(tipo: string): string {
  switch (tipo) {
    case "sinal":
      return "Entrada";
    case "parcela":
      return "Parcela";
    case "saldo":
      return "Saldo";
    default:
      return "Outro";
  }
}

/**
 * Aceita 295,99 / 295.99 / 1.750,00 / 1.750.
 * Ponto com 1 ou 2 casas é decimal. Ponto em grupos de 3 é milhar.
 */
export function normalizarValorPagamento(raw: string): string {
  let v = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!v) return "";

  const hasComma = v.includes(",");
  const hasDot = v.includes(".");
  if (hasComma && hasDot) {
    v = v.replace(/\./g, "");
  } else if (hasDot && !hasComma) {
    const parts = v.split(".");
    const last = parts[parts.length - 1] ?? "";
    const pareceMilhar = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    if (pareceMilhar) {
      v = parts.join("");
    } else {
      const intPart = parts.slice(0, -1).join("") || "0";
      const dec = last.replace(/\D/g, "").slice(0, 2);
      v = `${intPart},${dec}`;
    }
  }

  const ci = v.indexOf(",");
  if (ci !== -1) {
    const intPart = v.slice(0, ci).replace(/\D/g, "") || "0";
    const dec = v.slice(ci + 1).replace(/\D/g, "").slice(0, 2);
    v = `${intPart},${dec}`;
  }
  return v;
}

const EXT_UNIDADES = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const EXT_DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const EXT_CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function extensoGrupo(n: number): string {
  if (n <= 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(EXT_CENTENAS[c] ?? "");
  if (resto > 0 && resto < 20) {
    partes.push(EXT_UNIDADES[resto] ?? "");
  } else if (resto >= 20) {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u > 0 ? `${EXT_DEZENAS[d]} e ${EXT_UNIDADES[u]}` : (EXT_DEZENAS[d] ?? ""));
  }
  return partes.filter(Boolean).join(" e ");
}

function extensoInteiro(n: number): string {
  if (n <= 0) return "zero";
  if (n < 1000) return extensoGrupo(n);
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  const milTxt = mil === 1 ? "mil" : `${extensoGrupo(mil)} mil`;
  if (resto === 0) return milTxt;
  const liga = resto < 100 || resto % 100 === 0 ? " e " : " ";
  return `${milTxt}${liga}${extensoGrupo(resto)}`;
}

/** "duzentos e noventa e cinco reais e noventa e nove centavos" */
export function valorReaisPorExtenso(valor: number): string {
  const cents = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const parteReais =
    reais === 1 ? "um real" : `${extensoInteiro(reais)} reais`;
  if (centavos === 0) return parteReais;
  const parteCentavos =
    centavos === 1 ? "um centavo" : `${extensoGrupo(centavos)} centavos`;
  if (reais === 0) return parteCentavos;
  return `${parteReais} e ${parteCentavos}`;
}

const MESES_EN: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Lê datetime do MySQL, ISO ou o texto cru do `Date` do JavaScript. */
export function parsePagoEm(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const mysql = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (mysql) {
    return new Date(
      Number(mysql[1]),
      Number(mysql[2]) - 1,
      Number(mysql[3]),
      Number(mysql[4]),
      Number(mysql[5]),
      Number(mysql[6] ?? 0),
    );
  }

  const en = s.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (en && MESES_EN[en[1]] != null) {
    return new Date(Number(en[3]), MESES_EN[en[1]], Number(en[2]), Number(en[4]), Number(en[5]), Number(en[6] ?? 0));
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatPagoEmExibicao(raw: string): string {
  const d = parsePagoEm(raw);
  if (!d) return raw;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} às ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatPagoEmLongo(raw: string): string {
  const d = parsePagoEm(raw);
  if (!d) return raw;
  const longa = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return `Tarumã, ${longa}`;
}
