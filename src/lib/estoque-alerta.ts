/** Regras de alerta de estoque (metros): mínimo 2 = amarelo; 1 = vermelho. */

export type EstoqueAlertaNivel = "normal" | "alerta" | "critico" | "zerado";

export const ESTOQUE_MINIMO_PADRAO_M = 2;

export function estoqueAlertaNivel(
  saldo: number,
  minimo: number = ESTOQUE_MINIMO_PADRAO_M,
): EstoqueAlertaNivel {
  const s = Number(saldo) || 0;
  const min = Number(minimo) > 0 ? Number(minimo) : ESTOQUE_MINIMO_PADRAO_M;
  if (s <= 0) return "zerado";
  if (s <= 1) return "critico";
  if (s <= min) return "alerta";
  return "normal";
}

export function estoqueAlertaLabel(nivel: EstoqueAlertaNivel): string {
  if (nivel === "zerado") return "Sem estoque";
  if (nivel === "critico") return "Crítico";
  if (nivel === "alerta") return "Alerta";
  return "Normal";
}

/** Percentual da barrinha (0–100) com referência no mínimo (2 m) + folga. */
export function estoqueAlertaPct(
  saldo: number,
  minimo: number = ESTOQUE_MINIMO_PADRAO_M,
): number {
  const s = Math.max(0, Number(saldo) || 0);
  const min = Number(minimo) > 0 ? Number(minimo) : ESTOQUE_MINIMO_PADRAO_M;
  const ref = Math.max(min * 3, 6);
  return Math.max(0, Math.min(100, (s / ref) * 100));
}

/** Apito curto no navegador (estoque crítico). */
export function apitarEstoqueCritico(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = i === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02 + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + i * 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + 0.14 + i * 0.16);
    }
    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    /* autoplay bloqueado ou sem áudio */
  }
}

/** Som de erro ao tentar adicionar sem estoque (buzina grave e clara). */
export function apitarEstoqueErro(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Dois “bips” graves de erro (estilo alerta de sistema).
    const beeps: { start: number; dur: number; f0: number; f1: number }[] = [
      { start: 0, dur: 0.16, f0: 420, f1: 180 },
      { start: 0.2, dur: 0.22, f0: 380, f1: 120 },
    ];

    for (const beep of beeps) {
      const t0 = now + beep.start;
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "square";
      osc2.type = "triangle";
      osc.frequency.setValueAtTime(beep.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, beep.f1), t0 + beep.dur);
      osc2.frequency.setValueAtTime(beep.f0 * 0.5, t0);
      osc2.frequency.exponentialRampToValueAtTime(Math.max(40, beep.f1 * 0.5), t0 + beep.dur);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, t0);
      filter.frequency.exponentialRampToValueAtTime(400, t0 + beep.dur);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.015);
      gain.gain.setValueAtTime(0.18, t0 + beep.dur * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + beep.dur);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t0);
      osc2.start(t0);
      osc.stop(t0 + beep.dur + 0.02);
      osc2.stop(t0 + beep.dur + 0.02);
    }

    window.setTimeout(() => void ctx.close(), 700);
  } catch {
    /* autoplay bloqueado ou sem áudio */
  }
}
