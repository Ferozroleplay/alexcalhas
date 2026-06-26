import { useCallback, useEffect, useState } from "react";

import { InvRowActions } from "@/components/admin/admin-row-actions";
import { AdminModal } from "@/components/admin/modals/AdminModal";
import { DashPageHero } from "@/components/admin/DashPageHero";
import {
  atualizarMaterial,
  criarMaterial,
  excluirMaterial,
  fetchFornecedoresSelect,
  fetchMateriais,
  type FornecedorSelect,
  type MaterialItem,
} from "@/lib/admin-api";
import { dashConfirm } from "@/lib/dash-ui";

function formatBrl(value: number): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcLucro(custo: number, venda: number) {
  const c = Number(custo) || 0;
  const v = Number(venda) || 0;
  const lucro = v - c;
  const margem = v > 0 ? (lucro / v) * 100 : 0;
  return { lucro, margem };
}

function lucroClass(lucro: number) {
  return lucro >= 0 ? "material-lucro--pos" : "material-lucro--neg";
}

function validarValorMaterial(value: string): string {
  let v = value.replace(/[^\d,.]/g, "");
  const sep = v.includes(",") ? "," : v.includes(".") ? "." : null;
  if (sep) {
    const parts = v.split(sep);
    v = parts[0] + sep + (parts[1] ?? "").slice(0, 2);
  }
  return v;
}

function fornecedorRotulo(f: FornecedorSelect): string {
  const nf = f.nome_fantasia?.trim();
  const rs = f.razao_social?.trim();
  return nf || rs || "Fornecedor";
}

function formatCnpj(cnpj: string | null): string {
  const digits = (cnpj ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return cnpj?.trim() ?? "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

type EditState = {
  id: number;
  material: string;
  valor_custo: string;
  valor: string;
  valor_fornecedor: string;
  fornecedor_ids: number[];
};

export function MateriaisPage() {
  const [itens, setItens] = useState<MaterialItem[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorSelect[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [nome, setNome] = useState("");
  const [custo, setCusto] = useState("");
  const [venda, setVenda] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const [mats, forns] = await Promise.all([fetchMateriais(), fetchFornecedoresSelect()]);
      setItens(mats);
      setFornecedores(forns);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar materiais.");
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsg("");
    setErro("");
    const nomeTrim = nome.trim();
    if (nomeTrim.length > 50) {
      setErro("A descrição do material pode ter no máximo 50 caracteres.");
      setSalvando(false);
      return;
    }
    try {
      await criarMaterial({ material: nomeTrim, valor_custo: custo, valor: venda });
      setNome("");
      setCusto("");
      setVenda("");
      setMsg("Material cadastrado com sucesso!");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao cadastrar.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(m: MaterialItem) {
    setEdit({
      id: m.id,
      material: m.material,
      valor_custo: Number(m.valor_custo).toFixed(2).replace(".", ","),
      valor: Number(m.valor).toFixed(2).replace(".", ","),
      valor_fornecedor: Number(m.valor_fornecedor ?? 0).toFixed(2).replace(".", ","),
      fornecedor_ids: m.fornecedor_ids ?? [],
    });
    setEditOpen(true);
  }

  function toggleForn(fid: number) {
    setEdit((prev) => {
      if (!prev) return prev;
      const ids = prev.fornecedor_ids.includes(fid)
        ? prev.fornecedor_ids.filter((x) => x !== fid)
        : [...prev.fornecedor_ids, fid];
      return { ...prev, fornecedor_ids: ids };
    });
  }

  function selTodosForn() {
    setEdit((prev) =>
      prev ? { ...prev, fornecedor_ids: fornecedores.map((f) => f.id) } : prev,
    );
  }

  function limparForn() {
    setEdit((prev) => (prev ? { ...prev, fornecedor_ids: [] } : prev));
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setEditSaving(true);
    setErro("");
    try {
      await atualizarMaterial({
        id: edit.id,
        material: edit.material.trim(),
        valor_custo: edit.valor_custo,
        valor: edit.valor,
        valor_fornecedor: edit.valor_fornecedor,
        fornecedor_ids: edit.fornecedor_ids,
      });
      setEditOpen(false);
      setMsg("Material editado com sucesso!");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deletar(id: number) {
    if (
      !(await dashConfirm({
        title: "Excluir material?",
        message: "Tem certeza que deseja excluir este material?",
        confirmText: "Excluir",
        variant: "danger",
      }))
    ) {
      return;
    }
    setErro("");
    try {
      await excluirMaterial(id);
      setMsg("Material excluído com sucesso!");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  const qtdFornEdit = edit?.fornecedor_ids.length ?? 0;

  return (
    <div className="analytics-page dash-form-page--pro">
      <DashPageHero
        title="Materiais"
        subtitle="Cadastre itens com custo, preço de venda e acompanhe lucro e margem."
        iconClass="bi-box-seam"
        accent="materiais"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header">
        {msg ? (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            {msg}
            <button
              type="button"
              className="btn-close"
              aria-label="Fechar"
              onClick={() => setMsg("")}
            />
          </div>
        ) : null}
        {erro ? (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        ) : null}

        <div className="dash-material-page">
          <form className="needs-validation dash-form" onSubmit={cadastrar} noValidate>
            <section className="dash-edit-modal__panel dash-material-form">
              <h2 className="dash-edit-modal__panel-title">
                <i className="bi bi-plus-circle" aria-hidden="true" /> Novo material
              </h2>
              <div className="row g-2 align-items-end">
                <div className="col-12 col-lg-6">
                  <label className="dash-edit-modal__label" htmlFor="mat-nome">
                    Descrição do material
                  </label>
                  <input
                    type="text"
                    id="mat-nome"
                    className="form-control dash-edit-modal__input"
                    placeholder="Ex.: Chapa Galvalume 0,43 mm"
                    maxLength={50}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                  />
                </div>
                <div className="col-6 col-sm-4 col-lg-2">
                  <label className="dash-edit-modal__label" htmlFor="mat-custo">
                    Custo (R$)
                  </label>
                  <input
                    type="text"
                    id="mat-custo"
                    className="form-control dash-edit-modal__input"
                    placeholder="0,00"
                    inputMode="decimal"
                    autoComplete="off"
                    value={custo}
                    onChange={(e) => setCusto(validarValorMaterial(e.target.value))}
                  />
                </div>
                <div className="col-6 col-sm-4 col-lg-2">
                  <label className="dash-edit-modal__label" htmlFor="mat-venda">
                    Venda (R$)
                  </label>
                  <input
                    type="text"
                    id="mat-venda"
                    className="form-control dash-edit-modal__input"
                    placeholder="0,00"
                    inputMode="decimal"
                    autoComplete="off"
                    value={venda}
                    onChange={(e) => setVenda(validarValorMaterial(e.target.value))}
                    required
                  />
                </div>
                <div className="col-12 col-sm-4 col-lg-2 d-grid">
                  <label className="dash-edit-modal__label d-none d-sm-block">
                    &nbsp;
                  </label>
                  <button
                    type="submit"
                    className="btn dash-edit-modal__btn-save w-100"
                    disabled={salvando}
                  >
                    <i className="bi bi-plus-lg" aria-hidden="true" />{" "}
                    {salvando ? "Cadastrando…" : "Cadastrar"}
                  </button>
                </div>
              </div>
            </section>

            <section className="dash-edit-modal__panel dash-material-table-wrap p-0 overflow-hidden">
              {loading ? (
                <p className="p-4 text-muted mb-0">Carregando materiais…</p>
              ) : itens.length === 0 ? (
                <p className="p-4 text-muted mb-0">Nenhum material cadastrado.</p>
              ) : (
                <>
                  <div className="dashboard-data-desktop inv-table-shell">
                    <div className="table-responsive inv-table-scroll inv-table-scroll--fit">
                      <table className="table inv-data-table inv-data-table--balanced inv-material-table align-middle mb-0">
                        <thead>
                          <tr>
                            <th className="inv-col-id">ID</th>
                            <th className="inv-col-material">Material</th>
                            <th className="inv-col-valor">Custo</th>
                            <th className="inv-col-valor">Venda</th>
                            <th className="inv-col-lucro">Lucro</th>
                            <th className="inv-col-lucro">Margem</th>
                            <th className="inv-col-forn">Fornecedor</th>
                            <th className="inv-col-actions">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((v) => (
                            <MaterialRowDesktop
                              key={v.id}
                              item={v}
                              onEdit={() => abrirEdicao(v)}
                              onDelete={() => void deletar(v.id)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="dashboard-data-mobile dash-material-cards">
                    {itens.map((v) => (
                      <MaterialCardMobile
                        key={v.id}
                        item={v}
                        onEdit={() => abrirEdicao(v)}
                        onDelete={() => void deletar(v.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </form>
        </div>
      </div>

      <AdminModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        dialogClass="modal-lg dash-edit-modal__dialog"
      >
        <form onSubmit={salvarEdicao} className="dash-edit-modal__form">
          <div className="modal-content dash-edit-modal__content">
            <div className="modal-header dash-edit-modal__header">
              <div className="dash-edit-modal__head">
                <span className="dash-edit-modal__head-icon" aria-hidden="true">
                  <i className="bi bi-box-seam" />
                </span>
                <div>
                  <h4 className="modal-title dash-edit-modal__title mb-0">Editar material</h4>
                  <p className="dash-edit-modal__subtitle mb-0">
                    Nome e valores de custo e venda
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Fechar"
                onClick={() => setEditOpen(false)}
              />
            </div>
            <div className="modal-body dash-edit-modal__body">
              {edit ? (
                <>
                  <section className="dash-edit-modal__panel">
                    <h3 className="dash-edit-modal__panel-title">
                      <i className="bi bi-pencil-square" aria-hidden="true" />
                      Dados do material
                    </h3>
                    <div className="row g-2">
                      <div className="col-12 col-sm-4 col-md-3">
                        <label className="dash-edit-modal__label" htmlFor="modal-id">
                          ID
                        </label>
                        <input
                          type="text"
                          id="modal-id"
                          className="form-control dash-edit-modal__input dash-edit-modal__input--readonly"
                          readOnly
                          value={edit.id}
                        />
                      </div>
                      <div className="col-12 col-sm-8 col-md-9">
                        <label className="dash-edit-modal__label" htmlFor="modal-material">
                          Material
                        </label>
                        <input
                          type="text"
                          id="modal-material"
                          className="form-control dash-edit-modal__input"
                          value={edit.material}
                          onChange={(e) => setEdit({ ...edit, material: e.target.value })}
                          required
                        />
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="dash-edit-modal__label" htmlFor="modal-valor-custo">
                          Custo (R$)
                        </label>
                        <div className="input-group dash-material-money-group">
                          <span className="input-group-text">R$</span>
                          <input
                            type="text"
                            id="modal-valor-custo"
                            className="form-control dash-edit-modal__input"
                            placeholder="0,00"
                            inputMode="decimal"
                            value={edit.valor_custo}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                valor_custo: validarValorMaterial(e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="dash-edit-modal__label" htmlFor="modal-value">
                          Venda (R$)
                        </label>
                        <div className="input-group dash-material-money-group">
                          <span className="input-group-text">R$</span>
                          <input
                            type="text"
                            id="modal-value"
                            className="form-control dash-edit-modal__input dash-edit-modal__valor"
                            placeholder="0,00"
                            inputMode="decimal"
                            value={edit.valor}
                            onChange={(e) =>
                              setEdit({ ...edit, valor: validarValorMaterial(e.target.value) })
                            }
                            required
                          />
                        </div>
                      </div>
                    </div>
                    <MaterialEditMetrics custo={edit.valor_custo} venda={edit.valor} />
                  </section>

                  {fornecedores.length > 0 ? (
                    <section className="dash-edit-modal__panel dash-material-forn-panel">
                      <h3 className="dash-edit-modal__panel-title dash-material-forn-panel__title">
                        <i className="bi bi-truck" aria-hidden="true" />
                        Fornecedores
                      </h3>
                      <p className="dash-func-pag-modal__hint dash-material-forn-panel__hint">
                        Escolha <strong>para quais fornecedores</strong> este material aparece na nota
                        de entrega.
                      </p>
                      <div className="dash-material-forn-toolbar">
                        <button
                          type="button"
                          className="analytics-btn analytics-btn--outline analytics-btn--sm"
                          onClick={selTodosForn}
                        >
                          <i className="bi bi-check2-all" aria-hidden="true" /> Selecionar todos
                        </button>
                        <button
                          type="button"
                          className="analytics-btn analytics-btn--outline analytics-btn--sm"
                          onClick={limparForn}
                        >
                          <i className="bi bi-x-lg" aria-hidden="true" /> Limpar
                        </button>
                        {qtdFornEdit > 0 ? (
                          <span className="dash-material-forn-count">
                            {qtdFornEdit} selecionado{qtdFornEdit !== 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </div>
                      <div className="dash-material-forn-list">
                        {fornecedores.map((f) => {
                          const cnpjExib = formatCnpj(f.cnpj);
                          const checked = edit.fornecedor_ids.includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className={`dash-material-forn-item${checked ? " dash-material-forn-item--checked" : ""}`}
                              htmlFor={`modal-forn-${f.id}`}
                            >
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`modal-forn-${f.id}`}
                                checked={checked}
                                onChange={() => toggleForn(f.id)}
                              />
                              <span className="dash-material-forn-item__content">
                                <span className="dash-material-forn-item__nome">
                                  {fornecedorRotulo(f)}
                                </span>
                                {cnpjExib ? (
                                  <small className="dash-material-forn-item__doc">
                                    {cnpjExib}
                                  </small>
                                ) : null}
                              </span>
                              {checked ? (
                                <i
                                  className="bi bi-check-circle-fill dash-material-forn-item__check"
                                  aria-hidden="true"
                                />
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                      {qtdFornEdit > 0 ? (
                        <div className="dash-material-forn-valor">
                          <label className="dash-edit-modal__label" htmlFor="modal-valor-fornecedor">
                            Valor fornecedor (R$/metro)
                          </label>
                          <div className="input-group dash-func-pag-modal__input-group dash-material-money-group">
                            <span className="input-group-text">R$</span>
                            <input
                              type="text"
                              id="modal-valor-fornecedor"
                              className="form-control dash-edit-modal__input"
                              placeholder="0,00"
                              inputMode="decimal"
                              value={edit.valor_fornecedor}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  valor_fornecedor: validarValorMaterial(e.target.value),
                                })
                              }
                            />
                          </div>
                          <p className="dash-func-pag-modal__hint mb-0">
                            Preço sugerido na nota (o fornecedor ainda pode ajustar ao enviar).
                          </p>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="modal-footer dash-edit-modal__footer">
              <button
                type="button"
                className="btn dash-edit-modal__btn-cancel"
                onClick={() => setEditOpen(false)}
              >
                Fechar
              </button>
              <button
                type="submit"
                className="btn dash-edit-modal__btn-save"
                disabled={editSaving}
              >
                <i className="bi bi-check-lg" aria-hidden="true" />
                {editSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}

function parseMoneyInput(raw: string): number {
  const v = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function MaterialEditMetrics({ custo, venda }: { custo: string; venda: string }) {
  const { lucro, margem } = calcLucro(parseMoneyInput(custo), parseMoneyInput(venda));
  const margemFmt = `${margem.toFixed(1).replace(".", ",")}%`;

  return (
    <div className="dash-material-edit-metrics" role="status">
      <span className="dash-material-edit-metrics__label">Resumo</span>
      <span className={`dash-material-edit-metrics__lucro ${lucroClass(lucro)}`}>
        Lucro {formatBrl(lucro)}
      </span>
      <span className={`dash-material-edit-metrics__margem ${lucroClass(lucro)}`}>
        Margem {margemFmt}
      </span>
    </div>
  );
}

function FornecedorCell({ item }: { item: MaterialItem }) {
  const qtdForn = item.qtd_fornecedores ?? item.fornecedor_ids?.length ?? 0;
  const fornNomes = item.fornecedores_nomes ?? [];
  const valorForn = Number(item.valor_fornecedor ?? 0);

  if (qtdForn <= 0) {
    return <span className="material-forn-badge material-forn-badge--off">—</span>;
  }

  const titulo = fornNomes.length ? fornNomes.join(", ") : `${qtdForn} fornecedor(es)`;
  const rotulo =
    qtdForn === 1 && fornNomes[0] ? fornNomes[0] : `${qtdForn} fornecedores`;

  return (
    <span className="material-forn-badge material-forn-badge--ativo" title={titulo}>
      <i className="bi bi-check-circle-fill" aria-hidden="true" /> {rotulo} · {formatBrl(valorForn)}
      /m
    </span>
  );
}

function MaterialRowDesktop({
  item,
  onEdit,
  onDelete,
}: {
  item: MaterialItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { lucro, margem } = calcLucro(item.valor_custo, item.valor);
  const margemFmt = `${margem.toFixed(1).replace(".", ",")}%`;

  return (
    <tr className="inv-data-row">
      <th scope="row" className="inv-col-id">
        <span className="inv-id-badge">#{item.id}</span>
      </th>
      <td className="inv-col-material">
        <span className="inv-material-name" title={item.material}>
          {item.material}
        </span>
      </td>
      <td className="inv-col-valor">{formatBrl(item.valor_custo)}</td>
      <td className="inv-col-valor">
        <span className="inv-valor-tag">{formatBrl(item.valor)}</span>
      </td>
      <td className={`inv-col-lucro ${lucroClass(lucro)}`}>{formatBrl(lucro)}</td>
      <td className="inv-col-lucro">
        <span className={`material-margem-tag ${lucroClass(lucro)}`}>{margemFmt}</span>
      </td>
      <td className="inv-col-forn">
        <FornecedorCell item={item} />
      </td>
      <td className="inv-col-actions">
        <InvRowActions
          ariaLabel={`Mais ações #${item.id}`}
          primary={
            <button
              type="button"
              className="inv-action-btn inv-action-btn--secondary"
              title="Editar material"
              aria-label="Editar material"
              onClick={onEdit}
            >
              <i className="bi bi-pencil-square" aria-hidden="true" />
            </button>
          }
          menu={[
            {
              label: "Excluir",
              icon: "bi-trash",
              onClick: onDelete,
            },
          ]}
        />
      </td>
    </tr>
  );
}

function MaterialCardMobile({
  item,
  onEdit,
  onDelete,
}: {
  item: MaterialItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { lucro, margem } = calcLucro(item.valor_custo, item.valor);
  const margemFmt = `${margem.toFixed(1).replace(".", ",")}%`;
  const qtdForn = item.qtd_fornecedores ?? item.fornecedor_ids?.length ?? 0;
  const fornNomes = item.fornecedores_nomes ?? [];
  const valorForn = Number(item.valor_fornecedor ?? 0);
  const fornLabel =
    qtdForn > 0
      ? `${qtdForn === 1 && fornNomes[0] ? fornNomes[0] : `${qtdForn} fornecedores`} · ${formatBrl(valorForn)}/m`
      : "Não liberado";

  return (
    <article className="record-card dash-material-card">
      <div className="record-card-header">
        <span className="record-card-id">#{item.id}</span>
        <div className="record-card-header-actions">
          <button
            type="button"
            className="inv-action-btn inv-action-btn--secondary"
            title="Editar"
            aria-label="Editar"
            onClick={onEdit}
          >
            <i className="bi bi-pencil-square" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inv-action-btn inv-action-btn--muted"
            title="Excluir"
            aria-label="Excluir"
            onClick={onDelete}
          >
            <i className="bi bi-trash" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="record-card-body">
        <div className="record-card-row">
          <span className="record-card-label">Material</span>
          <span className="record-card-value">{item.material}</span>
        </div>
        <div className="record-card-row">
          <span className="record-card-label">Custo</span>
          <span className="record-card-value">{formatBrl(item.valor_custo)}</span>
        </div>
        <div className="record-card-row">
          <span className="record-card-label">Venda</span>
          <span className="record-card-value">{formatBrl(item.valor)}</span>
        </div>
        <div className="record-card-row">
          <span className="record-card-label">Fornecedor</span>
          <span className="record-card-value">{fornLabel}</span>
        </div>
        <div className="record-card-row">
          <span className="record-card-label">Lucro / Margem</span>
          <span className={`record-card-value ${lucroClass(lucro)}`}>
            {formatBrl(lucro)} · {margemFmt}
          </span>
        </div>
      </div>
    </article>
  );
}
