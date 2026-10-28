import { formatMoeda } from "@/lib/funcionario-pagamento-display";
import { getPrisma } from "@/lib/db.server";
import {
  calcMinutosTrabalhados,
  ganhoDiaFromPonto,
  valorHoraFromDiario,
} from "@/lib/ponto-jornada";
import {
  formatDataPontoTz,
  formatHoraPontoTz,
  pontoAgoraSql,
  pontoDiaChave,
  pontoSerializarDatetime,
  parsePontoDatetime,
  PONTO_SQL_DT_RE,
} from "@/lib/ponto-timezone";

export {
  calcMinutosTrabalhados,
  ganhoDiaFromPonto,
  PONTO_MINUTOS_CARGA_DIA,
  valorHoraFromDiario,
} from "@/lib/ponto-jornada";

const PONTO_DT_SQL = `DATE_FORMAT(registrado_em, '%Y-%m-%d %H:%i:%s') AS registrado_em`;

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

export function pontoNormalizarTipo(tipo: string): string | null {
  const t = tipo.toLowerCase().trim();
  const map: Record<string, string> = {
    entrada: "entrada",
    almoco: "almoco",
    almoço: "almoco",
    retorno: "retorno_almoco",
    retorno_almoco: "retorno_almoco",
    saida: "saida",
    saída: "saida",
  };
  return map[t] ?? null;
}

export function pontoLabelTipo(tipo: string): string {
  switch (pontoNormalizarTipo(tipo)) {
    case "entrada":
      return "Entrada";
    case "almoco":
      return "Almoço";
    case "retorno_almoco":
      return "Retorno";
    case "saida":
      return "Saída";
    default:
      return tipo;
  }
}

export function pontoClasseBadge(tipo: string): string {
  switch (pontoNormalizarTipo(tipo)) {
    case "entrada":
      return "dash-ponto-tipo--entrada";
    case "almoco":
      return "dash-ponto-tipo--almoco";
    case "retorno_almoco":
      return "dash-ponto-tipo--retorno";
    case "saida":
      return "dash-ponto-tipo--saida";
    default:
      return "bg-secondary";
  }
}

async function ultimoRegistro(usuarioId: number) {
  const prisma = await getPrisma();
  const uid = int(usuarioId);
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, tipo, ${PONTO_DT_SQL} FROM funcionario_ponto
     WHERE usuario_id = ${uid} ORDER BY registrado_em DESC, id DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function pontoEstadoAtual(usuarioId: number) {
  const ultimo = await ultimoRegistro(usuarioId);
  const ultimoTipo = pontoNormalizarTipo(String(ultimo?.tipo ?? "")) ?? "";

  const estado = {
    status: "fora" as string,
    label: "Fora do expediente",
    proximo: "entrada",
    pode_entrada: true,
    pode_almoco: false,
    pode_retorno: false,
    pode_saida: false,
  };

  switch (ultimoTipo) {
    case "entrada":
      estado.status = "trabalhando";
      estado.label = "Em serviço — registre o almoço";
      estado.proximo = "almoco";
      estado.pode_entrada = false;
      estado.pode_almoco = true;
      break;
    case "almoco":
      estado.status = "almoco";
      estado.label = "No almoço — registre o retorno";
      estado.proximo = "retorno_almoco";
      estado.pode_retorno = true;
      break;
    case "retorno_almoco":
      estado.status = "trabalhando";
      estado.label = "Em serviço — registre a saída";
      estado.proximo = "saida";
      estado.pode_saida = true;
      break;
    default:
      break;
  }
  return estado;
}

export async function pontoHistoricoUsuario(usuarioId: number, limit = 30) {
  const prisma = await getPrisma();
  const uid = int(usuarioId);
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, tipo, ${PONTO_DT_SQL} FROM funcionario_ponto
     WHERE usuario_id = ${uid} ORDER BY registrado_em DESC LIMIT ${int(limit)}`,
  );
  return rows.map((r) => ({
    id: int(r.id),
    tipo: String(r.tipo),
    registrado_em: pontoSerializarDatetime(r.registrado_em),
  }));
}

export async function pontoRegistrar(
  usuarioId: number,
  tipoRaw: string,
): Promise<{ ok: boolean; message: string }> {
  const tipo = pontoNormalizarTipo(tipoRaw);
  if (!tipo) return { ok: false, message: "Tipo de registro inválido." };

  const estado = await pontoEstadoAtual(usuarioId);
  const permitido =
    (tipo === "entrada" && estado.pode_entrada) ||
    (tipo === "almoco" && estado.pode_almoco) ||
    (tipo === "retorno_almoco" && estado.pode_retorno) ||
    (tipo === "saida" && estado.pode_saida);

  if (!permitido) {
    return {
      ok: false,
      message: `Próximo passo: ${pontoLabelTipo(estado.proximo)}.`,
    };
  }

  const prisma = await getPrisma();
  const uid = int(usuarioId);
  const tipoEsc = esc(tipo);
  const agora = esc(pontoAgoraSql());
  await prisma.$executeRawUnsafe(
    `INSERT INTO funcionario_ponto (usuario_id, tipo, registrado_em) VALUES (${uid}, '${tipoEsc}', '${agora}')`,
  );

  const msgs: Record<string, string> = {
    entrada: "Entrada registrada com sucesso!",
    almoco: "Almoço registrado com sucesso!",
    retorno_almoco: "Retorno registrado com sucesso!",
    saida: "Saída registrada com sucesso!",
  };
  return { ok: true, message: msgs[tipo] ?? "Registrado!" };
}

export function formatDataHoraPonto(raw: string): { data: string; hora: string } {
  return {
    data: formatDataPontoTz(raw),
    hora: formatHoraPontoTz(raw),
  };
}

export function formatHoraPonto(raw: string | null): string {
  return formatHoraPontoTz(raw);
}

export function formatMinutosPonto(minutos: number | null): string {
  if (minutos === null || minutos < 0) return "—";
  if (minutos === 0) return "0min";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

function formatMoedaPonto(valor: number): string {
  if (valor <= 0) return "—";
  return formatMoeda(valor);
}

function calcMinutosAlmoco(almoco: string | null, retorno: string | null): number | null {
  if (!almoco || !retorno) return null;
  const a = parsePontoDatetime(almoco).getTime();
  const r = parsePontoDatetime(retorno).getTime();
  if (Number.isNaN(a) || Number.isNaN(r) || r <= a) return null;
  return Math.floor((r - a) / 60000);
}

function statusJornadaAberta(horas: {
  entrada: string | null;
  almoco: string | null;
  retorno: string | null;
  saida: string | null;
}): string {
  if (!horas.entrada) return "—";
  if (!horas.almoco) return "Aguardando almoço";
  if (!horas.retorno) return "No almoço";
  if (!horas.saida) return "Aguardando saída";
  return "Encerrado";
}

export type PontoRegistroAdmin = {
  id: number;
  usuario_id: number;
  usuario_nome: string;
  thumb: string;
  tipo: string;
  registrado_em: string;
};

export type PontoJornada = {
  usuario_id: number;
  usuario_nome: string;
  thumb: string;
  data: string;
  data_fmt: string;
  entrada_fmt: string;
  almoco_fmt: string;
  retorno_fmt: string;
  saida_fmt: string;
  entrada_id: number | null;
  almoco_id: number | null;
  retorno_id: number | null;
  saida_id: number | null;
  intervalo_fmt: string;
  total_fmt: string;
  minutos_trabalhados: number | null;
  valor_diario: number;
  valor_hora_fmt: string;
  ganho_dia_fmt: string;
  ganho_parcial: boolean;
  aberto: boolean;
  status_label: string;
};

export async function listarFuncionariosPonto() {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: unknown; nome: string; thumb: string }[]>(
    `SELECT id, nome, thumb FROM usuarios WHERE nivel IN ('funcionário', 'funcionario') ORDER BY nome ASC`,
  );
  return rows.map((r) => ({ id: int(r.id), nome: r.nome, thumb: String(r.thumb ?? "nao.png") }));
}

export async function mapaValorDiarioFuncionarios(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const uniq = [...new Set(ids.filter((id) => id > 0))];
  if (uniq.length === 0) return map;

  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: unknown; valor_diario: unknown }[]>(
    `SELECT id, valor_diario FROM usuarios WHERE id IN (${uniq.join(",")})`,
  );
  for (const r of rows) {
    map.set(int(r.id), Math.max(0, Number(r.valor_diario) || 0));
  }
  return map;
}

export async function buscarRegistrosAdmin(
  usuarioId: number | null,
  dataDe: string,
  dataAte: string,
): Promise<PontoRegistroAdmin[]> {
  const prisma = await getPrisma();
  const where = ["1=1"];
  if (usuarioId && usuarioId > 0) where.push(`p.usuario_id = ${int(usuarioId)}`);
  if (dataDe) where.push(`p.registrado_em >= '${esc(dataDe)} 00:00:00'`);
  if (dataAte) where.push(`p.registrado_em <= '${esc(dataAte)} 23:59:59'`);

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT p.id, p.usuario_id, p.tipo,
            DATE_FORMAT(p.registrado_em, '%Y-%m-%d %H:%i:%s') AS registrado_em,
            u.nome AS usuario_nome, u.thumb
     FROM funcionario_ponto p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.registrado_em DESC, p.id DESC
     LIMIT 500`,
  );
  return rows.map((r) => ({
    id: int(r.id),
    usuario_id: int(r.usuario_id),
    usuario_nome: String(r.usuario_nome ?? ""),
    thumb: String(r.thumb ?? "nao.png"),
    tipo: String(r.tipo),
    registrado_em: pontoSerializarDatetime(r.registrado_em),
  }));
}

export function montarJornadasAdmin(
  registros: PontoRegistroAdmin[],
  valorDiarioPorUsuario: Map<number, number> = new Map(),
): PontoJornada[] {
  const agora = pontoAgoraSql();
  const porChave = new Map<
    string,
    {
      usuario_id: number;
      usuario_nome: string;
      thumb: string;
      data: string;
      data_fmt: string;
      eventos: PontoRegistroAdmin[];
    }
  >();

  for (const r of registros) {
    const uid = r.usuario_id;
    const tipo = pontoNormalizarTipo(r.tipo);
    const dia = pontoDiaChave(r.registrado_em);
    if (uid <= 0 || !dia || !tipo) continue;
    const chave = `${uid}|${dia}`;
    if (!porChave.has(chave)) {
      porChave.set(chave, {
        usuario_id: uid,
        usuario_nome: r.usuario_nome,
        thumb: r.thumb,
        data: dia,
        data_fmt: formatDataPontoTz(r.registrado_em),
        eventos: [],
      });
    }
    porChave.get(chave)!.eventos.push(r);
  }

  const jornadas: PontoJornada[] = [];

  for (const grupo of porChave.values()) {
    grupo.eventos.sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));

    let atual: {
      entrada: string | null;
      almoco: string | null;
      retorno: string | null;
      saida: string | null;
      entrada_id: number | null;
      almoco_id: number | null;
      retorno_id: number | null;
      saida_id: number | null;
    } | null = null;

    const fechar = () => {
      if (!atual?.entrada) return;
      const aberto = Boolean(atual.entrada && !atual.saida);
      const minTrab = calcMinutosTrabalhados(
        atual.entrada,
        atual.almoco,
        atual.retorno,
        atual.saida,
        aberto ? agora : null,
      );
      const minAlm = calcMinutosAlmoco(atual.almoco, atual.retorno);
      const valorDiario = valorDiarioPorUsuario.get(grupo.usuario_id) ?? 0;
      const valorHora = valorHoraFromDiario(valorDiario);
      const ganhoDia = ganhoDiaFromPonto(valorDiario, minTrab);
      jornadas.push({
        usuario_id: grupo.usuario_id,
        usuario_nome: grupo.usuario_nome,
        thumb: grupo.thumb,
        data: grupo.data,
        data_fmt: grupo.data_fmt,
        entrada_fmt: formatHoraPonto(atual.entrada),
        almoco_fmt: formatHoraPonto(atual.almoco),
        retorno_fmt: formatHoraPonto(atual.retorno),
        saida_fmt: atual.saida ? formatHoraPonto(atual.saida) : "—",
        entrada_id: atual.entrada_id,
        almoco_id: atual.almoco_id,
        retorno_id: atual.retorno_id,
        saida_id: atual.saida_id,
        intervalo_fmt: formatMinutosPonto(minAlm),
        total_fmt: formatMinutosPonto(minTrab),
        minutos_trabalhados: minTrab,
        valor_diario: valorDiario,
        valor_hora_fmt: formatMoedaPonto(valorHora),
        ganho_dia_fmt: formatMoedaPonto(ganhoDia),
        ganho_parcial: aberto && ganhoDia > 0,
        aberto,
        status_label: aberto ? statusJornadaAberta(atual) : "Encerrado",
      });
      atual = null;
    };

    for (const ev of grupo.eventos) {
      const tipo = pontoNormalizarTipo(ev.tipo);
      const hora = ev.registrado_em;
      const evId = int(ev.id);
      if (!tipo || !hora) continue;
      switch (tipo) {
        case "entrada":
          fechar();
          atual = {
            entrada: hora,
            almoco: null,
            retorno: null,
            saida: null,
            entrada_id: evId,
            almoco_id: null,
            retorno_id: null,
            saida_id: null,
          };
          break;
        case "almoco":
          if (atual) {
            atual.almoco = hora;
            atual.almoco_id = evId;
          }
          break;
        case "retorno_almoco":
          if (atual) {
            atual.retorno = hora;
            atual.retorno_id = evId;
          }
          break;
        case "saida":
          if (atual) {
            atual.saida = hora;
            atual.saida_id = evId;
            fechar();
          }
          break;
      }
    }
    fechar();
  }

  jornadas.sort((a, b) => {
    const c = b.data.localeCompare(a.data);
    return c !== 0 ? c : a.usuario_nome.localeCompare(b.usuario_nome);
  });
  return jornadas;
}

export async function apagarJornadaPonto(
  usuarioId: number,
  dataIso: string,
): Promise<{ ok: boolean; message: string; removidos: number }> {
  const uid = int(usuarioId);
  if (uid <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) {
    return { ok: false, message: "Jornada inválida.", removidos: 0 };
  }

  const prisma = await getPrisma();
  const de = esc(`${dataIso} 00:00:00`);
  const ate = esc(`${dataIso} 23:59:59`);

  const antes = await prisma.$queryRawUnsafe<{ n: unknown }[]>(
    `SELECT COUNT(*) AS n FROM funcionario_ponto
     WHERE usuario_id = ${uid}
       AND registrado_em >= '${de}' AND registrado_em <= '${ate}'`,
  );
  const removidos = int(antes[0]?.n);
  if (removidos <= 0) {
    return { ok: false, message: "Nenhum registro encontrado nesta jornada.", removidos: 0 };
  }

  await prisma.$executeRawUnsafe(
    `DELETE FROM funcionario_ponto
     WHERE usuario_id = ${uid}
       AND registrado_em >= '${de}' AND registrado_em <= '${ate}'`,
  );

  return {
    ok: true,
    message:
      removidos === 1
        ? "1 registro da jornada excluído."
        : `${removidos} registros da jornada excluídos.`,
    removidos,
  };
}

export async function criarRegistroPontoAdmin(
  usuarioId: number,
  tipoRaw: string,
  registradoEm: string,
): Promise<{ ok: boolean; message: string; id?: number }> {
  const tipo = pontoNormalizarTipo(tipoRaw);
  if (!tipo) return { ok: false, message: "Tipo de registro inválido." };

  const uid = int(usuarioId);
  if (uid <= 0) return { ok: false, message: "Funcionário inválido." };

  const sql = pontoSerializarDatetime(registradoEm);
  if (!PONTO_SQL_DT_RE.test(sql)) {
    return { ok: false, message: "Data ou hora inválida." };
  }

  const prisma = await getPrisma();
  const user = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT id FROM usuarios WHERE id = ${uid} LIMIT 1`,
  );
  if (!user[0]) return { ok: false, message: "Funcionário não encontrado." };

  const tipoEsc = esc(tipo);
  const emEsc = esc(sql);
  await prisma.$executeRawUnsafe(
    `INSERT INTO funcionario_ponto (usuario_id, tipo, registrado_em) VALUES (${uid}, '${tipoEsc}', '${emEsc}')`,
  );

  const inserted = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT LAST_INSERT_ID() AS id`,
  );
  const id = int(inserted[0]?.id);

  return { ok: true, message: "Registro criado.", id: id > 0 ? id : undefined };
}

export async function atualizarRegistroPonto(
  id: number,
  registradoEm: string,
): Promise<{ ok: boolean; message: string }> {
  const regId = int(id);
  const sql = pontoSerializarDatetime(registradoEm);
  if (regId <= 0) return { ok: false, message: "Registro inválido." };
  if (!PONTO_SQL_DT_RE.test(sql)) {
    return { ok: false, message: "Data ou hora inválida." };
  }

  const prisma = await getPrisma();
  const row = await prisma.$queryRawUnsafe<{ id: unknown; tipo: string }[]>(
    `SELECT id, tipo FROM funcionario_ponto WHERE id = ${regId} LIMIT 1`,
  );
  if (!row[0]) return { ok: false, message: "Registro não encontrado." };

  const tipo = pontoNormalizarTipo(String(row[0].tipo));
  if (!tipo) return { ok: false, message: "Tipo de registro inválido." };

  const emEsc = esc(sql);
  await prisma.$executeRawUnsafe(
    `UPDATE funcionario_ponto SET registrado_em = '${emEsc}' WHERE id = ${regId} LIMIT 1`,
  );

  return { ok: true, message: "Horário atualizado." };
}

export async function apagarRegistroPonto(id: number): Promise<{ ok: boolean; message: string }> {
  const regId = int(id);
  if (regId <= 0) return { ok: false, message: "Registro inválido." };

  const prisma = await getPrisma();
  const exists = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT id FROM funcionario_ponto WHERE id = ${regId} LIMIT 1`,
  );
  if (!exists[0]) return { ok: false, message: "Registro não encontrado." };

  await prisma.$executeRawUnsafe(`DELETE FROM funcionario_ponto WHERE id = ${regId} LIMIT 1`);
  return { ok: true, message: "Registro de ponto excluído." };
}
