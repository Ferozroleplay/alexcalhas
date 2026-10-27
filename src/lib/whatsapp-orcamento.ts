import { telefoneWhatsappLink } from "@/lib/format-br";
import { dashAlert } from "@/lib/dash-ui";

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
  const wa = telefoneWhatsappLink(item.telefone);
  if (!wa) {
    void dashAlert({ message: "Telefone inválido para WhatsApp.", variant: "warning" });
    return;
  }
  const primeiro = item.nome.trim().split(/\s+/)[0] || "";
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const v = item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const link = `${window.location.origin}/os?id=${item.id}`;
  const text = `${saudacao} Segue o orçamento da *Alex Calhas* no valor de *${v}*:\n${link}`;
  window.open(`${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
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
  const wa = telefoneWhatsappLink(item.telefone);
  if (!wa) {
    void dashAlert({ message: "Telefone inválido para WhatsApp.", variant: "warning" });
    return;
  }
  const text = mensagemWhatsappCobranca(item);
  window.open(`${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}
