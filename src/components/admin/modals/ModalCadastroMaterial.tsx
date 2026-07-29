import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import {
  atualizarMaterial,
  criarMaterial,
  type MaterialItem,
} from "@/lib/admin-api";
import { calcularFator, loadEmpresaConfig } from "@/lib/empresa-config";
import { dashToast } from "@/lib/dash-ui";
import {
  ESPESSURAS_CHAPA,
  calcularPrecosChapaGalvalume,
  isChapaGalvalumeMetros,
  type EspessuraChapa,
} from "@/lib/orcamento-empresa";

type TabId = "estoque" | "adicionais" | "similares" | "tributacao" | "preco" | "foto";

type FormState = {
  codigo: string;
  material: string;
  descricao_nfe: string;
  unidade: string;
  departamento: string;
  subdepartamento: string;
  marca: string;
  tipo_material: string;
  referencia: string;
  caracteristica: string;
  situacao: string;
  servico: string;
  situacao_tributaria: string;
  ncm: string;
  ean: string;
  valor: string;
  estoque_minimo: string;
  capacidade_total: string;
  estoque_negativo: string;
  fator: string;
  tipo_fator: string;
  chapa_mm: string;
  corte_cm: string;
  valor_custo: string;
  custo_mercado: string;
  custo_formacao: string;
  margem_desejada: string;
  margem_aplicada: string;
  perc_comissao: string;
  saldo_loja: string;
  saldo_geral: string;
  custo_loja: string;
  localizacao: string;
  local_mapa: string;
  coluna: string;
  prateleira: string;
  box: string;
};

type Props = {
  open: boolean;
  mode: "novo" | "editar";
  initial?: MaterialItem | null;
  onClose: () => void;
  onSaved: () => void;
};

function moneyInput(n: number): string {
  return Number(n || 0).toFixed(2).replace(".", ",");
}

function numInput(n: number, digits = 2): string {
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function emptyForm(): FormState {
  const cfg = typeof window !== "undefined" ? loadEmpresaConfig() : null;
  return {
    codigo: "",
    material: "",
    descricao_nfe: "",
    unidade: "M",
    departamento: "Calhas",
    subdepartamento: "Chapas",
    marca: "",
    tipo_material: "Galvalume",
    referencia: "",
    caracteristica: "",
    situacao: "liberado",
    servico: "nao",
    situacao_tributaria: "",
    ncm: "",
    ean: "",
    valor: "",
    estoque_minimo: "2",
    capacidade_total: "0",
    estoque_negativo: "nao",
    fator: cfg ? String(calcularFator(cfg.margemRecomendada)).replace(".", ",") : "",
    tipo_fator: "multiplicacao",
    chapa_mm: "0.43",
    corte_cm: "",
    valor_custo: "",
    custo_mercado: "",
    custo_formacao: "",
    margem_desejada: cfg ? String(cfg.margemRecomendada).replace(".", ",") : "",
    margem_aplicada: cfg ? String(cfg.margemRecomendada).replace(".", ",") : "",
    perc_comissao: "0",
    saldo_loja: "0",
    saldo_geral: "0",
    custo_loja: "",
    localizacao: "",
    local_mapa: "",
    coluna: "",
    prateleira: "",
    box: "",
  };
}

function fromItem(item: MaterialItem): FormState {
  return {
    codigo: item.codigo ?? "",
    material: item.material ?? "",
    descricao_nfe: item.descricao_nfe ?? "",
    unidade: item.unidade || "M",
    departamento: item.departamento || "Calhas",
    subdepartamento: item.subdepartamento || "Chapas",
    marca: item.marca ?? "",
    tipo_material: item.tipo_material || "Galvalume",
    referencia: item.referencia ?? "",
    caracteristica: item.caracteristica ?? "",
    situacao: item.situacao || "liberado",
    servico: item.servico ? "sim" : "nao",
    situacao_tributaria: item.situacao_tributaria ?? "",
    ncm: item.ncm ?? "",
    ean: item.ean ?? "",
    valor: moneyInput(item.valor),
    estoque_minimo: moneyInput(item.estoque_minimo ?? 0),
    capacidade_total: moneyInput(item.capacidade_total ?? 0),
    estoque_negativo: item.estoque_negativo ? "sim" : "nao",
    fator: numInput(item.fator ?? 0, 4),
    tipo_fator: item.tipo_fator || "multiplicacao",
    chapa_mm: item.chapa_mm || "0.43",
    corte_cm: item.corte_cm ? moneyInput(item.corte_cm) : "",
    valor_custo: moneyInput(item.valor_custo),
    custo_mercado: moneyInput(item.custo_mercado ?? item.valor_custo),
    custo_formacao: moneyInput(item.custo_formacao ?? item.valor_custo),
    margem_desejada: moneyInput(item.margem_desejada ?? 0),
    margem_aplicada: moneyInput(item.margem_aplicada ?? 0),
    perc_comissao: moneyInput(item.perc_comissao ?? 0),
    saldo_loja: moneyInput(item.saldo_loja ?? 0),
    saldo_geral: moneyInput(item.saldo_geral ?? 0),
    custo_loja: moneyInput(item.custo_loja ?? item.valor_custo),
    localizacao: item.localizacao ?? "",
    local_mapa: item.local_mapa ?? "",
    coluna: item.coluna ?? "",
    prateleira: item.prateleira ?? "",
    box: item.box ?? "",
  };
}

function Field({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`mcp-field ${className}`.trim()}>
      <span className="mcp-field__label">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

export function ModalCadastroMaterial({ open, mode, initial, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<TabId>("estoque");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const saldoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("estoque");
    setErro("");
    const base = initial ? fromItem(initial) : emptyForm();
    setForm(
      isChapaGalvalumeMetros({
        material: base.material,
        tipo_material: base.tipo_material,
        unidade: base.unidade,
      }) || (base.chapa_mm && base.corte_cm)
        ? aplicarCalculoEmpresa(base)
        : base,
    );
  }, [open, initial]);

  function patch(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function aplicarCalculoEmpresa(next: FormState) {
    const corteCampo = Number.parseFloat(next.corte_cm.replace(",", ".")) || 0;
    const chapaCampo = next.chapa_mm as EspessuraChapa;
    const temCamposChapa =
      corteCampo >= 1 && ["0.43", "0.50", "0.65"].includes(chapaCampo);

    const calc = temCamposChapa
      ? calcularPrecosChapaGalvalume({
          material: `Chapa Galvalume ${chapaCampo} mm - Perfil: C/${Math.round(corteCampo)}`,
          tipo_material: "Galvalume",
          unidade: "M",
          chapa_mm: chapaCampo,
          corte_cm: corteCampo,
        })
      : calcularPrecosChapaGalvalume({
          material: next.material,
          tipo_material: next.tipo_material || "Galvalume",
          unidade: next.unidade || "M",
          chapa_mm: next.chapa_mm,
          corte_cm: next.corte_cm,
        });

    if (!calc) return next;
    return {
      ...next,
      valor_custo: moneyInput(calc.custoUnitario),
      custo_mercado: moneyInput(calc.custoUnitario),
      custo_formacao: moneyInput(calc.custoUnitario),
      custo_loja: moneyInput(calc.custoUnitario),
      valor: moneyInput(calc.valorUnitario),
      fator: String(calc.fator).replace(".", ","),
      margem_desejada: String(calc.margemRecomendada).replace(".", ","),
      margem_aplicada: String(calc.margemRecomendada).replace(".", ","),
      chapa_mm: calc.espessura,
      corte_cm: String(calc.corteCm),
      material:
        next.material.trim() ||
        `Chapa Galvalume ${calc.espessura} mm - Perfil: C/${Math.round(calc.corteCm)}`,
      tipo_material: next.tipo_material || "Galvalume",
      unidade: next.unidade === "UN" && !temCamposChapa ? next.unidade : "M",
    };
  }

  function onChapaOrCorte(partial: Partial<FormState>) {
    setForm((prev) => aplicarCalculoEmpresa({ ...prev, ...partial }));
  }

  const resumo = useMemo(() => {
    const venda = Number.parseFloat(form.valor.replace(",", ".")) || 0;
    const custo = Number.parseFloat(form.valor_custo.replace(",", ".")) || 0;
    const margem = Number.parseFloat(form.margem_aplicada.replace(",", ".")) || 0;
    return { venda, custo, margem };
  }, [form.valor, form.valor_custo, form.margem_aplicada]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.material.trim()) {
      setErro("Informe a descrição para controle.");
      return;
    }
    setSaving(true);
    setErro("");

    // Chapa Galvalume em metros: sempre grava com preço da Empresa.
    const base = isChapaGalvalumeMetros({
      material: form.material,
      tipo_material: form.tipo_material,
      unidade: form.unidade,
    })
      ? aplicarCalculoEmpresa(form)
      : form;
    if (base !== form) setForm(base);

    const payload = {
      material: base.material.trim(),
      descricao_nfe: base.descricao_nfe,
      codigo: base.codigo,
      unidade: base.unidade,
      departamento: base.departamento,
      subdepartamento: base.subdepartamento,
      marca: base.marca,
      tipo_material: base.tipo_material,
      referencia: base.referencia,
      caracteristica: base.caracteristica,
      situacao: base.situacao,
      servico: base.servico === "sim",
      situacao_tributaria: base.situacao_tributaria,
      ncm: base.ncm,
      ean: base.ean,
      valor: base.valor,
      valor_custo: base.valor_custo,
      estoque_minimo: base.estoque_minimo,
      capacidade_total: base.capacidade_total,
      estoque_negativo: base.estoque_negativo === "sim",
      fator: base.fator,
      tipo_fator: base.tipo_fator,
      chapa_mm: base.chapa_mm,
      corte_cm: base.corte_cm,
      custo_mercado: base.custo_mercado,
      custo_formacao: base.custo_formacao,
      margem_desejada: base.margem_desejada,
      margem_aplicada: base.margem_aplicada,
      perc_comissao: base.perc_comissao,
      saldo_loja: base.saldo_loja,
      saldo_geral: base.saldo_geral,
      custo_loja: base.custo_loja,
      localizacao: base.localizacao,
      local_mapa: base.local_mapa,
      coluna: base.coluna,
      prateleira: base.prateleira,
      box: base.box,
    };
    try {
      if (mode === "editar" && initial?.id) {
        await atualizarMaterial({ id: initial.id, ...payload });
      } else {
        await criarMaterial(payload);
      }
      dashToast(mode === "editar" ? "Produto atualizado." : "Produto cadastrado.", "success");
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "estoque", label: "Dados do estoque" },
    { id: "adicionais", label: "Dados Adicionais" },
    { id: "similares", label: "Códigos Similares" },
    { id: "tributacao", label: "Tributação" },
    { id: "preco", label: "Tabela de Preço" },
    { id: "foto", label: "Foto" },
  ];

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dialogClass="modal-xl modal-cadastro-produto__dialog"
    >
      <form className="modal-content mcp-modal" onSubmit={salvar}>
        <div className="modal-header mcp-modal__header">
          <h4 className="modal-title mb-0">
            {mode === "editar" ? "Editar produto" : "Cadastro de Produtos"}
          </h4>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
        </div>

        <div className="modal-body mcp-modal__body">
          {erro ? (
            <div className="alert alert-danger py-2" role="alert">
              {erro}
            </div>
          ) : null}

          <section className="mcp-geral">
            <div className="mcp-geral__grid">
              <Field label="Código">
                <input
                  className="form-control mcp-input"
                  value={form.codigo}
                  onChange={(e) => patch({ codigo: e.target.value })}
                  placeholder="Ex.: 0054"
                />
              </Field>
              <Field label="Descrição para controle" required className="mcp-field--wide">
                <input
                  className="form-control mcp-input"
                  value={form.material}
                  onChange={(e) => patch({ material: e.target.value })}
                  placeholder="Ex: Bobina chapa 0,43 mm"
                  maxLength={255}
                  required
                />
              </Field>
              <Field label="Descrição para NF-e" className="mcp-field--wide">
                <input
                  className="form-control mcp-input"
                  value={form.descricao_nfe}
                  onChange={(e) => patch({ descricao_nfe: e.target.value })}
                />
              </Field>
              <Field label="Unidade">
                <select
                  className="form-select mcp-input"
                  value={form.unidade}
                  onChange={(e) => patch({ unidade: e.target.value })}
                >
                  <option value="M">M (metros)</option>
                  <option value="UN">UN (unidades)</option>
                  <option value="KG">KG</option>
                  <option value="PC">PC (peça)</option>
                </select>
              </Field>
              <Field label="Departamento" required>
                <input
                  className="form-control mcp-input"
                  value={form.departamento}
                  onChange={(e) => patch({ departamento: e.target.value })}
                />
              </Field>
              <Field label="Sub-departamento" required>
                <input
                  className="form-control mcp-input"
                  value={form.subdepartamento}
                  onChange={(e) => patch({ subdepartamento: e.target.value })}
                />
              </Field>
              <Field label="Marca">
                <input
                  className="form-control mcp-input"
                  value={form.marca}
                  onChange={(e) => patch({ marca: e.target.value })}
                />
              </Field>
              <Field label="Tipo de material" required>
                <input
                  className="form-control mcp-input"
                  value={form.tipo_material}
                  onChange={(e) => patch({ tipo_material: e.target.value })}
                />
              </Field>
              <Field label="Referência">
                <input
                  className="form-control mcp-input"
                  value={form.referencia}
                  onChange={(e) => patch({ referencia: e.target.value })}
                />
              </Field>
              <Field label="Característica">
                <input
                  className="form-control mcp-input"
                  value={form.caracteristica}
                  onChange={(e) => patch({ caracteristica: e.target.value })}
                />
              </Field>
              <Field label="Situação">
                <select
                  className="form-select mcp-input"
                  value={form.situacao}
                  onChange={(e) => patch({ situacao: e.target.value })}
                >
                  <option value="liberado">Liberado para venda</option>
                  <option value="bloqueado">Bloqueado</option>
                  <option value="inativo">Inativo</option>
                </select>
              </Field>
              <Field label="Serviço">
                <select
                  className="form-select mcp-input"
                  value={form.servico}
                  onChange={(e) => patch({ servico: e.target.value })}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </Field>
              <Field label="Situação tributária">
                <input
                  className="form-control mcp-input"
                  value={form.situacao_tributaria}
                  onChange={(e) => patch({ situacao_tributaria: e.target.value })}
                />
              </Field>
              <Field label="NCM">
                <input
                  className="form-control mcp-input"
                  value={form.ncm}
                  onChange={(e) => patch({ ncm: e.target.value })}
                />
              </Field>
              <Field label="Código EAN Fabricante">
                <input
                  className="form-control mcp-input"
                  value={form.ean}
                  onChange={(e) => patch({ ean: e.target.value })}
                />
              </Field>
              <Field label="Preço">
                <input
                  className="form-control mcp-input"
                  value={form.valor}
                  onChange={(e) => patch({ valor: e.target.value.replace(/[^\d,.]/g, "") })}
                  inputMode="decimal"
                />
              </Field>
            </div>
          </section>

          <div className="mcp-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`mcp-tabs__btn${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "estoque" ? (
            <div className="mcp-estoque">
              <section className="mcp-box">
                <h5 className="mcp-box__title">Detalhes de estoque</h5>
                <div className="mcp-estoque__grid">
                  <Field label="Estoque Mínimo (aviso)" className="mcp-field--destaque">
                    <input
                      className="form-control mcp-input"
                      value={form.estoque_minimo}
                      onChange={(e) => patch({ estoque_minimo: e.target.value.replace(/[^\d,.]/g, "") })}
                      inputMode="decimal"
                      placeholder="Ex.: 1 ou 2"
                    />
                    <span className="mcp-field__hint">
                      Avise quando o saldo ficar igual ou abaixo deste valor (ex.: 1 m, 2 m, 20 un).
                    </span>
                  </Field>
                  <Field label="Capacidade total">
                    <input
                      className="form-control mcp-input"
                      value={form.capacidade_total}
                      onChange={(e) =>
                        patch({ capacidade_total: e.target.value.replace(/[^\d,.]/g, "") })
                      }
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Estoque negativo?">
                    <select
                      className="form-select mcp-input"
                      value={form.estoque_negativo}
                      onChange={(e) => patch({ estoque_negativo: e.target.value })}
                    >
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </Field>
                  <Field label="Fator">
                    <input
                      className="form-control mcp-input"
                      value={form.fator}
                      onChange={(e) => patch({ fator: e.target.value.replace(/[^\d,.]/g, "") })}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Tipo do fator">
                    <select
                      className="form-select mcp-input"
                      value={form.tipo_fator}
                      onChange={(e) => patch({ tipo_fator: e.target.value })}
                    >
                      <option value="multiplicacao">Multiplicação</option>
                      <option value="divisao">Divisão</option>
                    </select>
                  </Field>
                  <Field label="Chapa (mm)">
                    <select
                      className="form-select mcp-input"
                      value={form.chapa_mm}
                      onChange={(e) => onChapaOrCorte({ chapa_mm: e.target.value })}
                    >
                      {ESPESSURAS_CHAPA.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label.replace(" mm", "")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Corte (cm)">
                    <input
                      className="form-control mcp-input"
                      value={form.corte_cm}
                      onChange={(e) =>
                        onChapaOrCorte({ corte_cm: e.target.value.replace(/[^\d,.]/g, "") })
                      }
                      inputMode="decimal"
                      placeholder="Ex.: 60"
                    />
                  </Field>
                  <Field label="Último Custo">
                    <input
                      className="form-control mcp-input"
                      value={form.valor_custo}
                      onChange={(e) => patch({ valor_custo: e.target.value.replace(/[^\d,.]/g, "") })}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Custo de Mercado">
                    <input
                      className="form-control mcp-input"
                      value={form.custo_mercado}
                      onChange={(e) =>
                        patch({ custo_mercado: e.target.value.replace(/[^\d,.]/g, "") })
                      }
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Custo de Form. Preço">
                    <input
                      className="form-control mcp-input"
                      value={form.custo_formacao}
                      onChange={(e) =>
                        patch({ custo_formacao: e.target.value.replace(/[^\d,.]/g, "") })
                      }
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Margem Desejada (%)">
                    <input
                      className="form-control mcp-input"
                      value={form.margem_desejada}
                      onChange={(e) =>
                        patch({ margem_desejada: e.target.value.replace(/[^\d,.]/g, "") })
                      }
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Margem Aplicada (%)">
                    <input
                      className="form-control mcp-input"
                      value={form.margem_aplicada}
                      onChange={(e) =>
                        patch({ margem_aplicada: e.target.value.replace(/[^\d,.]/g, "") })
                      }
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Perc. Comissão (%)">
                    <input
                      className="form-control mcp-input"
                      value={form.perc_comissao}
                      onChange={(e) =>
                        patch({ perc_comissao: e.target.value.replace(/[^\d,.]/g, "") })
                      }
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Saldo Loja (estoque atual)" className="mcp-field--destaque">
                    <input
                      ref={saldoRef}
                      className="form-control mcp-input"
                      value={form.saldo_loja}
                      onChange={(e) => patch({ saldo_loja: e.target.value.replace(/[^\d,.]/g, "") })}
                      inputMode="decimal"
                    />
                    <span className="mcp-field__hint">
                      Quantidade disponível agora. Se ficar ≤ estoque mínimo, aparece alerta na lista.
                    </span>
                  </Field>
                  <Field label="Saldo Geral">
                    <input
                      className="form-control mcp-input"
                      value={form.saldo_geral}
                      onChange={(e) => patch({ saldo_geral: e.target.value.replace(/[^\d,.]/g, "") })}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Custo Loja">
                    <input
                      className="form-control mcp-input"
                      value={form.custo_loja}
                      onChange={(e) => patch({ custo_loja: e.target.value.replace(/[^\d,.]/g, "") })}
                      inputMode="decimal"
                    />
                  </Field>
                </div>
                <p className="mcp-calc-hint">
                  {resumo.venda.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  {form.unidade === "M" ? "/m" : ""} — custo{" "}
                  {resumo.custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  {form.unidade === "M" ? "/m" : ""} — margem {resumo.margem.toLocaleString("pt-BR")}%
                </p>
                <p className="mcp-help">Digite o saldo aqui ou use o botão Lançar Estoque abaixo.</p>
              </section>

              <section className="mcp-box">
                <h5 className="mcp-box__title">Informações de local</h5>
                <div className="mcp-local__grid">
                  <Field label="Localização" className="mcp-field--wide">
                    <input
                      className="form-control mcp-input"
                      value={form.localizacao}
                      onChange={(e) => patch({ localizacao: e.target.value })}
                    />
                  </Field>
                  <Field label="Local Mapa / Rua" className="mcp-field--wide">
                    <input
                      className="form-control mcp-input"
                      value={form.local_mapa}
                      onChange={(e) => patch({ local_mapa: e.target.value })}
                    />
                  </Field>
                  <Field label="Coluna">
                    <input
                      className="form-control mcp-input"
                      value={form.coluna}
                      onChange={(e) => patch({ coluna: e.target.value })}
                    />
                  </Field>
                  <Field label="Prateleira">
                    <input
                      className="form-control mcp-input"
                      value={form.prateleira}
                      onChange={(e) => patch({ prateleira: e.target.value })}
                    />
                  </Field>
                  <Field label="Box">
                    <input
                      className="form-control mcp-input"
                      value={form.box}
                      onChange={(e) => patch({ box: e.target.value })}
                    />
                  </Field>
                </div>
              </section>

              <div className="mcp-estoque-actions">
                <button
                  type="button"
                  className="btn mcp-btn-outline"
                  onClick={() => dashToast("Histórico em breve.", "info")}
                >
                  <i className="bi bi-clock-history" aria-hidden="true" /> Histórico Produto
                </button>
                <button
                  type="button"
                  className="btn mcp-btn-outline"
                  onClick={() => dashToast("Extrato em breve.", "info")}
                >
                  <i className="bi bi-printer" aria-hidden="true" /> Extrato
                </button>
                <button
                  type="button"
                  className="btn mcp-btn-primary"
                  onClick={() => {
                    saldoRef.current?.focus();
                    saldoRef.current?.select();
                  }}
                >
                  <i className="bi bi-box-arrow-in-down" aria-hidden="true" /> Lançar Estoque
                </button>
                <button
                  type="button"
                  className="btn mcp-btn-outline"
                  onClick={() => dashToast("Histórico de compra em breve.", "info")}
                >
                  <i className="bi bi-cart3" aria-hidden="true" /> Histórico Compra
                </button>
              </div>
            </div>
          ) : (
            <div className="mcp-empty-tab">
              Aba “{tabs.find((t) => t.id === tab)?.label}” em breve — use Dados do estoque para
              unidade, chapa, corte e saldo.
            </div>
          )}
        </div>

        <div className="modal-footer mcp-modal__footer">
          <button type="button" className="btn btn-link" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn mcp-btn-primary" disabled={saving}>
            <i className="bi bi-floppy" aria-hidden="true" />
            {saving ? "Salvando…" : "Salvar produto"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
