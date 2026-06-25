import type { OrcamentoLinha } from "@/lib/orcamento.server";

export const MULTS_MATERIAL_PADRAO = [0.5, 0.6, 0.7, 0.8, 0.9] as const;
export const MULTS_INSTALADO_PADRAO = [1.0, 1.1, 1.2, 1.3, 1.4] as const;
export function multEhPadraoMaterial(m: number): boolean {
  return MULTS_MATERIAL_PADRAO.some((p) => Math.abs(p - m) < 0.001);
}

export function multEhPadraoInstalado(m: number): boolean {
  return MULTS_INSTALADO_PADRAO.some((p) => Math.abs(p - m) < 0.001);
}

export function colunasPadraoMaterial(): number[] {
  return [...MULTS_MATERIAL_PADRAO];
}

export function colunasPadraoInstalado(): number[] {
  return [...MULTS_INSTALADO_PADRAO];
}

export type LinhaBobina = {
  id: string;
  corteCm: string;
  metragemM: string;
  /** Material cadastrado escolhido pelo perfil C/XX (quando há mais de um). */
  materialId?: number | null;
  /** Nome exibido na calculadora — usado na importação para o orçamento. */
  materialNome?: string | null;
};

export type ColunaPersonalizada = {
  id: string;
  mult: string;
};

export type CalculadoraBobinaEntrada = {
  valorBobina: number;
  metragemTotalM: number;
  larguraBobinaCm: number;
  linhas: LinhaBobina[];
  multsMaterial: number[];
  multsInstalado: number[];
  colunasPersonalizadas: ColunaPersonalizada[];
};

export type LinhaBobinaCalculada = {
  id: string;
  corteCm: number;
  metragemM: number;
  custoTotal: number;
  vendaMaterial: number[];
  servicoInstalado: number[];
  colunasPersonalizadas: number[];
};

/**
 * Aceita decimal com vírgula (30,52) ou ponto (30.52), e milhar BR (1.185).
 * Antes removia todo "." — "30.52" virava 3052 e estourava o cálculo.
 */
export function parseNumeroBr(raw: string): number {
  let s = raw.trim();
  if (!s) return 0;

  s = s.replace(/R\$\s?/gi, "").replace(/\s/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    const last = parts[parts.length - 1] ?? "";
    const isThousands =
      parts.length > 1 &&
      last.length === 3 &&
      parts.every((part, index) => (index === 0 ? /^\d{1,3}$/.test(part) : /^\d{3}$/.test(part)));
    if (isThousands) s = s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function formatBrl(value: number): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Igual ao painel antigo: valor ÷ (metragem × largura).
 * O rótulo diz "cm²", mas a fórmula legada não converte metros para cm.
 */
export function custoPorCm2(valorBobina: number, metragemTotalM: number, larguraBobinaCm: number): number {
  if (valorBobina <= 0 || metragemTotalM <= 0 || larguraBobinaCm <= 0) return 0;
  return valorBobina / (metragemTotalM * larguraBobinaCm);
}

/** Custo total da peça = custo/cm² × corte × metragem aferida. */
export function custoPeca(corteCm: number, metragemM: number, custoCm2: number): number {
  if (corteCm <= 0 || metragemM <= 0 || custoCm2 <= 0) return 0;
  return custoCm2 * corteCm * metragemM;
}

/** Venda de material = corte × metragem × multiplicador (painel antigo). */
export function precoVendaMaterial(corteCm: number, metragemM: number, multiplicador: number): number {
  if (corteCm <= 0 || metragemM <= 0 || multiplicador <= 0) return 0;
  return corteCm * metragemM * multiplicador;
}

/** Serviço instalado = corte × metragem × multiplicador (painel antigo). */
export function precoServicoInstalado(corteCm: number, metragemM: number, multiplicador: number): number {
  return precoVendaMaterial(corteCm, metragemM, multiplicador);
}

export function calcularBobina(entrada: CalculadoraBobinaEntrada): {
  custoCm2: number;
  linhas: LinhaBobinaCalculada[];
} {
  const custoCm2 = custoPorCm2(entrada.valorBobina, entrada.metragemTotalM, entrada.larguraBobinaCm);

  const linhas = entrada.linhas.map((linha) => {
    const corteCm = parseNumeroBr(linha.corteCm);
    const metragemM = parseNumeroBr(linha.metragemM);
    const custoTotal = custoPeca(corteCm, metragemM, custoCm2);

    return {
      id: linha.id,
      corteCm,
      metragemM,
      custoTotal,
      vendaMaterial: entrada.multsMaterial.map((m) => precoVendaMaterial(corteCm, metragemM, m)),
      servicoInstalado: entrada.multsInstalado.map((m) => precoServicoInstalado(corteCm, metragemM, m)),
      colunasPersonalizadas: entrada.colunasPersonalizadas.map((col) =>
        precoVendaMaterial(corteCm, metragemM, parseNumeroBr(col.mult)),
      ),
    };
  });

  return { custoCm2, linhas };
}

export function linhasBobinaPadrao(): LinhaBobina[] {
  return [{ id: "r0", corteCm: "", metragemM: "", materialId: null, materialNome: null }];
}

export type MaterialCorteRef = {
  id: number;
  material: string;
};

/** Extrai o perfil numérico de nomes como "… Perfil: C/100" ou "… C/40". */
export function extrairPerfilCorte(material: string): number | null {
  const m = material.match(/C\s*\/\s*(\d+)/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function materiaisPorPerfilCorte(
  materiais: MaterialCorteRef[],
  corteCm: number,
): MaterialCorteRef[] {
  if (corteCm <= 0) return [];
  const alvo = Math.round(corteCm);
  return materiais.filter((item) => {
    const perfil = extrairPerfilCorte(item.material ?? "");
    return perfil != null && perfil === alvo;
  });
}

function preferenciaMaterialBobina(a: MaterialCorteRef, b: MaterialCorteRef): number {
  const score = (nome: string) => {
    const n = nome.toLowerCase();
    if (n.startsWith("chapa galvalume")) return 0;
    if (n.includes("chapa galvalume")) return 1;
    if (n.includes("calha moldura")) return 2;
    return 10;
  };
  const diff = score(a.material ?? "") - score(b.material ?? "");
  if (diff !== 0) return diff;
  return (a.material ?? "").localeCompare(b.material ?? "", "pt-BR");
}

/** Escolhe material pelo C/XX; mantém seleção manual quando ainda válida. */
export function escolherMaterialPorCorte(
  materiais: MaterialCorteRef[],
  corteCm: number,
  materialIdAtual?: number | null,
): MaterialCorteRef | null {
  const matches = materiaisPorPerfilCorte(materiais, corteCm);
  if (matches.length === 0) return null;

  if (materialIdAtual != null) {
    const atual = matches.find((m) => m.id === materialIdAtual);
    if (atual) return atual;
  }

  if (matches.length === 1) return matches[0];
  return [...matches].sort(preferenciaMaterialBobina)[0] ?? null;
}

export function resolverNomeMaterialOrcamento(
  corteCm: number,
  tipo: "material" | "instalado",
  mult: number,
  materiais: MaterialCorteRef[],
  materialId?: number | null,
  materialNome?: string | null,
): string {
  const nomeInformado = materialNome?.trim();
  if (nomeInformado) return nomeInformado;

  if (materialId != null) {
    const porId = materiais.find((m) => m.id === materialId);
    if (porId?.material?.trim()) return porId.material.trim();
  }

  const escolhido = escolherMaterialPorCorte(materiais, corteCm, materialId);
  if (escolhido?.material?.trim()) return escolhido.material.trim();
  return montarDescricaoCalculadora(tipo, corteCm, mult);
}

export function sincronizarMaterialLinha(
  linha: LinhaBobina,
  materiais: MaterialCorteRef[],
): LinhaBobina {
  const corte = parseNumeroBr(linha.corteCm);
  if (corte <= 0) {
    return { ...linha, materialId: null, materialNome: null };
  }
  const escolhido = escolherMaterialPorCorte(materiais, corte, linha.materialId);
  return {
    ...linha,
    materialId: escolhido?.id ?? null,
    materialNome: escolhido?.material?.trim() || null,
  };
}

export function formatMultLabel(mult: number): string {
  return `${mult.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
}

export type LinhaOrcamentoCalculadaInfo = {
  tipo: "material" | "instalado";
  corteCm: number;
  mult: number;
};

export function parseDescricaoCalculadora(material: string): LinhaOrcamentoCalculadaInfo | null {
  const mat = material.match(/^Material corte ([\d,]+)cm \(([\d,]+x)\)$/i);
  if (mat) {
    return {
      tipo: "material",
      corteCm: parseNumeroBr(mat[1]),
      mult: parseNumeroBr(mat[2].replace(/x$/i, "")),
    };
  }

  const inst = material.match(/^Serviço instalado corte ([\d,]+)cm \(([\d,]+x)\)$/i);
  if (inst) {
    return {
      tipo: "instalado",
      corteCm: parseNumeroBr(inst[1]),
      mult: parseNumeroBr(inst[2].replace(/x$/i, "")),
    };
  }

  return null;
}

export function montarDescricaoCalculadora(
  tipo: "material" | "instalado",
  corteCm: number,
  mult: number,
): string {
  const label = formatMultLabel(mult);
  if (tipo === "material") return `Material corte ${corteCm}cm (${label})`;
  return `Serviço instalado corte ${corteCm}cm (${label})`;
}

export function valorUnitarioCalculadora(corteCm: number, mult: number): number {
  if (corteCm <= 0 || mult <= 0) return 0;
  return Math.round(corteCm * mult * 100) / 100;
}

export function multsCalculadoraPorTipo(tipo: "material" | "instalado"): readonly number[] {
  return tipo === "material" ? MULTS_MATERIAL_PADRAO : MULTS_INSTALADO_PADRAO;
}

export function multsParaEdicaoCalculadora(tipo: "material" | "instalado"): number[] {
  return [...multsCalculadoraPorTipo(tipo)];
}

/** Corrige multiplicador legado salvo como 8 em vez de 0,8. */
export function normalizarMultCalculadora(tipo: "material" | "instalado", mult: number): number {
  if (tipo === "material" && mult >= 1.5 && mult <= 10) {
    return Math.round((mult / 10) * 1000) / 1000;
  }
  return mult;
}

export function indiceMultCalculadora(tipo: "material" | "instalado", mult: number): number {
  const mults = multsParaEdicaoCalculadora(tipo);
  const normalizado = normalizarMultCalculadora(tipo, mult);
  const idx = mults.findIndex((m) => Math.abs(m - normalizado) < 0.001);
  if (idx >= 0) return idx;

  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < mults.length; i++) {
    const diff = Math.abs(mults[i] - normalizado);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/**
 * Converte linhas calculadas em itens do orçamento.
 * Material e serviço instalado são exclusivos: instalado já inclui material + mão de obra.
 */
export function linhasCalculadoraParaOrcamento(
  linhasCalc: LinhaBobinaCalculada[],
  linhasInput: LinhaBobina[],
  materiais: MaterialCorteRef[],
  opts: {
    idxMaterial: number | null;
    idxInstalado: number | null;
    multsMaterial: number[];
    multsInstalado: number[];
  },
): OrcamentoLinha[] {
  const out: OrcamentoLinha[] = [];
  const usarInstalado = opts.idxInstalado != null && opts.idxInstalado >= 0;
  const usarMaterial =
    !usarInstalado && opts.idxMaterial != null && opts.idxMaterial >= 0;

  for (const linha of linhasCalc) {
    if (linha.corteCm <= 0 || linha.metragemM <= 0) continue;

    const input = linhasInput.find((l) => l.id === linha.id);
    const materialId = input?.materialId;
    const materialNome = input?.materialNome;

    const custoUnit =
      linha.custoTotal > 0 && linha.metragemM > 0
        ? Math.round((linha.custoTotal / linha.metragemM) * 100) / 100
        : undefined;

    if (usarInstalado) {
      const mult = opts.multsInstalado[opts.idxInstalado!];
      const totalVenda = linha.servicoInstalado[opts.idxInstalado!] ?? 0;
      const valorUnit = valorUnitarioCalculadora(linha.corteCm, mult ?? 0);
      if (mult != null && mult > 0 && totalVenda > 0 && valorUnit > 0) {
        out.push({
          material: resolverNomeMaterialOrcamento(
            linha.corteCm,
            "instalado",
            mult,
            materiais,
            materialId,
            materialNome,
          ),
          metros: linha.metragemM,
          valor: valorUnit,
          ...(materialId != null ? { id: materialId } : {}),
        });
      }
      continue;
    }

    if (usarMaterial) {
      const mult = opts.multsMaterial[opts.idxMaterial!];
      const totalVenda = linha.vendaMaterial[opts.idxMaterial!] ?? 0;
      const valorUnit = valorUnitarioCalculadora(linha.corteCm, mult ?? 0);
      if (mult != null && mult > 0 && totalVenda > 0 && valorUnit > 0) {
        out.push({
          material: resolverNomeMaterialOrcamento(
            linha.corteCm,
            "material",
            mult,
            materiais,
            materialId,
            materialNome,
          ),
          metros: linha.metragemM,
          valor: valorUnit,
          valor_custo: custoUnit,
          ...(materialId != null ? { id: materialId } : {}),
        });
      }
    }
  }

  return out;
}
