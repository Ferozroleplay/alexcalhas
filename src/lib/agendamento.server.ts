import type { PrismaClient } from "@prisma/client";

import {
  filtrarHorariosLivres,
  minutosDeHora,
  VISITA_PRIMEIRO_MIN,
} from "@/lib/agendamento-horarios";
import { getPrisma } from "@/lib/db.server";
import {
  extrairHoraDeDataVisita,
  formatHoraVisitaExibicao,
  resolveHoraVisitaInventario,
} from "@/lib/inventario-format";
import { parseOrcamentoJson, valorOrcamentoParaExibicao } from "@/lib/orcamento.server";
import { pontoHojeIso } from "@/lib/ponto-timezone";
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

/** Data da visita (BR, ISO ou com hora) → YYYY-MM-DD. */
export function dataVisitaParaIso(raw: string): string | null {
  const t = String(raw ?? "").trim();
  const br = /^(\d{2})-(\d{2})-(\d{4})/.exec(t);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function dataInputParaDb(isoDate: string): string {
  if (!isoDate.trim()) return "";
  return toDataVisitaBr(isoDate);
}

/** Hora atual (America/Sao_Paulo) — fallback de hora-visita e piso do encaixe no dia. */
export function agendamentoHoraAtualBr(): string {
  return new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Só visita em aberto trava a grade. Orçamento, obra e exclusão liberam o horário. */
const STATUS_OCUPA_GRADE = ["agendado"] as const;

async function minutosOcupadosNoDia(prisma: PrismaClient, dataBr: string): Promise<number[]> {
  const rows = await prisma.inventario.findMany({
    where: {
      AND: [
        {
          OR: [{ dataVisita: dataBr }, { dataVisita: { startsWith: `${dataBr} ` } }],
        },
        {
          status: { in: [...STATUS_OCUPA_GRADE] },
        },
      ],
    },
    select: { horaVisita: true, dataVisita: true },
  });

  const ocupados: number[] = [];
  for (const row of rows) {
    const min = minutosOcupadosDaLinha(row);
    if (min != null) ocupados.push(min);
  }
  return ocupados;
}

function minutosOcupadosDaLinha(row: { horaVisita?: string | null; dataVisita?: string | null }): number | null {
  return (
    minutosDeHora(String(row.horaVisita ?? "")) ??
    minutosDeHora(extrairHoraDeDataVisita(String(row.dataVisita ?? "")))
  );
}

/**
 * Horários livres no dia (08:00–18:00), sempre 2h depois de qualquer visita já marcada.
 * Hoje ignora horários que já passaram.
 */
export async function horariosLivresVisita(
  prisma: PrismaClient,
  dataIso: string,
): Promise<string[]> {
  const dataBr = toDataVisitaBr(dataIso);
  if (!/^\d{2}-\d{2}-\d{4}$/.test(dataBr)) return [];
  if (dataIso < pontoHojeIso()) return [];

  const ocupados = await minutosOcupadosNoDia(prisma, dataBr);
  let piso = VISITA_PRIMEIRO_MIN;
  if (dataIso === pontoHojeIso()) {
    const agora = minutosDeHora(agendamentoHoraAtualBr()) ?? piso;
    piso = Math.max(piso, agora);
  }
  return filtrarHorariosLivres(ocupados, piso);
}

export async function proximoHorarioLivreVisita(
  prisma: PrismaClient,
  dataIso: string,
): Promise<string | null> {
  const livres = await horariosLivresVisita(prisma, dataIso);
  return livres[0] ?? null;
}

/** Horários livres de cada dia do mês (YYYY-MM) para pintar o calendário. */
export async function horariosLivresNoMes(
  prisma: PrismaClient,
  anoMes: string,
): Promise<Record<string, string[]>> {
  const m = /^(\d{4})-(\d{2})$/.exec(anoMes.trim());
  if (!m) return {};
  const yyyy = m[1];
  const mm = m[2];
  const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
  if (!lastDay) return {};

  const hoje = pontoHojeIso();
  const agora = minutosDeHora(agendamentoHoraAtualBr()) ?? VISITA_PRIMEIRO_MIN;
  const sufixoBr = `-${mm}-${yyyy}`;
  const prefixoIso = `${yyyy}-${mm}-`;

  const rows = await prisma.inventario.findMany({
    where: {
      AND: [
        {
          OR: [
            { dataVisita: { contains: sufixoBr } },
            { dataVisita: { startsWith: prefixoIso } },
          ],
        },
        {
          status: { in: [...STATUS_OCUPA_GRADE] },
        },
      ],
    },
    select: { horaVisita: true, dataVisita: true },
  });

  const ocupadosPorDia = new Map<string, number[]>();
  for (const row of rows) {
    const iso = dataVisitaParaIso(String(row.dataVisita ?? ""));
    if (!iso || !iso.startsWith(prefixoIso)) continue;
    const min = minutosOcupadosDaLinha(row);
    if (min == null) continue;
    const lista = ocupadosPorDia.get(iso) ?? [];
    lista.push(min);
    ocupadosPorDia.set(iso, lista);
  }

  const dias: Record<string, string[]> = {};
  for (let d = 1; d <= lastDay; d++) {
    const iso = `${prefixoIso}${String(d).padStart(2, "0")}`;
    if (iso < hoje) {
      dias[iso] = [];
      continue;
    }
    const piso = iso === hoje ? Math.max(VISITA_PRIMEIRO_MIN, agora) : VISITA_PRIMEIRO_MIN;
    dias[iso] = filtrarHorariosLivres(ocupadosPorDia.get(iso) ?? [], piso);
  }
  return dias;
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
export function serializeInventario(row: any, opts?: { incluirItens?: boolean }) {
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
    orcamentoItens: opts?.incluirItens === false ? undefined : orcamentoItens,
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

let inventarioTextosProntos = false;

/** Nome/endereço no dump legado são VARCHAR(50) e cortam ViaCEP. */
export async function ensureInventarioTextosCliente(): Promise<void> {
  if (inventarioTextosProntos) return;
  const prisma = await getPrisma();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ len: unknown }>>(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS len
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'inventario'
         AND COLUMN_NAME = 'endereco'
       LIMIT 1`,
    );
    if (Number(rows[0]?.len ?? 0) >= 180) {
      inventarioTextosProntos = true;
      return;
    }
  } catch {
    /* tenta o ALTER mesmo assim */
  }
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE inventario
        MODIFY COLUMN nome VARCHAR(120) NOT NULL,
        MODIFY COLUMN endereco VARCHAR(180) NOT NULL,
        MODIFY COLUMN bairro VARCHAR(80) NOT NULL
    `);
  } catch (err) {
    console.error("[inventario] alargar nome/endereço", err);
  }
  inventarioTextosProntos = true;
}

export function buildInventarioCreateData(
  data: AgendamentoInput | AgendamentoSiteInput,
  funcionarioId?: number | null,
) {
  return {
    status: "agendado",
    nome: data.nome.slice(0, 120),
    telefone: data.telefone.slice(0, 50),
    cpfCnpj: data.cpfCnpj?.trim() || null,
    endereco: data.endereco.slice(0, 180),
    bairro: data.bairro.slice(0, 80),
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

export async function excluirInventario(prisma: PrismaClient, id: number): Promise<void> {
  const invId = Math.trunc(id);
  if (!Number.isFinite(invId) || invId < 1) return;
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM inventario_recebimento WHERE inventario_id = ${invId}`);
  } catch {
    /* tabela pode não existir */
  }
  await prisma.inventario.delete({ where: { id: invId } });
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
