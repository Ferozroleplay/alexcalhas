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
      <span className="bobina-calc__produto-nome">
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
  onCustoCm2Change?: (custoCm2: number) => void;
};

export function CalculadoraBobinaWidget({
  variant = "page",
  idPrefix = "bobina",
  onImportarOrcamento,
  onCustoCm2Change,
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

  useEffect(() => {
    if (!isModal || !onCustoCm2Change) return;
    onCustoCm2Change(resultado.custoCm2);
  }, [isModal, onCustoCm2Change, resultado.custoCm2]);

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

      {!isModal ? (
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
      ) : null}

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
          <p className="dash-bobina-table-head__hint mb-0">
            Preencha corte (cm) e metragem aferida (m). Os preços aparecem abaixo de cada linha.
          </p>
        </div>

        <div className="dash-bobina-lines" aria-label="Tabela de cortes">
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

            return (
              <article key={linha.id} className="dash-bobina-line-card">
                <div className="dash-bobina-line-card__top">
                  <div className="dash-bobina-line-card__field">
                    <label className="dash-bobina-mobile-label">Corte (cm)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control dash-bobina-mobile-input"
                      placeholder={idx === 0 ? "Ex.: 30" : "cm"}
                      value={linha.corteCm}
                      onChange={(e) => atualizarLinha(linha.id, { corteCm: e.target.value })}
                    />
                  </div>
                  <div className="dash-bobina-line-card__field">
                    <label className="dash-bobina-mobile-label">Metragem (m)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control dash-bobina-mobile-input"
                      placeholder="Ex.: 10"
                      value={linha.metragemM}
                      onChange={(e) => atualizarLinha(linha.id, { metragemM: e.target.value })}
                    />
                  </div>
                  <div className={`dash-bobina-line-card__custo${temValor ? " is-active" : ""}`}>
                    <span className="dash-bobina-mobile-label">Custo total</span>
                    <strong>{formatBrl(calc?.custoTotal ?? 0)}</strong>
                  </div>
                </div>

                <div className="dash-bobina-line-card__produto">
                  <ProdutoLinhaCorte
                    linha={linha}
                    corte={corte}
                    matches={matches}
                    escolhido={escolhido}
                    onSelectMaterial={(materialId) => selecionarMaterialLinha(linha.id, materialId)}
                  />
                </div>

                <div className="dash-bobina-line-card__precos">
                  <div className="dash-bobina-line-card__preco-grid dash-bobina-line-card__preco-grid--unified">
                    {multsMaterial.map((m, i) => {
                      const v = calc?.vendaMaterial[i] ?? 0;
                      return (
                        <div
                          key={`mm-${linha.id}-${m}`}
                          className={`dash-bobina-line-card__preco-item dash-bobina-line-card__preco-item--material${v > 0 ? " is-active" : ""}`}
                        >
                          <span className="dash-bobina-line-card__mult">{formatMult(m)}</span>
                          <span className="dash-bobina-line-card__val">{formatBrl(v)}</span>
                        </div>
                      );
                    })}
                    {multsInstalado.map((m, i) => {
                      const v = calc?.servicoInstalado[i] ?? 0;
                      return (
                        <div
                          key={`mi-${linha.id}-${m}`}
                          className={`dash-bobina-line-card__preco-item dash-bobina-line-card__preco-item--instalado${v > 0 ? " is-active" : ""}`}
                        >
                          <span className="dash-bobina-line-card__mult">{formatMult(m)}</span>
                          <span className="dash-bobina-line-card__val">{formatBrl(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {colunasPersonalizadas.length > 0 ? (
                  <div className="dash-bobina-line-card__preco-block dash-bobina-line-card__preco-block--custom">
                    <p className="dash-bobina-line-card__preco-label">Colunas personalizadas</p>
                    <div className="dash-bobina-line-card__preco-grid dash-bobina-line-card__preco-grid--custom">
                      {colunasPersonalizadas.map((col, i) => {
                        const v = calc?.colunasPersonalizadas[i] ?? 0;
                        return (
                          <div
                            key={`mc-${linha.id}-${col.id}`}
                            className={`dash-bobina-line-card__preco-item${v > 0 ? " is-active" : ""}`}
                          >
                            <span className="dash-bobina-line-card__mult">{labelColunaPersonalizada(col.mult)}</span>
                            <span className="dash-bobina-line-card__val">{formatBrl(v)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
