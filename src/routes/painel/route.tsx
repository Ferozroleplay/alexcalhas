import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AdminAuthProvider, useAdminAuth } from "@/components/admin/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTheme } from "@/components/admin/AdminTheme";
import { DashUiProvider } from "@/components/admin/DashUiProvider";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Painel — Alex Calhas" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
      },
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
      },
      { rel: "stylesheet", href: "/admin/painel.css" },
      { rel: "stylesheet", href: "/admin/dashboard-saas.css" },
      { rel: "stylesheet", href: "/admin/admin-react.css" },
      { rel: "stylesheet", href: "/admin/calculadora-bobina.css" },
      { rel: "stylesheet", href: "/admin/orcamento-modal.css" },
    ],
  }),
  component: PainelLayout,
});

function PainelLayout() {
  return (
    <AdminAuthProvider>
      <AdminTheme />
      <DashUiProvider>
        <PainelGate />
      </DashUiProvider>
    </AdminAuthProvider>
  );
}

function PainelGate() {
  const { ready, authenticated } = useAdminAuth();

  if (!ready) {
    return (
      <main className="min-h-screen grid place-items-center">
        <Loader2 className="animate-spin text-emerald-500" size={32} aria-label="Carregando" />
      </main>
    );
  }

  if (!authenticated) {
    return <Navigate to="/" search={{ painel: "login" }} replace />;
  }
  return <AdminShell />;
}
