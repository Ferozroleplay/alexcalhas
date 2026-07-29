import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import { PopupCalculadoraOrcamento } from "@/components/admin/modals/PopupCalculadoraOrcamento";
import { useOrcamentoForm } from "@/hooks/use-orcamento-form";
import { bloquearTeclaNaoNumerica, calcularCreditoMaquininha, parseMoneyBr, sanitizarDescontoPct, sanitizarNumeroBr, splitMaterialOrcamentoLabel } from "@/lib/orcamento.server";
import {
  formatBrl,
  formatMultLabel,
  indiceMultCalculadora,
  montarDescricaoCalculadora,
  multsParaEdicaoCalculadora,
  normalizarMultCalculadora,
  parseDescricaoCalculadora,
  valorUnitarioCalculadora,
  type LinhaOrcamentoCalculadaInfo,
} from "@/lib/calculadora-bobina";
import {
  apitarEstoqueCritico,
  apitarEstoqueErro,
  ESTOQUE_MINIMO_PADRAO_M,
  estoqueAlertaLabel,
  estoqueAlertaNivel,
  estoqueAlertaPct,
} from "@/lib/estoque-alerta";
import {
  CORTES_RAPIDOS_CM,
  ESPESSURAS_CHAPA,
  escolherMaterialPorCorteEspessura,
  type EspessuraChapa,
} from "@/lib/orcamento-empresa";
import {
  fetchMateriais,
  fetchOrcamentoInventario,
  salvarOrcamentoEdicao,
  salvarOrcamentoNovo,
  type AgendamentoItem,
} from "@/lib/admin-api";
import { ORCAMENTO_OBS_PRESETS } from "@/lib/os-document";
import { dashToast } from "@/lib/dash-ui";

type Props = {
  open: boolean;
  onClose: () => void;
  inventarioId: number | null;
  clienteNome?: string;
  cpfInicial?: string;
  mode: "novo" | "editar";
  onSaved: (item: AgendamentoItem, extra?: { nome: string; telefone: string; valor: number }) => void;
};

type PayOption = { value: "pix" | "debito" | "credito"; label: string; desc: string; icon: string };

const PAY_OPTIONS: PayOption[] = [
  { value: "pix", label: "PIX", desc: "Pagamento à vista", icon: "bi-qr-code-scan" },
  { value: "debito", label: "Débito", desc: "Cartão na hora", icon: "bi-credit-card" },
  { value: "credito", label: "Crédito", desc: "Parcelado no cartão", icon: "bi-credit-card-2-front" },
];

function MaterialOrcamentoNome({ material }: { material: string }) {
  const { titulo, perfil } = splitMaterialOrcamentoLabel(material);
  if (!perfil) return <>{titulo}</>;
  return (
    <span className="visitas-orc-material-nome">
      <span className="visitas-orc-material-nome__titulo">{titulo}</span>
      <span className="visitas-orc-material-nome__perfil">{perfil}</span>
    </span>
  );
}

type TaxaModo = "sem" | "com";

type PopupParcelasProps = {
  open: boolean;
  total: number;
  draft: string;
  draftTaxa: string;
  draftTaxaModo: TaxaModo;
  onDraftChange: (value: string) => void;
  onDraftTaxaChange: (value: string) => void;
  onDraftTaxaModoChange: (value: TaxaModo) => void;
  onConfirm: () => void;
  onClose: () => void;
};

function PopupParcelasCredito({
  open,
  total,
  draft,
  draftTaxa,
  draftTaxaModo,
  onDraftChange,
  onDraftTaxaChange,
  onDraftTaxaModoChange,
  onConfirm,
  onClose,
}: PopupParcelasProps) {
  const qtd = Math.max(1, Number.parseInt(draft, 10) || 1);
  const taxaPct = draftTaxaModo === "com" ? parseMoneyBr(draftTaxa) : 0;
  const calc = calcularCreditoMaquininha(total, qtd, taxaPct);
  const valorParcela = calc.totalFinal > 0 ? calc.totalFinal / qtd : 0;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      layerClass="visitas-orc-parcelas-layer"
      dialogClass="visitas-orc-parcelas-modal__dialog"
    >
      <div className="modal-content orc-parcelas-modal">
        <div className="orc-parcelas-modal__header">
          <div className="orc-parcelas-modal__head-main">
            <span className="orc-parcelas-modal__icon" aria-hidden="true">
              <i className="bi bi-calendar2-check" />
            </span>
            <div>
              <h5 className="orc-parcelas-modal__title">Parcelas no cartão</h5>
              <p className="orc-parcelas-modal__subtitle">Escolha em quantas vezes dividir</p>
            </div>
          </div>
          <button type="button" className="orc-parcelas-modal__close" aria-label="Fechar" onClick={onClose}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>

        <div className="orc-parcelas-modal__body">
          <div className="orc-parcelas-modal__config">
            <p className="orc-parcelas-modal__grid-label">Taxa da maquininha</p>
            <div className="orc-parcelas-modal__taxa-toggle" role="group" aria-label="Taxa da maquininha">
              <button
                type="button"
                className={`orc-parcelas-modal__taxa-opt${draftTaxaModo === "sem" ? " is-active" : ""}`}
                aria-pressed={draftTaxaModo === "sem"}
                onClick={() => onDraftTaxaModoChange("sem")}
              >
                <i className="bi bi-check-circle" aria-hidden="true" />
                Sem taxa
              </button>
              <button
                type="button"
                className={`orc-parcelas-modal__taxa-opt${draftTaxaModo === "com" ? " is-active" : ""}`}
                aria-pressed={draftTaxaModo === "com"}
                onClick={() => onDraftTaxaModoChange("com")}
              >
                <i className="bi bi-percent" aria-hidden="true" />
                Com taxa
              </button>
            </div>
            {draftTaxaModo === "com" ? (
              <div className="orc-parcelas-modal__taxa-field">
                <label className="visually-hidden" htmlFor="orc-parcelas-taxa">
                  Percentual da taxa
                </label>
                <input
                  id="orc-parcelas-taxa"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="form-control orc-parcelas-modal__taxa-input"
                  placeholder="Ex.: 2,5"
                  value={draftTaxa}
                  onChange={(e) => onDraftTaxaChange(sanitizarDescontoPct(e.target.value))}
                  onKeyDown={bloquearTeclaNaoNumerica}
                />
              </div>
            ) : null}
          </div>

          <div className={`orc-parcelas-modal__preview${calc.comTaxa ? " orc-parcelas-modal__preview--com-taxa" : ""}`}>
            <span className="orc-parcelas-modal__preview-label">{qtd}x de</span>
            <strong className="orc-parcelas-modal__preview-value">{fmt(valorParcela)}</strong>
            {calc.comTaxa ? (
              <span className="orc-parcelas-modal__preview-breakdown">
                Subtotal {fmt(total)} + taxa {fmt(calc.acrescimo)}
              </span>
            ) : null}
            <span className="orc-parcelas-modal__preview-total">
              Total {fmt(calc.totalFinal)}
              {calc.comTaxa ? ` • +${taxaPct.toLocaleString("pt-BR")}%` : ""}
            </span>
          </div>

          <p className="orc-parcelas-modal__grid-label">Quantidade de parcelas</p>
          <div className="orc-parcelas-modal__grid" role="listbox" aria-label="Quantidade de parcelas">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={draft === String(n)}
                className={`orc-parcelas-modal__opt${draft === String(n) ? " is-active" : ""}`}
                onClick={() => onDraftChange(String(n))}
              >
                {n}x
              </button>
            ))}
          </div>
        </div>

        <div className="orc-parcelas-modal__footer">
          <button type="button" className="orc-parcelas-modal__btn orc-parcelas-modal__btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="orc-parcelas-modal__btn orc-parcelas-modal__btn--primary" onClick={onConfirm}>
            Confirmar {qtd}x
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

export function ModalOrcamento({
  open,
  onClose,
  inventarioId,
  clienteNome,
  cpfInicial = "",
  mode,
  onSaved,
}: Props) {
  const [materiais, setMateriais] = useState<Awaited<ReturnType<typeof fetchMateriais>>>([]);
  const [materiaisLoading, setMateriaisLoading] = useState(false);
  const [materiaisErro, setMateriaisErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [parcelasOpen, setParcelasOpen] = useState(false);
  const [parcelasDraft, setParcelasDraft] = useState("1");
  const [parcelasDraftTaxa, setParcelasDraftTaxa] = useState("");
  const [parcelasDraftTaxaModo, setParcelasDraftTaxaModo] = useState<"sem" | "com">("sem");
  const [calculadoraOpen, setCalculadoraOpen] = useState(false);
  const [editingLinhaIdx, setEditingLinhaIdx] = useState<number | null>(null);
  const [editMetros, setEditMetros] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editCalcInfo, setEditCalcInfo] = useState<LinhaOrcamentoCalculadaInfo | null>(null);
  const [editMultIdx, setEditMultIdx] = useState(0);
  const [payHighlight, setPayHighlight] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [qtdBusca, setQtdBusca] = useState("1");
  const [modoItem, setModoItem] = useState<"chapa" | "outros">("chapa");
  const paySectionRef = useRef<HTMLElement>(null);
  const itensSectionRef = useRef<HTMLElement>(null);
  const buscaWrapRef = useRef<HTMLDivElement>(null);

  const form = useOrcamentoForm(materiais);
  const estoqueBeepRef = useRef<string>("");

  const materialAtualEstoque = useMemo(() => {
    if (form.materialAutoId == null) return null;
    return materiais.find((m) => m.id === form.materialAutoId) ?? null;
  }, [materiais, form.materialAutoId]);

  const nivelMaterialAtual = materialAtualEstoque
    ? estoqueAlertaNivel(
        Number(materialAtualEstoque.saldo_loja ?? 0),
        Number(materialAtualEstoque.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
      )
    : "normal";

  // Só mostra o box de alerta depois que o usuário escolhe um corte com estoque baixo.
  const alertaCorteSelecionado = useMemo(() => {
    const corte = String(form.corteCm ?? "").trim();
    if (!corte || !materialAtualEstoque) return null;
    if (nivelMaterialAtual === "normal") return null;
    return {
      item: materialAtualEstoque,
      nivel: nivelMaterialAtual,
      pct: estoqueAlertaPct(
        Number(materialAtualEstoque.saldo_loja ?? 0),
        Number(materialAtualEstoque.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
      ),
    };
  }, [form.corteCm, materialAtualEstoque, nivelMaterialAtual]);

  const metrosPedidos = useMemo(() => {
    const n = Number.parseFloat(String(form.metros).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [form.metros]);

  const estoqueDisponivel = useMemo(() => {
    if (!materialAtualEstoque) return null;
    const saldo = Number(materialAtualEstoque.saldo_loja ?? 0) || 0;
    const jaNoOrc = form.partData
      .filter((l) => l.id != null && l.id === materialAtualEstoque.id)
      .reduce((s, l) => s + (Number(l.metros) || 0), 0);
    return Math.round((saldo - jaNoOrc) * 100) / 100;
  }, [materialAtualEstoque, form.partData]);

  const bloqueadoSemEstoque =
    Boolean(String(form.corteCm ?? "").trim()) &&
    materialAtualEstoque != null &&
    (estoqueDisponivel == null || estoqueDisponivel <= 0 || metrosPedidos > estoqueDisponivel);

  function tentarAdicionarItem() {
    if (form.precoEstimado.valorUnitario <= 0) return;

    if (bloqueadoSemEstoque) {
      apitarEstoqueErro();
      const disp = estoqueDisponivel ?? 0;
      dashToast(
        disp <= 0
          ? "Sem estoque para este corte. Não é possível adicionar."
          : `Estoque insuficiente: só há ${disp.toLocaleString("pt-BR")} m disponível.`,
        "danger",
      );
      return;
    }

    form.addItemPorCorte();
  }

  const materialBusca = form.materialPesquisaSelecionado;
  const unidadeBusca = (materialBusca?.unidade || "M").toUpperCase();
  const isUnidadeBusca = unidadeBusca === "UN" || unidadeBusca === "PC" || unidadeBusca === "PÇ";
  const unidadeLabelBusca = isUnidadeBusca ? "un" : "m";

  const qtdPedidaBusca = useMemo(() => {
    const n = Number.parseFloat(String(qtdBusca).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [qtdBusca]);

  const estoqueDisponivelBusca = useMemo(() => {
    if (!materialBusca) return null;
    const saldo = Number(materialBusca.saldo_loja ?? 0) || 0;
    const jaNoOrc = form.partData
      .filter((l) => l.id === materialBusca.id)
      .reduce((s, l) => s + (Number(l.metros) || 0), 0);
    return Math.round((saldo - jaNoOrc) * 100) / 100;
  }, [materialBusca, form.partData]);

  const nivelMaterialBusca = materialBusca
    ? estoqueAlertaNivel(
        Number(estoqueDisponivelBusca ?? materialBusca.saldo_loja ?? 0),
        Number(materialBusca.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
      )
    : "normal";

  const insuficienteBusca =
    materialBusca != null &&
    (estoqueDisponivelBusca == null ||
      estoqueDisponivelBusca <= 0 ||
      qtdPedidaBusca > estoqueDisponivelBusca);

  /** Strip de estoque na aba Outros: sempre que há material selecionado. */
  const alertaBuscaSelecionado = useMemo(() => {
    if (!materialBusca || estoqueDisponivelBusca == null) return null;
    const nivel = insuficienteBusca
      ? estoqueDisponivelBusca <= 0
        ? ("zerado" as const)
        : ("critico" as const)
      : nivelMaterialBusca;
    return {
      item: materialBusca,
      nivel,
      disponivel: estoqueDisponivelBusca,
      qtd: qtdPedidaBusca,
      insuficiente: insuficienteBusca,
      pct: estoqueAlertaPct(
        estoqueDisponivelBusca,
        Number(materialBusca.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
      ),
    };
  }, [
    materialBusca,
    estoqueDisponivelBusca,
    insuficienteBusca,
    nivelMaterialBusca,
    qtdPedidaBusca,
  ]);

  const sugestoesBusca = useMemo(() => {
    const q = form.pesquisa.trim();
    const base = q.length >= 1 ? form.materiaisFiltrados : form.materiaisFiltrados.slice(0, 12);
    return [...base]
      .sort((a, b) => {
        const score = (m: (typeof base)[number]) => {
          const u = (m.unidade || "M").toUpperCase();
          const isUn = u === "UN" || u === "PC" || u === "PÇ";
          const isChapa = /chapa|galvalume|bobina/i.test(m.material);
          if (isUn) return 0;
          if (!isChapa) return 1;
          return 2;
        };
        return score(a) - score(b);
      })
      .slice(0, 10);
  }, [form.pesquisa, form.materiaisFiltrados]);

  function tentarAdicionarBusca() {
    if (!materialBusca) {
      dashToast("Digite e selecione o material na lista.", "warning");
      setBuscaAberta(true);
      return;
    }
    const qtd = qtdPedidaBusca;
    const disponivel = estoqueDisponivelBusca ?? 0;
    if (disponivel <= 0 || qtd > disponivel) {
      apitarEstoqueErro();
      dashToast(
        disponivel <= 0
          ? "Sem estoque deste material."
          : `Estoque insuficiente: só há ${disponivel.toLocaleString("pt-BR")} ${unidadeLabelBusca} disponível.`,
        "danger",
      );
      return;
    }
    if ((Number(materialBusca.valor) || 0) <= 0) {
      dashToast("Material sem preço de venda cadastrado.", "warning");
      return;
    }
    form.addMaterial(qtd);
    setBuscaAberta(false);
    setQtdBusca("1");
    dashToast("Material adicionado.", "success");
  }

  // Apita só ao selecionar um corte cujo material está crítico / sem estoque.
  useEffect(() => {
    if (!open) {
      estoqueBeepRef.current = "";
      return;
    }
    const corte = String(form.corteCm ?? "").trim();
    if (!corte || form.materialAutoId == null || !materialAtualEstoque) return;
    if (nivelMaterialAtual !== "critico" && nivelMaterialAtual !== "zerado") return;

    const key = `${form.materialAutoId}:${corte}:${nivelMaterialAtual}`;
    if (estoqueBeepRef.current === key) return;
    estoqueBeepRef.current = key;

    apitarEstoqueCritico();
    const saldo = Number(materialAtualEstoque.saldo_loja ?? 0) || 0;
    dashToast(
      saldo <= 0
        ? `Corte ${corte} cm sem estoque.`
        : `Corte ${corte} cm com estoque crítico (${saldo.toLocaleString("pt-BR")} m).`,
      "danger",
    );
  }, [
    open,
    form.materialAutoId,
    form.corteCm,
    materialAtualEstoque,
    nivelMaterialAtual,
  ]);

  // Apita ao selecionar material (Outros) sem estoque / crítico, ou qtd acima do saldo.
  useEffect(() => {
    if (!open || modoItem !== "outros" || !materialBusca || estoqueDisponivelBusca == null) return;

    const disp = estoqueDisponivelBusca;
    if (disp <= 0) {
      const key = `busca:${materialBusca.id}:zerado`;
      if (estoqueBeepRef.current === key) return;
      estoqueBeepRef.current = key;
      apitarEstoqueCritico();
      dashToast("Sem estoque deste material.", "danger");
      return;
    }

    if (qtdPedidaBusca > disp) {
      const key = `busca:${materialBusca.id}:insuf:${qtdPedidaBusca}:${disp}`;
      if (estoqueBeepRef.current === key) return;
      estoqueBeepRef.current = key;
      apitarEstoqueErro();
      dashToast(
        `Estoque insuficiente: só há ${disp.toLocaleString("pt-BR")} ${unidadeLabelBusca}.`,
        "danger",
      );
      return;
    }

    if (nivelMaterialBusca === "critico") {
      const key = `busca:${materialBusca.id}:critico`;
      if (estoqueBeepRef.current === key) return;
      estoqueBeepRef.current = key;
      apitarEstoqueCritico();
      dashToast(
        `Estoque crítico: ${disp.toLocaleString("pt-BR")} ${unidadeLabelBusca} disponível.`,
        "danger",
      );
    }
  }, [
    open,
    modoItem,
    materialBusca,
    estoqueDisponivelBusca,
    qtdPedidaBusca,
    nivelMaterialBusca,
    unidadeLabelBusca,
  ]);

  useEffect(() => {
    if (form.formaPagamento) setPayHighlight(false);
  }, [form.formaPagamento]);

  function focarSecao(el: HTMLElement | null, opts?: { highlightPay?: boolean }) {
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    if (opts?.highlightPay) {
      setPayHighlight(true);
      window.setTimeout(() => setPayHighlight(false), 3200);
    }
  }

  function formatEditNum(n: number): string {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function iniciarEdicaoLinha(idx: number) {
    const linha = form.partData[idx];
    if (!linha) return;
    const calcInfo = parseDescricaoCalculadora(linha.material);
    setEditingLinhaIdx(idx);
    setEditMetros(formatEditNum(linha.metros));
    setEditCalcInfo(calcInfo);
    if (calcInfo) {
      const multNormalizado = normalizarMultCalculadora(calcInfo.tipo, calcInfo.mult);
      const idxMult = indiceMultCalculadora(calcInfo.tipo, calcInfo.mult);
      setEditMultIdx(idxMult);
      const mults = multsParaEdicaoCalculadora(calcInfo.tipo);
      setEditValor(formatEditNum(valorUnitarioCalculadora(calcInfo.corteCm, mults[idxMult] ?? multNormalizado)));
    } else {
      setEditMultIdx(0);
      setEditValor(formatEditNum(linha.valor));
    }
  }

  function cancelarEdicaoLinha() {
    setEditingLinhaIdx(null);
    setEditMetros("");
    setEditValor("");
    setEditCalcInfo(null);
    setEditMultIdx(0);
  }

  function selecionarMultEdicao(idx: number) {
    if (!editCalcInfo) return;
    const mults = multsParaEdicaoCalculadora(editCalcInfo.tipo);
    const mult = mults[idx];
    if (mult == null) return;
    setEditMultIdx(idx);
    setEditValor(formatEditNum(valorUnitarioCalculadora(editCalcInfo.corteCm, mult)));
  }

  function salvarEdicaoLinha() {
    if (editingLinhaIdx === null) return;
    const metros = Number.parseFloat(editMetros.replace(",", ".")) || 0;
    const valor = parseMoneyBr(editValor);
    if (metros <= 0 || valor <= 0) return;

    if (editCalcInfo) {
      const mults = multsParaEdicaoCalculadora(editCalcInfo.tipo);
      const mult = mults[editMultIdx] ?? editCalcInfo.mult;
      form.updateLinha(editingLinhaIdx, {
        material: montarDescricaoCalculadora(editCalcInfo.tipo, editCalcInfo.corteCm, mult),
        metros,
        valor: valorUnitarioCalculadora(editCalcInfo.corteCm, mult),
      });
    } else {
      form.updateLinha(editingLinhaIdx, { metros, valor });
    }

    cancelarEdicaoLinha();
  }

  function abrirPopupParcelas() {
    setParcelasDraft(form.qtdParcelas || "1");
    setParcelasDraftTaxa(form.taxaMaquininha || "");
    setParcelasDraftTaxaModo(parseMoneyBr(form.taxaMaquininha) > 0 ? "com" : "sem");
    setParcelasOpen(true);
  }

  function selecionarFormaPagamento(value: PayOption["value"]) {
    if (value === "credito") {
      form.setFormaPagamento("credito");
      abrirPopupParcelas();
      return;
    }
    form.setFormaPagamento(value);
    setParcelasOpen(false);
  }

  function confirmarParcelas() {
    form.setQtdParcelas(parcelasDraft);
    form.setTaxaMaquininha(parcelasDraftTaxaModo === "com" ? parcelasDraftTaxa : "");
    setParcelasOpen(false);
  }

  useEffect(() => {
    if (!open) {
      setParcelasOpen(false);
      setCalculadoraOpen(false);
      setEditingLinhaIdx(null);
      setEditMetros("");
      setEditValor("");
      setBuscaAberta(false);
      setQtdBusca("1");
      setModoItem("chapa");
    }
  }, [open]);

  useEffect(() => {
    if (!buscaAberta) return;
    function onDoc(e: MouseEvent) {
      if (!buscaWrapRef.current?.contains(e.target as Node)) setBuscaAberta(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [buscaAberta]);

  useEffect(() => {
    if (!open) return;
    setMateriaisLoading(true);
    setMateriaisErro("");
    void fetchMateriais()
      .then((lista) => {
        setMateriais(lista);
        if (lista.length === 0) {
          setMateriaisErro("Nenhum material cadastrado. Cadastre em Materiais no menu.");
        }
      })
      .catch((e) => {
        setMateriais([]);
        setMateriaisErro(e instanceof Error ? e.message : "Não foi possível carregar materiais.");
      })
      .finally(() => setMateriaisLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !inventarioId) return;
    form.resetForm();
    setEditingLinhaIdx(null);
    setEditMetros("");
    setEditValor("");
    setError("");
    if (mode === "novo") {
      form.setCpfCnpj(cpfInicial.replace(/\D/g, "") === "00000000000" ? "" : cpfInicial);
      return;
    }
    setLoading(true);
    fetchOrcamentoInventario(inventarioId)
      .then((d) => form.loadExisting(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar."))
      .finally(() => setLoading(false));
  }, [open, inventarioId, mode, cpfInicial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inventarioId) return;
    if (form.partData.length === 0) {
      const msg = "Adicione pelo menos um material.";
      setError(msg);
      dashToast(msg, "danger");
      focarSecao(itensSectionRef.current);
      return;
    }
    if (!form.formaPagamento) {
      const msg = "Selecione a forma de pagamento.";
      setError(msg);
      dashToast(msg, "danger");
      focarSecao(paySectionRef.current, { highlightPay: true });
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = form.buildPayload();
      if (mode === "novo") {
        const res = await salvarOrcamentoNovo(inventarioId, payload);
        onSaved(res.item, { nome: res.nome, telefone: res.telefone, valor: res.valor });
      } else {
        const res = await salvarOrcamentoEdicao(inventarioId, payload);
        onSaved(res.item, { valor: res.valor, nome: res.item.nome, telefone: res.item.telefone });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const titulo = mode === "novo" ? "Novo orçamento" : "Editar orçamento";
  const mostrarDescontos = mode === "editar";
  const qtdParcelasNum = Math.max(1, Number.parseInt(form.qtdParcelas, 10) || 1);
  const taxaNum = parseMoneyBr(form.taxaMaquininha);
  const creditoCalc = calcularCreditoMaquininha(form.totalOrcamento, qtdParcelasNum, taxaNum);
  const valorParcela = creditoCalc.totalFinal > 0 ? creditoCalc.totalFinal / qtdParcelasNum : 0;
  const resumoCredito =
    form.formaPagamento === "credito"
      ? creditoCalc.comTaxa
        ? `${qtdParcelasNum}x • ${valorParcela.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (+${taxaNum.toLocaleString("pt-BR")}%)`
        : `${qtdParcelasNum}x • ${valorParcela.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
      : "";
  const totalMateriais = form.partData.reduce((sum, l) => sum + l.valor * l.metros, 0);
  const qtdItens = form.partData.length;

  return (
    <>
      <AdminModal open={open} onClose={onClose} closeOnBackdrop={false} dialogClass="visitas-orc-modal__dialog">
      <div className="modal-content visitas-orc-modal__content modal-orcamento">
        <div className="modal-header visitas-orc-modal__header flex-shrink-0">
          <div className="visitas-orc-modal__head">
            <span className="visitas-orc-modal__head-icon" aria-hidden="true">
              <i className="bi bi-clipboard-check" />
            </span>
            <div>
              <h4 className="modal-title visitas-orc-modal__title mb-0">{titulo}</h4>
              <p className="visitas-orc-modal__subtitle mb-0">
                {clienteNome ? clienteNome : "Materiais e forma de pagamento"}
              </p>
            </div>
          </div>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
        </div>

        <form className="visitas-orc-form" onSubmit={handleSubmit}>
          <div className="modal-body visitas-orc-modal__body">
            {error ? <div className="alert alert-danger py-2 visitas-orc-modal__alert">{error}</div> : null}
            {loading ? (
              <div className="visitas-orc-modal__loading d-flex justify-content-center py-4">
                <Loader2 className="spin" size={28} aria-label="Carregando" />
              </div>
            ) : (
              <>
                <div className="visitas-orc-col-form">
                  <section className="visitas-orc-panel visitas-orc-panel--summary">
                    <h5 className="visitas-orc-panel__title">
                      <i className="bi bi-clipboard-data" aria-hidden="true" /> Resumo do orçamento
                    </h5>
                    <div
                      className={`visitas-orc-resumo-grid${mostrarDescontos ? "" : " visitas-orc-resumo-grid--novo"}`}
                    >
                      <div className="visitas-orc-resumo-field">
                        <label className="visitas-orc-label">ID</label>
                        <input
                          type="text"
                          className="form-control visitas-orc-input"
                          readOnly
                          value={inventarioId ?? ""}
                        />
                      </div>
                      <div className="visitas-orc-resumo-field">
                        <label className="visitas-orc-label" htmlFor="modal-value-mostrar">
                          Valor total
                        </label>
                        <input
                          id="modal-value-mostrar"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          className="form-control visitas-orc-input visitas-orc-valor text-center"
                          placeholder="0,00"
                          title={
                            mostrarDescontos
                              ? "Valor final para o cliente — o desconto é calculado automaticamente"
                              : "Soma dos materiais do orçamento"
                          }
                          value={form.valorMostrar}
                          readOnly={!mostrarDescontos}
                          onChange={(e) => form.onValorTotalInput(e.target.value)}
                          onBlur={form.onValorTotalBlur}
                          onFocus={(e) => {
                            if (mostrarDescontos) {
                              form.onValorTotalFocus();
                              e.target.select();
                            }
                          }}
                          onKeyDown={mostrarDescontos ? bloquearTeclaNaoNumerica : undefined}
                          onPaste={
                            mostrarDescontos
                              ? (e) => {
                                  e.preventDefault();
                                  form.onValorTotalInput(e.clipboardData.getData("text"));
                                }
                              : undefined
                          }
                        />
                      </div>
                      {mostrarDescontos ? (
                        <>
                          <div className="visitas-orc-resumo-field">
                            <label className="visitas-orc-label" htmlFor="modal-desconto-valor">
                              Desconto (R$)
                            </label>
                            <input
                              id="modal-desconto-valor"
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              name="desconto_valor_orc"
                              className="form-control visitas-orc-input text-center"
                              placeholder="0,00"
                              value={form.descontoValor}
                              onChange={(e) => form.onDescontoValorInput(e.target.value)}
                              onBlur={form.onDescontoValorBlur}
                              onFocus={(e) => {
                                form.onDescontoValorFocus();
                                e.target.select();
                              }}
                              onKeyDown={bloquearTeclaNaoNumerica}
                              onPaste={(e) => {
                                e.preventDefault();
                                form.onDescontoValorInput(e.clipboardData.getData("text"));
                              }}
                            />
                          </div>
                          <div className="visitas-orc-resumo-field">
                            <label className="visitas-orc-label" htmlFor="modal-desconto-pct">
                              Desconto (%)
                            </label>
                            <input
                              id="modal-desconto-pct"
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              name="desconto_pct_orc"
                              maxLength={7}
                              className="form-control visitas-orc-input text-center"
                              placeholder="0"
                              value={form.descontoPct}
                              onChange={(e) => form.onDescontoPctInput(e.target.value)}
                              onBlur={form.onDescontoPctBlur}
                              onFocus={(e) => {
                                form.onDescontoPctFocus();
                                e.target.select();
                              }}
                              onKeyDown={bloquearTeclaNaoNumerica}
                              onPaste={(e) => {
                                e.preventDefault();
                                form.onDescontoPctInput(e.clipboardData.getData("text"));
                              }}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div className="visitas-orc-resumo-cpf">
                      <label className="visitas-orc-label">CPF/CNPJ</label>
                      <input
                        type="text"
                        className="form-control visitas-orc-input"
                        value={form.cpfCnpj}
                        onChange={(e) => form.setCpfCnpj(e.target.value)}
                      />
                    </div>
                  </section>

                  <section
                    ref={paySectionRef}
                    className={`visitas-orc-panel visitas-orc-panel--pay${payHighlight ? " visitas-orc-panel--pay-missing" : ""}`}
                  >
                    <div className="visitas-orc-panel__head">
                      <h5 className="visitas-orc-panel__title">
                        <i className="bi bi-wallet2" aria-hidden="true" /> Pagamento
                      </h5>
                      <p className="visitas-orc-panel__hint">
                        Escolha a forma de pagamento. No crédito, você define as parcelas em um passo rápido.
                      </p>
                    </div>

                    {payHighlight ? (
                      <p className="orc-pay-missing-msg" role="alert">
                        <i className="bi bi-exclamation-circle" aria-hidden="true" />
                        Selecione PIX, Débito ou Crédito para salvar
                      </p>
                    ) : null}

                    <div className="visitas-orc-pay-grid" role="radiogroup" aria-label="Forma de pagamento">
                      {PAY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={form.formaPagamento === opt.value}
                          className={`visitas-orc-pay-card${form.formaPagamento === opt.value ? " visitas-orc-pay-card--active" : ""}`}
                          onClick={() => selecionarFormaPagamento(opt.value)}
                        >
                          <span className="visitas-orc-pay-card__icon" aria-hidden="true">
                            <i className={`bi ${opt.icon}`} />
                          </span>
                          <span className="visitas-orc-pay-card__name">{opt.label}</span>
                          <span className="visitas-orc-pay-card__desc">
                            {opt.value === "credito" && form.formaPagamento === "credito"
                              ? resumoCredito
                              : opt.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                    {form.formaPagamento === "credito" ? (
                      <button
                        type="button"
                        className="visitas-orc-parcelas-link btn btn-link btn-sm"
                        onClick={abrirPopupParcelas}
                      >
                        <i className="bi bi-pencil-square" aria-hidden="true" /> Alterar parcelas ({qtdParcelasNum}x)
                      </button>
                    ) : null}
                  </section>

                  <section className="visitas-orc-panel visitas-orc-panel--obs">
                    <div className="visitas-orc-obs-head">
                      <h5 className="visitas-orc-panel__title">
                        <i className="bi bi-chat-left-text" aria-hidden="true" /> Observação
                      </h5>
                      <p className="visitas-orc-obs-head__hint">
                        Escolha uma opção pronta ou escreva a sua:
                      </p>
                    </div>

                    <div className="visitas-orc-obs-grid" role="group" aria-label="Textos prontos de observação">
                      {ORCAMENTO_OBS_PRESETS.map((preset) => {
                        const ativo =
                          form.observacao.replace(/\s+/g, " ").trim() ===
                          preset.text.replace(/\s+/g, " ").trim();
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={`visitas-orc-obs-card${ativo ? " is-active" : ""}`}
                            title={preset.text}
                            onClick={() => form.setObservacao(preset.text)}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      id="modal-orc-obs"
                      className="form-control visitas-orc-input visitas-orc-obs-textarea"
                      rows={4}
                      maxLength={500}
                      value={form.observacao}
                      onChange={(e) => form.setObservacao(e.target.value)}
                      placeholder="Ex.: condições de pagamento, prazo, observações para o cliente…"
                    />
                    <span className="visitas-orc-obs__count">{form.observacao.length}/500</span>
                  </section>
                </div>

                <div className="visitas-orc-col-materiais">
                <section ref={itensSectionRef} className="visitas-orc-panel visitas-orc-panel--materiais">
                  <div className="materiais-panel__head">
                    <div className="materiais-panel__head-row">
                      <h5 className="visitas-orc-panel__title mb-0">
                        <i className="bi bi-box-seam" aria-hidden="true" /> Itens do orçamento
                      </h5>
                      <button
                        type="button"
                        className="orc-corte-calc-link"
                        onClick={() => setCalculadoraOpen(true)}
                        title="Abrir calculadora de bobina"
                      >
                        <i className="bi bi-calculator" aria-hidden="true" />
                        Calculadora
                      </button>
                    </div>
                    {materiaisLoading ? (
                      <p className="text-muted small mb-0 mt-1">Carregando materiais…</p>
                    ) : null}
                    {materiaisErro ? (
                      <p className="text-danger small mb-0 mt-1" role="alert">
                        {materiaisErro}
                      </p>
                    ) : null}
                  </div>

                  <div className="orc-item-tabs" role="tablist" aria-label="Tipo de item">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modoItem === "chapa"}
                      className={`orc-item-tab${modoItem === "chapa" ? " is-active" : ""}`}
                      onClick={() => setModoItem("chapa")}
                    >
                      <i className="bi bi-rulers" aria-hidden="true" />
                      Chapa / Corte
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modoItem === "outros"}
                      className={`orc-item-tab${modoItem === "outros" ? " is-active" : ""}`}
                      onClick={() => {
                        setModoItem("outros");
                        setBuscaAberta(false);
                      }}
                    >
                      <i className="bi bi-box" aria-hidden="true" />
                      Outros (UN)
                    </button>
                  </div>

                  {modoItem === "chapa" && alertaCorteSelecionado ? (
                    <div
                      className={`orc-estoque-strip orc-estoque-strip--${alertaCorteSelecionado.nivel}`}
                      role="status"
                    >
                      <div className="orc-estoque-strip__icon" aria-hidden="true">
                        <i
                          className={
                            alertaCorteSelecionado.nivel === "alerta"
                              ? "bi bi-exclamation-triangle-fill"
                              : "bi bi-x-octagon-fill"
                          }
                        />
                      </div>
                      <div className="orc-estoque-strip__body">
                        <div className="orc-estoque-strip__row">
                          <strong>
                            {alertaCorteSelecionado.nivel === "alerta"
                              ? "Estoque em alerta"
                              : alertaCorteSelecionado.nivel === "critico"
                                ? "Estoque crítico"
                                : "Sem estoque"}
                          </strong>
                          <span className="orc-estoque-strip__badge">
                            {estoqueAlertaLabel(alertaCorteSelecionado.nivel)}
                          </span>
                        </div>
                        <p className="orc-estoque-strip__nome">
                          {alertaCorteSelecionado.item.material}
                        </p>
                        <div className="orc-estoque-strip__meter">
                          <div className="orc-estoque-strip__bar" aria-hidden="true">
                            <span style={{ width: `${Math.max(alertaCorteSelecionado.pct, 8)}%` }} />
                          </div>
                          <span className="orc-estoque-strip__qtd">
                            {(
                              Number(alertaCorteSelecionado.item.saldo_loja ?? 0) || 0
                            ).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                            m
                            <em>
                              {" "}
                              / mín.{" "}
                              {(
                                Number(
                                  alertaCorteSelecionado.item.estoque_minimo ??
                                    ESTOQUE_MINIMO_PADRAO_M,
                                ) || 2
                              ).toLocaleString("pt-BR")}{" "}
                              m
                            </em>
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {modoItem === "chapa" ? (
                  <div className="orc-corte-form">
                    <div className="orc-corte-form__primary">
                      <div className="orc-corte-form__field orc-corte-form__field--corte">
                        <label className="visitas-orc-label" htmlFor="orc-item-corte">
                          Corte
                        </label>
                        <div className="orc-corte-form__corte-wrap">
                          <input
                            id="orc-item-corte"
                            type="text"
                            className="form-control visitas-orc-input text-center"
                            value={form.corteCm}
                            onChange={(e) => form.onCorteInput(e.target.value)}
                            onKeyDown={(e) => {
                              bloquearTeclaNaoNumerica(e);
                              if (e.key === "Enter") {
                                e.preventDefault();
                                tentarAdicionarItem();
                              }
                            }}
                            placeholder="cm"
                            inputMode="decimal"
                            aria-describedby="orc-cortes-rapidos"
                          />
                          <span className="orc-corte-form__suffix">cm</span>
                        </div>
                        <div
                          id="orc-cortes-rapidos"
                          className="orc-corte-form__chips"
                          role="group"
                          aria-label="Cortes rápidos"
                        >
                          {CORTES_RAPIDOS_CM.map((cm) => {
                            const matChip = escolherMaterialPorCorteEspessura(
                              materiais,
                              cm,
                              form.espessura,
                              null,
                            );
                            const nivelChip = matChip
                              ? estoqueAlertaNivel(
                                  Number(matChip.saldo_loja ?? 0),
                                  Number(matChip.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
                                )
                              : "normal";
                            return (
                              <button
                                key={cm}
                                type="button"
                                className={`orc-corte-chip${form.corteCm === String(cm) ? " is-active" : ""}${
                                  nivelChip !== "normal" ? ` is-stock-${nivelChip}` : ""
                                }`}
                                onClick={() => form.aplicarCorteRapido(cm)}
                                title={
                                  nivelChip === "zerado"
                                    ? `${cm} cm — sem estoque`
                                    : nivelChip === "critico"
                                      ? `${cm} cm — estoque crítico`
                                      : nivelChip === "alerta"
                                        ? `${cm} cm — estoque em alerta`
                                        : undefined
                                }
                              >
                                {cm}
                                {nivelChip !== "normal" ? (
                                  <i className="orc-corte-chip__dot" aria-hidden="true" />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="orc-corte-form__field">
                        <label className="visitas-orc-label" htmlFor="orc-item-chapa">
                          Chapa
                        </label>
                        <select
                          id="orc-item-chapa"
                          className="form-select visitas-orc-input"
                          value={form.espessura}
                          onChange={(e) => form.setEspessura(e.target.value as EspessuraChapa)}
                        >
                          {ESPESSURAS_CHAPA.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="orc-corte-form__field">
                        <label className="visitas-orc-label" htmlFor="orc-item-metros">
                          Metros
                        </label>
                        <input
                          id="orc-item-metros"
                          type="text"
                          className="form-control visitas-orc-input text-center"
                          value={form.metros}
                          onChange={(e) => form.onMetrosInput(e.target.value)}
                          onKeyDown={(e) => {
                            bloquearTeclaNaoNumerica(e);
                            if (e.key === "Enter") {
                              e.preventDefault();
                              tentarAdicionarItem();
                            }
                          }}
                          inputMode="decimal"
                        />
                      </div>

                      <div
                        className={`orc-corte-form__price${
                          materialAtualEstoque && String(form.corteCm).trim()
                            ? ` orc-corte-form__price--stock orc-corte-form__price--${nivelMaterialAtual}`
                            : ""
                        }`}
                        aria-live="polite"
                      >
                        <span className="orc-corte-form__price-label">Estimativa</span>
                        <strong className="orc-corte-form__price-total">
                          {form.precoEstimado.total.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </strong>
                        {form.precoEstimado.valorUnitario > 0 ? (
                          <span className="orc-corte-form__price-unit">
                            {form.precoEstimado.valorUnitario.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                            /m
                          </span>
                        ) : null}
                        {materialAtualEstoque && String(form.corteCm).trim() ? (
                          <div
                            className={`orc-corte-estoque orc-corte-estoque--${nivelMaterialAtual}`}
                            title="Estoque do material selecionado"
                          >
                            <div className="orc-corte-estoque__bar" aria-hidden="true">
                              <span
                                style={{
                                  width: `${Math.max(
                                    estoqueAlertaPct(
                                      Number(materialAtualEstoque.saldo_loja ?? 0),
                                      Number(
                                        materialAtualEstoque.estoque_minimo ??
                                          ESTOQUE_MINIMO_PADRAO_M,
                                      ),
                                    ),
                                    nivelMaterialAtual === "normal" ? 12 : 8,
                                  )}%`,
                                }}
                              />
                            </div>
                            <div className="orc-corte-estoque__meta">
                              <small>
                                {nivelMaterialAtual === "normal"
                                  ? "Estoque ok"
                                  : estoqueAlertaLabel(nivelMaterialAtual)}
                              </small>
                              <span>
                                {(Number(materialAtualEstoque.saldo_loja ?? 0) || 0).toLocaleString(
                                  "pt-BR",
                                  { maximumFractionDigits: 2 },
                                )}{" "}
                                m
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="orc-corte-form__secondary">
                      <div className="orc-corte-form__field orc-corte-form__field--desc">
                        <label className="visitas-orc-label" htmlFor="orc-item-desc">
                          Descrição
                        </label>
                        <div className="orc-corte-form__desc-row">
                          <input
                            id="orc-item-desc"
                            type="text"
                            className="form-control visitas-orc-input"
                            value={form.descricaoItem}
                            onChange={(e) => form.onDescricaoInput(e.target.value)}
                            placeholder="Chapa galvalume"
                          />
                          {form.materialAutoId != null ? (
                            <span className="orc-corte-form__auto" title="Material encontrado pelo corte">
                              <i className="bi bi-check2" aria-hidden="true" />
                              <span>Auto</span>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="orc-corte-form__actions">
                        <button
                          type="button"
                          className={`btn visitas-orc-add-btn orc-corte-form__add${
                            bloqueadoSemEstoque ? " is-blocked-stock" : ""
                          }`}
                          onClick={tentarAdicionarItem}
                          disabled={form.precoEstimado.valorUnitario <= 0}
                          title={
                            bloqueadoSemEstoque
                              ? "Sem estoque — não é possível adicionar"
                              : "Adicionar item"
                          }
                        >
                          <i className="bi bi-plus-lg" aria-hidden="true" />
                          {bloqueadoSemEstoque ? "Sem estoque" : "Adicionar"}
                        </button>
                        <button
                          type="button"
                          className="btn orc-corte-form__clear"
                          onClick={form.limparItemForm}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                  </div>
                  ) : (
                  <div className="orc-busca-material">
                    <p className="orc-busca-material__hint">
                      Materiais por unidade — digite o nome e escolha na lista.
                    </p>

                    {alertaBuscaSelecionado ? (
                      <div
                        className={`orc-estoque-strip orc-estoque-strip--${
                          alertaBuscaSelecionado.insuficiente
                            ? alertaBuscaSelecionado.disponivel <= 0
                              ? "zerado"
                              : "critico"
                            : alertaBuscaSelecionado.nivel === "normal"
                              ? "ok"
                              : alertaBuscaSelecionado.nivel
                        }`}
                        role="status"
                      >
                        <div className="orc-estoque-strip__icon" aria-hidden="true">
                          <i
                            className={
                              alertaBuscaSelecionado.insuficiente ||
                              alertaBuscaSelecionado.nivel === "zerado" ||
                              alertaBuscaSelecionado.nivel === "critico"
                                ? "bi bi-x-octagon-fill"
                                : alertaBuscaSelecionado.nivel === "alerta"
                                  ? "bi bi-exclamation-triangle-fill"
                                  : "bi bi-box-seam"
                            }
                          />
                        </div>
                        <div className="orc-estoque-strip__body">
                          <div className="orc-estoque-strip__row">
                            <strong>
                              {alertaBuscaSelecionado.insuficiente
                                ? alertaBuscaSelecionado.disponivel <= 0
                                  ? "Sem estoque"
                                  : "Estoque insuficiente"
                                : alertaBuscaSelecionado.nivel === "alerta"
                                  ? "Estoque em alerta"
                                  : alertaBuscaSelecionado.nivel === "critico"
                                    ? "Estoque crítico"
                                    : alertaBuscaSelecionado.nivel === "zerado"
                                      ? "Sem estoque"
                                      : "Estoque disponível"}
                            </strong>
                            <span className="orc-estoque-strip__badge">
                              {alertaBuscaSelecionado.insuficiente
                                ? alertaBuscaSelecionado.disponivel <= 0
                                  ? "Sem estoque"
                                  : "Insuficiente"
                                : estoqueAlertaLabel(alertaBuscaSelecionado.nivel)}
                            </span>
                          </div>
                          <p className="orc-estoque-strip__nome">
                            {alertaBuscaSelecionado.item.material}
                          </p>
                          <div className="orc-estoque-strip__meter">
                            <div className="orc-estoque-strip__bar" aria-hidden="true">
                              <span
                                style={{
                                  width: `${Math.max(
                                    alertaBuscaSelecionado.insuficiente
                                      ? Math.min(
                                          (alertaBuscaSelecionado.disponivel /
                                            Math.max(alertaBuscaSelecionado.qtd, 1)) *
                                            100,
                                          100,
                                        )
                                      : alertaBuscaSelecionado.pct,
                                    8,
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="orc-estoque-strip__qtd">
                              {alertaBuscaSelecionado.disponivel.toLocaleString("pt-BR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              {unidadeLabelBusca} disponível
                              {alertaBuscaSelecionado.insuficiente &&
                              alertaBuscaSelecionado.disponivel > 0 ? (
                                <em>
                                  {" "}
                                  · pedindo{" "}
                                  {alertaBuscaSelecionado.qtd.toLocaleString("pt-BR", {
                                    maximumFractionDigits: 2,
                                  })}
                                </em>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="orc-busca-material__row">
                      <div className="orc-busca-material__field orc-busca-material__field--busca" ref={buscaWrapRef}>
                        <label className="visitas-orc-label" htmlFor="orc-busca-mat">
                          Buscar material
                        </label>
                        <div className="orc-busca-material__input-wrap">
                          <i className="bi bi-search" aria-hidden="true" />
                          <input
                            id="orc-busca-mat"
                            type="search"
                            className="form-control visitas-orc-input"
                            placeholder="Ex.: PU Veda, aluzinco, parafuso…"
                            value={form.pesquisa}
                            autoComplete="off"
                            onFocus={() => setBuscaAberta(true)}
                            onChange={(e) => {
                              form.setPesquisa(e.target.value);
                              form.setMaterialId("");
                              setBuscaAberta(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setBuscaAberta(false);
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (sugestoesBusca[0] && !materialBusca) {
                                  const first = sugestoesBusca[0];
                                  form.setMaterialId(String(first.id));
                                  form.setPesquisa(first.material);
                                  setBuscaAberta(false);
                                  return;
                                }
                                tentarAdicionarBusca();
                              }
                            }}
                          />
                          {buscaAberta && sugestoesBusca.length > 0 ? (
                            <ul className="orc-busca-material__list" role="listbox">
                              {sugestoesBusca.map((m) => {
                                const u = (m.unidade || "M").toUpperCase();
                                const saldo = Number(m.saldo_loja ?? 0) || 0;
                                const nivelOpt = estoqueAlertaNivel(
                                  saldo,
                                  Number(m.estoque_minimo ?? ESTOQUE_MINIMO_PADRAO_M),
                                );
                                return (
                                  <li key={m.id}>
                                    <button
                                      type="button"
                                      className={`orc-busca-material__option${
                                        form.materialId === String(m.id) ? " is-active" : ""
                                      }${nivelOpt !== "normal" ? ` is-estoque-${nivelOpt}` : ""}`}
                                      onClick={() => {
                                        form.setMaterialId(String(m.id));
                                        form.setPesquisa(m.material);
                                        setBuscaAberta(false);
                                      }}
                                    >
                                      <span className="orc-busca-material__option-nome">
                                        {m.codigo ? <em>Cód. {m.codigo}</em> : null}
                                        {m.material}
                                      </span>
                                      <span className="orc-busca-material__option-meta">
                                        <span className="orc-busca-material__pill">{u}</span>
                                        <span
                                          className={
                                            nivelOpt !== "normal"
                                              ? `orc-busca-material__saldo orc-busca-material__saldo--${nivelOpt}`
                                              : "orc-busca-material__saldo"
                                          }
                                        >
                                          {saldo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                                          {u === "UN" || u === "PC" || u === "PÇ" ? "un" : "m"}
                                        </span>
                                        <strong>
                                          {(Number(m.valor) || 0).toLocaleString("pt-BR", {
                                            style: "currency",
                                            currency: "BRL",
                                          })}
                                        </strong>
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                          {buscaAberta && form.pesquisa.trim() && sugestoesBusca.length === 0 ? (
                            <div className="orc-busca-material__empty">Nenhum material encontrado</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="orc-busca-material__field orc-busca-material__field--qtd">
                        <label className="visitas-orc-label" htmlFor="orc-busca-qtd">
                          {isUnidadeBusca ? "Qtd (un)" : "Qtd"}
                        </label>
                        <input
                          id="orc-busca-qtd"
                          type="text"
                          className={`form-control visitas-orc-input text-center${
                            insuficienteBusca ? " is-estoque-erro" : ""
                          }`}
                          value={qtdBusca}
                          onChange={(e) => {
                            let v = e.target.value.replace(/[^\d,.]/g, "");
                            const sep = v.includes(",") ? "," : v.includes(".") ? "." : null;
                            if (sep) {
                              const parts = v.split(sep);
                              v = parts[0] + sep + (parts[1] ?? "").slice(0, 2);
                            }
                            setQtdBusca(v);
                          }}
                          onKeyDown={(e) => {
                            bloquearTeclaNaoNumerica(e);
                            if (e.key === "Enter") {
                              e.preventDefault();
                              tentarAdicionarBusca();
                            }
                          }}
                          inputMode="decimal"
                        />
                      </div>

                      {materialBusca ? (
                        <div className="orc-busca-material__resumo" aria-live="polite">
                          <span className="orc-busca-material__resumo-label">Total</span>
                          <strong>
                            {(
                              (Number(materialBusca.valor) || 0) * qtdPedidaBusca
                            ).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </strong>
                          <small>
                            {(Number(materialBusca.valor) || 0).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                            /{unidadeLabelBusca}
                          </small>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className="btn visitas-orc-add-btn orc-busca-material__add"
                        onClick={tentarAdicionarBusca}
                        disabled={!materialBusca || insuficienteBusca}
                        title={
                          insuficienteBusca
                            ? estoqueDisponivelBusca != null && estoqueDisponivelBusca <= 0
                              ? "Sem estoque — não é possível adicionar"
                              : `Só há ${(estoqueDisponivelBusca ?? 0).toLocaleString("pt-BR")} ${unidadeLabelBusca}`
                            : undefined
                        }
                      >
                        <i
                          className={`bi ${insuficienteBusca ? "bi-slash-circle" : "bi-plus-lg"}`}
                          aria-hidden="true"
                        />
                        {insuficienteBusca ? "Sem estoque" : "Adicionar"}
                      </button>
                    </div>
                    {materialBusca ? (
                      <p className="orc-busca-material__selected">
                        <i className="bi bi-check2-circle" aria-hidden="true" />
                        {materialBusca.material}
                        {estoqueDisponivelBusca != null ? (
                          <span className="orc-busca-material__selected-stock">
                            ·{" "}
                            {estoqueDisponivelBusca.toLocaleString("pt-BR", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            {unidadeLabelBusca} em estoque
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  )}

                  <div className="visitas-orc-table-wrap materiais-table-wrapper table-responsive">
                    <table className="table table-sm visitas-orc-table mb-0">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Material</th>
                          <th className="text-end" title="Valor unitário">
                            R$ un.
                          </th>
                          <th className="text-end">Qtd</th>
                          <th className="text-end">Total</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {form.partData.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="orc-itens-empty">
                              <i className="bi bi-rulers" aria-hidden="true" />
                              <span>Nenhum item ainda</span>
                              <small>Use a aba Chapa/Corte ou Outros (UN) para adicionar</small>
                            </td>
                          </tr>
                        ) : null}
                        {form.partData.map((linha, i) => (
                          <tr key={i} className={editingLinhaIdx === i ? "visitas-orc-table__row--editing" : undefined}>
                            <td>{i + 1}</td>
                            <td className="visitas-orc-table__material">
                              <MaterialOrcamentoNome material={linha.material} />
                            </td>
                            {editingLinhaIdx === i ? (
                              editCalcInfo ? (
                                <td colSpan={4} className="visitas-orc-table__edit-calc">
                                  <div className="visitas-orc-edit-bar">
                                    <div
                                      className="visitas-orc-edit-pills"
                                      role="radiogroup"
                                      aria-label={`Multiplicador ${editCalcInfo.tipo === "material" ? "material" : "serviço instalado"}`}
                                    >
                                      {multsParaEdicaoCalculadora(editCalcInfo.tipo).map((mult, mi) => {
                                        const unit = valorUnitarioCalculadora(editCalcInfo.corteCm, mult);
                                        const metros = Number.parseFloat(editMetros.replace(",", ".")) || 0;
                                        const total = Math.round(unit * (metros > 0 ? metros : 1) * 100) / 100;
                                        const active = editMultIdx === mi;
                                        return (
                                          <button
                                            key={`${editCalcInfo.tipo}-${mult}`}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            className={`visitas-orc-edit-pill visitas-orc-edit-pill--${editCalcInfo.tipo}${active ? " is-active" : ""}`}
                                            onClick={() => selecionarMultEdicao(mi)}
                                          >
                                            <span className="visitas-orc-edit-pill__mult">{formatMultLabel(mult)}</span>
                                            <span className="visitas-orc-edit-pill__val">{formatBrl(total)}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="visitas-orc-row-actions visitas-orc-row-actions--inline">
                                      <button
                                        type="button"
                                        className="visitas-orc-save-row-btn"
                                        onClick={salvarEdicaoLinha}
                                        aria-label="Salvar alterações"
                                        title="Salvar"
                                      >
                                        <i className="bi bi-check-lg" aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        className="visitas-orc-cancel-row-btn"
                                        onClick={cancelarEdicaoLinha}
                                        aria-label="Cancelar edição"
                                        title="Cancelar"
                                      >
                                        <i className="bi bi-x-lg" aria-hidden="true" />
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              ) : (
                                <>
                                  <td className="text-end">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm visitas-orc-input visitas-orc-inline-input text-end"
                                      value={editValor}
                                      onChange={(e) => setEditValor(sanitizarNumeroBr(e.target.value))}
                                      onKeyDown={bloquearTeclaNaoNumerica}
                                      aria-label="Valor unitário"
                                    />
                                  </td>
                                  <td className="text-end">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm visitas-orc-input visitas-orc-inline-input text-end"
                                      value={editMetros}
                                      onChange={(e) => setEditMetros(sanitizarNumeroBr(e.target.value))}
                                      onKeyDown={bloquearTeclaNaoNumerica}
                                      aria-label="Metros"
                                    />
                                  </td>
                                  <td className="text-end visitas-orc-table__line-total">
                                    {(
                                      parseMoneyBr(editValor) *
                                      (Number.parseFloat(editMetros.replace(",", ".")) || 0)
                                    ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                  </td>
                                  <td className="text-center">
                                    <div className="visitas-orc-row-actions">
                                      <button
                                        type="button"
                                        className="visitas-orc-save-row-btn"
                                        onClick={salvarEdicaoLinha}
                                        aria-label="Salvar alterações"
                                        title="Salvar"
                                      >
                                        <i className="bi bi-check-lg" aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        className="visitas-orc-cancel-row-btn"
                                        onClick={cancelarEdicaoLinha}
                                        aria-label="Cancelar edição"
                                        title="Cancelar"
                                      >
                                        <i className="bi bi-x-lg" aria-hidden="true" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              )
                            ) : (
                              <>
                                <td className="text-end">
                                  {linha.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </td>
                                <td className="text-end">{linha.metros}</td>
                                <td className="text-end visitas-orc-table__line-total">
                                  {(linha.valor * linha.metros).toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </td>
                                <td className="text-center">
                                  <div className="visitas-orc-row-actions">
                                    <button
                                      type="button"
                                      className="visitas-orc-edit-btn"
                                      onClick={() => iniciarEdicaoLinha(i)}
                                      aria-label="Editar item"
                                      title="Editar"
                                    >
                                      <i className="bi bi-pencil-square" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      className="visitas-orc-del-btn"
                                      onClick={() => form.removeLinha(i)}
                                      aria-label="Remover item"
                                      title="Remover"
                                    >
                                      <i className="bi bi-trash" aria-hidden="true" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="visitas-orc-materiais-footer">
                    <span className="visitas-orc-materiais-footer__count">
                      {qtdItens} {qtdItens === 1 ? "item" : "itens"}
                    </span>
                    <span className="visitas-orc-materiais-footer__total">
                      Total dos materiais{" "}
                      <strong>
                        {totalMateriais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </strong>
                    </span>
                  </div>
                </section>
                </div>
              </>
            )}
          </div>
          <div className="modal-footer visitas-orc-modal__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn visitas-orc-save-btn" disabled={saving || loading}>
              {saving ? <Loader2 className="spin" size={18} /> : <i className="bi bi-check2-circle" aria-hidden="true" />}
              Salvar orçamento
            </button>
          </div>
        </form>
      </div>
    </AdminModal>

      <PopupParcelasCredito
        open={open && parcelasOpen}
        total={form.totalOrcamento}
        draft={parcelasDraft}
        draftTaxa={parcelasDraftTaxa}
        draftTaxaModo={parcelasDraftTaxaModo}
        onDraftChange={setParcelasDraft}
        onDraftTaxaChange={setParcelasDraftTaxa}
        onDraftTaxaModoChange={setParcelasDraftTaxaModo}
        onConfirm={confirmarParcelas}
        onClose={() => setParcelasOpen(false)}
      />

      <PopupCalculadoraOrcamento
        open={open && calculadoraOpen}
        onClose={() => setCalculadoraOpen(false)}
        onImportar={(linhas) => form.addLinhas(linhas)}
      />
    </>
  );
}
