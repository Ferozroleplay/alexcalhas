/** Helpers de URL de avatar (client + server). */

export const BLOB_PRIVATE_PREFIX = "blobprivate:";

/** Foto gravada na tabela `usuario_foto` (quando a Vercel não tem Blob). */
export const DB_FOTO_PREFIX = "dbfoto:";

export function dbFotoId(stored: string): number | null {
  if (!stored.startsWith(DB_FOTO_PREFIX)) return null;
  const id = Number(stored.slice(DB_FOTO_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function dbFotoPublicPath(stored: string): string | null {
  const id = dbFotoId(stored);
  if (!id) return null;
  return `/api/media/usuario-foto?id=${id}`;
}

export function isBlobPrivateRef(stored: string): boolean {
  return stored.startsWith(BLOB_PRIVATE_PREFIX);
}

export function resolveBlobStoredUrl(stored: string): string {
  if (isBlobPrivateRef(stored)) return stored.slice(BLOB_PRIVATE_PREFIX.length);
  return stored;
}

export function blobUrlParaExibicao(stored: string): string {
  if (isBlobPrivateRef(stored)) {
    const raw = resolveBlobStoredUrl(stored);
    return `/api/media/blob?url=${encodeURIComponent(raw)}`;
  }
  if (/^https?:\/\//i.test(stored.trim())) return stored.trim();
  return stored;
}
