import { createFileRoute } from "@tanstack/react-router";

import { ParceirosPage } from "@/components/admin/ParceirosPage";

export const Route = createFileRoute("/painel/parceiros")({
  component: ParceirosPage,
});
