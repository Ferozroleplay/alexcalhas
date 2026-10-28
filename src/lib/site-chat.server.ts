import { HOME_SITE } from "@/data/home-config";
import { getPrisma } from "@/lib/db.server";
import {
  fotoChatPublicUrl,
  isFotoChatPadrao,
  SITE_CHAT_FOTO_PADRAO,
} from "@/lib/site-chat-upload.server";

export type SiteChatPublico = {
  nome: string;
  cargo: string;
  mensagem: string;
  foto_url: string;
};

type DbRow = {
  nome: string;
  cargo: string;
  mensagem: string;
  foto: string | null;
};

let tabelaPronta = false;

function escSql(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

const MSG_ANTIGA = "Oi! 😊 Sou a {nome}, da Alex Calhas. Em que posso te ajudar hoje?";

export const SITE_CHAT_DEFAULTS: SiteChatPublico = {
  nome: HOME_SITE.chat.nome,
  cargo: HOME_SITE.chat.cargo,
  mensagem: HOME_SITE.chat.mensagem,
  foto_url: HOME_SITE.chat.foto,
};

async function ensureSiteChatTable(): Promise<void> {
  if (tabelaPronta) return;
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_chat (
      id INT PRIMARY KEY,
      nome VARCHAR(80) NOT NULL,
      cargo VARCHAR(120) NOT NULL,
      mensagem VARCHAR(500) NOT NULL,
      foto VARCHAR(255) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const rows = await prisma.$queryRawUnsafe<Array<{ c: number | bigint }>>(
    `SELECT COUNT(*) AS c FROM site_chat WHERE id = 1`,
  );
  const count = Number(rows[0]?.c ?? 0);
  if (count === 0) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO site_chat (id, nome, cargo, mensagem, foto)
      VALUES (
        1,
        '${escSql(SITE_CHAT_DEFAULTS.nome)}',
        '${escSql(SITE_CHAT_DEFAULTS.cargo)}',
        '${escSql(SITE_CHAT_DEFAULTS.mensagem)}',
        '${escSql(SITE_CHAT_FOTO_PADRAO)}'
      )
    `);
  }
  tabelaPronta = true;
}

function mapPublico(row: DbRow | null): SiteChatPublico {
  if (!row) return { ...SITE_CHAT_DEFAULTS };
  const mensagemBruta = row.mensagem.trim();
  return {
    nome: row.nome.trim() || SITE_CHAT_DEFAULTS.nome,
    cargo: row.cargo.trim() || SITE_CHAT_DEFAULTS.cargo,
    mensagem: !mensagemBruta || mensagemBruta === MSG_ANTIGA ? SITE_CHAT_DEFAULTS.mensagem : mensagemBruta,
    foto_url: fotoChatPublicUrl(row.foto),
  };
}

export async function getSiteChat(): Promise<SiteChatPublico> {
  await ensureSiteChatTable();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT nome, cargo, mensagem, foto FROM site_chat WHERE id = 1 LIMIT 1`,
  );
  return mapPublico(rows[0] ?? null);
}

export async function getSiteChatFotoStored(): Promise<string> {
  await ensureSiteChatTable();
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Array<{ foto: string | null }>>(
    `SELECT foto FROM site_chat WHERE id = 1 LIMIT 1`,
  );
  return rows[0]?.foto?.trim() || SITE_CHAT_FOTO_PADRAO;
}

export async function updateSiteChat(input: {
  nome?: string;
  cargo?: string;
  mensagem?: string;
}): Promise<SiteChatPublico> {
  await ensureSiteChatTable();
  const atual = await getSiteChat();
  const nome = (input.nome ?? atual.nome).trim().slice(0, 80) || SITE_CHAT_DEFAULTS.nome;
  const cargo = (input.cargo ?? atual.cargo).trim().slice(0, 120) || SITE_CHAT_DEFAULTS.cargo;
  const mensagem =
    (input.mensagem ?? atual.mensagem).trim().slice(0, 500) || SITE_CHAT_DEFAULTS.mensagem;
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    UPDATE site_chat
    SET nome = '${escSql(nome)}',
        cargo = '${escSql(cargo)}',
        mensagem = '${escSql(mensagem)}'
    WHERE id = 1
  `);
  return getSiteChat();
}

export async function setSiteChatFoto(arquivo: string): Promise<string> {
  await ensureSiteChatTable();
  const anterior = await getSiteChatFotoStored();
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    UPDATE site_chat SET foto = '${escSql(arquivo.slice(0, 255))}' WHERE id = 1
  `);
  return isFotoChatPadrao(anterior) ? "" : anterior;
}
