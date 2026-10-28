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
const SPAN_D = PECA_1.deslocamento - PECA_2.deslocamento;
const SPAN_I = PECA_1.inclinacao - PECA_2.inclinacao;
const SPAN_Q = PECA_1.queda - PECA_2.queda;

export function fmtCm(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function quaseIgual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

function tDeslocamento(d: number): number {
  return (d - PECA_2.deslocamento) / SPAN_D;
}

function estimarQueda(d: number): number {
  return Math.max(0, PECA_2.queda + SPAN_Q * tDeslocamento(d));
}

function estimarInclinacao(d: number, queda: number): number {
  const noIntervaloCalibrado = d > PECA_2.deslocamento && d < PECA_1.deslocamento;
  if (noIntervaloCalibrado) {
    return PECA_2.inclinacao + SPAN_I * tDeslocamento(d);
  }
  return Math.hypot(d, queda);
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
  const mesmaSecao = valido && quaseIgual(w, 6) && quaseIgual(m, 4.5);

  if (!valido) {
    status = "Preencha medidas válidas, com altura total maior que a primeira descida.";
    statusKind = "error";
  } else if (mesmaSecao && quaseIgual(d, PECA_1.deslocamento)) {
    inclinacao = PECA_1.inclinacao;
    queda = PECA_1.queda;
    alturaFinal = h - p - queda;
    pecaReferencia = 1;
    status =
      "Inclinação e queda de referência da peça 1. A altura final foi calculada com a queda de referência de 20 cm; valide se alterar a primeira descida.";
    statusKind = "ok";
  } else if (mesmaSecao && quaseIgual(d, PECA_2.deslocamento)) {
    inclinacao = PECA_2.inclinacao;
    queda = PECA_2.queda;
    alturaFinal = h - p - queda;
    pecaReferencia = 2;
    status =
      "Inclinação e queda de referência da peça 2. A altura final foi calculada com a queda de referência de 18 cm; valide se alterar a primeira descida.";
    statusKind = "ok";
  } else {
    queda = estimarQueda(d);
    inclinacao = estimarInclinacao(d, queda);
    alturaFinal = h - p - queda;
    const noIntervalo = d > PECA_2.deslocamento && d < PECA_1.deslocamento;
    status = noIntervalo
      ? "ESTIMATIVA por interpolação entre duas peças reais. Confira na obra antes de cortar."
      : "ESTIMATIVA pela geometria (horizontal e queda). Qualquer medida entra; confira na peça antes de cortar.";
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
        ? "Preencha as medidas da obra para somar a referência"
        : `${fmtCm(p)} + ${fmtCm(inclinacao)} + ${fmtCm(alturaFinal)} cm`,
    diferenca: hasReal && subtotal !== null && corteReal !== null ? corteReal - subtotal : null,
    corteTotalLabel,
    corteNota,
    corteLiberado,
    pecaReferencia,
  };
}
