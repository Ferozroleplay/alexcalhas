import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MaterialItem } from "@/lib/admin-api";
import {
  calcDescontoOrcamento,
  formatDescontoPctOrc,
  formatDescontoValorOrc,
  garantirTotalOrcamentoConsistente,
  inventarioSubtotalOrcamento,
  mesclarLinhasOrcamento,
  parseMoneyBr,
  sanitizarDescontoPct,
  parseFormaPagamento,
  sanitizarNumeroBr,
  type OrcamentoLinha,
  type OrcamentoModoDesconto,
} from "@/lib/orcamento.server";

type CamposDesconto = {
  pct?: string;
  valor?: string;
  valorMostrar?: string;
};

export function useOrcamentoForm(materiais: MaterialItem[]) {
  const [partData, setPartData] = useState<OrcamentoLinha[]>([]);
  const [descontoPct, setDescontoPct] = useState("");
  const [descontoValor, setDescontoValor] = useState("");
  const [valorMostrar, setValorMostrar] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [qtdParcelas, setQtdParcelas] = useState("1");
  const [taxaMaquininha, setTaxaMaquininha] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [observacao, setObservacao] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [metros, setMetros] = useState("1");

  const descontoSourceRef = useRef<OrcamentoModoDesconto>("percent");
  const valorBaseManualRef = useRef(0);
  const syncingRef = useRef(false);
  const carregandoRef = useRef(false);

  const subtotal = useMemo(() => inventarioSubtotalOrcamento(partData), [partData]);

  const calcComCampos = useCallback(
    (campos: CamposDesconto = {}) => {
      return calcDescontoOrcamento(
        subtotal,
        valorBaseManualRef.current,
        descontoSourceRef.current,
        campos.pct ?? descontoPct,
        campos.valor ?? descontoValor,
        campos.valorMostrar ?? valorMostrar,
      );
    },
    [subtotal, descontoPct, descontoValor, valorMostrar],
  );

  const totalOrcamento = useMemo(() => calcComCampos().total, [calcComCampos]);

  /** Igual PHP: atualiza o outro campo e o valor total (não o campo que está sendo editado). */
  const sincronizarDescontoPar = useCallback(
    (campos: CamposDesconto = {}) => {
      const src = descontoSourceRef.current;
      if (src === "total") return;

      const desc = calcComCampos(campos);
      if (desc.base <= 0 && src !== "total") return;

      syncingRef.current = true;

      if (src !== "valor") {
        setDescontoValor(
          desc.descontoValor > 0 ? formatDescontoValorOrc(desc.descontoValor) : "",
        );
      }
      if (src !== "percent") {
        setDescontoPct(desc.descontoPct > 0 ? formatDescontoPctOrc(desc.descontoPct) : "");
      }
      setValorMostrar(desc.total > 0 ? formatDescontoValorOrc(desc.total) : "");

      syncingRef.current = false;
    },
    [calcComCampos],
  );

  useEffect(() => {
    if (carregandoRef.current) return;
    if (partData.length === 0) return;
    valorBaseManualRef.current = 0;
    if (descontoSourceRef.current === "total") {
      descontoSourceRef.current = "percent";
    }
    sincronizarDescontoPar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partData]);

  const onValorTotalInput = useCallback((raw: string) => {
    if (syncingRef.current) return;
    const v = sanitizarNumeroBr(raw);
    setValorMostrar(v);
    descontoSourceRef.current = "total";
    valorBaseManualRef.current = parseMoneyBr(v);
    setDescontoPct("");
    setDescontoValor("");
  }, []);

  const onValorTotalBlur = useCallback(() => {
    if (syncingRef.current) return;
    let n = parseMoneyBr(valorMostrar);
    if (subtotal > 0 && n > subtotal) n = subtotal;
    if (n <= 0) {
      descontoSourceRef.current =
        parseMoneyBr(descontoValor) > 0
          ? "valor"
          : parseMoneyBr(descontoPct) > 0
            ? "percent"
            : "percent";
      valorBaseManualRef.current = 0;
      setValorMostrar("");
      sincronizarDescontoPar();
      return;
    }
    const fmt = formatDescontoValorOrc(n);
    setValorMostrar(fmt);
    descontoSourceRef.current = "total";
    valorBaseManualRef.current = n;
    if (subtotal > 0) {
      const diff = subtotal - n;
      syncingRef.current = true;
      setDescontoValor(diff > 0 ? formatDescontoValorOrc(diff) : "");
      setDescontoPct(
        diff > 0 ? formatDescontoPctOrc(Math.round((diff / subtotal) * 10000) / 100) : "",
      );
      syncingRef.current = false;
    }
  }, [valorMostrar, subtotal, descontoValor, descontoPct, sincronizarDescontoPar]);

  const onValorTotalFocus = useCallback(() => {
    descontoSourceRef.current = "total";
  }, []);

  const onDescontoPctInput = useCallback(
    (raw: string) => {
      if (syncingRef.current) return;
      const v = sanitizarDescontoPct(raw);
      setDescontoPct(v);
      descontoSourceRef.current = "percent";
      valorBaseManualRef.current = 0;
      sincronizarDescontoPar({ pct: v });
    },
    [sincronizarDescontoPar],
  );

  const onDescontoPctBlur = useCallback(() => {
    if (syncingRef.current) return;
    valorBaseManualRef.current = 0;
    descontoSourceRef.current = "percent";
    const desc = calcComCampos();
    setDescontoPct(desc.descontoPct > 0 ? formatDescontoPctOrc(desc.descontoPct) : "");
    sincronizarDescontoPar({ pct: desc.descontoPct > 0 ? formatDescontoPctOrc(desc.descontoPct) : "" });
  }, [calcComCampos, sincronizarDescontoPar]);

  const onDescontoPctFocus = useCallback(() => {
    descontoSourceRef.current = "percent";
    valorBaseManualRef.current = 0;
  }, []);

  const onDescontoValorInput = useCallback(
    (raw: string) => {
      if (syncingRef.current) return;
      const v = sanitizarNumeroBr(raw);
      setDescontoValor(v);
      descontoSourceRef.current = "valor";
      valorBaseManualRef.current = 0;
      sincronizarDescontoPar({ valor: v });
    },
    [sincronizarDescontoPar],
  );

  const onDescontoValorBlur = useCallback(() => {
    if (syncingRef.current) return;
    valorBaseManualRef.current = 0;
    descontoSourceRef.current = "valor";
    let desc = calcComCampos();
    if (subtotal > 0 && desc.descontoValor > subtotal) {
      desc = calcComCampos({ valor: formatDescontoValorOrc(subtotal) });
    }
    const valorFmt = desc.descontoValor > 0 ? formatDescontoValorOrc(desc.descontoValor) : "";
    setDescontoValor(valorFmt);
    sincronizarDescontoPar({ valor: valorFmt });
  }, [calcComCampos, sincronizarDescontoPar, subtotal]);

  const onDescontoValorFocus = useCallback(() => {
    descontoSourceRef.current = "valor";
    valorBaseManualRef.current = 0;
  }, []);

  const materiaisFiltrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    if (!q) return materiais;
    return materiais.filter((m) => m.material.toLowerCase().includes(q));
  }, [materiais, pesquisa]);

  const addMaterial = useCallback(() => {
    const m = materiais.find((x) => String(x.id) === materialId);
    if (!m) return;
    const mt = Number.parseFloat(metros.replace(",", ".")) || 1;
    setPartData((prev) =>
      mesclarLinhasOrcamento([
        ...prev,
        {
          material: m.material,
          metros: mt,
          valor: m.valor,
          valor_custo: m.valor_custo,
          id: m.id,
        },
      ]),
    );
    setMaterialId("");
    setMetros("1");
  }, [materiais, materialId, metros]);

  const addLinhas = useCallback((linhas: OrcamentoLinha[]) => {
    if (linhas.length === 0) return;
    setPartData((prev) => mesclarLinhasOrcamento([...prev, ...linhas]));
  }, []);

  const removeLinha = useCallback((idx: number) => {
    setPartData((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateLinha = useCallback((idx: number, patch: Partial<OrcamentoLinha>) => {
    setPartData((prev) =>
      prev.map((linha, i) => (i === idx ? { ...linha, ...patch } : linha)),
    );
  }, []);

  const resetForm = useCallback(() => {
    setPartData([]);
    setDescontoPct("");
    setDescontoValor("");
    setValorMostrar("");
    setFormaPagamento("");
    setQtdParcelas("1");
    setTaxaMaquininha("");
    setCpfCnpj("");
    setObservacao("");
    setPesquisa("");
    setMaterialId("");
    setMetros("1");
    descontoSourceRef.current = "percent";
    valorBaseManualRef.current = 0;
    carregandoRef.current = false;
  }, []);

  const loadExisting = useCallback(
    (data: {
      partData: OrcamentoLinha[];
      valor: number;
      descontoPercent: number;
      observacao: string;
      cpfCnpj: string;
      formaPagamento?: string;
    }) => {
      carregandoRef.current = true;
      setPartData(mesclarLinhasOrcamento(data.partData));
      setCpfCnpj(data.cpfCnpj.replace(/\D/g, "") === "00000000000" ? "" : data.cpfCnpj);
      setObservacao(data.observacao);
      const sub = inventarioSubtotalOrcamento(data.partData);
      const resolved = garantirTotalOrcamentoConsistente(
        sub,
        "percent",
        data.descontoPercent,
        0,
        data.valor,
      );
      setDescontoPct(
        resolved.percent > 0 ? formatDescontoPctOrc(resolved.percent) : "",
      );
      setDescontoValor(
        resolved.valor > 0 ? formatDescontoValorOrc(resolved.valor) : "",
      );
      setValorMostrar(formatDescontoValorOrc(resolved.total));
      const pagamento = parseFormaPagamento(data.formaPagamento);
      setFormaPagamento(pagamento.forma);
      setQtdParcelas(String(pagamento.qtdParcelas || 1));
      setTaxaMaquininha(
        pagamento.taxaMaquininhaPct > 0
          ? pagamento.taxaMaquininhaPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
          : "",
      );
      descontoSourceRef.current = "percent";
      valorBaseManualRef.current = 0;
      queueMicrotask(() => {
        carregandoRef.current = false;
      });
    },
    [],
  );

  const buildPayload = useCallback(() => {
    let modo = descontoSourceRef.current;
    const desc = calcComCampos();

    if (modo === "total" && parseMoneyBr(valorMostrar) <= 0) {
      if (parseMoneyBr(descontoValor) > 0) modo = "valor";
      else if (parseMoneyBr(descontoPct) > 0) modo = "percent";
      else modo = "percent";
    }

    const resolved = garantirTotalOrcamentoConsistente(
      subtotal,
      modo,
      modo === "percent" ? descontoPct : desc.descontoPct,
      modo === "valor" ? descontoValor : desc.descontoValor,
      modo === "total" ? valorMostrar : desc.total,
    );
    return {
      partData: mesclarLinhasOrcamento(partData),
      formaPagamento,
      qtdParcelas: formaPagamento === "credito" ? qtdParcelas : undefined,
      taxaMaquininhaPct: formaPagamento === "credito" ? taxaMaquininha : undefined,
      descontoModo: modo,
      descontoPercent: resolved.percent,
      descontoValor: resolved.valor,
      valor: resolved.total,
      cpfCnpj,
      observacao,
    };
  }, [
    partData,
    formaPagamento,
    qtdParcelas,
    taxaMaquininha,
    calcComCampos,
    subtotal,
    cpfCnpj,
    observacao,
    descontoPct,
    descontoValor,
    valorMostrar,
  ]);

  const onMetrosInput = useCallback((raw: string) => {
    let v = raw.replace(/[^\d,.]/g, "");
    const sep = v.includes(",") ? "," : v.includes(".") ? "." : null;
    if (sep) {
      const parts = v.split(sep);
      v = parts[0] + sep + (parts[1] ?? "").slice(0, 2);
    }
    setMetros(v);
  }, []);

  return {
    partData,
    descontoPct,
    descontoValor,
    valorMostrar,
    formaPagamento,
    qtdParcelas,
    taxaMaquininha,
    setQtdParcelas,
    setTaxaMaquininha,
    setFormaPagamento,
    cpfCnpj,
    setCpfCnpj,
    observacao,
    setObservacao,
    pesquisa,
    setPesquisa,
    materialId,
    setMaterialId,
    metros,
    onMetrosInput,
    materiaisFiltrados,
    addMaterial,
    addLinhas,
    removeLinha,
    updateLinha,
    resetForm,
    loadExisting,
    buildPayload,
    onValorTotalInput,
    onValorTotalBlur,
    onValorTotalFocus,
    onDescontoPctInput,
    onDescontoPctBlur,
    onDescontoPctFocus,
    onDescontoValorInput,
    onDescontoValorBlur,
    onDescontoValorFocus,
    subtotal,
    totalOrcamento,
  };
}
