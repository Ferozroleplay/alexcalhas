import { createHmac, timingSafeEqual } from "node:crypto";

import { getAuthSecret } from "@/lib/config.server";
import { getPrisma } from "@/lib/db.server";
import type { AdminVisao } from "@/lib/visao.server";
import {
  obterFornecedorPreviewId,
  redirectAposVisao,
  usuarioPodeSimularVisao,
} from "@/lib/visao.server";

export const ADMIN_COOKIE = "admin_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/** Backup da sessão admin ao impersonar outro usuário (igual Alex `MM_Impersonacao`). */
export type ImpersonationBackup = {
  userId: number;
  nome: string;
  usuario: string;
  visao: AdminVisao;
  podeSimular: boolean;
  fornecedorPreviewId: number;
};

export type AdminSessionPayload = {
  exp: number;
  userId: number;
  nome: string;
  usuario: string;
  thumb: string;
  nivelReal: string;
  visao: AdminVisao;
  podeSimular: boolean;
  fornecedorPreviewId: number;
  impersonation?: ImpersonationBackup | null;
};

export type AdminSessionPublic = {
  id: number;
  nome: string;
  usuario: string;
  thumb: string;
  visao: AdminVisao;
  podeSimular: boolean;
  simulando: boolean;
  fornecedorPreviewId: number;
  /** Conta logada originalmente é administrador. */
  adminReal: boolean;
  /** Pode abrir Usuários, impersonar e cadastrar (somente admin na visão admin). */
  podeGerenciarUsuarios: boolean;
  impersonando: boolean;
  impersonadorNome: string;
};

function signPayload(payloadB64: string, secret: string) {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Controle/exclusão de ponto — igual Alex `usuarioEhAdmin()` (visão administrador ativa). */
export function podeGerenciarPonto(session: AdminSessionPayload | null | undefined): boolean {
  return session?.visao === "admin";
}

/** Histórico de ponto (leitura + PDF). Admin e contador. */
export function podeVerHistoricoPonto(session: AdminSessionPayload | null | undefined): boolean {
  return session?.visao === "admin" || session?.visao === "contador";
}

export function ehAdminReal(session: AdminSessionPayload | null | undefined): boolean {
  return (session?.nivelReal?.toLowerCase() ?? "") === "admin";
}

export function estaImpersonando(session: AdminSessionPayload | null | undefined): boolean {
  return Boolean(session?.impersonation);
}

/** Igual Alex: rota `/usuarios` só para grupo admin efetivo, não durante impersonação. */
export function podeGerenciarUsuarios(session: AdminSessionPayload | null | undefined): boolean {
  if (!session) return false;
  return (
    ehAdminReal(session) &&
    session.visao === "admin" &&
    !estaImpersonando(session)
  );
}

export function sessionToPublic(session: AdminSessionPayload): AdminSessionPublic {
  const impersonando = estaImpersonando(session);
  return {
    id: session.userId,
    nome: session.nome,
    usuario: session.usuario,
    thumb: session.thumb ?? "nao.png",
    visao: session.visao,
    podeSimular: session.podeSimular,
    /** Admin alternando visão (demo) — não confundir com funcionário/fornecedor reais. */
    simulando:
      ehAdminReal(session) &&
      session.podeSimular &&
      session.visao !== "admin" &&
      !impersonando,
    fornecedorPreviewId: session.fornecedorPreviewId,
    adminReal: ehAdminReal(session),
    podeGerenciarUsuarios: podeGerenciarUsuarios(session),
    impersonando,
    impersonadorNome: impersonando ? (session.impersonation?.nome ?? "") : "",
  };
}

export async function buildAdminSessionPayload(user: {
  id: number;
  nome: string;
  usuario: string;
  email: string;
  nivel: string;
  thumb?: string;
}, visao?: AdminVisao): Promise<Omit<AdminSessionPayload, "exp">> {
  const podeSimular = usuarioPodeSimularVisao({
    nivel: user.nivel,
    usuario: user.usuario,
    email: user.email,
    nome: user.nome,
  });
  const visaoPadrao = visaoPorNivel(user.nivel);
  /** Login e refresh: visão sempre conforme o nível real, salvo simulação explícita (admin). */
  const v = visao ?? visaoPadrao;
  let fornecedorPreviewId = 0;
  if (v === "fornecedor") {
    const prisma = await getPrisma();
    const link = await prisma.usuario.findUnique({
      where: { id: user.id },
      select: { fornecedorId: true },
    });
    const fid = link?.fornecedorId ?? 0;
    fornecedorPreviewId =
      fid > 0 ? fid : podeSimular ? await obterFornecedorPreviewId() : 0;
  }
  return {
    userId: user.id,
    nome: user.nome,
    usuario: user.usuario,
    thumb: user.thumb?.trim() || "nao.png",
    nivelReal: user.nivel,
    visao: v,
    podeSimular,
    fornecedorPreviewId,
  };
}

export function createAdminSessionToken(payload: Omit<AdminSessionPayload, "exp">): string | null {
  const secret = getAuthSecret();
  if (!secret) return null;

  const exp = Date.now() + SESSION_MS;
  const body: AdminSessionPayload = { ...payload, exp };
  const payloadB64 = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const sig = signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function parseAdminSessionToken(token: string | null | undefined): AdminSessionPayload | null {
  if (!token) return null;
  const secret = getAuthSecret();
  if (!secret) return null;

  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = signPayload(payloadB64, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const raw = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<
      AdminSessionPayload
    >;
    if (typeof raw.exp !== "number" || raw.exp <= Date.now()) return null;
    if (typeof raw.userId !== "number") return null;
    if (usuarioSemAcesso(String(raw.usuario ?? ""))) return null;
    const body: AdminSessionPayload = {
      exp: raw.exp,
      userId: raw.userId,
      nome: String(raw.nome ?? ""),
      usuario: String(raw.usuario ?? ""),
      thumb: String(raw.thumb ?? "nao.png"),
      nivelReal: String(raw.nivelReal ?? "admin"),
      visao: (raw.visao as AdminVisao) ?? "admin",
      podeSimular: Boolean(raw.podeSimular),
      fornecedorPreviewId: Number(raw.fornecedorPreviewId ?? 0),
      impersonation: raw.impersonation ?? null,
    };
    return body;
  } catch {
    return null;
  }
}

export function getAdminSessionFromRequest(request: Request): AdminSessionPayload | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${ADMIN_COOKIE}=([^;]+)`));
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  return parseAdminSessionToken(token);
}

export function isAdminRequest(request: Request): boolean {
  return getAdminSessionFromRequest(request) !== null;
}

/** Sessão logada na visão administrador (caixa, financeiro, estoque). */
export function isAdminVisaoRequest(request: Request): boolean {
  return getAdminSessionFromRequest(request)?.visao === "admin";
}

/** Funcionário só acessa serviço atribuído a ele (ou visita ainda sem dono). */
export function funcionarioPodeVerInventario(
  session: AdminSessionPayload | null,
  funcionarioId: number | null | undefined,
): boolean {
  if (!session) return false;
  if (session.visao !== "funcionário") return true;
  if (funcionarioId == null) return true;
  return Number(funcionarioId) === session.userId;
}

/** Visão efetiva (admin / funcionário / fornecedor) para filtros e UI. */
export function getVisaoFromRequest(request: Request): AdminVisao {
  return getAdminSessionFromRequest(request)?.visao ?? "admin";
}

export function adminSessionCookieHeader(token: string): [string, string] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = Math.floor(SESSION_MS / 1000);
  return [
    "Set-Cookie",
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  ];
}

export function clearAdminSessionCookieHeader(): [string, string] {
  return ["Set-Cookie", `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`];
}

/** Login com tabela `usuarios` (senha bcrypt PHP $2y$ / $2b$). */
export async function authenticateUsuario(
  login: string,
  password: string,
): Promise<{
  id: number;
  nome: string;
  usuario: string;
  email: string;
  nivel: string;
  thumb: string;
} | null> {
  const prisma = await getPrisma();
  const loginTrim = login.trim();
  const rows = await prisma.$queryRawUnsafe<
    {
      id: number;
      nome: string;
      usuario: string;
      email: string;
      nivel: string;
      thumb: string | null;
      senha: string;
    }[]
  >(
    `SELECT id, nome, usuario, email, nivel, thumb, senha
     FROM usuarios WHERE TRIM(usuario) = ? LIMIT 1`,
    loginTrim,
  );
  const row = rows[0];
  if (!row) return null;
  if (!nivelPermiteLogin(row.nivel) || usuarioSemAcesso(row.usuario)) return null;

  const bcrypt = await import("bcryptjs");
  const hash = row.senha.replace(/^\$2[yb]\$/, "$2a$");
  const ok = await bcrypt.compare(password, hash);
  if (!ok) return null;

  return {
    id: row.id,
    nome: row.nome,
    usuario: row.usuario,
    email: row.email,
    nivel: row.nivel,
    thumb: row.thumb?.trim() || "nao.png",
  };
}

function normalizarNivelUsuario(nivel: string): string {
  const n = nivel.trim().toLowerCase();
  if (n === "funcionario") return "funcionário";
  return n;
}

/** Contas sem login. O admin geral é o Alex; Elias não entra mais. */
function usuarioSemAcesso(usuario: string): boolean {
  return usuario.trim().toLowerCase() === "elias";
}

function nivelPermiteLogin(nivel: string): boolean {
  const n = normalizarNivelUsuario(nivel);
  return n === "admin" || n === "funcionário" || n === "fornecedor" || n === "contador";
}

export function visaoPorNivel(nivel: string): AdminVisao {
  const n = normalizarNivelUsuario(nivel);
  if (n === "funcionário") return "funcionário";
  if (n === "fornecedor") return "fornecedor";
  if (n === "contador") return "contador";
  if (n === "admin") return "admin";
  return "funcionário";
}

export function redirectAposImpersonacao(
  nivel: string,
  fornecedorId: number,
): string {
  return redirectAposVisao(visaoPorNivel(nivel), fornecedorId);
}

/** Para onde enviar após login (conforme visão da sessão). */
export function redirectAposLogin(payload: {
  visao: AdminVisao;
  fornecedorPreviewId: number;
}): string {
  return redirectAposVisao(payload.visao, payload.fornecedorPreviewId);
}

type UsuarioDbRow = {
  id: number;
  nome: string;
  usuario: string;
  email: string;
  nivel: string;
  thumb: string;
  fornecedorId: number | null;
};

async function carregarUsuarioDb(userId: number): Promise<UsuarioDbRow | null> {
  const prisma = await getPrisma();
  const row = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    usuario: row.usuario,
    email: row.email,
    nivel: row.nivel,
    thumb: row.thumb?.trim() || "nao.png",
    fornecedorId: row.fornecedorId,
  };
}

/** Admin real entra na conta de outro usuário. */
export async function iniciarImpersonacao(
  session: AdminSessionPayload,
  targetId: number,
): Promise<{ ok: boolean; redirect?: string; token?: string; message?: string }> {
  if (!ehAdminReal(session) || estaImpersonando(session)) {
    return { ok: false, message: "Sem permissão." };
  }
  if (targetId <= 0 || targetId === session.userId) {
    return { ok: false, message: "Usuário inválido." };
  }

  const alvo = await carregarUsuarioDb(targetId);
  if (!alvo) return { ok: false, message: "Usuário não encontrado." };

  const backup: ImpersonationBackup = {
    userId: session.userId,
    nome: session.nome,
    usuario: session.usuario,
    visao: session.visao,
    podeSimular: session.podeSimular,
    fornecedorPreviewId: session.fornecedorPreviewId,
  };

  const visao = visaoPorNivel(alvo.nivel);
  let fornecedorPreviewId = 0;
  if (visao === "fornecedor") {
    fornecedorPreviewId =
      alvo.fornecedorId && alvo.fornecedorId > 0
        ? alvo.fornecedorId
        : await obterFornecedorPreviewId();
  }

  const payload: Omit<AdminSessionPayload, "exp"> = {
    userId: alvo.id,
    nome: alvo.nome,
    usuario: alvo.usuario,
    thumb: alvo.thumb,
    nivelReal: session.nivelReal,
    visao,
    podeSimular: session.podeSimular,
    fornecedorPreviewId,
    impersonation: backup,
  };

  const token = createAdminSessionToken(payload);
  if (!token) return { ok: false, message: "Não foi possível criar a sessão." };

  return {
    ok: true,
    redirect: redirectAposImpersonacao(alvo.nivel, fornecedorPreviewId),
    token,
  };
}

/** Volta à conta administrador original. */
export async function encerrarImpersonacao(
  session: AdminSessionPayload,
): Promise<{ ok: boolean; redirect?: string; token?: string; message?: string }> {
  if (!estaImpersonando(session) || !session.impersonation) {
    return { ok: false, message: "Não está impersonando." };
  }

  const b = session.impersonation;
  const admin = await carregarUsuarioDb(b.userId);
  if (!admin || admin.nivel.toLowerCase() !== "admin") {
    return { ok: false, message: "Conta admin original não encontrada." };
  }

  const payload = await buildAdminSessionPayload(
    {
      id: admin.id,
      nome: admin.nome,
      usuario: admin.usuario,
      email: admin.email,
      nivel: admin.nivel,
      thumb: admin.thumb,
    },
    "admin",
  );

  const token = createAdminSessionToken(payload);
  if (!token) return { ok: false, message: "Não foi possível restaurar a sessão." };

  return { ok: true, redirect: "/painel/usuarios", token };
}
