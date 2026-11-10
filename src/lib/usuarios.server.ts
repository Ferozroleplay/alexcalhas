import { getPrisma } from "@/lib/db.server";
import { removerThumbArquivo } from "@/lib/usuario-thumb.server";

export type UsuarioRow = {
  id: number;
  thumb: string;
  nome: string;
  usuario: string;
  email: string;
  nivel: string;
  valor_diario: number;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
};

type DbUsuario = {
  id: unknown;
  thumb: string;
  nome: string;
  usuario: string;
  email: string;
  nivel: string;
  valor_diario: unknown;
  fornecedor_id: unknown;
};

function int(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

function fornecedorRotulo(row: { razao_social: string; nome_fantasia: string | null }): string {
  const nf = row.nome_fantasia?.trim();
  const rs = row.razao_social?.trim();
  return nf || rs || "Fornecedor";
}

export async function listUsuarios(): Promise<UsuarioRow[]> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<DbUsuario[]>(
    `SELECT id, thumb, nome, usuario, email, nivel, valor_diario, fornecedor_id
     FROM usuarios
     ORDER BY nome ASC`,
  );

  const fornIds = [
    ...new Set(
      rows
        .map((r) => int(r.fornecedor_id))
        .filter((id) => id > 0),
    ),
  ];

  const fornNomes = new Map<number, string>();
  if (fornIds.length > 0) {
    try {
      const placeholders = fornIds.map(() => "?").join(",");
      const fornecedores = await prisma.$queryRawUnsafe<
        { id: unknown; razao_social: string; nome_fantasia: string | null }[]
      >(
        `SELECT id, razao_social, nome_fantasia FROM fornecedores WHERE id IN (${placeholders})`,
        ...fornIds,
      );
      for (const f of fornecedores) {
        fornNomes.set(int(f.id), fornecedorRotulo(f));
      }
    } catch {
      /* fornecedores opcional */
    }
  }

  return rows.map((r) => {
    const fid = r.fornecedor_id != null ? int(r.fornecedor_id) : null;
    return {
      id: int(r.id),
      thumb: r.thumb ?? "nao.png",
      nome: r.nome ?? "",
      usuario: r.usuario ?? "",
      email: r.email ?? "",
      nivel: r.nivel ?? "",
      valor_diario: Number(r.valor_diario) || 0,
      fornecedor_id: fid && fid > 0 ? fid : null,
      fornecedor_nome: fid && fid > 0 ? (fornNomes.get(fid) ?? null) : null,
    };
  });
}

export async function usuarioLoginExists(usuario: string): Promise<boolean> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT id FROM usuarios WHERE usuario = ? LIMIT 1`,
    usuario,
  );
  return rows.length > 0;
}

export async function getUsuarioById(id: number): Promise<UsuarioRow | null> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<DbUsuario[]>(
    `SELECT id, thumb, nome, usuario, email, nivel, valor_diario, fornecedor_id
     FROM usuarios WHERE id = ? LIMIT 1`,
    id,
  );
  const r = rows[0];
  if (!r) return null;

  let fornecedor_nome: string | null = null;
  const fid = r.fornecedor_id != null ? int(r.fornecedor_id) : null;
  if (fid && fid > 0) {
    try {
      const fornecedores = await prisma.$queryRawUnsafe<
        { razao_social: string; nome_fantasia: string | null }[]
      >(`SELECT razao_social, nome_fantasia FROM fornecedores WHERE id = ? LIMIT 1`, fid);
      if (fornecedores[0]) {
        fornecedor_nome = fornecedorRotulo(fornecedores[0]);
      }
    } catch {
      /* opcional */
    }
  }

  return {
    id: int(r.id),
    thumb: r.thumb ?? "nao.png",
    nome: r.nome ?? "",
    usuario: r.usuario ?? "",
    email: r.email ?? "",
    nivel: r.nivel ?? "",
    valor_diario: Number(r.valor_diario) || 0,
    fornecedor_id: fid && fid > 0 ? fid : null,
    fornecedor_nome,
  };
}

export async function updateUsuario(
  id: number,
  data: {
    nome: string;
    email: string;
    senha?: string;
    nivel: string;
    fornecedor_id: number | null;
  },
): Promise<void> {
  const prisma = await getPrisma();
  const fornecedorSql =
    data.nivel === "fornecedor" && data.fornecedor_id && data.fornecedor_id > 0
      ? data.fornecedor_id
      : null;

  if (data.senha) {
    await prisma.$executeRawUnsafe(
      `UPDATE usuarios SET nome = ?, email = ?, senha = ?, nivel = ?, fornecedor_id = ? WHERE id = ?`,
      data.nome,
      data.email,
      data.senha,
      data.nivel,
      fornecedorSql,
      id,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE usuarios SET nome = ?, email = ?, nivel = ?, fornecedor_id = ? WHERE id = ?`,
      data.nome,
      data.email,
      data.nivel,
      fornecedorSql,
      id,
    );
  }
}

export async function deleteUsuario(id: number): Promise<{ ok: boolean; message: string }> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ id: unknown; nome: string; thumb: string }[]>(
    `SELECT id, nome, thumb FROM usuarios WHERE id = ? LIMIT 1`,
    id,
  );
  if (!rows[0]) return { ok: false, message: "Usuário não encontrado." };

  await prisma.$executeRawUnsafe(`DELETE FROM usuarios WHERE id = ? LIMIT 1`, id);
  await removerThumbArquivo(rows[0].thumb ?? "");
  return { ok: true, message: `${rows[0].nome} foi excluído.` };
}

export async function setUsuarioThumb(id: number, thumb: string): Promise<string | null> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ thumb: string }[]>(
    `SELECT thumb FROM usuarios WHERE id = ? LIMIT 1`,
    id,
  );
  const anterior = rows[0]?.thumb ?? "nao.png";
  await prisma.$executeRawUnsafe(`UPDATE usuarios SET thumb = ? WHERE id = ?`, thumb, id);
  return anterior !== "nao.png" ? anterior : null;
}

export async function createUsuario(data: {
  thumb: string;
  nome: string;
  usuario: string;
  email: string;
  senha: string;
  nivel: string;
  fornecedor_id?: number | null;
}): Promise<number> {
  const prisma = await getPrisma();
  const fornecedorId =
    data.nivel === "fornecedor" && data.fornecedor_id && data.fornecedor_id > 0
      ? data.fornecedor_id
      : null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO usuarios (thumb, nome, email, usuario, senha, nivel, fornecedor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    data.thumb,
    data.nome,
    data.email,
    data.usuario,
    data.senha,
    data.nivel,
    fornecedorId,
  );
  const rows = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
    `SELECT id FROM usuarios WHERE usuario = ? ORDER BY id DESC LIMIT 1`,
    data.usuario,
  );
  return int(rows[0]?.id ?? 0);
}
