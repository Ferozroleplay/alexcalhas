import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { hasBlobStorage, uploadBlob } from "@/lib/blob-upload.server";
import { getPrisma } from "@/lib/db.server";
import {
  blobUrlParaExibicao,
  DB_FOTO_PREFIX,
  dbFotoId,
  dbFotoPublicPath,
  isBlobPrivateRef,
  resolveBlobStoredUrl,
} from "@/lib/usuario-thumb-url";
import {
  extensaoSegura,
  FOTOS_MAX_BYTES,
  FOTOS_TIPOS,
} from "@/lib/produtos-upload.server";
import {
  canPersistUploadsOnDisk,
  isReadOnlyServerless,
  mensagemUploadIndisponivel,
  resolveUploadDir,
} from "@/lib/upload-dir.server";

export function usuarioThumbUploadDir(): string {
  return resolveUploadDir("USER_THUMB_DIR", ["images", "thumb"]);
}

export function isThumbStoredUrl(thumb: string): boolean {
  return /^https?:\/\//i.test(thumb.trim());
}

export function thumbPublicUrl(arquivo: string): string {
  const noBanco = dbFotoPublicPath(arquivo);
  if (noBanco) return noBanco;
  if (isBlobPrivateRef(arquivo) || isThumbStoredUrl(arquivo)) {
    return blobUrlParaExibicao(arquivo);
  }
  const name = arquivo.replace(/^\/+/, "").split(/[/\\]/).pop() ?? arquivo;
  return `/images/thumb/${encodeURIComponent(name)}`;
}

export function thumbNomeSeguro(nome: string): string | null {
  const base = path.basename(nome.trim());
  if (!base || base !== nome.trim() || base.includes("..")) return null;
  return base;
}

export async function salvarThumbUpload(
  file: File,
): Promise<{ arquivo: string } | { erro: string }> {
  if (!FOTOS_TIPOS.has(file.type)) {
    return { erro: "Tipo de arquivo não permitido. Use JPG, PNG, WebP ou GIF." };
  }
  if (file.size > FOTOS_MAX_BYTES) {
    return { erro: "Arquivo maior que 8 MB." };
  }
  const ext = extensaoSegura(file.type);
  if (!ext) return { erro: "Extensão inválida." };

  const key = `thumbs/${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`;

  if (isReadOnlyServerless()) {
    if (hasBlobStorage()) {
      const blob = await uploadBlob(key, file);
      if ("erro" in blob) return { erro: blob.erro };
      return { arquivo: blob.stored };
    }
    return salvarThumbNoBanco(file);
  }

  if (!canPersistUploadsOnDisk("USER_THUMB_DIR")) {
    return { erro: mensagemUploadIndisponivel("foto de perfil") };
  }

  const dir = usuarioThumbUploadDir();
  await mkdir(dir, { recursive: true });
  const arquivo = `${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, arquivo), buf);
  return { arquivo };
}

const FOTO_BANCO_MAX_BYTES = 4 * 1024 * 1024;

async function garantirTabelaFoto(): Promise<void> {
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS usuario_foto (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      mime VARCHAR(40) NOT NULL,
      dados MEDIUMBLOB NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
}

async function salvarThumbNoBanco(file: File): Promise<{ arquivo: string } | { erro: string }> {
  if (file.size > FOTO_BANCO_MAX_BYTES) {
    return { erro: "A foto passou de 4 MB. Escolha uma imagem menor." };
  }
  await garantirTabelaFoto();
  const prisma = await getPrisma();
  const buf = Buffer.from(await file.arrayBuffer());
  await prisma.$executeRawUnsafe(
    `INSERT INTO usuario_foto (mime, dados) VALUES (?, ?)`,
    file.type,
    buf,
  );
  const inserted = await prisma.$queryRawUnsafe<{ id: unknown }[]>(`SELECT LAST_INSERT_ID() AS id`);
  const id = Number(inserted[0]?.id) || 0;
  if (id <= 0) return { erro: "Não foi possível guardar a foto." };
  return { arquivo: `${DB_FOTO_PREFIX}${id}` };
}

export async function lerUsuarioFoto(
  id: number,
): Promise<{ mime: string; dados: Uint8Array } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<{ mime: string; dados: Uint8Array | null }[]>(
    `SELECT mime, dados FROM usuario_foto WHERE id = ? LIMIT 1`,
    id,
  );
  const row = rows[0];
  if (!row?.dados || !FOTOS_TIPOS.has(row.mime)) return null;
  return { mime: row.mime, dados: row.dados };
}

async function apagarFotoBanco(id: number): Promise<void> {
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`DELETE FROM usuario_foto WHERE id = ? LIMIT 1`, id);
}

export async function removerThumbArquivo(thumb: string): Promise<void> {
  if (!thumb || thumb === "nao.png") return;
  const fotoId = dbFotoId(thumb);
  if (fotoId) {
    try {
      await apagarFotoBanco(fotoId);
    } catch {
      /* tabela pode ainda não existir */
    }
    return;
  }
  if (isThumbStoredUrl(thumb) || isBlobPrivateRef(thumb)) {
    try {
      const { del } = await import("@vercel/blob");
      await del(resolveBlobStoredUrl(thumb));
    } catch {
      /* ignore */
    }
    return;
  }
  const nome = thumbNomeSeguro(thumb);
  if (!nome) return;
  const filePath = path.join(usuarioThumbUploadDir(), nome);
  try {
    await unlink(filePath);
  } catch {
    /* arquivo pode estar só no servidor Alex */
  }
}
