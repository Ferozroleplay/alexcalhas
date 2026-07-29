export type EstoqueChapa = "0.43" | "0.50" | "0.65";

export type EstoqueItem = {
  id: number;
  codigo: string;
  nome: string;
  chapa: EstoqueChapa | null;
  corte: number | null;
  unidade: "m" | "un" | "pc";
  quantidade: number;
  minimo: number;
  maximo: number;
  ativo: boolean;
};

export type EstoqueInput = {
  codigo?: string;
  nome: string;
  chapa?: EstoqueChapa | null;
  corte?: number | null;
  unidade?: "m" | "un" | "pc";
  quantidade?: number;
  minimo?: number;
  maximo?: number;
  ativo?: boolean;
};

export const ESTOQUE_CHAPAS: { value: EstoqueChapa; label: string }[] = [
  { value: "0.43", label: "0,43 mm" },
  { value: "0.50", label: "0,50 mm" },
  { value: "0.65", label: "0,65 mm" },
];

function profileCortes(from: number, to = 120, step = 5) {
  return Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step);
}

export const ESTOQUE_CATALOG: { chapa: EstoqueChapa; cortes: number[] }[] = [
  { chapa: "0.43", cortes: profileCortes(15) },
  { chapa: "0.50", cortes: profileCortes(40) },
  { chapa: "0.65", cortes: profileCortes(40) },
];

export function estoqueLevel(item: EstoqueItem): "ok" | "low" | "critical" | "empty" {
  if (item.quantidade <= 0) return "empty";
  if (item.unidade === "m") {
    if (item.quantidade <= 1) return "critical";
    if (item.quantidade <= 5) return "low";
    return "ok";
  }
  if (item.quantidade <= item.minimo * 0.5) return "critical";
  if (item.quantidade <= item.minimo) return "low";
  return "ok";
}

export function estoqueLevelLabel(level: ReturnType<typeof estoqueLevel>) {
  if (level === "empty") return "Esgotado";
  if (level === "critical") return "Crítico";
  if (level === "low") return "Atenção";
  return "Normal";
}

export function formatEstoqueQty(item: EstoqueItem) {
  const n = Number(item.quantidade || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: item.unidade === "m" ? 1 : 0,
    maximumFractionDigits: 2,
  });
  return `${n} ${item.unidade}`;
}
