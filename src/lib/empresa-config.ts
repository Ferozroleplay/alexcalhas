/** Configuração editável da empresa (painel → Empresa). Persistida no navegador. */

export const EMPRESA_STORAGE_KEY = "alex-empresa-config-v1";

export type EmpresaConfig = {
  nome: string;
  proprietario: string;
  cnpj: string;
  email: string;
  telefone: string;
  whatsapp: string;
  endereco: string;
  cidadeUf: string;
  logoDataUrl: string;
  chapa043: number;
  chapa050: number;
  chapa065: number;
  margemRecomendada: number;
  margemMinima: number;
  taxaMaquininha12x: number;
  comprimentoBobina: number;
};

export const EMPRESA_DEFAULTS: EmpresaConfig = {
  nome: "Alex Calhas",
  proprietario: "Alex",
  cnpj: "28.376.837/0001-59",
  email: "contato@alexcalhas.com",
  telefone: "(18) 99647-5269",
  whatsapp: "(18) 99647-5269",
  endereco: "Rua Angelim, 137, Parque Industrial",
  cidadeUf: "Tarumã/SP",
  logoDataUrl: "",
  chapa043: 900,
  chapa050: 1050,
  chapa065: 1440,
  margemRecomendada: 72.93,
  margemMinima: 65,
  taxaMaquininha12x: 18.79,
  comprimentoBobina: 24,
};

/** Fator = 1 / (1 − margem recomendada). */
export function calcularFator(margemRecomendadaPct: number): number {
  const m = Number(margemRecomendadaPct);
  if (!Number.isFinite(m) || m >= 100) return 0;
  const base = 1 - m / 100;
  if (base <= 0) return 0;
  return Math.round((1 / base) * 1000) / 1000;
}

export function formatFator(fator: number): string {
  return fator.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function formatMoneyInput(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPctInput(value: number): string {
  const n = Number(value || 0);
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return fixed.replace(".", ",");
}

export function parseMoneyBr(raw: string): number {
  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return 0;
  if (cleaned.includes(",")) {
    return Number.parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number.parseFloat(cleaned) || 0;
}

function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeEmpresaConfig(partial: Partial<EmpresaConfig> | null | undefined): EmpresaConfig {
  const d = EMPRESA_DEFAULTS;
  const p = partial ?? {};
  return {
    nome: String(p.nome ?? d.nome).slice(0, 120),
    proprietario: String(p.proprietario ?? d.proprietario).slice(0, 80),
    cnpj: String(p.cnpj ?? d.cnpj).slice(0, 22),
    email: String(p.email ?? d.email).slice(0, 120),
    telefone: String(p.telefone ?? d.telefone).slice(0, 24),
    whatsapp: String(p.whatsapp ?? d.whatsapp).slice(0, 24),
    endereco: String(p.endereco ?? d.endereco).slice(0, 200),
    cidadeUf: String(p.cidadeUf ?? d.cidadeUf).slice(0, 80),
    logoDataUrl: typeof p.logoDataUrl === "string" && p.logoDataUrl.startsWith("data:image/")
      ? p.logoDataUrl
      : "",
    chapa043: clampNumber(Number(p.chapa043 ?? d.chapa043), 0, 1_000_000),
    chapa050: clampNumber(Number(p.chapa050 ?? d.chapa050), 0, 1_000_000),
    chapa065: clampNumber(Number(p.chapa065 ?? d.chapa065), 0, 1_000_000),
    margemRecomendada: clampNumber(Number(p.margemRecomendada ?? d.margemRecomendada), 0, 99.99),
    margemMinima: clampNumber(Number(p.margemMinima ?? d.margemMinima), 0, 99.99),
    taxaMaquininha12x: clampNumber(Number(p.taxaMaquininha12x ?? d.taxaMaquininha12x), 0, 99.99),
    comprimentoBobina: clampNumber(Number(p.comprimentoBobina ?? d.comprimentoBobina), 0.01, 10_000),
  };
}

export function loadEmpresaConfig(): EmpresaConfig {
  if (typeof window === "undefined") return { ...EMPRESA_DEFAULTS };
  try {
    const raw = localStorage.getItem(EMPRESA_STORAGE_KEY);
    if (!raw) return { ...EMPRESA_DEFAULTS };
    return sanitizeEmpresaConfig(JSON.parse(raw) as Partial<EmpresaConfig>);
  } catch {
    return { ...EMPRESA_DEFAULTS };
  }
}

export function saveEmpresaConfig(config: EmpresaConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(EMPRESA_STORAGE_KEY, JSON.stringify(sanitizeEmpresaConfig(config)));
}

export function formatCnpjMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
