import { createFileRoute } from "@tanstack/react-router";

import { CalculadoraCondutoresPage } from "@/components/admin/CalculadoraCondutoresPage";

export const Route = createFileRoute("/painel/calculadora-condutores")({
  component: CalculadoraCondutoresPage,
});
