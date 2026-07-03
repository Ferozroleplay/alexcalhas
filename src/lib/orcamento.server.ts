export type OrcamentoModoDesconto = "percent" | "valor" | "total";

export type OrcamentoLinha = {
  material: string;
  metros: number;
  valor: number;
  valor_custo?: number;
  id?: number;
};

/** Separa nome do material e perfil (ex.: "Chapa… mm" + "Perfil: C/40"). */
export function splitMaterialOrcamentoLabel(material: string): {
  titulo: string;
  perfil: string | null;
} {
  const t = material.trim();
  if (!t) return { titulo: "", perfil: null };

  const m = t.match(/^(.+?)\s*[-–—]?\s*(Perfil\s*:\s*.+)$/i);
  if (m) {
    const titulo = m[1].trim();
    const perfil = m[2].trim();
    if (titulo) return { titulo, perfil };
  }

  return { titulo: t, perfil: null };
}

export function parseMoneyBr(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(Math.max(0, raw) * 100) / 100;
  }
  const s = String(raw ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(Math.max(0, n) * 100) / 100 : 0;
}

/** Mantém só dígitos e vírgula decimal (máx. 2 casas) — igual ao Alex ao digitar. */
export function sanitizarNumeroBr(raw: string): string {
  let v = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (v.includes(".") && !v.includes(",")) {
    v = v.replace(/\./g, ",");
  } else if (v.includes(".") && v.includes(",")) {
    v = v.replace(/\./g, "");
  }
  const ci = v.indexOf(",");
  if (ci !== -1) {
    const intPart = v.slice(0, ci).replace(/,/g, "");
    const dec = v.slice(ci + 1).replace(/[.,]/g, "").slice(0, 2);
    v = dec.length > 0 || raw.endsWith(",") ? `${intPart},${dec}` : intPart;
  }
  return v;
}

/** Bloqueia letras no teclado; permite dígitos, vírgula e teclas de edição. */
export function bloquearTeclaNaoNumerica(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault(): void;
}): void {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const permitidas = ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End", "Enter"];
  if (permitidas.includes(e.key)) return;
  if (e.key === "," || e.key === ".") return;
  if (/^\d$/.test(e.key)) return;
  e.preventDefault();
}

export function formatDescontoValorOrc(valor: number): string {
  if (valor <= 0) return "";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDescontoPctOrc(pct: number): string {
  if (pct <= 0) return "";
  return pct.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Sanitiza % enquanto digita (sem milhar; máx. 100). */
export function sanitizarDescontoPct(raw: string): string {
  let v = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (v.includes(".") && !v.includes(",")) {
    v = v.replace(/\./g, ",");
  } else if (v.includes(".") && v.includes(",")) {
    v = v.replace(/\./g, "");
  }
  const ci = v.indexOf(",");
  if (ci !== -1) {
    const intPart = v.slice(0, ci).replace(/,/g, "");
    const dec = v.slice(ci + 1).replace(/[.,]/g, "").slice(0, 2);
    v = dec.length > 0 || raw.endsWith(",") ? `${intPart},${dec}` : intPart;
  }
  const n = parseMoneyBr(v);
  if (n > 100) return "100";
  return v;
}

export type OrcamentoDescontoCalc = {
  subtotal: number;
  base: number;
  descontoValor: number;
  descontoPct: number;
  total: number;
};

/**
 * Base do cálculo de desconto.
 * % e R$ usam sempre o subtotal dos materiais; só o modo "total" usa valor digitado manualmente.
 */
export function baseOrcamento(
  subtotal: number,
  valorBaseManual: number,
  valorMostrarRaw: string,
  descontoSource: OrcamentoModoDesconto,
): number {
  if (descontoSource === "total") {
    if (valorBaseManual > 0) return valorBaseManual;
    if (subtotal > 0) return subtotal;
    return parseMoneyBr(valorMostrarRaw);
  }
  if (subtotal > 0) return subtotal;
  return parseMoneyBr(valorMostrarRaw);
}

/** Cálculo de desconto do modal (orcamento-novo-modal.js / orcamentado.php). */
export function calcDescontoOrcamento(
  subtotal: number,
  valorBaseManual: number,
  descontoSource: OrcamentoModoDesconto,
  descontoPctRaw: string,
  descontoValorRaw: string,
  valorMostrarRaw: string,
): OrcamentoDescontoCalc {
  const base = baseOrcamento(subtotal, valorBaseManual, valorMostrarRaw, descontoSource);
  let descontoValor = parseMoneyBr(descontoValorRaw);
  let descontoPct = parseMoneyBr(descontoPctRaw);
  let total = Math.max(0, base - descontoValor);

  if (descontoSource === "total") {
    total = parseMoneyBr(valorMostrarRaw);
    if (total <= 0 && parseMoneyBr(descontoValorRaw) > 0) {
      descontoValor = parseMoneyBr(descontoValorRaw);
      total = Math.max(0, base - descontoValor);
      descontoPct = base > 0 ? Math.round((descontoValor / base) * 10000) / 100 : 0;
    } else if (total <= 0 && parseMoneyBr(descontoPctRaw) > 0) {
      descontoPct = parseMoneyBr(descontoPctRaw);
      descontoValor = Math.round(base * (descontoPct / 100) * 100) / 100;
      total = Math.max(0, base - descontoValor);
    } else if (base > 0) {
      const diff = base - total;
      descontoValor = diff > 0 ? Math.round(diff * 100) / 100 : 0;
      descontoPct = diff > 0 ? Math.round((descontoValor / base) * 10000) / 100 : 0;
    }
  } else if (base > 0) {
    if (descontoSource === "valor") {
      total = Math.max(0, base - descontoValor);
      descontoPct = Math.round((descontoValor / base) * 10000) / 100;
    } else if (descontoSource === "percent") {
      descontoValor = Math.round(base * (descontoPct / 100) * 100) / 100;
      total = Math.max(0, base - descontoValor);
    }
  } else if (descontoSource === "total") {
    total = parseMoneyBr(valorMostrarRaw);
  }

  return {
    subtotal,
    base,
    descontoValor: Math.round(descontoValor * 100) / 100,
    descontoPct: Math.round(descontoPct * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export function inventarioSubtotalOrcamento(itens: OrcamentoLinha[]): number {
  let total = 0;
  for (const item of itens) {
    total += (Number(item.metros) || 0) * (Number(item.valor) || 0);
  }
  return Math.round(total * 100) / 100;
}

/** Agrupa linhas iguais (mesma descrição + mesmo valor unitário). */
export function chaveLinhaOrcamento(linha: OrcamentoLinha): string {
  const nome = linha.material.trim().toLowerCase();
  const valor = Math.round((Number(linha.valor) || 0) * 100) / 100;
  return `${nome}|${valor.toFixed(2)}`;
}

export function mesclarLinhasOrcamento(linhas: OrcamentoLinha[]): OrcamentoLinha[] {
  const ordem: string[] = [];
  const map = new Map<string, OrcamentoLinha>();

  for (const linha of linhas) {
    const key = chaveLinhaOrcamento(linha);
    const metros = Math.round((Number(linha.metros) || 0) * 100) / 100;
    const existente = map.get(key);
    if (existente) {
      existente.metros = Math.round(((Number(existente.metros) || 0) + metros) * 100) / 100;
      if (linha.id != null && existente.id == null) existente.id = linha.id;
      if (linha.valor_custo != null && existente.valor_custo == null) {
        existente.valor_custo = linha.valor_custo;
      }
    } else {
      ordem.push(key);
      map.set(key, {
        ...linha,
        material: linha.material.trim(),
        metros,
        valor: Math.round((Number(linha.valor) || 0) * 100) / 100,
      });
    }
  }

  return ordem.map((k) => map.get(k)!);
}

function normalizarDescontoPercent(raw: unknown): number {
  const n = parseMoneyBr(raw);
  return Math.min(100, Math.max(0, n));
}

export function normalizarModoDesconto(raw: string): OrcamentoModoDesconto {
  const m = raw.trim().toLowerCase();
  if (m === "valor" || m === "total") return m;
  return "percent";
}

export function normalizarFormaPagamento(raw: string): string {
  let v = raw.trim().toLowerCase();
  if (v.startsWith("credito:")) v = "credito";
  if (v === "débito") v = "debito";
  if (v === "crédito") v = "credito";
  return ["pix", "debito", "credito"].includes(v) ? v : "";
}

export function parseFormaPagamento(raw: string | null | undefined): {
  forma: "" | "pix" | "debito" | "credito";
  qtdParcelas: number;
  taxaMaquininhaPct: number;
  parcelasSemJuros: number;
} {
  const fp = (raw ?? "").trim().toLowerCase();
  const creditoMatch = fp.match(/^credito:(\d+)(?:@([\d.]+))?(?:~(\d+))?$/);
  if (creditoMatch) {
    const qtd = Math.min(24, Math.max(1, Number.parseInt(creditoMatch[1], 10) || 1));
    const taxa = Math.max(0, Number.parseFloat(creditoMatch[2] ?? "0") || 0);
    const semJuros = Math.min(12, Math.max(1, Number.parseInt(creditoMatch[3] ?? "3", 10) || 3));
    return { forma: "credito", qtdParcelas: qtd, taxaMaquininhaPct: taxa, parcelasSemJuros: semJuros };
  }

  const forma = normalizarFormaPagamento(fp) as "" | "pix" | "debito" | "credito";
  return {
    forma,
    qtdParcelas: forma === "credito" ? 1 : 0,
    taxaMaquininhaPct: 0,
    parcelasSemJuros: 3,
  };
}

export function calcularCreditoMaquininha(
  totalBase: number,
  _qtdParcelas?: number,
  taxaMaquininhaPct?: number | string,
  _parcelasSemJuros?: number,
): { totalFinal: number; acrescimo: number; comTaxa: boolean } {
  const base = Math.round(Math.max(0, totalBase) * 100) / 100;
  const taxa = parseMoneyBr(taxaMaquininhaPct);

  if (taxa <= 0) {
    return { totalFinal: base, acrescimo: 0, comTaxa: false };
  }

  const acrescimo = Math.round(base * (taxa / 100) * 100) / 100;
  return {
    totalFinal: Math.round((base + acrescimo) * 100) / 100,
    acrescimo,
    comTaxa: true,
  };
}

export function encodeFormaPagamento(
  forma: string,
  qtdParcelas?: number | string,
  taxaMaquininhaPct?: number | string,
  parcelasSemJuros?: number | string,
): string {
  const base = normalizarFormaPagamento(forma);
  if (!base) return "";
  if (base !== "credito") return base;

  const qtd = Math.min(24, Math.max(1, Math.round(Number(qtdParcelas) || 1)));
  const taxa = parseMoneyBr(taxaMaquininhaPct);

  let encoded = qtd > 1 ? `credito:${qtd}` : "credito";
  if (taxa > 0) encoded += `@${taxa}`;
  return encoded;
}

export function calcularValoresParcelas(total: number, qtd: number): number[] {
  const parcelas = Math.min(24, Math.max(1, Math.round(qtd) || 1));
  const valorBase = Math.floor((total / parcelas) * 100) / 100;
  const valores = Array.from({ length: parcelas }, () => valorBase);
  const soma = Math.round(valorBase * parcelas * 100) / 100;
  const diff = Math.round((total - soma) * 100) / 100;
  valores[parcelas - 1] = Math.round((valorBase + diff) * 100) / 100;
  return valores;
}

function addMesesDataBr(dataBr: string, meses: number): string {
  const [dia, mes, ano] = dataBr.split("/").map((p) => Number.parseInt(p, 10));
  if (!dia || !mes || !ano) return dataBr;
  const dt = new Date(ano, mes - 1 + meses, dia);
  return dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function gerarParcelasOrcamento(
  total: number,
  formaPagamento: string | null | undefined,
  dataEmissao: string,
): Array<{ label: string; valor: number; vencimento: string }> {
  const pag = parseFormaPagamento(formaPagamento);
  const { totalFinal } = calcularCreditoMaquininha(
    total,
    pag.qtdParcelas,
    pag.taxaMaquininhaPct,
    pag.parcelasSemJuros,
  );
  const valor = Math.round(Math.max(0, totalFinal) * 100) / 100;

  if (pag.forma !== "credito" || pag.qtdParcelas <= 1) {
    return [{ label: "01/01", valor, vencimento: dataEmissao }];
  }

  const valores = calcularValoresParcelas(valor, pag.qtdParcelas);
  return valores.map((parcelaValor, index) => ({
    label: `${String(index + 1).padStart(2, "0")}/${String(pag.qtdParcelas).padStart(2, "0")}`,
    valor: parcelaValor,
    vencimento: addMesesDataBr(dataEmissao, index),
  }));
}

/**
 * Garante total gravado/exibido coerente com a soma dos materiais.
 * Corrige valor inflado (ex.: 36.425 quando o subtotal é 383,42).
 */
export function garantirTotalOrcamentoConsistente(
  subtotal: number,
  modo: OrcamentoModoDesconto,
  descontoPercentRaw: unknown,
  descontoValorRaw: unknown,
  valorTotalCandidato: unknown,
): { percent: number; valor: number; total: number } {
  const sub = Math.round(Math.max(0, subtotal) * 100) / 100;
  if (sub <= 0) {
    const manual = parseMoneyBr(valorTotalCandidato);
    return { percent: 0, valor: 0, total: manual > 0 ? manual : 0 };
  }

  let resolved = resolverDescontoOrcamento(
    sub,
    descontoPercentRaw,
    descontoValorRaw,
    modo,
    valorTotalCandidato,
  );

  if (resolved.total > sub + 0.009) {
    resolved = resolverDescontoOrcamento(sub, descontoPercentRaw, descontoValorRaw, "percent");
    if (resolved.total > sub + 0.009) {
      resolved = { percent: 0, valor: 0, total: sub };
    }
  }

  return resolved;
}

/** Valor para lista/WhatsApp quando o campo gravado diverge da soma dos itens. */
export function valorOrcamentoParaExibicao(
  valorGravado: number,
  descontoPercent: number,
  itens: OrcamentoLinha[],
): number {
  const subtotal = inventarioSubtotalOrcamento(itens);
  if (subtotal <= 0) return Math.max(0, valorGravado);
  const valor = Math.max(0, valorGravado);
  if (valor > 0 && valor <= subtotal + 0.009) return valor;
  if (descontoPercent > 0) {
    return resolverDescontoOrcamento(subtotal, descontoPercent, 0, "percent").total;
  }
  return subtotal;
}

export function resolverDescontoOrcamento(
  subtotal: number,
  descontoPercentRaw: unknown,
  descontoValorRaw: unknown,
  modo: OrcamentoModoDesconto = "percent",
  valorTotalRaw?: unknown,
): { percent: number; valor: number; total: number } {
  const sub = Math.round(Math.max(0, subtotal) * 100) / 100;
  if (sub <= 0) {
    const totalManual = parseMoneyBr(valorTotalRaw ?? 0);
    if (totalManual > 0) return { percent: 0, valor: 0, total: totalManual };
    return { percent: 0, valor: 0, total: 0 };
  }

  if (modo === "total") {
    const totalDesejado = parseMoneyBr(valorTotalRaw ?? 0);
    if (totalDesejado <= 0) {
      const descontoEmReais = parseMoneyBr(descontoValorRaw);
      if (descontoEmReais > 0) {
        return resolverDescontoOrcamento(sub, 0, descontoEmReais, "valor");
      }
      const pct = normalizarDescontoPercent(descontoPercentRaw);
      if (pct > 0) {
        return resolverDescontoOrcamento(sub, pct, 0, "percent");
      }
      return { percent: 0, valor: 0, total: sub };
    }
    const valor = Math.round(Math.max(0, sub - totalDesejado) * 100) / 100;
    const percent = Math.round((valor / sub) * 10000) / 100;
    return { percent: Math.max(0, percent), valor, total: Math.round(Math.max(0, totalDesejado) * 100) / 100 };
  }

  if (modo === "valor") {
    const valor = parseMoneyBr(descontoValorRaw);
    const percent = Math.round((valor / sub) * 10000) / 100;
    return {
      percent: Math.max(0, percent),
      valor,
      total: Math.round(Math.max(0, sub - valor) * 100) / 100,
    };
  }

  const percent = normalizarDescontoPercent(descontoPercentRaw);
  const valor = Math.round(sub * (percent / 100) * 100) / 100;
  return {
    percent,
    valor,
    total: Math.round(Math.max(0, sub - valor) * 100) / 100,
  };
}

export function parseOrcamentoJson(raw: string | null | undefined): OrcamentoLinha[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        material: String(x.material ?? ""),
        metros: Number(x.metros) || 0,
        valor: Number(x.valor) || 0,
        valor_custo: x.valor_custo != null ? Number(x.valor_custo) : undefined,
        id: x.id != null ? Number(x.id) : undefined,
      }));
  } catch {
    return [];
  }
}
