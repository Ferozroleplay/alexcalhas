/**
 * Baixa fotos de produtos que estão no Blob (via proxy público do site)
 * e grava em public/images/produtos + atualiza o banco para caminho local.
 *
 * Uso: node scripts/migrar-produtos-blob-local.mjs
 *      node scripts/migrar-produtos-blob-local.mjs --base https://www.alexcalhas.com
 */
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });

const baseArg = process.argv.find((a, i) => process.argv[i - 1] === "--base");
const SITE_BASE = (baseArg || "https://www.alexcalhas.com").replace(/\/$/, "");

function dbUrl() {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || "3306";
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;
  if (!host || !user || pass == null || !name) return null;
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(name)}`;
}

function escSql(valor) {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function nomeArquivoDeUrl(url) {
  try {
    const u = new URL(url);
    return path.basename(u.pathname);
  } catch {
    return null;
  }
}

const url = dbUrl();
if (!url) {
  console.error("Configure DB_* no .env");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const outDir = resolve(process.cwd(), "public", "images", "produtos");
await mkdir(outDir, { recursive: true });

try {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT id, produto_id, arquivo, legenda FROM produto_fotos WHERE arquivo IS NOT NULL AND arquivo <> ''",
  );

  let migrados = 0;
  for (const row of rows) {
    const arquivoRef = String(row.arquivo || "").trim();
    if (!arquivoRef.startsWith("blobprivate:") && !/^https?:\/\//i.test(arquivoRef)) {
      console.log(`- foto #${row.id}: já é local (${arquivoRef})`);
      continue;
    }

    const rawUrl = arquivoRef.startsWith("blobprivate:")
      ? arquivoRef.slice("blobprivate:".length)
      : arquivoRef;
    const arquivo = nomeArquivoDeUrl(rawUrl);
    if (!arquivo) {
      console.warn(`! foto #${row.id}: URL inválida`);
      continue;
    }

    const dest = path.join(outDir, arquivo);
    if (!existsSync(dest)) {
      const proxy = `${SITE_BASE}/api/media/blob?url=${encodeURIComponent(rawUrl)}`;
      console.log(`↓ baixando foto #${row.id} (produto ${row.produto_id})…`);
      const res = await fetch(proxy);
      if (!res.ok) {
        console.warn(`! falha download #${row.id}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      console.log(`  salvou ${arquivo} (${buf.length} bytes)`);
    } else {
      console.log(`  arquivo já existe: ${arquivo}`);
    }

    await prisma.$executeRawUnsafe(
      `UPDATE produto_fotos SET arquivo = '${escSql(arquivo)}' WHERE id = ${Number(row.id)}`,
    );
    console.log(`✓ foto #${row.id} → ${arquivo}`);
    migrados++;
  }

  console.log(`\nOK — ${migrados} foto(s) migrada(s) para disco local.`);
  console.log("Agora faça commit das imagens em public/images/produtos e push.");
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
