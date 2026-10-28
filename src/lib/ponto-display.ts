export function pontoNormalizarTipo(tipo: string): string | null {
  const t = tipo.toLowerCase().trim();
  const map: Record<string, string> = {
    entrada: "entrada",
    almoco: "almoco",
    almoço: "almoco",
    retorno: "retorno_almoco",
    retorno_almoco: "retorno_almoco",
    saida: "saida",
    saída: "saida",
  };
  return map[t] ?? null;
}

export function pontoLabelTipo(tipo: string): string {
  switch (pontoNormalizarTipo(tipo)) {
    case "entrada":
      return "Entrada";
    case "almoco":
      return "Almoço";
    case "retorno_almoco":
      return "Retorno";
    case "saida":
      return "Saída";
    default:
      return tipo;
  }
}

export function pontoClasseBadge(tipo: string): string {
  switch (pontoNormalizarTipo(tipo)) {
    case "entrada":
      return "dash-ponto-tipo--entrada";
    case "almoco":
      return "dash-ponto-tipo--almoco";
    case "retorno_almoco":
      return "dash-ponto-tipo--retorno";
    case "saida":
      return "dash-ponto-tipo--saida";
    default:
      return "bg-secondary";
  }
}

export { formatDataHoraPontoTz as formatDataHoraPonto } from "@/lib/ponto-timezone";

export function formatMinutosPontoLabel(minutos: number | null): string {
  if (minutos === null || minutos < 0) return "—";
  if (minutos === 0) return "0min";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}
