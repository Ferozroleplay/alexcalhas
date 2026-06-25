import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import type { AdminVisao } from "@/lib/visao.server";

/** Rotas que só o admin (visão admin) pode acessar. */
const ADMIN_ONLY = [
  "/painel",
  "/painel/orcamentado",
  "/painel/confirmado",
  "/painel/finalizado",
  "/painel/material",
  "/painel/calculadora-bobina",
  "/painel/clientes",
  "/painel/usuarios",
  "/painel/financeiro",
  "/painel/logs",
  "/painel/ponto-controle",
  "/painel/produtos",
  "/painel/agendar",
];

/** Rotas permitidas ao funcionário. */
const FUNC_ALLOWED_PREFIXES = [
  "/painel/ponto",
  "/painel/visitas",
  "/painel/funcionarios",
  "/painel/agendar",
];

/** Rotas permitidas ao fornecedor (demais redireciona para o portal). */
const FORNECEDOR_ALLOWED_PREFIXES = ["/painel/inicio-fornecedor", "/painel/fornecedores"];

function destinoPadrao(visao: AdminVisao, fornecedorId: number): string {
  if (visao === "funcionário") return "/painel/ponto";
  if (visao === "fornecedor") {
    return fornecedorId > 0
      ? `/painel/inicio-fornecedor?controle=${fornecedorId}`
      : "/painel/inicio-fornecedor";
  }
  return "/painel";
}

function pathBloqueado(pathname: string, visao: AdminVisao): boolean {
  const p = pathname.replace(/\/$/, "") || "/painel";

  if (visao === "admin") return false;

  if (visao === "funcionário") {
    return !FUNC_ALLOWED_PREFIXES.some(
      (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`),
    );
  }

  if (visao === "fornecedor") {
    return !FORNECEDOR_ALLOWED_PREFIXES.some(
      (prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`),
    );
  }

  return false;
}

/** Impede funcionário/fornecedor de abrir URLs do painel admin no navegador. */
export function PainelVisaoGuard() {
  const { user, ready } = useAdminAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready || !user) return;
    if (user.podeSimular && user.visao === "admin") return;
    if (!pathBloqueado(pathname, user.visao)) return;

    const destino = destinoPadrao(user.visao, user.fornecedorPreviewId);
    const [path, search] = destino.split("?");
    if (search) {
      const params = Object.fromEntries(new URLSearchParams(search));
      void navigate({ to: path, search: params, replace: true });
    } else {
      void navigate({ to: path, replace: true });
    }
  }, [ready, user, pathname, navigate]);

  return null;
}
