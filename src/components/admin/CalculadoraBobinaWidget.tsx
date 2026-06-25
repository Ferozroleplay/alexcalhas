import { useEffect, useMemo, useRef, useState } from "react";

import { fetchMateriais } from "@/lib/admin-api";
import {
  MULTS_INSTALADO_PADRAO,
  MULTS_MATERIAL_PADRAO,
  calcularBobina,
  colunasPadraoInstalado,
  colunasPadraoMaterial,
  escolherMaterialPorCorte,
  formatBrl,
  formatMultLabel,
  linhasBobinaPadrao,
  linhasCalculadoraParaOrcamento,
  materiaisPorPerfilCorte,
  parseNumeroBr,
  sincronizarMaterialLinha,
  type ColunaPersonalizada,
  type LinhaBobina,
  type MaterialCorteRef,
} from "@/lib/calculadora-bobina";
import type { OrcamentoLinha } from "@/lib/orcamento.server";

function uid() {
  return `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function formatMult(m: number): string {
  return formatMultLabel(m);
}

type ProdutoLinhaProps = {
  linha: LinhaBobina;
  corte: number;
  matches: MaterialCorteRef[];
  escolhido: MaterialCorteRef | null;
  onSelectMaterial: (materialId: number) => void;
  compact?: boolean;
};

function ProdutoLinhaCorte({
  linha,
  corte,
  matches,
  escolhido,
  onSelectMaterial,
  compact = false,
}: ProdutoLinhaProps) {
  if (corte <= 0) {
    return compact ? (
      <span className="bobina-calc__produto-vazio">Digite o corte</span>
    ) : (
      <span className="bobina-calc__produto-vazio">—</span>
    );
  }

  if (matches.length > 1) {
    return (
      <select
        className={`form-select bobina-calc__produto-select${compact ? " bobina-calc__produto-select--compact" : ""}`}
        value={linha.materialId ?? escolhido?.id ?? ""}
        onChange={(e) => onSelectMaterial(Number(e.target.value))}
        aria-label="Produto pelo corte"
      >
        {matches.map((m) => (
          <option key={m.id} value={m.id}>
            {m.material}
          </option>
        ))}
      </select>
    );
  }

  if (escolhido?.material) {
    return (
      <span className="bobina-calc__produto-nome" title={escolhido.material}>
        {escolhido.material}
      </span>
    );
  }

  return (
    <span className="bobina-calc__produto-vazio" title={`Nenhum material com C/${Math.round(corte)}`}>
      C/{Math.round(corte)} não encontrado
    </span>
  );
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  variant?: "page" | "modal";
  idPrefix?: string;
  onImportarOrcamento?: (linhas: OrcamentoLinha[]) => void;
};

export function CalculadoraBobinaWidget({
  variant = "page",
  idPrefix = "bobina",
  onImportarOrcamento,
}: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const isModal = variant === "modal";
  const [valorBobina, setValorBobina] = useState("");
  const [metragemTotal, setMetragemTotal] = useState("");
  const [larguraBobina, setLarguraBobina] = useState("");
  const [linhas, setLinhas] = useState<LinhaBobina[]>(() => linhasBobinaPadrao());
  const [multsMaterial, setMultsMaterial] = useState<number[]>([...MULTS_MATERIAL_PADRAO]);
  const [multsInstalado, setMultsInstalado] = useState<number[]>([...MULTS_INSTALADO_PADRAO]);
  const [colunasPersonalizadas, setColunasPersonalizadas] = useState<ColunaPersonalizada[]>([]);
  const [importIdxMaterial, setImportIdxMaterial] = useState<number | null>(null);
  const [importIdxInstalado, setImportIdxInstalado] = useState<number | null>(4);
  const [importErro, setImportErro] = useState("");
  const [materiais, setMateriais] = useState<MaterialCorteRef[]>([]);

  useEffect(() => {
    void fetchMateriais()
      .then((itens) =>
        setMateriais(
          itens.map((m) => ({
            id: m.id,
            material: m.material ?? "",
          })),
        ),
      )
      .catch(() => setMateriais([]));
  }, []);

  useEffect(() => {
    if (materiais.length === 0) return;
    setLinhas((prev) => prev.map((l) => sincronizarMaterialLinha(l, materiais)));
  }, [materiais]);

  const resultado = useMemo(
    () =>
      calcularBobina({
        valorBobina: parseNumeroBr(valorBobina),
        metragemTotalM: parseNumeroBr(metragemTotal),
        larguraBobinaCm: parseNumeroBr(larguraBobina),
        linhas,
        multsMaterial,
        multsInstalado,
        colunasPersonalizadas,
      }),
    [valorBobina, metragemTotal, larguraBobina, linhas, multsMaterial, multsInstalado, colunasPersonalizadas],
  );

  function atualizarLinha(id: string, patch: Partial<LinhaBobina>) {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...patch };
        if ("corteCm" in patch || "materialId" in patch) {
          return sincronizarMaterialLinha(merged, materiais);
        }
        return merged;
      }),
    );
  }

  function selecionarMaterialLinha(id: string, materialId: number) {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const picked = materiais.find((m) => m.id === materialId);
        return {
          ...l,
          materialId: materialId || null,
          materialNome: picked?.material?.trim() || null,
        };
      }),
    );
  }

  function produtoLinha(linha: LinhaBobina) {
    const corte = parseNumeroBr(linha.corteCm);
    const matches = materiaisPorPerfilCorte(materiais, corte);
    const escolhido =
      linha.materialNome && linha.materialId
        ? materiais.find((m) => m.id === linha.materialId) ?? {
            id: linha.materialId,
            material: linha.materialNome,
          }
        : escolherMaterialPorCorte(materiais, corte, linha.materialId);
    return { corte, matches, escolhido };
  }

  function adicionarLinha() {
    setLinhas((prev) => [
      ...prev,
      { id: uid(), corteCm: "", metragemM: "", materialId: null, materialNome: null },
    ]);
  }

  function adicionarColuna() {
    setColunasPersonalizadas((prev) => [...prev, { id: uid(), mult: "" }]);
  }

  function atualizarColunaPersonalizada(id: string, mult: string) {
    setColunasPersonalizadas((prev) => prev.map((col) => (col.id === id ? { ...col, mult } : col)));
  }

  function removerColunaPersonalizada(id: string) {
    setColunasPersonalizadas((prev) => prev.filter((col) => col.id !== id));
  }

  function restaurarColunasPadrao() {
    setMultsMaterial(colunasPadraoMaterial());
    setMultsInstalado(colunasPadraoInstalado());
    setColunasPersonalizadas([]);
  }

  const temColunasPersonalizadas = colunasPersonalizadas.length > 0;

  function limparValores() {
    setValorBobina("");
    setMetragemTotal("");
    setLarguraBobina("");
    setLinhas(linhasBobinaPadrao());
    restaurarColunasPadrao();
    setImportErro("");
  }

  function labelColunaPersonalizada(mult: string): string {
    const n = parseNumeroBr(mult);
    return n > 0 ? formatMult(n) : "Personalizada";
  }

  function exportarCsv() {
    const head = [
      "Corte (cm)",
      "Metragem Aferida (m)",
      "Custo Total",
      ...multsMaterial.map((m) => `Material ${formatMult(m)}`),
      ...multsInstalado.map((m) => `Instalado ${formatMult(m)}`),
      ...colunasPersonalizadas.map((col) => `Personalizada ${labelColunaPersonalizada(col.mult)}`),
    ];
    const rows = resultado.linhas.map((l) => [
      l.corteCm || "",
      l.metragemM || "",
      l.custoTotal.toFixed(2).replace(".", ","),
      ...l.vendaMaterial.map((v) => v.toFixed(2).replace(".", ",")),
      ...l.servicoInstalado.map((v) => v.toFixed(2).replace(".", ",")),
      ...l.colunasPersonalizadas.map((v) => v.toFixed(2).replace(".", ",")),
    ]);
    const csv = [head.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    downloadText("calculadora-bobina.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
  }

  async function exportarPdf() {
    const el = printRef.current;
    if (!el) return;
    const mod = await import("html2pdf.js");
    const html2pdf = mod.default;
    await html2pdf()
      .set({
        margin: 8,
        filename: "calculadora-bobina.pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      })
      .from(el)
      .save();
  }

  function totalColunaImport(tipo: "material" | "instalado", idx: number): number {
    return resultado.linhas.reduce((sum, linha) => {
      if (linha.corteCm <= 0 || linha.metragemM <= 0) return sum;
      const valores = tipo === "material" ? linha.vendaMaterial : linha.servicoInstalado;
      return sum + (valores[idx] ?? 0);
    }, 0);
  }

  const totalImportMaterial =
    importIdxMaterial != null ? totalColunaImport("material", importIdxMaterial) : 0;
  const totalImportInstalado =
    importIdxInstalado != null ? totalColunaImport("instalado", importIdxInstalado) : 0;
  const totalImportOrcamento =
    importIdxInstalado != null ? totalImportInstalado : totalImportMaterial;

  function selecionarImportMaterial(idx: number) {
    if (importIdxMaterial === idx) {
      setImportIdxMaterial(null);
      return;
    }
    setImportIdxMaterial(idx);
    setImportIdxInstalado(null);
  }

  function selecionarImportInstalado(idx: number) {
    if (importIdxInstalado === idx) {
      setImportIdxInstalado(null);
      return;
    }
    setImportIdxInstalado(idx);
    setImportIdxMaterial(null);
  }

  function importarParaOrcamento() {
    if (!onImportarOrcamento) return;
    setImportErro("");

    if (importIdxMaterial == null && importIdxInstalado == null) {
      setImportErro("Selecione ao menos material ou serviço instalado para importar.");
      return;
    }

    const linhasOrc = linhasCalculadoraParaOrcamento(resultado.linhas, linhas, materiais, {
      idxMaterial: importIdxMaterial,
      idxInstalado: importIdxInstalado,
      multsMaterial,
      multsInstalado,
    });

    if (linhasOrc.length === 0) {
      setImportErro("Preencha corte e metragem em pelo menos uma linha.");
      return;
    }

    onImportarOrcamento(linhasOrc);
  }

  return (
    <div
      className={`dash-material-page dash-bobina-page__stack${isModal ? " dash-bobina-page__stack--modal" : ""}`}
      ref={printRef}
    >
      <section className="dash-edit-modal__panel dash-material-form dash-bobina-panel">
        <h2 className="dash-edit-modal__panel-title">
          <i className="bi bi-box-seam" aria-hidden="true" /> Dados da bobina
        </h2>
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-4">
            <label className="dash-edit-modal__label" htmlFor={`${idPrefix}-valor`}>
              Valor da bobina
            </label>
            <div className="input-group dash-material-money-group">
              <span className="input-group-text">R$</span>
              <input
                id={`${idPrefix}-valor`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="form-control dash-edit-modal__input"
                placeholder="0,00"
                value={valorBobina}
                onChange={(e) => setValorBobina(e.target.value)}
              />
            </div>
          </div>
          <div className="col-6 col-md-4">
            <label className="dash-edit-modal__label" htmlFor={`${idPrefix}-metragem`}>
              Metragem total
            </label>
            <div className="input-group dash-bobina-unit-group">
              <input
                id={`${idPrefix}-metragem`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="form-control dash-edit-modal__input"
                placeholder="0"
                value={metragemTotal}
                onChange={(e) => setMetragemTotal(e.target.value)}
              />
              <span className="input-group-text">m</span>
            </div>
          </div>
          <div className="col-6 col-md-4">
            <label className="dash-edit-modal__label" htmlFor={`${idPrefix}-largura`}>
              Largura da bobina
            </label>
            <div className="input-group dash-bobina-unit-group">
              <input
                id={`${idPrefix}-largura`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="form-control dash-edit-modal__input"
                placeholder="0"
                value={larguraBobina}
                onChange={(e) => setLarguraBobina(e.target.value)}
              />
              <span className="input-group-text">cm</span>
            </div>
          </div>
        </div>
      </section>

      <section className="analytics-section dash-bobina-metrics" aria-label="Resumo">
        <div className="metric-card metric-card--static metric-card--finance dash-bobina-metric">
          <div className="metric-card__top">
            <span className="metric-card__label">Custo por cm²</span>
            <span className="metric-card__icon metric-card__icon--green" aria-hidden="true">
              <i className="bi bi-aspect-ratio" />
            </span>
          </div>
          <div className="metric-card__value">{formatBrl(resultado.custoCm2)}</div>
          <span className="metric-card__hint">Base para calcular o custo total de cada corte</span>
        </div>
      </section>

      <section className="dash-edit-modal__panel dash-bobina-toolbar">
        <div className="dash-bobina-toolbar__head">
          <div>
            <h2 className="dash-edit-modal__panel-title mb-1">
              <i className="bi bi-sliders" aria-hidden="true" /> Ações
            </h2>
            <p className="dash-bobina-toolbar__hint mb-0">
              {isModal
                ? "Preencha os cortes e importe para o orçamento."
                : "Exporte, limpe os campos, adicione linhas ou crie colunas personalizadas na tabela."}
            </p>
          </div>
        </div>
        <div className="dash-bobina-toolbar__actions">
          {!isModal ? (
            <>
              <button
                type="button"
                className="analytics-btn analytics-btn--outline analytics-btn--sm"
                onClick={() => void exportarPdf()}
              >
                <i className="bi bi-file-earmark-pdf" aria-hidden="true" /> PDF
              </button>
              <button
                type="button"
                className="analytics-btn analytics-btn--outline analytics-btn--sm"
                onClick={exportarCsv}
              >
                <i className="bi bi-file-earmark-spreadsheet" aria-hidden="true" /> Excel
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="analytics-btn analytics-btn--outline analytics-btn--sm dash-bobina-btn-danger"
            onClick={limparValores}
          >
            <i className="bi bi-trash" aria-hidden="true" /> Limpar
          </button>
          <button
            type="button"
            className="analytics-btn analytics-btn--primary analytics-btn--sm"
            onClick={adicionarLinha}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" /> Linha
          </button>
          <button
            type="button"
            className="analytics-btn analytics-btn--outline analytics-btn--sm dash-bobina-btn-col"
            onClick={adicionarColuna}
          >
            <i className="bi bi-plus-lg" aria-hidden="true" /> Adicionar coluna
          </button>
          {temColunasPersonalizadas ? (
            <button
              type="button"
              className="analytics-btn analytics-btn--outline analytics-btn--sm dash-bobina-btn-restore"
              onClick={restaurarColunasPadrao}
            >
              <i className="bi bi-arrow-counterclockwise" aria-hidden="true" /> Restaurar colunas
            </button>
          ) : null}
        </div>
      </section>

      <section className="dash-edit-modal__panel dash-material-table-wrap dash-bobina-table-panel p-0 overflow-hidden">
        <div className="dash-bobina-table-head">
          <h2 className="dash-edit-modal__panel-title mb-1">
            <i className="bi bi-table" aria-hidden="true" /> Tabela de cortes
          </h2>
          <p className="dash-bobina-table-head__hint mb-0 dash-bobina-table-head__hint--desktop">
            Preencha corte (cm) e metragem aferida (m) em cada linha.
          </p>
          <p className="dash-bobina-table-head__hint mb-0 dash-bobina-table-head__hint--mobile">
            Preencha corte e metragem em cada card abaixo.
          </p>
        </div>

        <div className="dashboard-data-desktop inv-table-shell">
          <div className="table-responsive inv-table-scroll inv-table-scroll--fit">
            <table className="table inv-data-table inv-data-table--balanced bobina-calc__table mb-0">
              <thead>
                <tr className="bobina-calc__head-main">
                  <th rowSpan={2} className="bobina-calc__sticky bobina-calc__col-corte">
                    Corte (cm)
                  </th>
                  <th rowSpan={2} className="bobina-calc__sticky bobina-calc__col-produto">
                    Produto
                  </th>
                  <th rowSpan={2} className="bobina-calc__sticky bobina-calc__col-metragem">
                    Metragem aferida
                  </th>
                  <th rowSpan={2} className="bobina-calc__sticky bobina-calc__col-custo">
                    Custo total
                  </th>
                  <th
                    colSpan={multsMaterial.length}
                    className="text-center bobina-calc__group bobina-calc__group--material"
                  >
                    Venda de material
                  </th>
                  <th
                    colSpan={multsInstalado.length}
                    className="text-center bobina-calc__group bobina-calc__group--instalado"
                  >
                    Serviço instalado
                  </th>
                  {colunasPersonalizadas.length > 0 ? (
                    <th
                      colSpan={colunasPersonalizadas.length}
                      className="text-center bobina-calc__group bobina-calc__group--custom"
                    >
                      Colunas personalizadas
                    </th>
                  ) : null}
                </tr>
                <tr className="bobina-calc__head-sub">
                  {multsMaterial.map((m) => (
                    <th key={`m-${m}`} className="text-center bobina-calc__mult bobina-calc__mult--material">
                      <span className="bobina-calc__mult-label">{formatMult(m)}</span>
                    </th>
                  ))}
                  {multsInstalado.map((m) => (
                    <th key={`i-${m}`} className="text-center bobina-calc__mult bobina-calc__mult--instalado">
                      <span className="bobina-calc__mult-label">{formatMult(m)}</span>
                    </th>
                  ))}
                  {colunasPersonalizadas.map((col) => (
                    <th key={col.id} className="text-center bobina-calc__mult bobina-calc__mult--custom">
                      <div className="bobina-calc__custom-head">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control bobina-calc__mult-input"
                          placeholder="1,5"
                          value={col.mult}
                          onChange={(e) => atualizarColunaPersonalizada(col.id, e.target.value)}
                          aria-label="Multiplicador personalizado"
                        />
                        <button
                          type="button"
                          className="bobina-calc__mult-remove"
                          title="Remover coluna"
                          aria-label="Remover coluna personalizada"
                          onClick={() => removerColunaPersonalizada(col.id)}
                        >
                          <i className="bi bi-x-lg" aria-hidden="true" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, idx) => {
                  const calc = resultado.linhas.find((l) => l.id === linha.id);
                  const temValor = (calc?.custoTotal ?? 0) > 0;
                  const { corte, matches, escolhido } = produtoLinha(linha);
                  return (
                    <tr key={linha.id} className="inv-data-row bobina-calc__row">
                      <td className="bobina-calc__sticky bobina-calc__col-corte">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control dash-edit-modal__input bobina-calc__input"
                          placeholder={idx === 0 ? "Meu corte" : "cm"}
                          value={linha.corteCm}
                          onChange={(e) => atualizarLinha(linha.id, { corteCm: e.target.value })}
                        />
                      </td>
                      <td className="bobina-calc__sticky bobina-calc__col-produto">
                        <ProdutoLinhaCorte
                          linha={linha}
                          corte={corte}
                          matches={matches}
                          escolhido={escolhido}
                          onSelectMaterial={(materialId) => selecionarMaterialLinha(linha.id, materialId)}
                        />
                      </td>
                      <td className="bobina-calc__sticky bobina-calc__col-metragem">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control dash-edit-modal__input bobina-calc__input"
                          placeholder="m"
                          value={linha.metragemM}
                          onChange={(e) => atualizarLinha(linha.id, { metragemM: e.target.value })}
                        />
                      </td>
                      <td
                        className={`bobina-calc__sticky bobina-calc__col-custo bobina-calc__money${temValor ? " bobina-calc__money--active" : ""}`}
                      >
                        {formatBrl(calc?.custoTotal ?? 0)}
                      </td>
                      {calc?.vendaMaterial.map((v, i) => (
                        <td
                          key={`vm-${linha.id}-${i}`}
                          className={`bobina-calc__money bobina-calc__money--material${v > 0 ? " bobina-calc__money--active" : ""}`}
                        >
                          {formatBrl(v)}
                        </td>
                      ))}
                      {calc?.servicoInstalado.map((v, i) => (
                        <td
                          key={`vi-${linha.id}-${i}`}
                          className={`bobina-calc__money bobina-calc__money--instalado${v > 0 ? " bobina-calc__money--active" : ""}`}
                        >
                          {formatBrl(v)}
                        </td>
                      ))}
                      {calc?.colunasPersonalizadas.map((v, i) => (
                        <td
                          key={`cp-${linha.id}-${i}`}
                          className={`bobina-calc__money bobina-calc__money--custom${v > 0 ? " bobina-calc__money--active" : ""}`}
                        >
                          {formatBrl(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-data-mobile dash-bobina-mobile" aria-label="Tabela de cortes (modo celular)">
          {colunasPersonalizadas.length > 0 ? (
            <div className="dash-bobina-mobile-custom">
              <p className="dash-bobina-mobile-custom__title">
                <i className="bi bi-sliders" aria-hidden="true" /> Colunas personalizadas
              </p>
              <div className="dash-bobina-mobile-custom__list">
                {colunasPersonalizadas.map((col) => (
                  <div key={col.id} className="dash-bobina-mobile-custom__item">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control bobina-calc__mult-input"
                      placeholder="1,5"
                      value={col.mult}
                      onChange={(e) => atualizarColunaPersonalizada(col.id, e.target.value)}
                      aria-label="Multiplicador personalizado"
                    />
                    <button
                      type="button"
                      className="bobina-calc__mult-remove"
                      title="Remover coluna"
                      aria-label="Remover coluna personalizada"
                      onClick={() => removerColunaPersonalizada(col.id)}
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {linhas.map((linha, idx) => {
            const calc = resultado.linhas.find((l) => l.id === linha.id);
            const temValor = (calc?.custoTotal ?? 0) > 0;
            const { corte, matches, escolhido } = produtoLinha(linha);
            const badge =
              escolhido?.material ??
              (corte > 0
                ? `C/${Math.round(corte)}`
                : linha.corteCm.trim() || linha.metragemM.trim()
                  ? `${linha.corteCm.trim() || "?"} cm · ${linha.metragemM.trim() || "?"} m`
                  : idx === 0
                    ? "Meu corte"
                    : null);

            return (
              <article key={linha.id} className="dash-bobina-mobile-card">
                {badge ? (
                  <header className="dash-bobina-mobile-card__badge">{badge}</header>
                ) : null}

                <div className="dash-bobina-mobile-card__fields">
                  <div className="dash-bobina-mobile-card__field">
                    <label className="dash-bobina-mobile-label">Corte (cm)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control dash-bobina-mobile-input"
                      placeholder={idx === 0 ? "Ex.: 10" : String([15, 20, 25, 30, 35, 40][idx - 1] ?? "cm")}
                      value={linha.corteCm}
                      onChange={(e) => atualizarLinha(linha.id, { corteCm: e.target.value })}
                    />
                  </div>
                  <div className="dash-bobina-mobile-card__field dash-bobina-mobile-card__field--produto">
                    <label className="dash-bobina-mobile-label">Produto</label>
                    <ProdutoLinhaCorte
                      linha={linha}
                      corte={corte}
                      matches={matches}
                      escolhido={escolhido}
                      compact
                      onSelectMaterial={(materialId) => selecionarMaterialLinha(linha.id, materialId)}
                    />
                  </div>
                  <div className="dash-bobina-mobile-card__field">
                    <label className="dash-bobina-mobile-label">Metragem (m)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control dash-bobina-mobile-input"
                      placeholder="Ex.: 13"
                      value={linha.metragemM}
                      onChange={(e) => atualizarLinha(linha.id, { metragemM: e.target.value })}
                    />
                  </div>
                </div>

                <div
                  className={`dash-bobina-mobile-card__custo${temValor ? " dash-bobina-mobile-card__custo--active" : ""}`}
                >
                  <span>Custo</span>
                  <strong>{formatBrl(calc?.custoTotal ?? 0)}</strong>
                </div>

                <details className="dash-bobina-mobile-card__section dash-bobina-mobile-card__section--precos" open>
                  <summary>Material e instalado</summary>
                  <dl className="dash-bobina-mobile-card__grid dash-bobina-mobile-card__grid--unified">
                    {multsMaterial.map((m, i) => (
                      <div
                        key={`mm-${linha.id}-${m}`}
                        className="dash-bobina-mobile-card__pair dash-bobina-mobile-card__pair--material"
                      >
                        <dt>{formatMult(m)}</dt>
                        <dd>{formatBrl(calc?.vendaMaterial[i] ?? 0)}</dd>
                      </div>
                    ))}
                    {multsInstalado.map((m, i) => (
                      <div
                        key={`mi-${linha.id}-${m}`}
                        className="dash-bobina-mobile-card__pair dash-bobina-mobile-card__pair--instalado"
                      >
                        <dt>{formatMult(m)}</dt>
                        <dd>{formatBrl(calc?.servicoInstalado[i] ?? 0)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>

                {colunasPersonalizadas.length > 0 ? (
                  <details className="dash-bobina-mobile-card__section dash-bobina-mobile-card__section--custom">
                    <summary>Personalizadas</summary>
                    <dl className="dash-bobina-mobile-card__grid">
                      {colunasPersonalizadas.map((col, i) => (
                        <div key={`mc-${linha.id}-${col.id}`} className="dash-bobina-mobile-card__pair">
                          <dt>{labelColunaPersonalizada(col.mult)}</dt>
                          <dd>{formatBrl(calc?.colunasPersonalizadas[i] ?? 0)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {isModal && onImportarOrcamento ? (
        <section className="dash-edit-modal__panel dash-bobina-import">
          <h2 className="dash-edit-modal__panel-title mb-2">
            <i className="bi bi-clipboard-plus" aria-hidden="true" /> Importar para o orçamento
          </h2>
          {totalImportOrcamento > 0 ? (
            <p className="dash-bobina-import__total mb-2">
              Total a importar: <strong>{formatBrl(totalImportOrcamento)}</strong>
            </p>
          ) : null}
          <div className="dash-bobina-import__row">
            <div
              className="dash-bobina-import__choices"
              role="radiogroup"
              aria-label="Multiplicador para importar no orçamento"
            >
              <div className="dash-bobina-import__pills">
                {multsMaterial.map((m, i) => {
                  const active = importIdxMaterial === i;
                  const total = totalColunaImport("material", i);
                  return (
                    <button
                      key={`im-${m}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`Material ${formatMult(m)}${total > 0 ? `, ${formatBrl(total)}` : ""}`}
                      className={`dash-bobina-import__pill${active ? " is-active" : ""}`}
                      onClick={() => selecionarImportMaterial(i)}
                    >
                      <span className="dash-bobina-import__pill-mult">{formatMult(m)}</span>
                      <span className="dash-bobina-import__pill-val">
                        {total > 0 ? formatBrl(total) : "—"}
                      </span>
                    </button>
                  );
                })}
                {multsInstalado.map((m, i) => {
                  const active = importIdxInstalado === i;
                  const total = totalColunaImport("instalado", i);
                  return (
                    <button
                      key={`ii-${m}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`Serviço instalado ${formatMult(m)}${total > 0 ? `, ${formatBrl(total)}` : ""}`}
                      className={`dash-bobina-import__pill${active ? " is-active" : ""}`}
                      onClick={() => selecionarImportInstalado(i)}
                    >
                      <span className="dash-bobina-import__pill-mult">{formatMult(m)}</span>
                      <span className="dash-bobina-import__pill-val">
                        {total > 0 ? formatBrl(total) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="analytics-btn analytics-btn--primary dash-bobina-import__submit"
              onClick={importarParaOrcamento}
            >
              <i className="bi bi-check2-circle" aria-hidden="true" /> Adicionar ao orçamento
            </button>
          </div>
          {importErro ? (
            <p className="text-danger small mb-0 mt-2" role="alert">
              {importErro}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
