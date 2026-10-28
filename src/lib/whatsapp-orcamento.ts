import { telefoneWhatsappLink } from "@/lib/format-br";
import { dashAlert } from "@/lib/dash-ui";
import { OS_ORCAMENTO_EMPRESA } from "@/lib/os-document";

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

function telefoneWhatsappDigits(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits.replace(/^0+/, "")}`;
}

export function abrirWhatsappComTexto(telefone: string, text: string, janela?: string): boolean {
  const wa = telefoneWhatsappLink(telefone);
  if (!wa) {
    void dashAlert({ message: "Telefone inválido para WhatsApp.", variant: "warning" });
    return false;
  }
  const url = `${wa}?text=${encodeURIComponent(text)}`;
  const alvo = janela?.trim() || "_blank";
  const popup = janela
    ? window.open(url, alvo)
    : window.open(url, "_blank", "noopener,noreferrer");
  return popup !== null;
}

const JANELA_AVISO = "alexcalhas_aviso";
let avisoWin: Window | null = null;

function janelaAvisoViva(): Window | null {
  if (avisoWin && !avisoWin.closed) return avisoWin;
  avisoWin = null;
  return null;
}

function navegarJanelaAviso(url: string): boolean {
  const viva = janelaAvisoViva();
  if (viva) {
    try {
      (viva as unknown as { location: string }).location = url;
      viva.focus();
      return true;
    } catch {
      /* tenta reabrir pelo nome */
    }
  }
  const aberta = window.open(url, JANELA_AVISO, "width=480,height=340");
  avisoWin = aberta;
  return Boolean(aberta && !aberta.closed);
}

/** Abre a janelinha da fila no clique (gesto do usuário). Sem isso o navegador bloqueia o resto. */
export function abrirJanelaAvisoFila(): boolean {
  const viva = janelaAvisoViva();
  if (viva) {
    viva.focus();
    return true;
  }
  return navegarJanelaAviso(`${window.location.origin}/aviso-wa.html`);
}

export function fecharJanelaAvisoFila(): void {
  try {
    janelaAvisoViva()?.close();
  } catch {
    /* ignore */
  }
  avisoWin = null;
}

/**
 * Troca o cliente na janela da fila (mesma janela, sem pop-up novo).
 * A página aviso-wa.html dispara o WhatsApp instalado no computador.
 */
export function abrirWhatsappFila(telefone: string, text: string, nome = ""): boolean {
  const phone = telefoneWhatsappDigits(telefone);
  if (!phone) {
    void dashAlert({ message: "Telefone inválido para WhatsApp.", variant: "warning" });
    return false;
  }
  const params = new URLSearchParams({
    phone,
    text,
    nome: nome.trim().split(/\s+/)[0] || "",
    t: String(Date.now()),
  });
  return navegarJanelaAviso(`${window.location.origin}/aviso-wa.html?${params.toString()}`);
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

const SITE_PUBLIC_ORIGIN = "https://www.alexcalhas.com";

export function osPublicPath(id: number, _token?: string | null): string {
  return `/os?id=${Math.trunc(id)}`;
}

function origemLinkOrcamento(): string {
  if (typeof window === "undefined") return SITE_PUBLIC_ORIGIN;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  return SITE_PUBLIC_ORIGIN;
}

function osPublicUrl(id: number, token?: string | null): string {
  return `${origemLinkOrcamento()}${osPublicPath(id, token)}`;
}

function dataBrAmigavel(data: string | null | undefined): string {
  const t = String(data ?? "").trim();
  const br = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  if (br) return `${br[1].padStart(2, "0")}/${br[2].padStart(2, "0")}/${br[3]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return t;
}

export function mensagemWhatsappOrcamento(nome: string, valor: number, comLink = true): string {
  const primeiro = primeiroNome(nome);
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const v = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const base = `${saudacao} Segue o orçamento da *Alex Calhas* no valor de *${v}*.`;
  if (!comLink) return base;
  return base;
}

export function abrirWhatsappOrcamento(item: {
  id: number;
  nome: string;
  telefone: string;
  valor: number;
  osToken?: string | null;
}): void {
  const primeiro = primeiroNome(item.nome);
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const v = item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const link = osPublicUrl(item.id, item.osToken);
  const text = `${saudacao} Segue o orçamento da *Alex Calhas* no valor de *${v}*:\n${link}`;
  abrirWhatsappComTexto(item.telefone, text);
}

export function mensagemWhatsappMontagem(nome: string, dataMontagem?: string | null): string {
  const primeiro = primeiroNome(nome);
  const saudacao = saudacaoPeriodoDia();
  const oi = primeiro ? `${saudacao}, ${primeiro}!` : `${saudacao}!`;
  const quando = dataBrAmigavel(dataMontagem);
  const dataLinha = quando
    ? `Confirmamos a montagem para *${quando}*.`
    : "Confirmamos a data da montagem.";
  return (
    `${oi} Tudo bem?\n\n` +
    `Aqui é da *Alex Calhas*. ${dataLinha}\n\n` +
    `Qualquer coisa é só chamar. Até já!`
  );
}

export function abrirWhatsappMontagem(item: {
  nome: string;
  telefone: string;
  dataMontagem?: string | null;
}): void {
  abrirWhatsappComTexto(item.telefone, mensagemWhatsappMontagem(item.nome, item.dataMontagem));
}

export function gerarOS(id: number, token?: string | null): void {
  window.open(osPublicPath(id, token), "_blank", "noopener,noreferrer");
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
    `PIX: ${OS_ORCAMENTO_EMPRESA.chavePix}\n\n` +
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
