/** Grade pública de visitas: 08:00–18:00, 2h entre um e outro. */
export const VISITA_GAP_MIN = 120;
export const VISITA_PRIMEIRO_MIN = 8 * 60;
export const VISITA_ULTIMO_MIN = 18 * 60;
export const VISITA_SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"] as const;

/** Só relógio (HH:MM). Não lê data (28-10-2026 / 2026-10-28). */
export function minutosDeHora(raw: string): number | null {
  const t = String(raw ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function fmtHoraMinutos(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 14:36 e 17:47 (hora do clique) viram 14:00 e 18:00 na grade. */
export function encaixarNaGrade(minutos: number): number {
  if (!Number.isFinite(minutos)) return VISITA_PRIMEIRO_MIN;
  const idx = Math.round((minutos - VISITA_PRIMEIRO_MIN) / VISITA_GAP_MIN);
  const slot = VISITA_PRIMEIRO_MIN + idx * VISITA_GAP_MIN;
  return Math.min(VISITA_ULTIMO_MIN, Math.max(VISITA_PRIMEIRO_MIN, slot));
}

export function slotLivreDeOcupados(slot: number, ocupados: number[]): boolean {
  return ocupados.every((o) => Math.abs(slot - o) >= VISITA_GAP_MIN);
}

export function filtrarHorariosLivres(ocupados: number[], pisoMinutos: number): string[] {
  const naGrade = ocupados.map(encaixarNaGrade);
  const livres: string[] = [];
  for (let slot = VISITA_PRIMEIRO_MIN; slot <= VISITA_ULTIMO_MIN; slot += VISITA_GAP_MIN) {
    if (slot < pisoMinutos) continue;
    if (slotLivreDeOcupados(slot, naGrade)) livres.push(fmtHoraMinutos(slot));
  }
  return livres;
}
