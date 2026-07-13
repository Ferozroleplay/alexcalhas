/**
 * Exporta o banco atual (DB_* do .env) para um .sql completo.
 * Não altera a estrutura — só lê e grava o dump.
 *
 * Uso:
 *   node scripts/export-banco.mjs
 *   node scripts/export-banco.mjs --out scripts/dumps/copia.sql
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });

function dbUrl() {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || "3306";
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;
  if (!host || !user || pass == null || !name) return null;
  return {
    url: `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(name)}`,
    name,
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "bigint") return String(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, "0");
    const y = value.getFullYear();
    const m = pad(value.getMonth() + 1);
    const d = pad(value.getDate());
    const h = pad(value.getHours());
    const mi = pad(value.getMinutes());
    const s = pad(value.getSeconds());
    return `'${y}-${m}-${d} ${h}:${mi}:${s}'`;
  }
  if (Buffer.isBuffer(value)) {
    return `0x${value.toString("hex")}`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function outPathFromArgs() {
  const idx = process.argv.indexOf("--out");
  if (idx >= 0 && process.argv[idx + 1]) return resolve(process.cwd(), process.argv[idx + 1]);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return resolve(process.cwd(), "scripts", "dumps", `copia-banco-${stamp}.sql`);
}

const cfg = dbUrl();
if (!cfg) {
  console.error("Configure DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no .env");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: cfg.url } } });
const outFile = outPathFromArgs();

try {
  const tableRows = await prisma.$queryRawUnsafe(`SHOW TABLES`);
  const tables = tableRows.map((r) => Object.values(r)[0]).filter(Boolean);

  const lines = [
    `-- Dump gerado por scripts/export-banco.mjs`,
    `-- Origem: ${cfg.name}`,
    `-- Data: ${new Date().toISOString()}`,
    `-- Estrutura + dados (sem alterar o banco de origem)`,
    ``,
    `SET NAMES utf8mb4;`,
    `SET FOREIGN_KEY_CHECKS = 0;`,
    `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';`,
    ``,
  ];

  console.log(`Exportando ${tables.length} tabelas de "${cfg.name}"...`);

  for (const table of tables) {
    const createRows = await prisma.$queryRawUnsafe(`SHOW CREATE TABLE \`${table}\``);
    const createSql = createRows[0]?.["Create Table"] ?? createRows[0]?.["Create View"];
    if (!createSql) {
      console.warn(`  ! pulando ${table} (sem CREATE)`);
      continue;
    }

    lines.push(`-- --------------------------------------------------------`);
    lines.push(`-- Tabela: ${table}`);
    lines.push(`-- --------------------------------------------------------`);
    lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
    lines.push(`${createSql};`);
    lines.push(``);

    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM \`${table}\``);
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`  - ${table}: 0 linhas`);
      continue;
    }

    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `\`${c}\``).join(", ");
    const chunkSize = 100;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values = chunk
        .map((row) => `(${cols.map((c) => sqlLiteral(row[c])).join(", ")})`)
        .join(",\n");
      lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES`);
      lines.push(`${values};`);
      lines.push(``);
    }

    console.log(`  - ${table}: ${rows.length} linhas`);
  }

  lines.push(`SET FOREIGN_KEY_CHECKS = 1;`);
  lines.push(``);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, lines.join("\n"), "utf8");
  console.log(`\nOK — dump salvo em:\n${outFile}`);
} catch (err) {
  console.error("Falha ao exportar:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
