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

export function parceirosUploadDir(): string {
  return resolveUploadDir("PARCEIROS_UPLOAD_DIR", ["images", "parceiros"]);
}

function isStoredUrl(arquivo: string): boolean {
  return /^https?:\/\//i.test(arquivo.trim());
}

export function logoPublicUrl(arquivo: string): string {
  if (isBlobPrivateRef(arquivo) || isStoredUrl(arquivo)) {
    return blobUrlParaExibicao(arquivo);
  }
  const name = arquivo.replace(/^\/+/, "").split(/[/\\]/).pop() ?? arquivo;
  return `/images/parceiros/${encodeURIComponent(name)}`;
}

export function logoNomeSeguro(nome: string): string | null {
  const base = path.basename(nome.trim());
  if (!base || base !== nome.trim() || base.includes("..")) return null;
  return base;
}

export async function salvarLogoParceiroUpload(
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

  const key = `parceiros/${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`;

  if (isReadOnlyServerless()) {
    const blob = await uploadBlob(key, file);
    if ("erro" in blob) return { erro: blob.erro };
    return { arquivo: blob.stored };
  }

  if (!canPersistUploadsOnDisk("PARCEIROS_UPLOAD_DIR")) {
    return { erro: mensagemUploadIndisponivel("logo do parceiro") };
  }

  const dir = parceirosUploadDir();
  await mkdir(dir, { recursive: true });
  const arquivo = `${Date.now()}_${randomBytes(4).toString("hex")}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, arquivo), buf);
  return { arquivo };
}

export async function removerLogoParceiroArquivo(logo: string): Promise<void> {
  if (!logo?.trim()) return;
  if (isStoredUrl(logo) || isBlobPrivateRef(logo)) {
    try {
      const { del } = await import("@vercel/blob");
      await del(resolveBlobStoredUrl(logo));
    } catch {
      /* ignore */
    }
    return;
  }
  const nome = logoNomeSeguro(logo);
  if (!nome) return;
  const filePath = path.join(parceirosUploadDir(), nome);
  try {
    await unlink(filePath);
  } catch {
    /* ignore */
  }
}
