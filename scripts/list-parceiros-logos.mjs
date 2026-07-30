import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });

const user = process.env.DB_USER;
const pass = process.env.DB_PASSWORD;
const db = process.env.DB_NAME;
const host = process.env.DB_HOST;
const port = process.env.DB_PORT || "3306";
const url = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(db)}`;
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT id, nome, logo, ativo FROM parceiros_site ORDER BY id",
  );
  for (const r of rows) {
    const logo = r.logo?.trim() || "";
    const isUrl = /^https?:\/\//i.test(logo) || logo.startsWith("blobprivate:");
    const localName = logo.replace(/^\/+/, "").split(/[/\\]/).pop() || "";
    const localPath = resolve(process.cwd(), "public", "images", "parceiros", localName);
    const localOk = !isUrl && localName ? existsSync(localPath) : null;
    console.log(
      [
        `id=${r.id}`,
        `ativo=${Number(r.ativo) === 1 ? "sim" : "nao"}`,
        `nome=${r.nome}`,
        `logo=${logo || "(vazio)"}`,
        isUrl ? "tipo=url/blob" : `local=${localOk ? "OK" : "FALTANDO"}`,
      ].join(" | "),
    );
  }
} finally {
  await prisma.$disconnect();
}
