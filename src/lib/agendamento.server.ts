import type { PrismaClient } from "@prisma/client";

import {
  formatHoraVisitaExibicao,
  resolveHoraVisitaInventario,
} from "@/lib/inventario-format";
import { parseOrcamentoJson, valorOrcamentoParaExibicao } from "@/lib/orcamento.server";
import type { AgendamentoInput, AgendamentoSiteInput } from "@/lib/validation";

export { INVENTARIO_STATUS, type InventarioStatus } from "@/lib/agendamento-constants";

/** Converte YYYY-MM-DD (input date) → DD-MM-YYYY (banco legado). */
export function toDataVisitaBr(isoDate: string): string {
  const [y, m, d] = isoDate.trim().split("-");
  if (!y || !m || !d) return isoDate;
  return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
}

/** Converte DD-MM-YYYY → YYYY-MM-DD (input date). */
export function dataBrParaInput(data: string): string {
  const t = data.trim();
  const m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return t;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function dataInputParaDb(isoDate: string): string {
  if (!isoDate.trim()) return "";
  return toDataVisitaBr(isoDate);
}

/** Hora atual (America/Sao_Paulo) — quando o cliente agenda pelo site sem informar horário. */
export function agendamentoHoraAtualBr(): string {
  return new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Normaliza hora do formulário (input time) para gravar em hora-visita (HH:MM). */
export function normalizarHoraVisitaDb(horaRaw: string): string {
  const fmt = formatHoraVisitaExibicao(horaRaw.trim());
  return (fmt || agendamentoHoraAtualBr()).slice(0, 50);
}

function horaInformadaNoPayload(data: AgendamentoInput | AgendamentoSiteInput): string {
  return "hora" in data && typeof data.hora === "string" ? data.hora.trim() : "";
}

/** Preenche hora-visita vazia no banco a partir de agendado_em / data (máx. por requisição). */
export async function backfillInventarioHorasVazias(
  prisma: PrismaClient,
  rows: { id: number; status: string; horaVisita: string; dataVisita: string }[],
  limit = 40,
): Promise<void> {
  let gravados = 0;
  for (const row of rows) {
    if (gravados >= limit) break;
    if (String(row.horaVisita ?? "").trim()) continue;

    const resolvida = resolveHoraVisitaInventario({
      horaVisita: row.horaVisita,
      dataVisita: row.dataVisita,
      status: row.status,
    });
    if (!resolvida) continue;

    try {
      await prisma.inventario.update({
        where: { id: row.id },
        data: { horaVisita: resolvida },
      });
      row.horaVisita = resolvida;
      gravados++;
    } catch {
      /* coluna ou permissão — exibição ainda usa resolve na serialização */
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeInventario(row: any) {
  const orcamentoItens = parseOrcamentoJson(row.orcamento);
  const valorGravado = row.valor != null ? Number(row.valor) : 0;
  const descontoPercent = row.descontoPercent != null ? Number(row.descontoPercent) : 0;
  const valor =
    orcamentoItens.length > 0
      ? valorOrcamentoParaExibicao(valorGravado, descontoPercent, orcamentoItens)
      : valorGravado;

  return {
    id: Number(row.id),
    status: row.status,
    nome: row.nome,
    cpfCnpj: row.cpfCnpj ?? null,
    telefone: row.telefone,
    endereco: row.endereco,
    bairro: row.bairro,
    cep: row.cep ?? "",
    numero: row.numero,
    dataVisita: row.dataVisita,
    horaVisita: resolveHoraVisitaInventario({
      horaVisita: row.horaVisita,
      dataVisita: row.dataVisita,
      status: row.status,
    }),
    observacao: row.observacao ?? null,
    funcionario: row.funcionario ?? null,
    valor,
    descontoPercent,
    formaPagamento: row.formaPagamento ?? null,
    dataMontagem: row.dataMontagem ?? null,
    orcamentoItens,
    materiaisCount: orcamentoItens.length,
  };
}

export function inventarioWhereStatus(status?: string) {
  if (!status) return undefined;
  if (status === "orcamentado") {
    return { OR: [{ status: "orcamentado" }, { status: "orçamentado" }] };
  }
  if (status === "pendencias") {
    return { status: "finalizado" };
  }
  return { status };
}

export function buildInventarioCreateData(
  data: AgendamentoInput | AgendamentoSiteInput,
  funcionarioId?: number | null,
) {
  return {
    status: "agendado",
    nome: data.nome.slice(0, 50),
    telefone: data.telefone.slice(0, 50),
    cpfCnpj: data.cpfCnpj?.trim() || null,
    endereco: data.endereco.slice(0, 50),
    bairro: data.bairro.slice(0, 50),
    numero: data.numero.slice(0, 50),
    cep: (data.cep?.trim() || "").slice(0, 50),
    dataVisita: toDataVisitaBr(data.data),
    horaVisita: normalizarHoraVisitaDb(horaInformadaNoPayload(data) || agendamentoHoraAtualBr()),
    observacao: data.observacao?.trim() || null,
    funcionario: funcionarioId ?? null,
    valor: 0,
    descontoPercent: 0,
    formaPagamento: null,
    dataMontagem: null,
    orcamento: null,
  };
}

export function dbErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("Authentication failed") || msg.includes("credentials")) {
    return "Senha ou usuário do MySQL incorretos. Confira DB_HOST (193.203.175.84), DB_USER, DB_PASSWORD e DB_NAME — no .env local ou nas variáveis da Vercel (Settings → Environment Variables) e faça redeploy.";
  }
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    if (code === "P1000") {
      return "MySQL recusou usuário/senha. Corrija DB_PASSWORD no .env com a senha definida na Hostinger para esse banco.";
    }
    if (code === "P1001") {
      return "Não foi possível alcançar o MySQL. Libere acesso remoto ao IP do seu PC na Hostinger ou teste pelo servidor de hospedagem.";
    }
    if (code === "P2021" || code === "P2022") {
      return "Estrutura do banco desatualizada. No servidor, rode: node scripts/migrar-agendado-em.mjs (ou peça suporte para atualizar o MySQL).";
    }
  }
  return err instanceof Error ? err.message : "Erro no banco de dados.";
}
