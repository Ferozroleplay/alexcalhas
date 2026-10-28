import type { AgendamentoPayload } from "@/types/site";

export type AgendamentoResponse = {
  ok: boolean;
  id?: string | number;
  hora?: string;
  message?: string;
};

export async function fetchHorariosVisita(
  data: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const qs = new URLSearchParams({ data });
  const res = await fetch(`/api/horarios-visita?${qs}`, { signal });
  const json = (await res.json()) as { ok?: boolean; horarios?: string[] };
  if (!res.ok || !json.ok) {
    throw new Error("Não foi possível carregar os horários.");
  }
  return Array.isArray(json.horarios) ? json.horarios : [];
}

export async function fetchHorariosMes(
  mes: string,
  signal?: AbortSignal,
): Promise<Record<string, string[]>> {
  const qs = new URLSearchParams({ mes });
  const res = await fetch(`/api/horarios-visita?${qs}`, { signal });
  const json = (await res.json()) as { ok?: boolean; dias?: Record<string, string[]> };
  if (!res.ok || !json.ok) {
    throw new Error("Não foi possível carregar os horários.");
  }
  return json.dias && typeof json.dias === "object" ? json.dias : {};
}

/**
 * Envia um agendamento para a API REST.
 *
 * Em produção esta rota é servida pelo backend próprio (MySQL via Prisma).
 * Persiste na tabela `inventario` (MySQL Hostinger). Ver `prisma/schema.prisma`.
 */
export async function enviarAgendamento(
  payload: AgendamentoPayload,
): Promise<AgendamentoResponse> {
  const res = await fetch("/api/agendamentos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = "Não foi possível enviar o agendamento.";
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  return (await res.json()) as AgendamentoResponse;
}
