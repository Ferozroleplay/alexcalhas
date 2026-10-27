import { telefoneWhatsappLink } from "@/lib/format-br";
import { dashAlert } from "@/lib/dash-ui";

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || "";
}

function horaSaoPaulo(): number {
  const hora = new Date().toLocaleTimeString("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  });
  return Number.parseInt(hora.slice(0, 2), 10);
}

/** Bom dia até 11h, boa tarde até 17h, boa noite no restante (horário de São Paulo). */
export function saudacaoPeriodoDia(): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hora = horaSaoPaulo();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function abrirWhatsappComTexto(telefone: string, text: string): void {
  const wa = telefoneWhatsappLink(telefone);
  if (!wa) {
    void dashAlert({ message: "Telefone inválido para WhatsApp.", variant: "warning" });
    return;
  }
  window.open(`${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

export function mensagemWhatsappVisita(nome: string): string {
  const primeiro = primeiroNome(nome);
  const saudacao = saudacaoPeriodoDia();
  const oi = primeiro ? `${saudacao}, ${primeiro}!` : `${saudacao}!`;
  return (
    `${oi} Tudo bem?\n\n` +
    `Aqui é da *Alex Calhas*. Estamos indo até o local para fazer o orçamento.\n\n` +
    `Qualquer coisa é só chamar. Até já!`
  );
}

export function abrirWhatsappVisita(item: { nome: string; telefone: string }): void {
  abrirWhatsappComTexto(item.telefone, mensagemWhatsappVisita(item.nome));
}

export function mensagemWhatsappOrcamento(nome: string, valor: number, comLink = true): string {
  const primeiro = nome.trim().split(/\s+/)[0] || "";
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const v = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const base = `${saudacao} Segue o orçamento da *Alex Calhas* no valor de *${v}*.`;
  if (!comLink) return base;
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/os?id=${encodeURIComponent(String(""))}`
      : "";
  return `${base}\n${link}`;
}

export function abrirWhatsappOrcamento(item: {
  id: number;
  nome: string;
  telefone: string;
  valor: number;
}): void {
  const primeiro = primeiroNome(item.nome);
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const v = item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const link = `${window.location.origin}/os?id=${item.id}`;
  const text = `${saudacao} Segue o orçamento da *Alex Calhas* no valor de *${v}*:\n${link}`;
  abrirWhatsappComTexto(item.telefone, text);
}

export function gerarOS(id: number): void {
  window.open(`/os?id=${id}`, "_blank", "noopener,noreferrer");
}

export function mensagemWhatsappCobranca(opts: {
  nome: string;
  saldo: number;
  diasAtraso: number;
}): string {
  const primeiro = opts.nome.trim().split(/\s+/)[0] || "";
  const saudacao = primeiro ? `Olá, ${primeiro}! Tudo bem?` : "Olá! Tudo bem?";
  const v = opts.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const atraso =
    opts.diasAtraso <= 0
      ? "com o serviço já concluído"
      : opts.diasAtraso === 1
        ? "há 1 dia"
        : `há ${opts.diasAtraso} dias`;
  return (
    `${saudacao}\n\n` +
    `Aqui é da *Alex Calhas*. O serviço já foi finalizado e ficou um saldo de *${v}* em aberto (${atraso}).\n\n` +
    `Quando puder, nos avise para combinarmos o pagamento. Qualquer dúvida estamos à disposição.\n\n` +
    `Obrigado!`
  );
}

export function abrirWhatsappCobranca(item: {
  nome: string;
  telefone: string;
  saldo: number;
  diasAtraso: number;
}): void {
  abrirWhatsappComTexto(item.telefone, mensagemWhatsappCobranca(item));
}
