import { createFileRoute } from "@tanstack/react-router";

import { AvisosPage } from "@/components/admin/AvisosPage";

export const Route = createFileRoute("/painel/avisos")({
  component: AvisosPage,
});
