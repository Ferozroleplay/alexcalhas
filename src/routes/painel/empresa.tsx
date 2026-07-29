import { createFileRoute } from "@tanstack/react-router";

import { EmpresaPage } from "@/components/admin/EmpresaPage";

export const Route = createFileRoute("/painel/empresa")({
  component: EmpresaPage,
});
