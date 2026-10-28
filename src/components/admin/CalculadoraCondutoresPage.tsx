import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { DashPageHero } from "@/components/admin/DashPageHero";
import { parseNumeroBr } from "@/lib/calculadora-bobina";
import {
  PECA_1,
  PECA_2,
  calcularCondutores,
  fmtCm,
  type CondutoresEntrada,
  type CondutoresStatusKind,
} from "@/lib/calculadora-condutores";

type Campos = {
  largura: string;
  marcacao: string;
  deslocamento: string;
  alturaTotal: string;
  primeiraDescida: string;
  corteReal: string;
};

const PECA_1_CAMPOS: Campos = {
  largura: "6",
  marcacao: "4,5",
  deslocamento: "53,5",
  alturaTotal: "325",
  primeiraDescida: "22",
  corteReal: "",
};

const STATUS_LABEL: Record<CondutoresStatusKind, string> = {
  ok: "Calibrado",
  warning: "Estimativa",
  error: "Atenção",
};

function parseCampo(raw: string): number {
  return parseNumeroBr(raw);
}

function parseCorteOpcional(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = parseNumeroBr(raw);
  return n > 0 ? n : null;
}

function toEntrada(campos: Campos): CondutoresEntrada {
  return {
    largura: parseCampo(campos.largura),
    marcacao: parseCampo(campos.marcacao),
    deslocamento: parseCampo(campos.deslocamento),
    alturaTotal: parseCampo(campos.alturaTotal),
    primeiraDescida: parseCampo(campos.primeiraDescida),
    corteReal: parseCorteOpcional(campos.corteReal),
  };
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="dash-condutor-field">
      <label className="dash-condutor-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="dash-condutor-input">
        <input
          id={id}
          className="dash-condutor-input__control"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="dash-condutor-input__unit">cm</span>
      </div>
      {hint ? <span className="dash-condutor-field__hint">{hint}</span> : null}
    </div>
  );
}

type EsquemaLabels = {
  svgP: string;
  svgD: string;
  svgI: string;
  svgH: string;
  svgF: string;
};

function EsquemaCondutor({
  labels,
  variant = "card",
}: {
  labels: EsquemaLabels;
  variant?: "card" | "full";
}) {
  const { svgP, svgD, svgI, svgH, svgF } = labels;
  const gridId = `condutor-grid-${variant}`;

  return (
    <svg
      className={`dash-condutor-svg${variant === "full" ? " dash-condutor-svg--full" : " dash-condutor-svg--zoom"}`}
      viewBox="0 0 1040 680"
      aria-label="Esquema lateral do condutor"
    >
      <defs>
        <pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.55" />
        </pattern>
      </defs>
      <rect className="dash-condutor-svg__grid" x="0" y="0" width="1040" height="680" fill={`url(#${gridId})`} />
      <path d="M180 70 H540" stroke="#5b6570" strokeWidth="14" strokeLinecap="round" />
      <path d="M520 70 V620" stroke="#8b97a4" strokeWidth="10" />
      <path
        d="M180 70 V210 L460 310 V620"
        fill="none"
        stroke="#2f7ea8"
        strokeWidth="16"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M186 94 H512" stroke="#d08a2f" strokeWidth="2.2" strokeDasharray="8 6" />
      <path d="M186 88 V100 M512 88 V100" stroke="#d08a2f" strokeWidth="2" />
      <text x="250" y="84" fontSize="16" fill="#c48a2a">
        {svgD} nivelado
      </text>
      <path d="M228 88 V202" stroke="#c04545" strokeWidth="2.2" strokeDasharray="8 6" />
      <path d="M222 88 H234 M222 202 H234" stroke="#c04545" strokeWidth="2" />
      <g transform="translate(228 148) rotate(-90)">
        <rect x="-40" y="-28" width="80" height="24" rx="6" className="dash-condutor-svg__tag" />
        <text x="0" y="-15" fontSize="15" fontWeight="700" fill="#c04545" textAnchor="middle" dominantBaseline="middle">
          {svgP}
        </text>
      </g>
      <path d="M196 204 L444 294" stroke="#2f7ea8" strokeWidth="2.2" strokeDasharray="8 6" />
      <g transform="translate(320 249) rotate(19.7)">
        <rect x="-112" y="-26" width="224" height="22" rx="6" className="dash-condutor-svg__tag" />
        <text x="0" y="-14" fontSize="15" fontWeight="700" fill="#2f7ea8" textAnchor="middle" dominantBaseline="middle">
          {svgI}
        </text>
      </g>
      <path d="M620 70 V620" stroke="#c04545" strokeWidth="2" />
      <path d="M614 70 H626 M614 620 H626" stroke="#c04545" strokeWidth="2" />
      <text x="638" y="92" fontSize="16" fill="#c04545">
        {svgH} total
      </text>
      <path d="M482 310 V620" stroke="#2f8a5b" strokeWidth="2.2" strokeDasharray="8 6" />
      <path d="M476 310 H488 M476 620 H488" stroke="#2f8a5b" strokeWidth="2" />
      <g transform="translate(482 465) rotate(-90)">
        <rect x="-96" y="-28" width="192" height="24" rx="6" className="dash-condutor-svg__tag" />
        <text x="0" y="-15" fontSize="15" fontWeight="700" fill="#2f8a5b" textAnchor="middle" dominantBaseline="middle">
          {svgF} ao chão
        </text>
      </g>
      <text className="dash-condutor-svg__note" x="168" y="52" fontSize="16" fontWeight="600" fill="#ffffff">
        Boca da calha
      </text>
      <text className="dash-condutor-svg__note" x="448" y="650" fontSize="16" fontWeight="600" fill="#ffffff">
        Chão
      </text>
      <text className="dash-condutor-svg__note" x="760" y="250" fontSize="16" fontWeight="600" fill="#ffffff">
        Laranja · horizontal
      </text>
      <text className="dash-condutor-svg__note" x="760" y="284" fontSize="16" fontWeight="600" fill="#ffffff">
        Azul · borda inclinada
      </text>
      <text className="dash-condutor-svg__note" x="760" y="318" fontSize="16" fontWeight="600" fill="#ffffff">
        Verde · 2ª curva
      </text>
      <text className="dash-condutor-svg__note" x="760" y="368" fontSize="15" fontWeight="600" fill="#ffffff">
        Ilustrativo — sem escala de dobra
      </text>
    </svg>
  );
}

function Metric({
  tone,
  kicker,
  value,
  hint,
}: {
  tone: "copper" | "sky" | "moss" | "zinc";
  kicker: string;
  value: string;
  hint: string;
}) {
  return (
    <article className={`dash-condutor-metric dash-condutor-metric--${tone}`}>
      <span className="dash-condutor-metric__kicker">{kicker}</span>
      <strong className="dash-condutor-metric__value">{value}</strong>
      <span className="dash-condutor-metric__hint">{hint}</span>
    </article>
  );
}

export function CalculadoraCondutoresPage() {
  const [campos, setCampos] = useState<Campos>(PECA_1_CAMPOS);
  const [desenhoAberto, setDesenhoAberto] = useState(false);
  const resultado = useMemo(() => calcularCondutores(toEntrada(campos)), [campos]);

  useEffect(() => {
    if (!desenhoAberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDesenhoAberto(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [desenhoAberto]);

  function setCampo<K extends keyof Campos>(key: K, value: Campos[K]) {
    setCampos((atual) => ({ ...atual, [key]: value }));
  }

  const incLabel =
    resultado.inclinacao === null ? "—" : `${fmtCm(resultado.inclinacao)} cm`;
  const finalLabel =
    resultado.alturaFinal === null ? "—" : `${fmtCm(resultado.alturaFinal)} cm`;
  const quedaLabel = resultado.queda === null ? "—" : `${fmtCm(resultado.queda)} cm`;
  const subtotalLabel =
    resultado.subtotal === null ? "—" : `${fmtCm(resultado.subtotal)} cm`;
  const subtotalM =
    resultado.subtotal === null ? "" : `${fmtCm(resultado.subtotal / 100)} m`;
  const svgP = `${fmtCm(parseCampo(campos.primeiraDescida) || PECA_1.primeiraDescida)} cm`;
  const svgD = `${fmtCm(parseCampo(campos.deslocamento) || 0)} cm`;
  const svgI =
    resultado.inclinacao === null
      ? "Inclinação sem calibração"
      : `${fmtCm(resultado.inclinacao)} cm inclinação`;
  const svgH = `${fmtCm((parseCampo(campos.alturaTotal) || 0) / 100)} m`;
  const svgF = resultado.alturaFinal === null ? "—" : `${fmtCm(resultado.alturaFinal)} cm`;
  const esquemaLabels: EsquemaLabels = { svgP, svgD, svgI, svgH, svgF };

  return (
    <div className="analytics-page dash-form-page--pro dash-condutor-page">
      <DashPageHero
        title="Condutores"
        subtitle="Ficha de deslocamento · V6 · corte só depois da calibração real."
        iconClass="bi-rulers"
        accent="materiais"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header dash-condutor-stage">
        <section className="dash-condutor-card dash-condutor-card--ficha">
          <header className="dash-condutor-card__head">
            <p className="dash-condutor-eyebrow">Obra</p>
            <h2>Medidas em centímetros</h2>
          </header>
          <div className="dash-condutor-fields">
            <Campo
              id="condutor-w"
              label="Largura do condutor"
              value={campos.largura}
              onChange={(v) => setCampo("largura", v)}
            />
            <Campo
              id="condutor-m"
              label="Marcação de cada lado"
              hint="As duas curvas usam o mesmo valor."
              value={campos.marcacao}
              onChange={(v) => setCampo("marcacao", v)}
            />
            <Campo
              id="condutor-d"
              label="Deslocamento nivelado"
              hint="Horizontal na borda — pode ser qualquer medida da obra."
              value={campos.deslocamento}
              onChange={(v) => setCampo("deslocamento", v)}
            />
            <Campo
              id="condutor-h"
              label="Altura boca da calha → chão"
              value={campos.alturaTotal}
              onChange={(v) => setCampo("alturaTotal", v)}
            />
            <Campo
              id="condutor-p"
              label="Primeira descida"
              hint="Até o início da marcação."
              value={campos.primeiraDescida}
              onChange={(v) => setCampo("primeiraDescida", v)}
            />
          </div>
        </section>

        <section className="dash-condutor-card dash-condutor-card--preview">
          <header className="dash-condutor-card__head dash-condutor-card__head--row">
            <div>
              <p className="dash-condutor-eyebrow">Esquema</p>
              <h2>Leitura lateral</h2>
            </div>
            <div className="dash-condutor-card__head-actions">
              <span className={`dash-condutor-pill dash-condutor-pill--${resultado.statusKind}`}>
                {STATUS_LABEL[resultado.statusKind]}
              </span>
              <button
                type="button"
                className="dash-condutor-print"
                onClick={() => setDesenhoAberto(true)}
              >
                <i className="bi bi-arrows-fullscreen" aria-hidden="true" />
                Ver maior
              </button>
            </div>
          </header>
          <p className={`dash-condutor-status dash-condutor-status--${resultado.statusKind}`}>
            {resultado.status}
          </p>
          <button
            type="button"
            className="dash-condutor-svg-hit"
            onClick={() => setDesenhoAberto(true)}
            aria-label="Abrir desenho em tela cheia"
          >
            <EsquemaCondutor labels={esquemaLabels} variant="card" />
          </button>
        </section>

        <section className="dash-condutor-metrics" aria-label="Resultados automáticos">
          <Metric
            tone="sky"
            kicker="Inclinação superior"
            value={incLabel}
            hint="Da 1ª dobra ao centro da 2ª"
          />
          <Metric
            tone="moss"
            kicker="2ª curva → chão"
            value={finalLabel}
            hint="Altura vertical final"
          />
          <Metric
            tone="copper"
            kicker="Queda de referência"
            value={quedaLabel}
            hint="Início da marcação → 2ª curva"
          />
          <Metric tone="zinc" kicker="Curvas 1 e 2" value={resultado.curvasLabel} hint="Marcações iguais" />
        </section>

        <section className="dash-condutor-cut">
          <article className="dash-condutor-readout">
            <p className="dash-condutor-eyebrow">Soma de referência</p>
            <strong className="dash-condutor-readout__value">{subtotalLabel}</strong>
            {subtotalM ? <span className="dash-condutor-readout__alt">{subtotalM}</span> : null}
            <span className="dash-condutor-readout__formula">{resultado.formula}</span>
            <p className="dash-condutor-readout__warn">
              Não é medida de corte. A soma ignora o desenvolvimento real das curvas.
            </p>
          </article>

          <article className="dash-condutor-readout dash-condutor-readout--cut">
            <p className="dash-condutor-eyebrow">Corte validado</p>
            <strong className="dash-condutor-readout__value">
              {resultado.corteLiberado ? resultado.corteTotalLabel : "Aguardando"}
            </strong>
            <Campo
              id="condutor-real"
              label="Chapa real esticada"
              placeholder="Medir na oficina"
              value={campos.corteReal}
              onChange={(v) => setCampo("corteReal", v)}
            />
            <p className="dash-condutor-readout__formula">
              Diferença:{" "}
              {resultado.diferenca === null ? "—" : `${fmtCm(resultado.diferenca)} cm`} · {resultado.corteNota}
            </p>
          </article>
        </section>

        <section className="dash-condutor-card dash-condutor-card--lab">
          <header className="dash-condutor-card__head">
            <p className="dash-condutor-eyebrow">Oficina</p>
            <h2>Peças reais de calibração</h2>
          </header>
          <div className="table-responsive">
            <table className="dash-condutor-table">
              <thead>
                <tr>
                  <th>Medida</th>
                  <th>Peça 1</th>
                  <th>Peça 2</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Largura / curva</td>
                  <td>
                    {PECA_1.largura} / {fmtCm(PECA_1.marcacao)}+{fmtCm(PECA_1.marcacao)}
                  </td>
                  <td>
                    {PECA_2.largura} / {fmtCm(PECA_2.marcacao)}+{fmtCm(PECA_2.marcacao)}
                  </td>
                </tr>
                <tr>
                  <td>Horizontal nivelada</td>
                  <td>{fmtCm(PECA_1.deslocamento)}</td>
                  <td>{fmtCm(PECA_2.deslocamento)}</td>
                </tr>
                <tr>
                  <td>Inclinação superior</td>
                  <td>{fmtCm(PECA_1.inclinacao)}</td>
                  <td>{fmtCm(PECA_2.inclinacao)}</td>
                </tr>
                <tr>
                  <td>Altura / 1ª descida</td>
                  <td>
                    {PECA_1.alturaTotal} / {PECA_1.primeiraDescida}
                  </td>
                  <td>
                    {PECA_2.alturaTotal} / {PECA_2.primeiraDescida}
                  </td>
                </tr>
                <tr>
                  <td>2ª curva até o chão</td>
                  <td>283</td>
                  <td>292</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="dash-condutor-footnote">
            As peças 1 e 2 só calibram 51 e 53,5 cm. Fora disso a inclinação é estimada. Meça o
            desenvolvimento das duas dobras e a folga de encaixe antes de cortar a chapa.
          </p>
        </section>
      </div>

      {desenhoAberto && typeof document !== "undefined"
        ? createPortal(
            <div
              className="dash-condutor-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Desenho do condutor"
              onClick={() => setDesenhoAberto(false)}
            >
              <div className="dash-condutor-lightbox__frame" onClick={(e) => e.stopPropagation()}>
                <header className="dash-condutor-lightbox__bar">
                  <strong>Leitura lateral</strong>
                  <button
                    type="button"
                    className="dash-condutor-lightbox__close"
                    onClick={() => setDesenhoAberto(false)}
                  >
                    <i className="bi bi-x-lg" aria-hidden="true" />
                    Fechar
                  </button>
                </header>
                <EsquemaCondutor labels={esquemaLabels} variant="full" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
