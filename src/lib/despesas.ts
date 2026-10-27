export const DESPESA_CATEGORIAS = [
  { value: "combustivel", label: "Combustível" },
  { value: "material", label: "Material" },
  { value: "ferramenta", label: "Ferramenta" },
  { value: "aluguel", label: "Aluguel" },
  { value: "energia", label: "Energia" },
  { value: "internet", label: "Internet / telefone" },
  { value: "impostos", label: "Impostos / taxas" },
  { value: "manutencao", label: "Manutenção" },
  { value: "transporte", label: "Transporte" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "outros", label: "Outros" },
] as const;

export const DESPESA_FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
] as const;

export type DespesaCategoria = (typeof DESPESA_CATEGORIAS)[number]["value"];
export type DespesaForma = (typeof DESPESA_FORMAS)[number]["value"];

export type DespesaItem = {
  id: number;
  data: string;
  descricao: string;
  categoria: string;
  categoria_label: string;
  valor: number;
  forma_pagamento: string;
  forma_pagamento_label: string;
  observacao: string;
  registrado_por: number | null;
  registrado_por_nome: string;
};

export type DespesaInput = {
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  forma_pagamento: string;
  observacao?: string;
  registrado_por?: number | null;
};

export function isCategoriaValida(v: string): v is DespesaCategoria {
  return DESPESA_CATEGORIAS.some((c) => c.value === v);
}

export function isFormaValida(v: string): v is DespesaForma {
  return DESPESA_FORMAS.some((f) => f.value === v);
}

export function isDataValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

export function labelCategoria(value: string): string {
  return DESPESA_CATEGORIAS.find((c) => c.value === value)?.label ?? value;
}

export function labelForma(value: string): string {
  return DESPESA_FORMAS.find((f) => f.value === value)?.label ?? value;
}

export function totalDespesas(itens: DespesaItem[]): number {
  return Math.round(itens.reduce((sum, i) => sum + i.valor, 0) * 100) / 100;
}

export function formatDespesaDataBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
