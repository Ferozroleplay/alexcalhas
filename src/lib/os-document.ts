import type { AgendamentoItem } from "@/lib/admin-api";
import type { OrcamentoLinha } from "@/lib/orcamento.server";
import { parseFormaPagamento, calcularCreditoMaquininha } from "@/lib/orcamento.server";

/** Dados fixos da empresa no orçamento. */
export const OS_ORCAMENTO_EMPRESA = {
  tagline: "Calhas • Rufos • Pingadeiras",
  telefone1: "(18) 99757-8060",
  telefone2: "(18) 99757-8060",
  whatsapp: "18 996475269  996069273",
  cnpj: "28.376.837/0001-59",
  ie: "731.021.804.118",
  enderecoLinha1: "Rua Angelim, 137",
  enderecoLinha2: "Parque Industrial",
  cidade: "Tarumã/SP",
  logoSrc: "/images/logo/logo-preto.png",
  pixQrSrc: "/images/Pix%20Qrcod/qrcod.jpeg",
  chavePix: "contato@alexcalhas.com",
  assinaturaSrc: "/images/Pix%20Qrcod/Assinatura.png",
  assinaturaNome: "Alex Calhas",
  assinaturaCargo: "Responsável pela empresa",
  validadeProposta: "30 dias",
  condicaoPagamentoPadrao: "50% de sinal + 50% na instalação",
} as const;

export function formatOsMoney(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatOsTelefone(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  if (d.length < 10) return telefone.trim() || "—";
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}

export function formatOsDocumento(doc: string | null | undefined): string {
  const d = (doc ?? "").replace(/\D/g, "");
  if (!d || d === "00000000000" || d === "00000000000000") return "—";
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc?.trim() || "—";
}

export function formatOsEndereco(item: AgendamentoItem): string {
  const parts = [item.endereco, item.numero, item.bairro].filter(Boolean);
  const base = parts.join(", ");
  const cep = (item.cep ?? "").trim();
  if (!base && !cep) return "—";
  return cep ? `${base} — ${cep}` : base;
}

/** Quantidade na linha do PDF (metros ≤ 0 → 1). */
export function quantidadeLinhaOrcamento(linha: OrcamentoLinha): number {
  const qtd = Number(linha.metros) || 0;
  return qtd > 0 ? qtd : 1;
}

export function totalLinhaOrcamento(linha: OrcamentoLinha): number {
  const unit = Number(linha.valor) || 0;
  return Math.round(quantidadeLinhaOrcamento(linha) * unit * 100) / 100;
}

export function subtotalOrcamentoDocumento(itens: OrcamentoLinha[]): number {
  let total = 0;
  for (const linha of itens) {
    total += totalLinhaOrcamento(linha);
  }
  return Math.round(total * 100) / 100;
}

export function calcTotaisOrcamento(itens: OrcamentoLinha[], valorFinal: number) {
  const bruto = subtotalOrcamentoDocumento(itens);
  const valor = Number(valorFinal) || 0;
  let total = bruto;
  if (valor > 0 && valor <= bruto + 0.009) {
    total = Math.round(valor * 100) / 100;
  }
  const desconto = Math.round(Math.max(0, bruto - total) * 100) / 100;
  return { subtotalMateriais: bruto, bruto, desconto, total };
}

export function dataEmissaoOs(): { data: string; hora: string } {
  const now = new Date();
  const data = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return { data, hora };
}

export function condicaoPagamentoExibicao(item: AgendamentoItem): string {
  const pag = parseFormaPagamento(item.formaPagamento);
  if (pag.forma === "pix") return "PIX";
  if (pag.forma === "debito") return "Débito";
  if (pag.forma === "credito") {
    const base = pag.qtdParcelas > 1 ? `Crédito em ${pag.qtdParcelas}x` : "Crédito à vista";
    const { comTaxa } = calcularCreditoMaquininha(
      Number(item.valor) || 0,
      pag.qtdParcelas,
      pag.taxaMaquininhaPct,
      pag.parcelasSemJuros,
    );
    if (comTaxa) {
      return `${base} (taxa maquininha ${pag.taxaMaquininhaPct.toLocaleString("pt-BR")}%)`;
    }
    return base;
  }

  const fp = item.formaPagamento?.trim();
  if (fp) return fp;
  return OS_ORCAMENTO_EMPRESA.condicaoPagamentoPadrao;
}

export function resumoCreditoOrcamento(item: AgendamentoItem): {
  acrescimoMaquininha: number;
  totalCartao: number;
  comTaxa: boolean;
} {
  const pag = parseFormaPagamento(item.formaPagamento);
  const totalBase = Number(item.valor) || 0;
  const calc = calcularCreditoMaquininha(
    totalBase,
    pag.qtdParcelas,
    pag.taxaMaquininhaPct,
    pag.parcelasSemJuros,
  );
  return {
    acrescimoMaquininha: calc.acrescimo,
    totalCartao: calc.totalFinal,
    comTaxa: calc.comTaxa,
  };
}

export function observacaoExibicao(item: AgendamentoItem): string {
  const obs = item.observacao?.trim();
  if (obs) return obs;
  return OS_ORCAMENTO_EMPRESA.condicaoPagamentoPadrao;
}
