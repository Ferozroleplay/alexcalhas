import { createFileRoute } from "@tanstack/react-router";

import { DespesasPage } from "@/components/admin/DespesasPage";

export const Route = createFileRoute("/painel/despesas")({
  component: DespesasPage,
});
