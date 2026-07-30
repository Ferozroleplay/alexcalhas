/**
 * Baixa logos de parceiros que estão no Blob (via proxy público do site)
 * e grava em public/images/parceiros + atualiza o banco para caminho local.
 *
 * Uso: node scripts/migrar-parceiros-blob-local.mjs
 *      node scripts/migrar-parceiros-blob-local.mjs --base https://www.alexcalhas.com
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
const outDir = resolve(process.cwd(), "public", "images", "parceiros");
await mkdir(outDir, { recursive: true });

try {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT id, nome, logo FROM parceiros_site WHERE logo IS NOT NULL AND logo <> ''",
  );

  let migrados = 0;
  for (const row of rows) {
    const logo = String(row.logo || "").trim();
    if (!logo.startsWith("blobprivate:") && !/^https?:\/\//i.test(logo)) {
      console.log(`- #${row.id} ${row.nome}: já é local (${logo})`);
      continue;
    }

    const rawUrl = logo.startsWith("blobprivate:") ? logo.slice("blobprivate:".length) : logo;
    const arquivo = nomeArquivoDeUrl(rawUrl);
    if (!arquivo) {
      console.warn(`! #${row.id} ${row.nome}: URL inválida`);
      continue;
    }

    const dest = path.join(outDir, arquivo);
    if (!existsSync(dest)) {
      const proxy = `${SITE_BASE}/api/media/blob?url=${encodeURIComponent(rawUrl)}`;
      console.log(`↓ baixando #${row.id} ${row.nome}…`);
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
      `UPDATE parceiros_site SET logo = '${escSql(arquivo)}' WHERE id = ${Number(row.id)}`,
    );
    console.log(`✓ #${row.id} ${row.nome} → ${arquivo}`);
    migrados++;
  }

  console.log(`\nOK — ${migrados} logo(s) migrada(s) para disco local.`);
  console.log("Agora faça commit das imagens em public/images/parceiros e push.");
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
