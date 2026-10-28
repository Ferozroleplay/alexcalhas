import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { uploadBlob } from "@/lib/blob-upload.server";
import {
  blobUrlParaExibicao,
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

export const SITE_CHAT_FOTO_PADRAO = "/images/perfil/poliane.jpg";

export function perfilUploadDir(): string {
  return resolveUploadDir("PERFIL_UPLOAD_DIR", ["images", "perfil"]);
}

function isStoredUrl(arquivo: string): boolean {
  return /^https?:\/\//i.test(arquivo.trim());
}

export function isFotoChatPadrao(foto: string | null | undefined): boolean {
  const t = (foto ?? "").trim();
  if (!t) return true;
  return t === SITE_CHAT_FOTO_PADRAO || t.endsWith("/perfil/poliane.jpg") || t.endsWith("/perfil/poliane.jpeg");
}

export function fotoChatPublicUrl(arquivo: string | null | undefined): string {
  const t = (arquivo ?? "").trim();
  if (!t || isFotoChatPadrao(t)) return SITE_CHAT_FOTO_PADRAO;
  if (isBlobPrivateRef(t) || isStoredUrl(t)) return blobUrlParaExibicao(t);
  if (t.startsWith("/")) return t;
  const name = t.replace(/^\/+/, "").split(/[/\\]/).pop() ?? t;
  return `/images/perfil/${encodeURIComponent(name)}`;
}

export async function salvarFotoChatUpload(
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

  const key = `perfil/${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`;

  if (isReadOnlyServerless()) {
    const blob = await uploadBlob(key, file);
    if ("erro" in blob) return { erro: blob.erro };
    return { arquivo: blob.stored };
  }

  if (!canPersistUploadsOnDisk("PERFIL_UPLOAD_DIR")) {
    return { erro: mensagemUploadIndisponivel("foto do atendente") };
  }

  const dir = perfilUploadDir();
  await mkdir(dir, { recursive: true });
  const arquivo = `${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, arquivo), buf);
  return { arquivo };
}

export async function removerFotoChatArquivo(foto: string): Promise<void> {
  if (!foto?.trim() || isFotoChatPadrao(foto)) return;
  if (isStoredUrl(foto) || isBlobPrivateRef(foto)) {
    try {
      const { del } = await import("@vercel/blob");
      await del(resolveBlobStoredUrl(foto));
    } catch {
      /* ignore */
    }
    return;
  }
  const nome = path.basename(foto.trim());
  if (!nome || nome.includes("..") || nome === "poliane.jpg") return;
  try {
    await unlink(path.join(perfilUploadDir(), nome));
  } catch {
    /* ignore */
  }
}
