import { createFileRoute } from "@tanstack/react-router";

import { CalculadoraBobinaPage } from "@/components/admin/CalculadoraBobinaPage";

export const Route = createFileRoute("/painel/calculadora-bobina")({
  component: CalculadoraBobinaPage,
});
