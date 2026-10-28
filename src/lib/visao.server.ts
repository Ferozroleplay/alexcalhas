import { getPrisma } from "@/lib/db.server";

export type AdminVisao = "admin" | "funcionário" | "fornecedor" | "contador";

const LOGINS_SIMULACAO = ["alex", "poliane", "polly"];
const EMAILS_SIMULACAO = ["alexcalhascrp@outlook.com", "polly_livinha@hotmail.com"];
const NOMES_SIMULACAO = ["alex", "poliane", "polly"];

export function normalizarVisao(raw: string): AdminVisao | null {
  const v = raw.trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "funcionario" || v === "funcionário") return "funcionário";
  if (v === "fornecedor") return "fornecedor";
  if (v === "contador") return "contador";
  return null;
}

export function usuarioPodeSimularVisao(row: {
  nivel: string;
  usuario: string;
  email: string;
  nome: string;
}): boolean {
  const nivel = row.nivel?.toLowerCase() ?? "";
  if (nivel !== "admin") return false;

  const login = row.usuario.trim().toLowerCase();
  const email = row.email.trim().toLowerCase();
  const nome = row.nome.trim().toLowerCase();

  if (LOGINS_SIMULACAO.includes(login)) return true;
  if (EMAILS_SIMULACAO.includes(email)) return true;
  return NOMES_SIMULACAO.some((p) => p && nome.includes(p));
}

export async function obterFornecedorPreviewId(): Promise<number> {
  const prisma = await getPrisma();
  const linked = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT f.id FROM fornecedores f
     INNER JOIN usuarios u ON u.fornecedor_id = f.id AND u.nivel = 'fornecedor'
     ORDER BY f.razao_social ASC LIMIT 1`,
  );
  if (linked[0]?.id) return linked[0].id;

  const any = await prisma.fornecedor.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  return any?.id ?? 0;
}

export function redirectAposVisao(visao: AdminVisao, fornecedorPreviewId: number): string {
  if (visao === "funcionário") return "/painel/ponto";
  if (visao === "contador") return "/painel/ponto-controle";
  if (visao === "fornecedor") {
    return fornecedorPreviewId > 0
      ? `/painel/inicio-fornecedor?controle=${fornecedorPreviewId}`
      : "/painel/inicio-fornecedor";
  }
  return "/painel";
}

export function grupoEfetivo(visao: AdminVisao): AdminVisao {
  return visao;
}

export function ehVisaoAdmin(visao: AdminVisao): boolean {
  return visao === "admin";
}
