import {
  custoPorCm2,
  escolherMaterialPorCorte,
  materiaisPorPerfilCorte,
  type MaterialCorteRef,
} from "@/lib/calculadora-bobina";
import {
  calcularFator,
  loadEmpresaConfig,
  type EmpresaConfig,
} from "@/lib/empresa-config";

/** Largura útil padrão da bobina quando não há campo na Empresa. */
export const LARGURA_BOBINA_PADRAO_CM = 120;

export type EspessuraChapa = "0.43" | "0.50" | "0.65";

export const ESPESSURAS_CHAPA: { value: EspessuraChapa; label: string }[] = [
  { value: "0.43", label: "0,43 mm" },
  { value: "0.50", label: "0,50 mm" },
  { value: "0.65", label: "0,65 mm" },
];

export const CORTES_RAPIDOS_CM = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;

export function labelEspessura(esp: EspessuraChapa): string {
  return ESPESSURAS_CHAPA.find((e) => e.value === esp)?.label ?? `${esp.replace(".", ",")} mm`;
}

export function valorBobinaPorEspessura(cfg: EmpresaConfig, esp: EspessuraChapa): number {
  if (esp === "0.50") return cfg.chapa050;
  if (esp === "0.65") return cfg.chapa065;
  return cfg.chapa043;
}

/** Detecta 0,43 / 0.50 / 0.65 no nome do material. */
export function materialTemEspessura(nome: string, esp: EspessuraChapa): boolean {
  const n = nome.toLowerCase().replace(/,/g, ".");
  const variantes =
    esp === "0.50" ? ["0.50", "0.5"] : esp === "0.65" ? ["0.65"] : ["0.43"];

  return variantes.some((v) => {
    const re = new RegExp(`(^|[^\\d])${v.replace(".", "\\.")}\\s*m?m?([^\\d]|$)`, "i");
    return re.test(n);
  });
}

export function escolherMaterialPorCorteEspessura(
  materiais: MaterialCorteRef[],
  corteCm: number,
  espessura: EspessuraChapa,
  materialIdAtual?: number | null,
): MaterialCorteRef | null {
  const porCorte = materiaisPorPerfilCorte(materiais, corteCm);
  if (porCorte.length === 0) return null;

  const porEspessura = porCorte.filter((m) => materialTemEspessura(m.material ?? "", espessura));
  const pool = porEspessura.length > 0 ? porEspessura : porCorte;

  if (materialIdAtual != null) {
    const atual = pool.find((m) => m.id === materialIdAtual);
    if (atual) return atual;
  }

  return escolherMaterialPorCorte(pool, corteCm, materialIdAtual);
}

export function montarDescricaoItemEmpresa(
  corteCm: number,
  espessura: EspessuraChapa,
  materialNome?: string | null,
): string {
  const nome = materialNome?.trim();
  if (nome) return nome;
  const corte = Math.round(corteCm);
  return `Chapa galvalume Perfil: C/${corte} · ${labelEspessura(espessura)}`;
}

export type PrecoItemEmpresa = {
  valorBobina: number;
  comprimentoBobina: number;
  larguraBobinaCm: number;
  fator: number;
  custoUnitario: number;
  valorUnitario: number;
  total: number;
};

/** Preço com bobina + comprimento da Empresa e fator da margem recomendada. */
export function calcularPrecoItemEmpresa(opts: {
  cfg?: EmpresaConfig;
  corteCm: number;
  metros: number;
  espessura: EspessuraChapa;
  larguraBobinaCm?: number;
}): PrecoItemEmpresa {
  const cfg = opts.cfg ?? loadEmpresaConfig();
  const valorBobina = valorBobinaPorEspessura(cfg, opts.espessura);
  const comprimentoBobina = cfg.comprimentoBobina;
  const larguraBobinaCm = opts.larguraBobinaCm ?? LARGURA_BOBINA_PADRAO_CM;
  const fator = calcularFator(cfg.margemRecomendada);
  const corteCm = opts.corteCm;
  const metros = opts.metros;

  const cm2 = custoPorCm2(valorBobina, comprimentoBobina, larguraBobinaCm);
  const custoUnitario =
    corteCm > 0 && cm2 > 0 ? Math.round(cm2 * corteCm * 100) / 100 : 0;
  const valorUnitario =
    custoUnitario > 0 && fator > 0 ? Math.round(custoUnitario * fator * 100) / 100 : 0;
  const total =
    valorUnitario > 0 && metros > 0 ? Math.round(valorUnitario * metros * 100) / 100 : 0;

  return {
    valorBobina,
    comprimentoBobina,
    larguraBobinaCm,
    fator,
    custoUnitario,
    valorUnitario,
    total,
  };
}

/** Material de chapa galvalume vendido por metro. */
export function isChapaGalvalumeMetros(opts: {
  material?: string | null;
  tipo_material?: string | null;
  unidade?: string | null;
}): boolean {
  const unidade = (opts.unidade || "M").toUpperCase();
  if (unidade !== "M") return false;
  const blob = `${opts.material ?? ""} ${opts.tipo_material ?? ""}`.toLowerCase();
  return blob.includes("galvalume") && (blob.includes("chapa") || blob.includes("bobina"));
}

export function detectarEspessuraChapa(
  nome?: string | null,
  chapaMm?: string | null,
): EspessuraChapa | null {
  const campo = (chapaMm ?? "").trim().replace(",", ".");
  if (campo === "0.43" || campo === "0.50" || campo === "0.65") return campo;
  if (campo === "0.5") return "0.50";
  for (const esp of ESPESSURAS_CHAPA) {
    if (materialTemEspessura(nome ?? "", esp.value)) return esp.value;
  }
  return null;
}

export function detectarCorteCm(nome?: string | null, corteCm?: number | string | null): number {
  const n = Number(corteCm);
  if (Number.isFinite(n) && n > 0) return n;
  const m = (nome ?? "").match(/C\s*\/\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return 0;
  return Number.parseFloat(m[1].replace(",", ".")) || 0;
}

export type PrecosChapaEmpresa = {
  espessura: EspessuraChapa;
  corteCm: number;
  custoUnitario: number;
  valorUnitario: number;
  fator: number;
  margemRecomendada: number;
};

/** Calcula custo/venda de Chapa Galvalume (R$/m) com dados da Empresa. */
export function calcularPrecosChapaGalvalume(opts: {
  material?: string | null;
  tipo_material?: string | null;
  unidade?: string | null;
  chapa_mm?: string | null;
  corte_cm?: number | string | null;
  cfg?: EmpresaConfig;
}): PrecosChapaEmpresa | null {
  if (
    !isChapaGalvalumeMetros({
      material: opts.material,
      tipo_material: opts.tipo_material,
      unidade: opts.unidade,
    })
  ) {
    return null;
  }
  const espessura = detectarEspessuraChapa(opts.material, opts.chapa_mm);
  const corteCm = detectarCorteCm(opts.material, opts.corte_cm);
  if (!espessura || corteCm < 1) return null;

  const cfg = opts.cfg ?? loadEmpresaConfig();
  const preco = calcularPrecoItemEmpresa({
    cfg,
    corteCm,
    metros: 1,
    espessura,
  });
  if (preco.valorUnitario <= 0) return null;

  return {
    espessura,
    corteCm,
    custoUnitario: preco.custoUnitario,
    valorUnitario: preco.valorUnitario,
    fator: preco.fator,
    margemRecomendada: cfg.margemRecomendada,
  };
}
