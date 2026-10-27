import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { InvActionBtn, InvRowActions } from "@/components/admin/admin-row-actions";
import { DashPageHero } from "@/components/admin/DashPageHero";
import { AdminModal } from "@/components/admin/modals/AdminModal";
import {
  criarDespesa,
  DESPESA_CATEGORIAS,
  DESPESA_FORMAS,
  excluirDespesa,
  fetchDespesas,
  formatDespesaDataBr,
  salvarDespesa,
  totalDespesas,
  type DespesaItem,
} from "@/lib/despesas-client";
import { dashConfirm } from "@/lib/dash-ui";

const MESES = [
  { value: 0, label: "Todos" },
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

function hojeIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sanitizarValor(raw: string): string {
  let v = raw.replace(/[^\d,.]/g, "");
  const sep = v.includes(",") ? "," : v.includes(".") ? "." : null;
  if (sep) {
    const parts = v.split(sep);
    v = parts[0] + sep + (parts[1] ?? "").slice(0, 2);
  }
  return v;
}

type FormState = {
  data: string;
  descricao: string;
  categoria: string;
  valor: string;
  forma_pagamento: string;
  observacao: string;
};

function formVazio(categoria = "outros"): FormState {
  return {
    data: hojeIso(),
    descricao: "",
    categoria,
    valor: "",
    forma_pagamento: "pix",
    observacao: "",
  };
}

export function DespesasPage() {
  const { user } = useAdminAuth();
  const isAdmin = user?.visao === "admin";
  const categoriaPadrao = isAdmin ? "outros" : "combustivel";
  const yearNow = new Date().getFullYear();
  const [ano, setAno] = useState(yearNow);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [itens, setItens] = useState<DespesaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<FormState>(() => formVazio(categoriaPadrao));
  const [salvando, setSalvando] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<FormState>(() => formVazio());
  const [editSaving, setEditSaving] = useState(false);

  const anos = useMemo(() => [yearNow, yearNow - 1, yearNow - 2, yearNow - 3], [yearNow]);

  const total = useMemo(() => totalDespesas(itens), [itens]);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      setItens(
        await fetchDespesas({
          ano,
          mes: mes > 0 ? mes : undefined,
          categoria: filtroCategoria || undefined,
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar despesas.");
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, filtroCategoria]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim()) {
      setErro("Informe a descrição da despesa.");
      return;
    }
    setSalvando(true);
    setMsg("");
    setErro("");
    try {
      await criarDespesa({
        data: form.data,
        descricao: form.descricao.trim(),
        categoria: form.categoria,
        valor: form.valor,
        forma_pagamento: form.forma_pagamento,
        observacao: form.observacao.trim() || undefined,
      });
      setForm(formVazio(categoriaPadrao));
      setMsg("Despesa cadastrada.");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao cadastrar.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(item: DespesaItem) {
    setEditId(item.id);
    setEdit({
      data: item.data,
      descricao: item.descricao,
      categoria: item.categoria,
      valor: item.valor.toFixed(2).replace(".", ","),
      forma_pagamento: item.forma_pagamento,
      observacao: item.observacao,
    });
    setEditOpen(true);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (editId == null) return;
    setEditSaving(true);
    setErro("");
    try {
      await salvarDespesa(editId, {
        data: edit.data,
        descricao: edit.descricao.trim(),
        categoria: edit.categoria,
        valor: edit.valor,
        forma_pagamento: edit.forma_pagamento,
        observacao: edit.observacao.trim() || undefined,
      });
      setEditOpen(false);
      setMsg("Despesa atualizada.");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deletar(item: DespesaItem) {
    if (
      !(await dashConfirm({
        title: "Excluir despesa?",
        message: `Remover "${item.descricao}" (${formatBrl(item.valor)})?`,
        confirmText: "Excluir",
        variant: "danger",
      }))
    ) {
      return;
    }
    setErro("");
    try {
      await excluirDespesa(item.id);
      setMsg("Despesa excluída.");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  return (
    <div className="analytics-page dash-form-page--pro despesas-page">
      <DashPageHero
        title="Despesas"
        subtitle={
          isAdmin
            ? "Gastos da empresa. Funcionário também lança abastecimento e outros daqui."
            : "Abasteceu o carro? Lança aqui na hora. O admin vê na lista."
        }
        iconClass="bi-receipt"
        accent="financeiro"
        showNovaVisita={false}
      />

      <div className="dash-page-body dash-page-body--with-header">
        {msg ? (
          <div className="alert alert-success py-2" role="status">
            {msg}
          </div>
        ) : null}
        {erro ? (
          <div className="alert alert-danger py-2" role="alert">
            {erro}
          </div>
        ) : null}

        <section className="despesas-card despesas-card--form">
          <h2 className="despesas-card__title">Nova despesa</h2>
          <form className="despesas-form" onSubmit={cadastrar}>
            <label className="despesas-field">
              <span>Data</span>
              <input
                type="date"
                className="form-control dash-edit-modal__input"
                value={form.data}
                onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))}
                required
              />
            </label>
            <label className="despesas-field despesas-field--grow">
              <span>Descrição</span>
              <input
                type="text"
                className="form-control dash-edit-modal__input"
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder={isAdmin ? "Ex.: gasolina da semana" : "Ex.: abastecimento do carro"}
                maxLength={255}
                required
              />
            </label>
            <label className="despesas-field">
              <span>Categoria</span>
              <select
                className="form-select dash-edit-modal__input"
                value={form.categoria}
                onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
              >
                {DESPESA_CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="despesas-field">
              <span>Valor (R$)</span>
              <input
                type="text"
                className="form-control dash-edit-modal__input"
                value={form.valor}
                onChange={(e) => setForm((p) => ({ ...p, valor: sanitizarValor(e.target.value) }))}
                placeholder="0,00"
                inputMode="decimal"
                required
              />
            </label>
            <label className="despesas-field">
              <span>Pagamento</span>
              <select
                className="form-select dash-edit-modal__input"
                value={form.forma_pagamento}
                onChange={(e) => setForm((p) => ({ ...p, forma_pagamento: e.target.value }))}
              >
                {DESPESA_FORMAS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="despesas-field despesas-field--full">
              <span>Observação</span>
              <input
                type="text"
                className="form-control dash-edit-modal__input"
                value={form.observacao}
                onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                placeholder="Opcional"
                maxLength={2000}
              />
            </label>
            <div className="despesas-form__actions">
              <button type="submit" className="btn btn-success" disabled={salvando}>
                {salvando ? "Salvando…" : "Adicionar despesa"}
              </button>
            </div>
          </form>
        </section>

        <section className="despesas-card">
          <div className="despesas-toolbar">
            <div className="despesas-filters">
              <label className="despesas-field">
                <span>Mês</span>
                <select
                  className="form-select dash-edit-modal__input"
                  value={mes}
                  onChange={(e) => setMes(Number(e.target.value))}
                >
                  {MESES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="despesas-field">
                <span>Ano</span>
                <select
                  className="form-select dash-edit-modal__input"
                  value={ano}
                  onChange={(e) => setAno(Number(e.target.value))}
                >
                  {anos.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <label className="despesas-field">
                <span>Categoria</span>
                <select
                  className="form-select dash-edit-modal__input"
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                >
                  <option value="">Todas</option>
                  {DESPESA_CATEGORIAS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="despesas-total">
              <span>Total do período</span>
              <strong>{formatBrl(total)}</strong>
            </div>
          </div>

          <div className="table-responsive despesas-table-wrap">
            <table className="table table-sm align-middle mb-0 despesas-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  {isAdmin ? <th>Lançado por</th> : null}
                  <th>Pagamento</th>
                  <th className="text-end">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="text-muted text-center py-4">
                      Carregando…
                    </td>
                  </tr>
                ) : itens.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="text-muted text-center py-4">
                      Nenhuma despesa neste período.
                    </td>
                  </tr>
                ) : (
                  itens.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDespesaDataBr(item.data)}</td>
                      <td>
                        <div className="despesas-desc">
                          <span>{item.descricao}</span>
                          {item.observacao ? (
                            <small className="text-muted">{item.observacao}</small>
                          ) : null}
                        </div>
                      </td>
                      <td>{item.categoria_label}</td>
                      {isAdmin ? <td>{item.registrado_por_nome || "—"}</td> : null}
                      <td>{item.forma_pagamento_label}</td>
                      <td className="text-end fw-semibold">{formatBrl(item.valor)}</td>
                      <td className="text-end">
                        <InvRowActions
                          primary={
                            <InvActionBtn
                              icon="bi-pencil-square"
                              title="Editar"
                              onClick={() => abrirEdicao(item)}
                            />
                          }
                          menu={[
                            {
                              label: "Excluir",
                              icon: "bi-trash",
                              className: "text-danger",
                              onClick: () => void deletar(item),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <AdminModal open={editOpen} onClose={() => setEditOpen(false)} dialogClass="modal-md">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title mb-0">Editar despesa</h5>
            <button type="button" className="btn-close" aria-label="Fechar" onClick={() => setEditOpen(false)} />
          </div>
          <form onSubmit={salvarEdicao}>
            <div className="modal-body">
              <div className="despesas-form despesas-form--modal">
                <label className="despesas-field">
                  <span>Data</span>
                  <input
                    type="date"
                    className="form-control dash-edit-modal__input"
                    value={edit.data}
                    onChange={(e) => setEdit((p) => ({ ...p, data: e.target.value }))}
                    required
                  />
                </label>
                <label className="despesas-field despesas-field--full">
                  <span>Descrição</span>
                  <input
                    type="text"
                    className="form-control dash-edit-modal__input"
                    value={edit.descricao}
                    onChange={(e) => setEdit((p) => ({ ...p, descricao: e.target.value }))}
                    maxLength={255}
                    required
                  />
                </label>
                <label className="despesas-field">
                  <span>Categoria</span>
                  <select
                    className="form-select dash-edit-modal__input"
                    value={edit.categoria}
                    onChange={(e) => setEdit((p) => ({ ...p, categoria: e.target.value }))}
                  >
                    {DESPESA_CATEGORIAS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="despesas-field">
                  <span>Valor (R$)</span>
                  <input
                    type="text"
                    className="form-control dash-edit-modal__input"
                    value={edit.valor}
                    onChange={(e) => setEdit((p) => ({ ...p, valor: sanitizarValor(e.target.value) }))}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="despesas-field">
                  <span>Pagamento</span>
                  <select
                    className="form-select dash-edit-modal__input"
                    value={edit.forma_pagamento}
                    onChange={(e) => setEdit((p) => ({ ...p, forma_pagamento: e.target.value }))}
                  >
                    {DESPESA_FORMAS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="despesas-field despesas-field--full">
                  <span>Observação</span>
                  <input
                    type="text"
                    className="form-control dash-edit-modal__input"
                    value={edit.observacao}
                    onChange={(e) => setEdit((p) => ({ ...p, observacao: e.target.value }))}
                    maxLength={2000}
                  />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-success" disabled={editSaving}>
                {editSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </AdminModal>
    </div>
  );
}
