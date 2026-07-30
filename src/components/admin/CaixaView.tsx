import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { AdminModal } from "@/components/admin/modals/AdminModal";
import type { CaixaDiaResumo, CaixaStatus } from "@/lib/caixa.server";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

type CaixaStatusMap = Record<string, CaixaStatus>;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstName(nome: string): string {
  const p = nome.trim().split(/\s+/)[0];
  return p || "usuário";
}

function money(v: number, hidden = false) {
  if (hidden) return "R$ ••••••";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Linha = {
  key: string;
  label: string;
  icon: string;
  value: number;
  highlight?: boolean;
  lucro?: boolean;
};

export function CaixaView() {
  const { user } = useAdminAuth();
  const hoje = useMemo(() => ymd(new Date()), []);
  const [selectedYmd, setSelectedYmd] = useState(hoje);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [resumo, setResumo] = useState<CaixaDiaResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hideMoney, setHideMoney] = useState(true);
  const [hideFin, setHideFin] = useState(true);
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [statusMap, setStatusMap] = useState<CaixaStatusMap>({});
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState("");
  const [lucroOpen, setLucroOpen] = useState(false);

  const load = useCallback(async (data: string, mesView?: { y: number; m: number }) => {
    setLoading(true);
    setError("");
    try {
      const ano = mesView?.y ?? Number(data.slice(0, 4));
      const mes = (mesView?.m ?? Number(data.slice(5, 7)) - 1) + 1;
      const qs = new URLSearchParams({
        data,
        ano: String(ano),
        mes: String(mes),
      });
      const res = await fetch(`/api/admin/caixa?${qs}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        resumo?: CaixaDiaResumo;
        statusMes?: CaixaStatusMap;
        message?: string;
      };
      if (!res.ok || !json.resumo) throw new Error(json.message ?? "Falha ao carregar caixa.");
      setResumo(json.resumo);
      setCaixaAberto(json.resumo.status === "aberto");
      if (json.statusMes) setStatusMap(json.statusMes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
      setResumo(null);
      setCaixaAberto(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(selectedYmd, viewMonth);
  }, [selectedYmd, viewMonth, load]);

  const toggleCaixa = useCallback(async () => {
    if (toggling) return;
    const action = caixaAberto ? "fechar" : "abrir";
    setToggling(true);
    try {
      const res = await fetch("/api/admin/caixa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: selectedYmd, action }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        status?: CaixaStatus;
        statusMes?: CaixaStatusMap;
        message?: string;
      };
      if (!res.ok || !json.status) throw new Error(json.message ?? "Falha ao atualizar caixa.");
      setCaixaAberto(json.status === "aberto");
      if (json.statusMes) {
        setStatusMap((prev) => ({ ...prev, ...json.statusMes }));
      } else {
        setStatusMap((prev) => ({ ...prev, [selectedYmd]: json.status! }));
      }
      setToast(json.status === "aberto" ? "Caixa aberto." : "Caixa fechado.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Erro ao atualizar caixa.");
    } finally {
      setToggling(false);
    }
  }, [caixaAberto, selectedYmd, toggling]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "2") {
        e.preventDefault();
        toggleCaixa();
      }
      if (e.key === "5") {
        e.preventDefault();
        setToast("Listar caixas em breve.");
      }
      if (e.key === "6") {
        e.preventDefault();
        setLucroOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCaixa]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const calendarDays = useMemo(() => {
    const first = new Date(viewMonth.y, viewMonth.m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewMonth.y, viewMonth.m + 1, 0).getDate();
    const cells: ({ day: number; ymd: string } | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewMonth.y, viewMonth.m, d);
      cells.push({ day: d, ymd: ymd(date) });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const linhas: Linha[] = useMemo(() => {
    const r = resumo;
    return [
      { key: "dinheiro", label: "Dinheiro", icon: "bi-cash-stack", value: r?.dinheiro ?? 0 },
      { key: "cartoes", label: "Cartões", icon: "bi-credit-card", value: r?.cartoes ?? 0 },
      { key: "cheques", label: "Cheques", icon: "bi-file-earmark-text", value: r?.cheques ?? 0 },
      { key: "pix", label: "Pix", icon: "bi-qr-code", value: r?.pix ?? 0 },
      { key: "financeira", label: "Financeira", icon: "bi-bank", value: r?.financeira ?? 0 },
      {
        key: "saldo",
        label: "Saldo final do dia",
        icon: "bi-wallet2",
        value: r?.saldoFinal ?? 0,
        highlight: true,
      },
      {
        key: "lucro",
        label: "Lucro real",
        icon: "bi-graph-up-arrow",
        value: r?.lucroReal ?? 0,
        lucro: true,
      },
      { key: "receb", label: "Recebimentos", icon: "bi-hand-thumbs-up", value: r?.recebimentos ?? 0 },
      { key: "vendas", label: "Vendas", icon: "bi-cart3", value: r?.vendas ?? 0 },
      {
        key: "sangria",
        label: "Sangrias e suprimentos",
        icon: "bi-plus-lg",
        value: r?.sangriasSuprimentos ?? 0,
      },
      { key: "dev", label: "Devoluções", icon: "bi-arrow-counterclockwise", value: r?.devolucoes ?? 0 },
    ];
  }, [resumo]);

  const dataLabel =
    resumo?.dataLabel ?? selectedYmd.split("-").reverse().join("/");

  const nome = firstName(user?.nome ?? "Alex");
  const lucroNegativo = (resumo?.lucroReal ?? 0) < 0;

  return (
    <div className="caixa-page">
      {toast ? (
        <div className="caixa-toast" role="status">
          {toast}
        </div>
      ) : null}

      <section className="caixa-board" aria-label="Caixa diário">
        <aside className="caixa-side">
          <p className="caixa-side__eyebrow">CAIXA</p>
          <h1 className="caixa-side__hello">Olá, {nome}</h1>
          <p className="caixa-side__status">
            Veja os movimentos do dia <strong>{dataLabel}</strong>.{" "}
            {caixaAberto ? (
              <>Caixa aberto.</>
            ) : (
              <>
                Caixa fechado. Clique em <em>Abrir caixa</em> para reabrir.
              </>
            )}
          </p>

          <div className="caixa-cal" aria-label="Calendário">
            <div className="caixa-cal__head">
              <button
                type="button"
                className="caixa-cal__nav"
                aria-label="Mês anterior"
                onClick={() =>
                  setViewMonth((v) => {
                    const d = new Date(v.y, v.m - 1, 1);
                    return { y: d.getFullYear(), m: d.getMonth() };
                  })
                }
              >
                <i className="bi bi-chevron-left" aria-hidden="true" />
              </button>
              <strong>
                {MESES[viewMonth.m]} De {viewMonth.y}
              </strong>
              <button
                type="button"
                className="caixa-cal__nav"
                aria-label="Próximo mês"
                onClick={() =>
                  setViewMonth((v) => {
                    const d = new Date(v.y, v.m + 1, 1);
                    return { y: d.getFullYear(), m: d.getMonth() };
                  })
                }
              >
                <i className="bi bi-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <div className="caixa-cal__week">
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`}>{w}</span>
              ))}
            </div>
            <div className="caixa-cal__grid">
              {calendarDays.map((cell, i) =>
                cell ? (
                  <button
                    key={cell.ymd}
                    type="button"
                    title={
                      statusMap[cell.ymd] === "aberto" || statusMap[cell.ymd] === "fechado"
                        ? "Caixa aberto neste dia"
                        : cell.ymd <= hoje
                          ? "Caixa não aberto neste dia"
                          : undefined
                    }
                    className={`caixa-cal__day${cell.ymd === selectedYmd ? " is-selected" : ""}${
                      cell.ymd === hoje ? " is-today" : ""
                    }${
                      statusMap[cell.ymd] === "aberto" || statusMap[cell.ymd] === "fechado"
                        ? " is-aberto"
                        : cell.ymd <= hoje
                          ? " is-nao-aberto"
                          : ""
                    }`}
                    onClick={() => setSelectedYmd(cell.ymd)}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <span key={`empty-${i}`} className="caixa-cal__day is-empty" />
                ),
              )}
            </div>
          </div>

          <div className="caixa-actions">
            <button
              type="button"
              className="caixa-action"
              onClick={() => setLucroOpen(true)}
            >
              <i className="bi bi-graph-up-arrow" aria-hidden="true" />
              <span>
                Lucro real
                <small>Atalho Alt + 6</small>
              </span>
            </button>
            <button
              type="button"
              className="caixa-action"
              onClick={() => setToast("Listar caixas em breve.")}
            >
              <i className="bi bi-list-ul" aria-hidden="true" />
              <span>
                Listar caixas
                <small>Atalho Alt + 5</small>
              </span>
            </button>
            <button
              type="button"
              className={`caixa-action caixa-action--primary${caixaAberto ? " is-open" : ""}`}
              onClick={() => void toggleCaixa()}
              disabled={toggling}
            >
              <i className={`bi ${caixaAberto ? "bi-unlock-fill" : "bi-lock-fill"}`} aria-hidden="true" />
              <span>
                {caixaAberto ? "Fechar caixa" : "Abrir caixa"}
                <small>Atalho Alt + 2</small>
              </span>
            </button>
          </div>
        </aside>

        <div className="caixa-main">
          <div className="caixa-main__head">
            <div>
              <h2>Resumo do caixa diário</h2>
              <p>
                {loading
                  ? "Carregando…"
                  : `${resumo?.qtdVendas ?? 0} venda(s) faturada(s) neste dia`}
              </p>
            </div>
            <button
              type="button"
              className="caixa-eye"
              aria-label={hideMoney ? "Mostrar valores" : "Ocultar valores"}
              onClick={() => setHideMoney((v) => !v)}
            >
              <i className={`bi bi-eye${hideMoney ? "-slash" : ""}`} aria-hidden="true" />
            </button>
          </div>

          {error ? <p className="caixa-error">{error}</p> : null}

          <ul className="caixa-rows">
            {linhas.map((row) => (
              <li
                key={row.key}
                className={`caixa-row${row.highlight ? " caixa-row--saldo" : ""}${
                  row.lucro ? " caixa-row--lucro" : ""
                }${row.lucro && lucroNegativo ? " is-neg" : ""}`}
              >
                <span className="caixa-row__icon" aria-hidden="true">
                  <i className={`bi ${row.icon}`} />
                </span>
                <span className="caixa-row__label">{row.label}</span>
                <strong className="caixa-row__value">{money(row.value, hideMoney)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="caixa-fin" aria-labelledby="caixa-fin-title">
        <div className="caixa-fin__head">
          <h2 id="caixa-fin-title">Resumo financeiro</h2>
          <button
            type="button"
            className="caixa-eye"
            aria-label={hideFin ? "Mostrar valores" : "Ocultar valores"}
            onClick={() => setHideFin((v) => !v)}
          >
            <i className={`bi bi-eye${hideFin ? "-slash" : ""}`} aria-hidden="true" />
          </button>
        </div>
        <div className="caixa-fin__grid">
          <Link to="/painel/confirmado" className="caixa-fin__card">
            <span>Vendas (dia)</span>
            <strong>{money(resumo?.vendas ?? 0, hideFin)}</strong>
          </Link>
          <button type="button" className="caixa-fin__card" onClick={() => setLucroOpen(true)}>
            <span>Custo materiais</span>
            <strong>{money(resumo?.custoMateriais ?? 0, hideFin)}</strong>
          </button>
          <button type="button" className="caixa-fin__card" onClick={() => setLucroOpen(true)}>
            <span>Despesas</span>
            <strong>{money(resumo?.despesas ?? 0, hideFin)}</strong>
          </button>
          <button
            type="button"
            className="caixa-fin__card caixa-fin__card--lucro"
            onClick={() => setLucroOpen(true)}
          >
            <span>Lucro real</span>
            <strong className={lucroNegativo ? "is-red" : "is-green"}>
              {money(resumo?.lucroReal ?? 0, hideFin)}
            </strong>
          </button>
        </div>
      </section>

      <AdminModal
        open={lucroOpen}
        onClose={() => setLucroOpen(false)}
        dialogClass="modal-lg modal-dialog-centered"
      >
        <div className="modal-content caixa-lucro-modal">
          <div className="modal-header">
            <div>
              <p className="caixa-lucro-modal__eyebrow">Relatório</p>
              <h2 className="modal-title">Lucro real — {dataLabel}</h2>
            </div>
            <button type="button" className="btn-close" aria-label="Fechar" onClick={() => setLucroOpen(false)} />
          </div>
          <div className="modal-body">
            <p className="caixa-lucro-modal__formula">
              Lucro real = vendas − custo dos materiais − despesas do dia
            </p>

            <div className="caixa-lucro-kpis">
              <div className="caixa-lucro-kpi">
                <span>Vendas</span>
                <strong>{money(resumo?.vendas ?? 0)}</strong>
              </div>
              <div className="caixa-lucro-kpi">
                <span>Custo materiais</span>
                <strong>{money(resumo?.custoMateriais ?? 0)}</strong>
              </div>
              <div className="caixa-lucro-kpi">
                <span>Despesas</span>
                <strong>{money(resumo?.despesas ?? 0)}</strong>
              </div>
              <div className={`caixa-lucro-kpi caixa-lucro-kpi--result${lucroNegativo ? " is-neg" : ""}`}>
                <span>Lucro real</span>
                <strong>{money(resumo?.lucroReal ?? 0)}</strong>
                <small>
                  {(resumo?.margemPct ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de margem
                </small>
              </div>
            </div>

            <h3 className="caixa-lucro-modal__list-title">Vendas do dia</h3>
            {(resumo?.vendasDetalhe?.length ?? 0) === 0 ? (
              <p className="caixa-lucro-modal__empty">Nenhuma venda confirmada/finalizada neste dia.</p>
            ) : (
              <div className="caixa-lucro-table-wrap">
                <table className="caixa-lucro-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Status</th>
                      <th>Pagamento</th>
                      <th className="text-end">Venda</th>
                      <th className="text-end">Custo</th>
                      <th className="text-end">Lucro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(resumo?.vendasDetalhe ?? []).map((v) => (
                      <tr key={v.id}>
                        <td>{v.nome}</td>
                        <td>{v.status}</td>
                        <td>{v.forma}</td>
                        <td className="text-end">{money(v.venda)}</td>
                        <td className="text-end">{money(v.custo)}</td>
                        <td className={`text-end${v.lucro < 0 ? " is-neg" : " is-pos"}`}>
                          {money(v.lucro)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setLucroOpen(false)}>
              Fechar
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => window.print()}
            >
              <i className="bi bi-printer me-1" aria-hidden="true" />
              Imprimir
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
