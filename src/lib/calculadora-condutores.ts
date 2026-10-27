export type CondutoresEntrada = {
  largura: number;
  marcacao: number;
  deslocamento: number;
  alturaTotal: number;
  primeiraDescida: number;
  corteReal: number | null;
};

export type CondutoresStatusKind = "warning" | "error" | "ok";

export type CondutoresResultado = {
  valido: boolean;
  inclinacao: number | null;
  alturaFinal: number | null;
  queda: number | null;
  curvasLabel: string;
  status: string;
  statusKind: CondutoresStatusKind;
  subtotal: number | null;
  formula: string;
  diferenca: number | null;
  corteTotalLabel: string;
  corteNota: string;
  corteLiberado: boolean;
  pecaReferencia: 1 | 2 | null;
};

export const PECA_1 = {
  largura: 6,
  marcacao: 4.5,
  deslocamento: 53.5,
  alturaTotal: 325,
  primeiraDescida: 22,
  inclinacao: 58.5,
  queda: 20,
} as const;

export const PECA_2 = {
  largura: 6,
  marcacao: 4.5,
  deslocamento: 51,
  alturaTotal: 332,
  primeiraDescida: 22,
  inclinacao: 53,
  queda: 18,
} as const;

const EPS = 0.001;

export function fmtCm(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function quaseIgual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

export function calcularCondutores(entrada: CondutoresEntrada): CondutoresResultado {
  const { largura: w, marcacao: m, deslocamento: d, alturaTotal: h, primeiraDescida: p, corteReal } =
    entrada;

  const valido =
    [w, m, d, h, p].every(Number.isFinite) && w > 0 && m > 0 && d > 0 && h > p && p >= 0;

  let inclinacao: number | null = null;
  let alturaFinal: number | null = null;
  let queda: number | null = null;
  let status = "";
  let statusKind: CondutoresStatusKind = "warning";
  let pecaReferencia: 1 | 2 | null = null;

  if (!valido) {
    status = "Preencha medidas válidas, com altura total maior que a primeira descida.";
    statusKind = "error";
  } else if (!quaseIgual(w, 6) || !quaseIgual(m, 4.5)) {
    status =
      "Largura ou marcação diferente das peças de referência. Sem calibração: não é possível calcular inclinação e descida final com segurança.";
  } else if (quaseIgual(d, PECA_1.deslocamento)) {
    inclinacao = PECA_1.inclinacao;
    queda = PECA_1.queda;
    alturaFinal = h - p - queda;
    pecaReferencia = 1;
    status =
      "Inclinação e queda de referência da peça 1. A altura final foi calculada com a queda de referência de 20 cm; valide se alterar a primeira descida.";
    statusKind = "ok";
  } else if (quaseIgual(d, PECA_2.deslocamento)) {
    inclinacao = PECA_2.inclinacao;
    queda = PECA_2.queda;
    alturaFinal = h - p - queda;
    pecaReferencia = 2;
    status =
      "Inclinação e queda de referência da peça 2. A altura final foi calculada com a queda de referência de 18 cm; valide se alterar a primeira descida.";
    statusKind = "ok";
  } else if (d > PECA_2.deslocamento && d < PECA_1.deslocamento) {
    const t = (d - PECA_2.deslocamento) / 2.5;
    inclinacao = PECA_2.inclinacao + 5.5 * t;
    queda = PECA_2.queda + 2 * t;
    alturaFinal = h - p - queda;
    status =
      "ESTIMATIVA por interpolação entre duas peças reais, não uma fórmula de dobra validada. Não utilizar para cortar material.";
  } else {
    status =
      "Fora do intervalo de deslocamentos calibrados (51 a 53,5 cm). É necessário medir outra peça ou validar a geometria antes de calcular.";
  }

  if (alturaFinal !== null && alturaFinal < 0) {
    alturaFinal = null;
    status = `Altura final negativa: as entradas são incompatíveis. ${status}`;
    statusKind = "error";
  }

  const subtotal =
    inclinacao !== null && alturaFinal !== null ? p + inclinacao + alturaFinal : null;
  const hasReal = corteReal !== null && Number.isFinite(corteReal) && corteReal > 0;
  const exactRef =
    valido &&
    quaseIgual(w, 6) &&
    quaseIgual(m, 4.5) &&
    ((quaseIgual(d, PECA_1.deslocamento) &&
      quaseIgual(h, PECA_1.alturaTotal) &&
      quaseIgual(p, PECA_1.primeiraDescida)) ||
      (quaseIgual(d, PECA_2.deslocamento) &&
        quaseIgual(h, PECA_2.alturaTotal) &&
        quaseIgual(p, PECA_2.primeiraDescida)));

  let corteTotalLabel = "Aguardando calibração";
  let corteNota =
    "Informe o comprimento real da chapa esticada da peça para liberar o corte desta configuração.";
  let corteLiberado = false;

  if (hasReal && exactRef && corteReal !== null) {
    corteTotalLabel = `${fmtCm(corteReal)} cm (${fmtCm(corteReal / 100)} m)`;
    corteNota =
      "Comprimento real informado para esta peça de referência. Não aplicar automaticamente a outras geometrias.";
    corteLiberado = true;
  } else if (hasReal) {
    corteNota =
      "A medição real só valida a configuração exata da peça de referência.";
  }

  return {
    valido,
    inclinacao,
    alturaFinal,
    queda,
    curvasLabel: valido ? `${fmtCm(m)} + ${fmtCm(m)} cm` : "—",
    status,
    statusKind,
    subtotal,
    formula:
      subtotal === null || inclinacao === null || alturaFinal === null
        ? "Inclinação e descida final precisam estar calibradas"
        : `${fmtCm(p)} + ${fmtCm(inclinacao)} + ${fmtCm(alturaFinal)} cm`,
    diferenca: hasReal && subtotal !== null && corteReal !== null ? corteReal - subtotal : null,
    corteTotalLabel,
    corteNota,
    corteLiberado,
    pecaReferencia,
  };
}
