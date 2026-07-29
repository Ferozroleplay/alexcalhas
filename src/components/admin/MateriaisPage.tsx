import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DashPageHero } from "@/components/admin/DashPageHero";
import { ModalCadastroMaterial } from "@/components/admin/modals/ModalCadastroMaterial";
import {
  atualizarMaterial,
  definirEstoquesEmMassa,
  definirEstoquesMinimosEmMassa,
  excluirMaterial,
  fetchMateriais,
  type MaterialItem,
} from "@/lib/admin-api";
import { dashConfirm, dashToast } from "@/lib/dash-ui";
import {
  ESTOQUE_MINIMO_PADRAO_M,
  estoqueAlertaLabel,
  estoqueAlertaNivel,
  estoqueAlertaPct,
} from "@/lib/estoque-alerta";
import { calcularPrecosChapaGalvalume, isChapaGalvalumeMetros } from "@/lib/orcamento-empresa";

const ESTOQUE_100_FLAG = "alex-materiais-estoque-100-v2";
const ESTOQUE_MIN_2_FLAG = "alex-materiais-estoque-min-2-v1";

type StockNivel = "normal" | "alerta" | "critico" | "zerado";

function unidadeLabel(u?: string): string {
  const v = (u || "M").toUpperCase();
  if (v === "UN" || v === "PC") return "un";
  if (v === "KG") return "kg";
  return "m";
}

function formatQtd(value: number, unidade?: string): string {
  const n = Number(value) || 0;
  const fmt = n.toLocaleString("pt-BR", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${fmt} ${unidadeLabel(unidade)}`;
}

function formatChapa(mm?: string): string {
  if (!mm) return "—";
  return `${mm.replace(".", ",")} mm`;
}

function stockNivel(item: MaterialItem): StockNivel {
  return estoqueAlertaNivel(
    Number(item.saldo_loja ?? 0),
    Number(item.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
  );
}

function stockPct(item: MaterialItem): number {
  return estoqueAlertaPct(
    Number(item.saldo_loja ?? 0),
    Number(item.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
  );
}

function stockRefLabel(item: MaterialItem): string {
  const saldo = Number(item.saldo_loja ?? 0);
  const minimo = Number(item.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M);
  return `${formatQtd(saldo, item.unidade)} / mín. ${formatQtd(minimo, item.unidade)}`;
}

export function MateriaisPage() {
  const [itens, setItens] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"novo" | "editar">("novo");
  const [editItem, setEditItem] = useState<MaterialItem | null>(null);
  const [ajustandoId, setAjustandoId] = useState<number | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const syncFeitoRef = useRef(false);

  const aplicarPrecoEmpresa = useCallback(async (item: MaterialItem): Promise<MaterialItem | null> => {
    const calc = calcularPrecosChapaGalvalume({
      material: item.material,
      tipo_material: item.tipo_material,
      unidade: item.unidade || "M",
      chapa_mm: item.chapa_mm,
      corte_cm: item.corte_cm,
    });
    if (!calc) return null;

    const custoAtual = Number(item.valor_custo) || 0;
    const vendaAtual = Number(item.valor) || 0;
    const mesma =
      Math.abs(custoAtual - calc.custoUnitario) < 0.01 &&
      Math.abs(vendaAtual - calc.valorUnitario) < 0.01 &&
      Math.abs(Number(item.fator ?? 0) - calc.fator) < 0.001;

    if (mesma && item.chapa_mm === calc.espessura && Number(item.corte_cm) === calc.corteCm) {
      return item;
    }

    return atualizarMaterial({
      ...item,
      id: item.id,
      material: item.material,
      unidade: "M",
      tipo_material: item.tipo_material || "Galvalume",
      chapa_mm: calc.espessura,
      corte_cm: calc.corteCm,
      valor_custo: calc.custoUnitario,
      valor: calc.valorUnitario,
      custo_mercado: calc.custoUnitario,
      custo_formacao: calc.custoUnitario,
      custo_loja: calc.custoUnitario,
      fator: calc.fator,
      tipo_fator: "multiplicacao",
      margem_desejada: calc.margemRecomendada,
      margem_aplicada: calc.margemRecomendada,
    });
  }, []);

  const sincronizarChapasEmpresa = useCallback(
    async (lista: MaterialItem[], { silent = false }: { silent?: boolean } = {}) => {
      const alvos = lista.filter((m) =>
        isChapaGalvalumeMetros({
          material: m.material,
          tipo_material: m.tipo_material,
          unidade: m.unidade || "M",
        }),
      );
      if (alvos.length === 0) return lista;

      setSincronizando(true);
      let atualizados = 0;
      const mapa = new Map(lista.map((m) => [m.id, m]));
      try {
        for (const item of alvos) {
          const updated = await aplicarPrecoEmpresa(item);
          if (updated && updated !== item) {
            mapa.set(item.id, { ...item, ...updated });
            atualizados += 1;
          }
        }
        const next = lista.map((m) => mapa.get(m.id) ?? m);
        if (atualizados > 0 && !silent) {
          dashToast(
            `${atualizados} Chapa Galvalume atualizada(s) com o cálculo da Empresa.`,
            "success",
          );
        } else if (!silent) {
          dashToast("Chapas Galvalume já estão com o preço da Empresa.", "success");
        }
        return next;
      } catch (err) {
        if (!silent) {
          dashToast(err instanceof Error ? err.message : "Erro ao calcular chapas.", "danger");
        }
        return lista;
      } finally {
        setSincronizando(false);
      }
    },
    [aplicarPrecoEmpresa],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      let lista = await fetchMateriais();

      // Uma vez: estoque mínimo 2 m em todos (alerta amarelo).
      if (typeof window !== "undefined" && localStorage.getItem(ESTOQUE_MIN_2_FLAG) !== "1") {
        lista = await definirEstoquesMinimosEmMassa(ESTOQUE_MINIMO_PADRAO_M);
        localStorage.setItem(ESTOQUE_MIN_2_FLAG, "1");
        dashToast("Estoque mínimo definido em 2 metros para todos.", "success");
      }

      // Uma vez por navegador: define todos os estoques em 100 metros.
      if (typeof window !== "undefined" && localStorage.getItem(ESTOQUE_100_FLAG) !== "1") {
        lista = await definirEstoquesEmMassa(100);
        localStorage.setItem(ESTOQUE_100_FLAG, "1");
        dashToast("Todos os estoques foram definidos em 100 metros.", "success");
      }

      const sincronizada = await sincronizarChapasEmpresa(lista, { silent: syncFeitoRef.current });
      syncFeitoRef.current = true;
      setItens(sincronizada);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar materiais.");
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, [sincronizarChapasEmpresa]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    let normal = 0;
    let alerta = 0;
    let critico = 0;
    let zerado = 0;
    let totalMetros = 0;
    for (const item of itens) {
      const nivel = stockNivel(item);
      if (nivel === "normal") normal += 1;
      else if (nivel === "alerta") alerta += 1;
      else if (nivel === "critico") critico += 1;
      else zerado += 1;
      if ((item.unidade || "M").toUpperCase() === "M") {
        totalMetros += Number(item.saldo_loja ?? 0);
      }
    }
    return { total: itens.length, normal, alerta, critico, zerado, totalMetros };
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((m) => {
      const blob = [
        m.material,
        m.codigo,
        m.chapa_mm,
        m.corte_cm,
        m.departamento,
        m.tipo_material,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [itens, busca]);

  const alertas = useMemo(
    () => itens.filter((m) => stockNivel(m) !== "normal"),
    [itens],
  );

  function abrirNovo() {
    setModalMode("novo");
    setEditItem(null);
    setModalOpen(true);
  }

  function abrirEdicao(item: MaterialItem) {
    setModalMode("editar");
    setEditItem(item);
    setModalOpen(true);
  }

  async function ajustarEstoque(item: MaterialItem, delta: number) {
    const atual = Number(item.saldo_loja ?? 0);
    const novo = Math.max(0, Math.round((atual + delta) * 100) / 100);
    setAjustandoId(item.id);
    setErro("");
    try {
      const updated = await atualizarMaterial({
        ...item,
        id: item.id,
        material: item.material,
        valor: item.valor,
        valor_custo: item.valor_custo,
        saldo_loja: novo,
        saldo_geral: Number(item.saldo_geral ?? novo),
      });
      setItens((prev) => prev.map((m) => (m.id === item.id ? { ...m, ...updated } : m)));
      const nivel = stockNivel({ ...item, ...updated });
      if (nivel === "alerta") {
        dashToast(`${item.material}: estoque baixo (mín. ${formatQtd(item.estoque_minimo ?? 0, item.unidade)})`, "warning");
      } else if (nivel === "zerado") {
        dashToast(`${item.material}: sem estoque`, "danger");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao ajustar estoque.");
    } finally {
      setAjustandoId(null);
    }
  }

  async function deletar(item: MaterialItem) {
    if (
      !(await dashConfirm({
        title: "Excluir material?",
        message: `Remover "${item.material}"?`,
        confirmText: "Excluir",
        variant: "danger",
      }))
    ) {
      return;
    }
    try {
      await excluirMaterial(item.id);
      dashToast("Material excluído.", "success");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  return (
    <div className="analytics-page dash-form-page--pro stock-materiais-page">
      <DashPageHero
        title="Materiais"
        subtitle="Chapa Galvalume (metros) usa o cálculo da Empresa automaticamente. Cadastre estoque mínimo para alertas."
        iconClass="bi-box-seam"
        accent="materiais"
        showNovaVisita={false}
        cta={
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              disabled={sincronizando || loading || itens.length === 0}
              onClick={async () => {
                const next = await sincronizarChapasEmpresa(itens, { silent: false });
                setItens(next);
              }}
            >
              <i className="bi bi-calculator" aria-hidden="true" />{" "}
              {sincronizando ? "Calculando…" : "Recalcular Galvalume"}
            </button>
            <button type="button" className="dash-form-page__cta" onClick={abrirNovo}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
              <span>Cadastrar</span>
            </button>
          </div>
        }
      />

      <div className="dash-page-body dash-page-body--with-header">
        {erro ? (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        ) : null}

        {alertas.length > 0 ? (
          <div className="stock-alert-banner" role="status">
            <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
            <div>
              <strong>
                {stats.zerado > 0 ? `${stats.zerado} sem estoque` : null}
                {stats.zerado > 0 && (stats.critico > 0 || stats.alerta > 0) ? " · " : null}
                {stats.critico > 0 ? `${stats.critico} crítico (≤1 m)` : null}
                {stats.critico > 0 && stats.alerta > 0 ? " · " : null}
                {stats.alerta > 0 ? `${stats.alerta} em alerta (≤2 m)` : null}
              </strong>
              <span> — mínimo padrão: 2 m (amarelo). Com 1 m a barra fica vermelha.</span>
            </div>
          </div>
        ) : null}

        <div className="stock-kpi-grid">
          <article className="stock-kpi">
            <span className="stock-kpi__label">Materiais</span>
            <strong className="stock-kpi__value">{stats.total}</strong>
          </article>
          <article className="stock-kpi stock-kpi--ok">
            <span className="stock-kpi__label">Estoque normal</span>
            <strong className="stock-kpi__value">{stats.normal}</strong>
          </article>
          <article className="stock-kpi stock-kpi--warn">
            <span className="stock-kpi__label">Em alerta (≤2 m)</span>
            <strong className="stock-kpi__value">{stats.alerta}</strong>
          </article>
          <article className="stock-kpi stock-kpi--danger">
            <span className="stock-kpi__label">Crítico / zerado</span>
            <strong className="stock-kpi__value">{stats.critico + stats.zerado}</strong>
          </article>
          <article className="stock-kpi stock-kpi--meters">
            <span className="stock-kpi__label">Total em metros</span>
            <strong className="stock-kpi__value">
              {stats.totalMetros.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m
            </strong>
          </article>
        </div>

        <section className="stock-panel">
          <div className="stock-panel__head">
            <div className="stock-panel__titles">
              <h2 className="stock-panel__title">Materiais cadastrados</h2>
              <p className="stock-panel__sub">Ajuste quantidades ou edite chapa e corte.</p>
            </div>
            <div className="stock-panel__search">
              <i className="bi bi-search" aria-hidden="true" />
              <input
                type="search"
                className="form-control"
                placeholder="Buscar material, chapa ou corte..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="p-4 text-muted mb-0">Carregando…</p>
          ) : itensFiltrados.length === 0 ? (
            <p className="p-4 text-muted mb-0">
              Nenhum material encontrado. Cadastre e defina o <strong>estoque mínimo</strong> para
              receber alertas.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table stock-table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Cód. / Material</th>
                    <th>Chapa / Corte</th>
                    <th className="text-end">Disponível</th>
                    <th className="text-end">Mínimo</th>
                    <th>Nível</th>
                    <th className="text-center">Ajuste rápido</th>
                    <th className="text-end">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((item) => {
                    const nivel = stockNivel(item);
                    const pct = stockPct(item);
                    const busy = ajustandoId === item.id;
                    return (
                      <tr key={item.id} className={`stock-row stock-row--${nivel}`}>
                        <td>
                          <div className="stock-mat">
                            <span className="stock-mat__icon" aria-hidden="true">
                              <i className="bi bi-box-seam-fill" />
                            </span>
                            <div className="stock-mat__body">
                              {item.codigo ? (
                                <span className="stock-mat__cod">Cód. {item.codigo}</span>
                              ) : null}
                              <strong className="stock-mat__name">{item.material}</strong>
                              <span className="stock-mat__meta">
                                Unidade: {(item.unidade || "M").toUpperCase()}
                                {item.departamento ? ` · ${item.departamento}` : null}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="stock-chapa">
                            {item.chapa_mm ? (
                              <span className="stock-chapa__badge">{formatChapa(item.chapa_mm)}</span>
                            ) : (
                              <span className="stock-chapa__empty">—</span>
                            )}
                            {Number(item.corte_cm) > 0 ? (
                              <span className="stock-chapa__corte">
                                <i className="bi bi-rulers" aria-hidden="true" />
                                Corte {Number(item.corte_cm).toLocaleString("pt-BR")} cm
                              </span>
                            ) : (
                              <span className="stock-chapa__corte is-empty">—</span>
                            )}
                          </div>
                        </td>
                        <td className="text-end">
                          <span className="stock-qtd stock-qtd--disp">
                            {formatQtd(item.saldo_loja ?? 0, item.unidade)}
                          </span>
                        </td>
                        <td className="text-end">
                          <span className="stock-qtd">
                            {formatQtd(item.estoque_minimo ?? 0, item.unidade)}
                          </span>
                        </td>
                        <td>
                          <div className={`stock-nivel stock-nivel--${nivel}`}>
                            <span className="stock-nivel__badge">
                              {estoqueAlertaLabel(nivel)}
                            </span>
                            <div className="stock-nivel__bar" aria-hidden="true">
                              <span style={{ width: `${pct}%` }} />
                            </div>
                            <small>{stockRefLabel(item)}</small>
                          </div>
                        </td>
                        <td>
                          <div className="stock-adjust">
                            {[-5, -1, 1, 5].map((delta) => (
                              <button
                                key={delta}
                                type="button"
                                className={`stock-adjust__btn${delta < 0 ? " is-minus" : " is-plus"}`}
                                disabled={busy}
                                onClick={() => void ajustarEstoque(item, delta)}
                                title={`Ajustar ${delta > 0 ? "+" : ""}${delta}`}
                              >
                                {delta > 0 ? `+${delta}` : delta}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="text-end">
                          <div className="stock-actions">
                            <a
                              href="/painel/visitas"
                              className="btn btn-sm stock-actions__orc"
                              title="Abrir orçamento"
                            >
                              <i className="bi bi-file-earmark-text" aria-hidden="true" />
                              Orçamento
                            </a>
                            <button
                              type="button"
                              className="btn btn-sm stock-actions__edit"
                              onClick={() => abrirEdicao(item)}
                              title="Editar"
                            >
                              <i className="bi bi-pencil" aria-hidden="true" />
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm stock-actions__del"
                              onClick={() => void deletar(item)}
                              title="Excluir"
                              aria-label="Excluir"
                            >
                              <i className="bi bi-trash" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ModalCadastroMaterial
        open={modalOpen}
        mode={modalMode}
        initial={editItem}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
