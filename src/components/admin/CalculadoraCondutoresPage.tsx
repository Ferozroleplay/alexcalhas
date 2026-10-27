import { useMemo, useState } from "react";

import { DashPageHero } from "@/components/admin/DashPageHero";
import { parseNumeroBr } from "@/lib/calculadora-bobina";
import {
  PECA_1,
  PECA_2,
  calcularCondutores,
  fmtCm,
  type CondutoresEntrada,
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

const PECA_2_CAMPOS: Campos = {
  largura: "6",
  marcacao: "4,5",
  deslocamento: "51",
  alturaTotal: "332",
  primeiraDescida: "22",
  corteReal: "",
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

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="dash-condutor-metric">
      <span className="dash-condutor-metric__label">{label}</span>
      <strong className="dash-condutor-metric__value">{value}</strong>
      <span className="dash-condutor-metric__hint">{hint}</span>
    </div>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="dash-condutor-field">
      <label className="dash-edit-modal__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="form-control dash-edit-modal__input"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function CalculadoraCondutoresPage() {
  const [campos, setCampos] = useState<Campos>(PECA_1_CAMPOS);
  const resultado = useMemo(() => calcularCondutores(toEntrada(campos)), [campos]);

  function setCampo<K extends keyof Campos>(key: K, value: Campos[K]) {
    setCampos((atual) => ({ ...atual, [key]: value }));
  }

  const incLabel =
    resultado.inclinacao === null ? "Não calibrado" : `${fmtCm(resultado.inclinacao)} cm`;
  const finalLabel =
    resultado.alturaFinal === null ? "Não calibrado" : `${fmtCm(resultado.alturaFinal)} cm`;
  const quedaLabel = resultado.queda === null ? "Não calibrado" : `${fmtCm(resultado.queda)} cm`;
  const subtotalLabel =
    resultado.subtotal === null
      ? "Não calculável"
      : `${fmtCm(resultado.subtotal)} cm (${fmtCm(resultado.subtotal / 100)} m)`;
  const svgP = `${fmtCm(parseCampo(campos.primeiraDescida) || PECA_1.primeiraDescida)} cm`;
  const svgD = `${fmtCm(parseCampo(campos.deslocamento) || 0)} cm nivelado`;
  const svgI =
    resultado.inclinacao === null
      ? "Inclinação: sem calibração"
      : `${fmtCm(resultado.inclinacao)} cm inclinação`;
  const svgH = `${fmtCm((parseCampo(campos.alturaTotal) || 0) / 100)} m altura total`;
  const svgF =
    resultado.alturaFinal === null ? "Altura não calibrada" : `${fmtCm(resultado.alturaFinal)} cm até chão`;

  return (
    <div className="analytics-page dash-form-page--pro dash-condutor-page">
      <DashPageHero
        title="Calculadora de condutores"
        subtitle="Deslocamento de condutores • Versão 6 — corte condicionado à calibração."
        iconClass="bi-rulers"
        accent="materiais"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header dash-condutor-stack">
        <section className="dash-edit-modal__panel dash-material-form">
          <h2 className="dash-edit-modal__panel-title">
            <i className="bi bi-rulers" aria-hidden="true" /> Medidas da obra (cm)
          </h2>
          <div className="dash-condutor-grid">
            <Campo
              id="condutor-w"
              label="Largura do condutor"
              value={campos.largura}
              onChange={(v) => setCampo("largura", v)}
            />
            <Campo
              id="condutor-m"
              label="Marcação de cada lado da curva"
              value={campos.marcacao}
              onChange={(v) => setCampo("marcacao", v)}
            />
            <Campo
              id="condutor-d"
              label="Deslocamento horizontal nivelado pela borda"
              value={campos.deslocamento}
              onChange={(v) => setCampo("deslocamento", v)}
            />
            <Campo
              id="condutor-h"
              label="Altura total boca da calha até o chão"
              value={campos.alturaTotal}
              onChange={(v) => setCampo("alturaTotal", v)}
            />
            <Campo
              id="condutor-p"
              label="Primeira descida até o início da marcação"
              value={campos.primeiraDescida}
              onChange={(v) => setCampo("primeiraDescida", v)}
            />
          </div>
          <p className="dash-condutor-hint">
            As duas curvas têm sempre a mesma marcação: cada uma = valor acima + valor acima. Não
            confundir 53,5 cm com 0,535 cm.
          </p>
        </section>

        <section className="dash-edit-modal__panel dash-material-form">
          <h2 className="dash-edit-modal__panel-title">
            <i className="bi bi-graph-up" aria-hidden="true" /> Resultados automáticos
          </h2>
          <div className="dash-condutor-metrics">
            <Metric
              label="Inclinação na borda superior"
              value={incLabel}
              hint="Da primeira dobra ao centro da segunda"
            />
            <Metric
              label="Centro da segunda curva até o chão"
              value={finalLabel}
              hint="Altura vertical"
            />
            <Metric
              label="Diferença vertical de referência"
              value={quedaLabel}
              hint="Entre início da marcação e centro da 2ª curva"
            />
            <Metric label="Curvas 1 e 2" value={resultado.curvasLabel} hint="Marcações iguais" />
          </div>
          <p className={`dash-condutor-status dash-condutor-status--${resultado.statusKind}`}>
            {resultado.status}
          </p>
        </section>

        <section className="dash-edit-modal__panel dash-material-form">
          <h2 className="dash-edit-modal__panel-title">
            <i className="bi bi-scissors" aria-hidden="true" /> Tamanho total da peça esticada
          </h2>
          <div className="dash-condutor-total">
            <span className="dash-condutor-total__kicker">
              Soma das medidas de referência (não é medida de corte)
            </span>
            <strong className="dash-condutor-total__value">{subtotalLabel}</strong>
            <span className="dash-condutor-total__formula">{resultado.formula}</span>
            <p className="dash-condutor-total__caution">
              A soma usa pontos de medição diferentes e não considera o desenvolvimento real das
              curvas. Não corte a chapa por este valor.
            </p>
          </div>

          <h3 className="dash-condutor-subtitle">Calibração do comprimento de corte</h3>
          <p className="dash-condutor-hint">
            Quando você medir o comprimento da chapa esticada de uma peça real, informe abaixo. O
            sistema calcula a diferença em relação à soma e mostra o corte validado apenas para a
            configuração de referência correspondente.
          </p>
          <div className="dash-condutor-grid dash-condutor-grid--2">
            <Campo
              id="condutor-real"
              label="Comprimento real da chapa antes de dobrar (cm) — opcional"
              value={campos.corteReal}
              onChange={(v) => setCampo("corteReal", v)}
              placeholder="Ex.: medir na oficina"
            />
            <Metric
              label="Diferença real para a soma"
              value={resultado.diferenca === null ? "—" : `${fmtCm(resultado.diferenca)} cm`}
              hint="Não extrapolar para outros tamanhos"
            />
          </div>
          <div className="dash-condutor-total">
            <span className="dash-condutor-total__kicker">Tamanho total para corte</span>
            <strong className="dash-condutor-total__value">{resultado.corteTotalLabel}</strong>
            <span className="dash-condutor-total__formula">{resultado.corteNota}</span>
          </div>
        </section>

        <section className="dash-edit-modal__panel dash-material-form dash-condutor-print-hide">
          <h2 className="dash-edit-modal__panel-title">
            <i className="bi bi-bezier2" aria-hidden="true" /> Desenho esquemático
          </h2>
          <p className="dash-condutor-hint">Não está em escala de fabricação.</p>
          <svg
            className="dash-condutor-svg"
            viewBox="0 0 900 520"
            aria-label="Esquema lateral do condutor"
          >
            <path d="M130 42 H380" stroke="#555" strokeWidth="15" />
            <path d="M370 42 V480" stroke="#9ca8b2" strokeWidth="12" />
            <path
              d="M130 42 V120 L320 190 V480"
              fill="none"
              stroke="#1d658e"
              strokeWidth="18"
              strokeLinejoin="round"
            />
            <path d="M130 120 H320" stroke="#e39828" strokeWidth="2" strokeDasharray="6 5" />
            <path d="M110 45 V120" stroke="#b52525" strokeWidth="2" />
            <path d="M105 45 h10 M105 120 h10" stroke="#b52525" strokeWidth="2" />
            <text x="20" y="90" fontSize="18" fill="#b52525">
              {svgP}
            </text>
            <text x="170" y="110" fontSize="17" fill="#ae6810">
              {svgD}
            </text>
            <path d="M157 112 L317 171" stroke="#12608c" strokeWidth="2" strokeDasharray="4 3" />
            <rect x="165" y="135" width="172" height="27" rx="5" fill="#ffffff" stroke="#b6d2e2" />
            <text x="172" y="154" fontSize="17" fontWeight="bold" fill="#12608c">
              {svgI}
            </text>
            <path d="M405 42 V480" stroke="#b52525" strokeWidth="2" />
            <text x="420" y="55" fontSize="17" fill="#b52525">
              {svgH}
            </text>
            <path d="M345 190 V480" stroke="#198456" strokeWidth="2" />
            <text x="355" y="305" fontSize="18" fill="#198456">
              {svgF}
            </text>
            <text className="dash-condutor-svg__note" x="115" y="30" fontSize="16">
              Boca da calha
            </text>
            <text className="dash-condutor-svg__note" x="310" y="504" fontSize="17">
              Chão
            </text>
            <text className="dash-condutor-svg__note" x="450" y="185" fontSize="17">
              Referências de medição:
            </text>
            <text className="dash-condutor-svg__note" x="450" y="214" fontSize="15">
              Laranja = horizontal nivelada
            </text>
            <text className="dash-condutor-svg__note" x="450" y="242" fontSize="15">
              Azul = borda superior inclinada
            </text>
            <text className="dash-condutor-svg__note" x="450" y="270" fontSize="15">
              Verde = altura da 2ª curva
            </text>
            <text className="dash-condutor-svg__note" x="450" y="320" fontSize="15">
              Desenho ilustrativo:
            </text>
            <text className="dash-condutor-svg__note" x="450" y="346" fontSize="15">
              não representa ângulos exatos
            </text>
          </svg>
        </section>

        <section className="dash-edit-modal__panel dash-material-form">
          <h2 className="dash-edit-modal__panel-title">
            <i className="bi bi-table" aria-hidden="true" /> Peças reais de calibração
          </h2>
          <div className="table-responsive">
            <table className="table dash-condutor-table">
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
                  <td>Altura total / primeira descida</td>
                  <td>
                    {PECA_1.alturaTotal} / {PECA_1.primeiraDescida}
                  </td>
                  <td>
                    {PECA_2.alturaTotal} / {PECA_2.primeiraDescida}
                  </td>
                </tr>
                <tr>
                  <td>2ª curva até chão</td>
                  <td>283</td>
                  <td>292</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="dash-condutor-hint">
            Os dois exemplos têm diferença de 2,5 cm na horizontal, mas 5,5 cm na inclinação e 2 cm
            na queda de referência. Uma única fórmula geométrica não está validada a partir desses
            dados.
          </p>
        </section>

        <section className="dash-edit-modal__panel dash-material-form">
          <h2 className="dash-edit-modal__panel-title">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" /> Corte e desperdício
          </h2>
          <p className="dash-condutor-status dash-condutor-status--warning">
            Comprimento de chapa não liberado automaticamente. É necessário medir o desenvolvimento
            real das duas dobras e a folga de encaixe. A altura até o chão não é automaticamente
            igual ao comprimento de chapa.
          </p>
          <div className="dash-condutor-actions dash-condutor-print-hide">
            <button type="button" className="dash-form-page__cta" onClick={() => window.print()}>
              <i className="bi bi-printer" aria-hidden="true" />
              <span>Imprimir ficha</span>
            </button>
            <button
              type="button"
              className="btn dash-condutor-btn-secondary"
              onClick={() => setCampos(PECA_1_CAMPOS)}
            >
              Carregar peça 1
            </button>
            <button
              type="button"
              className="btn dash-condutor-btn-secondary"
              onClick={() => setCampos(PECA_2_CAMPOS)}
            >
              Carregar peça 2
            </button>
          </div>
          <p className="dash-condutor-footer">
            Aviso: estimativas entre as referências servem apenas para comparação. Não usar
            resultados interpolados como gabarito de corte ou dobra.
          </p>
        </section>
      </div>
    </div>
  );
}
