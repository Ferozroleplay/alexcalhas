import { getPrisma } from "@/lib/db.server";

export type FornecedorRow = {
  id: number;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  email: string | null;
  telefone: string | null;
  contato_nome: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacao: string | null;
};

export type EntregaListaRow = {
  id: number;
  fornecedor_id: number;
  status: string;
  pagamento_status: string | null;
  enviado_em: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  usuario_nome: string | null;
  qtd_itens: number;
  qtd_itens_recebidos: number;
  qtd_itens_pg_pendentes: number;
  qtd_itens_pago_aguard_conf: number;
  total_valor: number;
};

export type EntregaItemRow = {
  id: number;
  material_id: number;
  material_nome: string;
  metros: number;
  valor_unitario: number;
  total: number;
  observacao: string | null;
  recebido: boolean;
  pagamento_status: string;
  pagamento_confirmado_forn: boolean;
};

export type EntregaDetalhe = EntregaListaRow & {
  observacao: string | null;
  usuario_nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  contato_nome: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  itens: EntregaItemRow[];
  total_geral: number;
  total_recebido: number;
  total_pago: number;
  qtd_itens_pendentes: number;
  qtd_itens_pg_pendentes: number;
  qtd_itens_pago_aguard_conf: number;
};

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function escSql(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

export function parseMoney(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const n = parseFloat(String(raw).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function rowFornecedor(r: Record<string, unknown>): FornecedorRow {
  return {
    id: int(r.id),
    razao_social: str(r.razao_social),
    nome_fantasia: r.nome_fantasia ? str(r.nome_fantasia) : null,
    cnpj: str(r.cnpj),
    email: r.email ? str(r.email) : null,
    telefone: r.telefone ? str(r.telefone) : null,
    contato_nome: r.contato_nome ? str(r.contato_nome) : null,
    cep: r.cep ? str(r.cep) : null,
    endereco: r.endereco ? str(r.endereco) : null,
    numero: r.numero ? str(r.numero) : null,
    complemento: r.complemento ? str(r.complemento) : null,
    bairro: r.bairro ? str(r.bairro) : null,
    cidade: r.cidade ? str(r.cidade) : null,
    uf: r.uf ? str(r.uf) : null,
    observacao: r.observacao ? str(r.observacao) : null,
  };
}

function rowEntregaLista(r: Record<string, unknown>): EntregaListaRow {
  return {
    id: int(r.id),
    fornecedor_id: int(r.fornecedor_id),
    status: str(r.status),
    pagamento_status: r.pagamento_status ? str(r.pagamento_status) : null,
    enviado_em: r.enviado_em ? str(r.enviado_em) : null,
    razao_social: r.razao_social ? str(r.razao_social) : null,
    nome_fantasia: r.nome_fantasia ? str(r.nome_fantasia) : null,
    usuario_nome: r.usuario_nome ? str(r.usuario_nome) : null,
    qtd_itens: int(r.qtd_itens),
    qtd_itens_recebidos: int(r.qtd_itens_recebidos),
    qtd_itens_pg_pendentes: int(r.qtd_itens_pg_pendentes),
    qtd_itens_pago_aguard_conf: int(r.qtd_itens_pago_aguard_conf),
    total_valor: num(r.total_valor),
  };
}

export async function listarFornecedores(): Promise<FornecedorRow[]> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM fornecedores ORDER BY razao_social ASC`,
  );
  return rows.map(rowFornecedor);
}

export async function contarEntregasPendentes(fornecedorId?: number): Promise<number> {
  const prisma = await getPrisma();
  let where = "e.status IN ('enviado', 'parcial')";
  if (fornecedorId != null && fornecedorId > 0) {
    where += ` AND e.fornecedor_id = ${int(fornecedorId)}`;
  }
  const rows = await prisma.$queryRawUnsafe<{ c: unknown }[]>(
    `SELECT COUNT(*) AS c FROM fornecedor_entregas e WHERE ${where}`,
  );
  return int(rows[0]?.c);
}

export async function listarEntregasAdmin(
  statusFiltro: "enviado" | "recebido" | "todas" | null,
  fornecedorId?: number,
): Promise<EntregaListaRow[]> {
  const prisma = await getPrisma();
  let where = "1=1";
  if (statusFiltro === "enviado") {
    where = "e.status IN ('enviado', 'parcial')";
  } else if (statusFiltro === "recebido") {
    where = "e.status IN ('recebido', 'parcial')";
  }
  if (fornecedorId != null && fornecedorId > 0) {
    where += ` AND e.fornecedor_id = ${int(fornecedorId)}`;
  }

  const sql = `SELECT e.*, f.razao_social, f.nome_fantasia, f.cnpj, f.telefone, f.email, f.contato_nome,
                   u.nome AS usuario_nome,
                   (SELECT COUNT(*) FROM fornecedor_entrega_itens i WHERE i.entrega_id = e.id) AS qtd_itens,
                   (SELECT COUNT(*) FROM fornecedor_entrega_itens i WHERE i.entrega_id = e.id AND i.recebido = 1) AS qtd_itens_recebidos,
                   (SELECT COUNT(*) FROM fornecedor_entrega_itens i WHERE i.entrega_id = e.id AND i.recebido = 1 AND (i.pagamento_status IS NULL OR i.pagamento_status <> 'pago')) AS qtd_itens_pg_pendentes,
                   (SELECT COUNT(*) FROM fornecedor_entrega_itens i WHERE i.entrega_id = e.id AND i.recebido = 1 AND i.pagamento_status = 'pago' AND i.pagamento_confirmado_forn = 0) AS qtd_itens_pago_aguard_conf,
                   (SELECT COALESCE(SUM(i.metros * i.valor_unitario), 0) FROM fornecedor_entrega_itens i WHERE i.entrega_id = e.id) AS total_valor
            FROM fornecedor_entregas e
            LEFT JOIN fornecedores f ON f.id = e.fornecedor_id
            LEFT JOIN usuarios u ON u.id = e.usuario_id
            WHERE ${where}
            ORDER BY FIELD(e.status, 'enviado', 'parcial', 'recebido'), e.enviado_em DESC, e.id DESC`;

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
  return rows.map(rowEntregaLista);
}

export async function obterEntregaCompleta(entregaId: number): Promise<EntregaDetalhe | null> {
  const prisma = await getPrisma();
  const id = int(entregaId);
  if (id <= 0) return null;

  const entRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT e.*, f.razao_social, f.nome_fantasia, f.cnpj, f.telefone, f.email, f.contato_nome,
            u.nome AS usuario_nome
     FROM fornecedor_entregas e
     LEFT JOIN fornecedores f ON f.id = e.fornecedor_id
     LEFT JOIN usuarios u ON u.id = e.usuario_id
     WHERE e.id = ${id} LIMIT 1`,
  );
  if (!entRows[0]) return null;

  const base = rowEntregaLista(entRows[0]);
  const itemRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT i.*, m.material AS material_nome
     FROM fornecedor_entrega_itens i
     INNER JOIN materiais m ON m.id = i.material_id
     WHERE i.entrega_id = ${id}
     ORDER BY i.id ASC`,
  );

  const itens: EntregaItemRow[] = itemRows.map((row) => {
    const metros = num(row.metros);
    const unit = num(row.valor_unitario);
    return {
      id: int(row.id),
      material_id: int(row.material_id),
      material_nome: str(row.material_nome),
      metros,
      valor_unitario: unit,
      total: metros * unit,
      observacao: row.observacao ? str(row.observacao) : null,
      recebido: int(row.recebido) === 1,
      pagamento_status: str(row.pagamento_status ?? ""),
      pagamento_confirmado_forn: int(row.pagamento_confirmado_forn) === 1,
    };
  });

  let total_recebido = 0;
  let total_pago = 0;
  let qtd_itens_pendentes = 0;
  let qtd_itens_pg_pendentes = 0;
  let qtd_itens_pago_aguard_conf = 0;

  for (const it of itens) {
    if (it.recebido) {
      total_recebido += it.total;
      if (it.pagamento_status === "pago") {
        total_pago += it.total;
        if (!it.pagamento_confirmado_forn) qtd_itens_pago_aguard_conf++;
      } else {
        qtd_itens_pg_pendentes++;
      }
    } else {
      qtd_itens_pendentes++;
    }
  }

  const row = entRows[0];
  return {
    ...base,
    observacao: row.observacao ? str(row.observacao) : null,
    cnpj: row.cnpj ? str(row.cnpj) : null,
    telefone: row.telefone ? str(row.telefone) : null,
    email: row.email ? str(row.email) : null,
    contato_nome: row.contato_nome ? str(row.contato_nome) : null,
    endereco: row.endereco ? str(row.endereco) : null,
    numero: row.numero ? str(row.numero) : null,
    complemento: row.complemento ? str(row.complemento) : null,
    bairro: row.bairro ? str(row.bairro) : null,
    cidade: row.cidade ? str(row.cidade) : null,
    uf: row.uf ? str(row.uf) : null,
    itens,
    total_geral: itens.reduce((s, i) => s + i.total, 0),
    total_recebido,
    total_pago,
    qtd_itens_pendentes,
    qtd_itens_pg_pendentes,
    qtd_itens_pago_aguard_conf,
  };
}

function parseMetrosEntrega(raw: string | number): number {
  if (typeof raw === "number") return raw > 0 ? raw : 0;
  const cleaned = String(raw).replace(/[^\d,.]/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Registra entrega enviada pelo fornecedor (igual Alex `fornecedorEnviarEntrega`). */
export async function fornecedorEnviarEntrega(
  fornecedorId: number,
  usuarioId: number,
  itens: Array<{
    material_id: number;
    metros: string | number;
    valor_unitario: string | number;
    observacao?: string;
  }>,
  observacaoGeral = "",
): Promise<number> {
  const fid = int(fornecedorId);
  if (fid <= 0 || itens.length === 0) return 0;

  const prisma = await getPrisma();
  const obsEsc = escSql(observacaoGeral.trim().slice(0, 500));
  const uidSql = usuarioId > 0 ? int(usuarioId) : "NULL";

  await prisma.$executeRawUnsafe(
    `INSERT INTO fornecedor_entregas (fornecedor_id, usuario_id, status, observacao, enviado_em)
     VALUES (${fid}, ${uidSql}, 'enviado', '${obsEsc}', NOW())`,
  );

  const idRows = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT LAST_INSERT_ID() AS id`,
  );
  const entregaId = int(idRows[0]?.id);
  if (entregaId <= 0) return 0;

  let inseridos = 0;
  for (const raw of itens) {
    const materialId = int(raw.material_id);
    const metros = parseMetrosEntrega(raw.metros);
    const valorUnit = Math.max(0, parseMoney(raw.valor_unitario));
    const obsItem = escSql(String(raw.observacao ?? "").trim().slice(0, 255));

    if (materialId <= 0 || metros <= 0) continue;

    const metrosEsc = metros.toFixed(2);
    const valorEsc = valorUnit.toFixed(2);

    await prisma.$executeRawUnsafe(
      `INSERT INTO fornecedor_entrega_itens (entrega_id, material_id, metros, valor_unitario, observacao)
       VALUES (${entregaId}, ${materialId}, '${metrosEsc}', '${valorEsc}', '${obsItem}')`,
    );
    inseridos++;
  }

  if (inseridos === 0) {
    await prisma.$executeRawUnsafe(`DELETE FROM fornecedor_entregas WHERE id = ${entregaId}`);
    return 0;
  }

  return entregaId;
}

async function salvarCompraFornecedor(
  fornecedorId: number,
  materialId: number,
  metros: number,
  valorUnit: number,
  observacao: string,
): Promise<void> {
  const prisma = await getPrisma();
  const fid = int(fornecedorId);
  const mid = int(materialId);
  if (fid <= 0 || mid <= 0 || metros <= 0) return;

  const m = metros.toFixed(2);
  const v = Math.max(0, valorUnit).toFixed(2);
  const obs = escSql(observacao.trim());

  await prisma.$executeRawUnsafe(
    `INSERT INTO fornecedor_compras (fornecedor_id, material_id, metros, valor_unitario, observacao)
     VALUES (${fid}, ${mid}, '${m}', '${v}', '${obs}')`,
  );
}

async function entregaSincronizarStatusCabecalho(entregaId: number): Promise<void> {
  const prisma = await getPrisma();
  const id = int(entregaId);

  const pendRows = await prisma.$queryRawUnsafe<{ c: unknown }[]>(
    `SELECT COUNT(*) AS c FROM fornecedor_entrega_itens WHERE entrega_id = ${id} AND recebido = 0`,
  );
  const pend = int(pendRows[0]?.c);

  const recRows = await prisma.$queryRawUnsafe<{ c: unknown }[]>(
    `SELECT COUNT(*) AS c FROM fornecedor_entrega_itens WHERE entrega_id = ${id} AND recebido = 1`,
  );
  const rec = int(recRows[0]?.c);

  if (pend === 0 && rec > 0) {
    const naoPagoRows = await prisma.$queryRawUnsafe<{ c: unknown }[]>(
      `SELECT COUNT(*) AS c FROM fornecedor_entrega_itens
       WHERE entrega_id = ${id} AND recebido = 1 AND (pagamento_status IS NULL OR pagamento_status <> 'pago')`,
    );
    const pag = int(naoPagoRows[0]?.c) > 0 ? "pendente" : "pago";
    await prisma.$executeRawUnsafe(
      `UPDATE fornecedor_entregas
       SET status = 'recebido', pagamento_status = '${pag}',
           recebido_em = COALESCE(recebido_em, NOW())
       WHERE id = ${id}`,
    );
  } else if (rec > 0 && pend > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE fornecedor_entregas SET status = 'parcial' WHERE id = ${id} AND status <> 'recebido'`,
    );
  }
}

export async function marcarItensEntregaRecebidos(
  entregaId: number,
  itemIds: number[],
  adminUserId: number,
  pagamentoStatus: "pago" | "pendente",
): Promise<{ ok: boolean; message: string }> {
  const entrega = await obterEntregaCompleta(entregaId);
  if (!entrega) return { ok: false, message: "Entrega não encontrada." };
  if (entrega.status === "recebido") {
    return { ok: false, message: "Esta nota já foi totalmente recebida." };
  }

  const ids = [...new Set(itemIds.map(int).filter((id) => id > 0))];
  if (ids.length === 0) return { ok: false, message: "Selecione ao menos um item." };

  const prisma = await getPrisma();
  const eid = int(entregaId);
  const pag = pagamentoStatus === "pago" ? "pago" : "pendente";
  const admin = int(adminUserId);
  const map = new Map(entrega.itens.map((it) => [it.id, it]));

  let processados = 0;
  for (const itemId of ids) {
    const item = map.get(itemId);
    if (!item || item.recebido) continue;

    await prisma.$executeRawUnsafe(
      `UPDATE fornecedor_entrega_itens
       SET recebido = 1, recebido_em = NOW(), recebido_por = ${admin},
           pagamento_status = '${pag}', pagamento_confirmado_forn = 0
       WHERE id = ${itemId} AND entrega_id = ${eid} AND recebido = 0`,
    );

    await salvarCompraFornecedor(
      entrega.fornecedor_id,
      item.material_id,
      item.metros,
      item.valor_unitario,
      `Entrega #${eid} item #${itemId} — ${item.observacao ?? ""}`,
    );
    processados++;
  }

  if (processados === 0) return { ok: false, message: "Nenhum item válido para receber." };

  await prisma.$executeRawUnsafe(
    `UPDATE fornecedor_entregas SET recebido_em = COALESCE(recebido_em, NOW()), recebido_por = ${admin} WHERE id = ${eid}`,
  );
  await entregaSincronizarStatusCabecalho(eid);

  return {
    ok: true,
    message: processados === 1 ? "1 item recebido." : `${processados} itens recebidos.`,
  };
}

export async function marcarEntregaRecebida(
  entregaId: number,
  adminUserId: number,
  pagamentoStatus: "pago" | "pendente",
): Promise<{ ok: boolean; message: string }> {
  const entrega = await obterEntregaCompleta(entregaId);
  if (!entrega) return { ok: false, message: "Entrega não encontrada." };
  const pendentes = entrega.itens.filter((i) => !i.recebido).map((i) => i.id);
  return marcarItensEntregaRecebidos(entregaId, pendentes, adminUserId, pagamentoStatus);
}

export async function marcarItensEntregaPagos(
  entregaId: number,
  itemIds: number[],
): Promise<{ ok: boolean; message: string }> {
  const entrega = await obterEntregaCompleta(entregaId);
  if (!entrega) return { ok: false, message: "Entrega não encontrada." };
  if (!["recebido", "parcial"].includes(entrega.status)) {
    return { ok: false, message: "Só é possível pagar itens já recebidos." };
  }

  const prisma = await getPrisma();
  const eid = int(entregaId);
  const map = new Map(entrega.itens.map((it) => [it.id, it]));
  let processados = 0;

  for (const itemId of itemIds) {
    const item = map.get(int(itemId));
    if (!item || !item.recebido || item.pagamento_status === "pago") continue;
    await prisma.$executeRawUnsafe(
      `UPDATE fornecedor_entrega_itens
       SET pagamento_status = 'pago', pagamento_confirmado_forn = 0
       WHERE id = ${int(itemId)} AND entrega_id = ${eid} AND recebido = 1`,
    );
    processados++;
  }

  if (processados === 0) {
    return { ok: false, message: "Nenhum item pendente de pagamento foi selecionado." };
  }

  const naoPagoRows = await prisma.$queryRawUnsafe<{ c: unknown }[]>(
    `SELECT COUNT(*) AS c FROM fornecedor_entrega_itens
     WHERE entrega_id = ${eid} AND recebido = 1 AND (pagamento_status IS NULL OR pagamento_status <> 'pago')`,
  );
  const pag = int(naoPagoRows[0]?.c) > 0 ? "pendente" : "pago";
  await prisma.$executeRawUnsafe(
    `UPDATE fornecedor_entregas SET pagamento_status = '${pag}' WHERE id = ${eid}`,
  );

  return {
    ok: true,
    message:
      processados === 1
        ? "1 item marcado como pago. O fornecedor precisa confirmar o recebimento."
        : `${processados} itens marcados como pagos. O fornecedor precisa confirmar o recebimento.`,
  };
}

export async function confirmarPagamentoFornecedor(
  entregaId: number,
  fornecedorId: number,
  itemIds?: number[],
): Promise<{ ok: boolean; message: string }> {
  const entrega = await obterEntregaCompleta(entregaId);
  if (!entrega) return { ok: false, message: "Entrega não encontrada." };
  if (entrega.fornecedor_id !== int(fornecedorId)) {
    return { ok: false, message: "Esta entrega não pertence à sua empresa." };
  }

  const candidatos = entrega.itens.filter(
    (i) => i.recebido && i.pagamento_status === "pago" && !i.pagamento_confirmado_forn,
  );
  const ids =
    itemIds && itemIds.length > 0
      ? [...new Set(itemIds.map(int).filter((id) => id > 0))]
      : candidatos.map((i) => i.id);

  if (ids.length === 0) {
    return { ok: false, message: "Nenhum pagamento aguardando confirmação." };
  }

  const prisma = await getPrisma();
  const eid = int(entregaId);
  const map = new Map(entrega.itens.map((it) => [it.id, it]));
  let processados = 0;

  for (const itemId of ids) {
    const item = map.get(itemId);
    if (!item || item.pagamento_status !== "pago" || item.pagamento_confirmado_forn) continue;
    await prisma.$executeRawUnsafe(
      `UPDATE fornecedor_entrega_itens
       SET pagamento_confirmado_forn = 1
       WHERE id = ${itemId} AND entrega_id = ${eid} AND pagamento_status = 'pago'`,
    );
    processados++;
  }

  if (processados === 0) {
    return { ok: false, message: "Nenhum item válido para confirmar." };
  }

  return {
    ok: true,
    message:
      processados === 1
        ? "Pagamento confirmado com sucesso."
        : `${processados} pagamentos confirmados com sucesso.`,
  };
}

export async function atualizarPagamentoEntrega(
  entregaId: number,
  pagamento: "pago" | "pendente",
): Promise<boolean> {
  const prisma = await getPrisma();
  const eid = int(entregaId);
  const pag = pagamento === "pago" ? "pago" : "pendente";
  const confForn = pag === "pago" ? 0 : 0;
  await prisma.$executeRawUnsafe(
    `UPDATE fornecedor_entregas SET pagamento_status = '${pag}' WHERE id = ${eid}`,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE fornecedor_entrega_itens
     SET pagamento_status = '${pag}', pagamento_confirmado_forn = ${confForn}
     WHERE entrega_id = ${eid} AND recebido = 1`,
  );
  return true;
}

export type FornecedorInput = {
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  email?: string;
  telefone?: string;
  contato_nome?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  observacao?: string;
};

function cnpjDigitos(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

export async function salvarFornecedor(
  dados: FornecedorInput,
  idExcluir?: number,
): Promise<{ ok: boolean; message: string }> {
  const digits = cnpjDigitos(dados.cnpj);
  if (digits.length !== 14) {
    return { ok: false, message: "Informe um CNPJ válido (14 dígitos)." };
  }
  if (!dados.razao_social.trim()) {
    return { ok: false, message: "Informe a razão social do fornecedor." };
  }

  const prisma = await getPrisma();
  let dupSql = `SELECT id FROM fornecedores WHERE REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = '${escSql(digits)}'`;
  if (idExcluir != null) dupSql += ` AND id <> ${int(idExcluir)}`;
  const dup = await prisma.$queryRawUnsafe<{ id: unknown }[]>(dupSql);
  if (dup.length > 0) {
    return { ok: false, message: "Já existe um fornecedor cadastrado com este CNPJ." };
  }

  const campos = {
    razao_social: escSql(dados.razao_social.trim()),
    nome_fantasia: escSql((dados.nome_fantasia ?? "").trim()),
    cnpj: escSql(digits),
    email: escSql((dados.email ?? "").trim()),
    telefone: escSql((dados.telefone ?? "").trim()),
    contato_nome: escSql((dados.contato_nome ?? "").trim()),
    cep: escSql(cnpjDigitos(dados.cep ?? "")),
    endereco: escSql((dados.endereco ?? "").trim()),
    numero: escSql((dados.numero ?? "").trim()),
    complemento: escSql((dados.complemento ?? "").trim()),
    bairro: escSql((dados.bairro ?? "").trim()),
    cidade: escSql((dados.cidade ?? "").trim()),
    uf: escSql((dados.uf ?? "").trim().toUpperCase().slice(0, 2)),
    observacao: escSql((dados.observacao ?? "").trim()),
  };

  if (idExcluir == null) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO fornecedores (
        razao_social, nome_fantasia, cnpj, email, telefone, contato_nome,
        cep, endereco, numero, complemento, bairro, cidade, uf, observacao
      ) VALUES (
        '${campos.razao_social}', '${campos.nome_fantasia}', '${campos.cnpj}',
        '${campos.email}', '${campos.telefone}', '${campos.contato_nome}',
        '${campos.cep}', '${campos.endereco}', '${campos.numero}',
        '${campos.complemento}', '${campos.bairro}', '${campos.cidade}',
        '${campos.uf}', '${campos.observacao}'
      )`,
    );
    return { ok: true, message: "Fornecedor cadastrado com sucesso." };
  }

  const id = int(idExcluir);
  await prisma.$executeRawUnsafe(
    `UPDATE fornecedores SET
      razao_social = '${campos.razao_social}',
      nome_fantasia = '${campos.nome_fantasia}',
      cnpj = '${campos.cnpj}',
      email = '${campos.email}',
      telefone = '${campos.telefone}',
      contato_nome = '${campos.contato_nome}',
      cep = '${campos.cep}',
      endereco = '${campos.endereco}',
      numero = '${campos.numero}',
      complemento = '${campos.complemento}',
      bairro = '${campos.bairro}',
      cidade = '${campos.cidade}',
      uf = '${campos.uf}',
      observacao = '${campos.observacao}'
    WHERE id = ${id}`,
  );
  return { ok: true, message: "Fornecedor atualizado com sucesso." };
}

export async function excluirFornecedor(fornecedorId: number): Promise<{ ok: boolean; message: string }> {
  const id = int(fornecedorId);
  if (id <= 0) return { ok: false, message: "Fornecedor inválido." };

  const prisma = await getPrisma();
  const exists = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT id FROM fornecedores WHERE id = ${id} LIMIT 1`,
  );
  if (!exists[0]) return { ok: false, message: "Fornecedor não encontrado." };

  const [u, e, c] = await Promise.all([
    prisma.$queryRawUnsafe<{ c: unknown }[]>(
      `SELECT COUNT(*) AS c FROM usuarios WHERE fornecedor_id = ${id}`,
    ),
    prisma.$queryRawUnsafe<{ c: unknown }[]>(
      `SELECT COUNT(*) AS c FROM fornecedor_entregas WHERE fornecedor_id = ${id}`,
    ),
    prisma.$queryRawUnsafe<{ c: unknown }[]>(
      `SELECT COUNT(*) AS c FROM fornecedor_compras WHERE fornecedor_id = ${id}`,
    ),
  ]);

  const nUsu = int(u[0]?.c);
  const nEnt = int(e[0]?.c);
  const nComp = int(c[0]?.c);
  if (nUsu > 0 || nEnt > 0 || nComp > 0) {
    const partes: string[] = [];
    if (nUsu > 0) partes.push(`${nUsu} usuário(s) vinculado(s)`);
    if (nEnt > 0) partes.push(`${nEnt} nota(s) de entrega`);
    if (nComp > 0) partes.push(`${nComp} lançamento(s) no financeiro`);
    return { ok: false, message: `Não é possível excluir esta empresa: ${partes.join(", ")}.` };
  }

  await prisma.$executeRawUnsafe(`DELETE FROM fornecedores WHERE id = ${id}`);
  return { ok: true, message: "Fornecedor excluído." };
}

export async function excluirEntrega(entregaId: number): Promise<{ ok: boolean; message: string }> {
  const entrega = await obterEntregaCompleta(entregaId);
  if (!entrega) return { ok: false, message: "Entrega não encontrada." };

  const prisma = await getPrisma();
  const eid = int(entregaId);
  const fid = int(entrega.fornecedor_id);

  await prisma.$executeRawUnsafe(`DELETE FROM fornecedor_compras WHERE observacao LIKE 'Entrega #${eid} %'`);
  await prisma.$executeRawUnsafe(`DELETE FROM fornecedor_entrega_itens WHERE entrega_id = ${eid}`);
  await prisma.$executeRawUnsafe(`DELETE FROM fornecedor_entregas WHERE id = ${eid}`);

  void fid;
  return { ok: true, message: "Nota de entrega excluída." };
}
