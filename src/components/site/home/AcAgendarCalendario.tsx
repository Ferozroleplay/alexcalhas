import { VISITA_SLOTS } from "@/lib/agendamento-horarios";
import { pontoHojeIso } from "@/lib/ponto-timezone";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export function padMes(n: number): string {
  return String(n).padStart(2, "0");
}

export function chaveMes(y: number, m: number): string {
  return `${y}-${padMes(m)}`;
}

export function mesDeIso(iso: string): { y: number; m: number } {
  const [y, m] = iso.split("-").map(Number);
  return { y, m };
}

export function tituloMes(y: number, m: number): string {
  const nome = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${y}`;
}

export function tituloDiaLongo(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function celulasMes(y: number, m: number): Array<{ iso: string; dia: number } | null> {
  const start = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  const cells: Array<{ iso: string; dia: number } | null> = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= last; d++) {
    cells.push({ iso: `${y}-${padMes(m)}-${padMes(d)}`, dia: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type StatusDia = "past" | "free" | "full" | "wait";

function statusDia(iso: string, livres: string[] | undefined, hoje: string, loading: boolean): StatusDia {
  if (iso < hoje) return "past";
  if (livres == null) return loading ? "wait" : "full";
  return livres.length > 0 ? "free" : "full";
}

type Props = {
  data: string;
  hora: string;
  dias: Record<string, string[]>;
  mesLoading: boolean;
  mesErro: boolean;
  viewY: number;
  viewM: number;
  busy: boolean;
  onView: (y: number, m: number) => void;
  onSelectData: (iso: string) => void;
  onSelectHora: (hora: string) => void;
};

export function AcAgendarCalendario({
  data,
  hora,
  dias,
  mesLoading,
  mesErro,
  viewY,
  viewM,
  busy,
  onView,
  onSelectData,
  onSelectHora,
}: Props) {
  const hoje = pontoHojeIso();
  const { y: hojeY, m: hojeM } = mesDeIso(hoje);
  const podeVoltar = viewY > hojeY || (viewY === hojeY && viewM > hojeM);
  const limite = new Date(hojeY, hojeM - 1 + 2, 1);
  const podeAvancar = new Date(viewY, viewM - 1, 1) < limite;
  const horarios = data ? (dias[data] ?? []) : [];
  const horaLoading = mesLoading && data.startsWith(chaveMes(viewY, viewM));

  function ir(delta: number) {
    const dt = new Date(viewY, viewM - 1 + delta, 1);
    onView(dt.getFullYear(), dt.getMonth() + 1);
  }

  return (
    <div className="ac-agenda-cal">
      <div className="ac-agenda-cal__month">
        <div className="ac-agenda-cal__nav">
          <button
            type="button"
            className="ac-agenda-cal__nav-btn"
            aria-label="Mês anterior"
            disabled={!podeVoltar || busy}
            onClick={() => ir(-1)}
          >
            ‹
          </button>
          <p className="ac-agenda-cal__title">{tituloMes(viewY, viewM)}</p>
          <button
            type="button"
            className="ac-agenda-cal__nav-btn"
            aria-label="Próximo mês"
            disabled={!podeAvancar || busy}
            onClick={() => ir(1)}
          >
            ›
          </button>
        </div>
        <div className="ac-agenda-cal__week" aria-hidden="true">
          {SEMANA.map((letra, i) => (
            <span key={`${letra}-${i}`}>{letra}</span>
          ))}
        </div>
        <div className="ac-agenda-cal__grid" role="grid" aria-label="Calendário de visitas">
          {celulasMes(viewY, viewM).map((cell, i) => {
            if (!cell) {
              return <span key={`e-${i}`} className="ac-agenda-cal__day ac-agenda-cal__day--empty" />;
            }
            const st = statusDia(cell.iso, dias[cell.iso], hoje, mesLoading);
            const selected = data === cell.iso;
            const blocked = st === "past" || st === "wait";
            return (
              <button
                key={cell.iso}
                type="button"
                role="gridcell"
                aria-pressed={selected}
                aria-label={`${cell.dia} de ${tituloMes(viewY, viewM)}`}
                disabled={busy || blocked}
                className={`ac-agenda-cal__day is-${st}${selected ? " is-selected" : ""}`}
                onClick={() => onSelectData(cell.iso)}
              >
                {cell.dia}
              </button>
            );
          })}
        </div>
        <ul className="ac-agenda-cal__legend">
          <li>
            <span className="ac-agenda-cal__dot is-free" /> Com horário
          </li>
          <li>
            <span className="ac-agenda-cal__dot is-full" /> Sem horário
          </li>
          <li>
            <span className="ac-agenda-cal__dot is-past" /> Indisponível
          </li>
        </ul>
      </div>

      <div className="ac-agenda-cal__times">
        {data ? (
          <p className="ac-agenda-cal__when">
            <span aria-hidden="true">»</span> {tituloDiaLongo(data)}
          </p>
        ) : (
          <p className="ac-agenda-cal__when ac-agenda-cal__when--muted">Escolha um dia com horário</p>
        )}
        <div className="ac-hora-slots" role="group" aria-label="Horários">
          {VISITA_SLOTS.map((slot) => {
            const livre = horarios.includes(slot);
            const taken = Boolean(data) && !horaLoading && !mesErro && !livre;
            return (
              <button
                key={slot}
                type="button"
                className={`ac-hora-slot${hora === slot ? " is-selected" : ""}${taken ? " is-taken" : ""}`}
                aria-pressed={hora === slot}
                disabled={busy || !livre}
                onClick={() => onSelectHora(slot)}
              >
                {slot}
              </button>
            );
          })}
        </div>
        {horaLoading ? (
          <p className="ac-agendar-hora-hint" role="status">
            Buscando horários…
          </p>
        ) : mesErro ? (
          <p className="ac-agendar-hora-hint ac-agendar-hora-hint--warn">
            Não deu para carregar os horários. Tente outro mês ou recarregue.
          </p>
        ) : data && horarios.length === 0 ? (
          <p className="ac-agendar-hora-hint ac-agendar-hora-hint--warn">
            Sem horário livre nesse dia. Escolha outra data.
          </p>
        ) : (
          <p className="ac-agendar-hora-hint">Horários com 2 horas de intervalo entre visitas.</p>
        )}
      </div>
    </div>
  );
}
