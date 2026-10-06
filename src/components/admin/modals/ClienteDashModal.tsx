import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  atualizarRecebimentoInventario,
  fetchOrcamentoInventario,
  fetchRecebimentosInventario,
  type AgendamentoItem,
  type InventarioRecebimentoItem,
  type RecebimentoResumo,
} from "@/lib/admin-api";
import { dashToast } from "@/lib/dash-ui";
import { formatarTelefone, telefoneWhatsappLink } from "@/lib/format-br";
import { formatMoeda } from "@/lib/financeiro-display";
import { googleMapsUrlEndereco } from "@/lib/inventario-format";
import {
  formatPagoEmExibicao,
  labelRecebimentoTipo,
  normalizarValorPagamento,
  parsePagoEm,
  RECEBIMENTO_TIPOS,
} from "@/lib/inventario-recebimento-display";
import { parseMoneyBr, splitMaterialOrcamentoLabel, type OrcamentoLinha } from "@/lib/orcamento.server";
import { formatOsDocumento, quantidadeLinhaOrcamento, totalLinhaOrcamento } from "@/lib/os-document";
import { abrirRecibo } from "@/lib/recibo-pdf";

type Props = {
  open: boolean;
  onClose: () => void;
  item: AgendamentoItem | null;
  onPagamentoSalvo?: (
    patch: Pick<AgendamentoItem, "valorRecebido" | "saldoPendente" | "quitado" | "qtdPagamentos">,
  ) => void;
};

function pagoEmParaCampo(raw: string): string {
  const d = parsePagoEm(raw);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nomeExibicao(nome: string): string {
  const t = nome.trim();
  if (!t) return "Cliente";
  if (t !== t.toLowerCase()) return t;
  return t.replace(/\p{L}+/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function statusPipeline(status: string): string {
  switch (status) {
    case "confirmado":
      return "Confirmado";
    case "orcamentado":
    case "orçamentado":
      return "Orçado";
    case "finalizado":
      return "Finalizado";
    case "agendado":
      return "Visita";
    default:
      return status || "Serviço";
  }
}

function dataMontagemExibicao(raw: string | null): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : t;
}

function dataCurta(raw: string): string {
  const texto = formatPagoEmExibicao(raw);
  const corte = texto.indexOf(" às ");
  return corte > 0 ? texto.slice(0, corte) : texto;
}

function enderecoFicha(item: AgendamentoItem): string {
  const end = item.endereco.trim();
  const num = item.numero.trim();
  const bairro = item.bairro.trim();
  const cep = item.cep.trim();

  let rua = end;
  if (num && end && !new RegExp(`\\b${num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(end)) {
    const corte = end.indexOf(" - ");
    rua = corte > 0 ? `${end.slice(0, corte)}, ${num}${end.slice(corte)}` : `${end}, ${num}`;
  } else if (num && !end) {
    rua = num;
  }

  const base = [rua, bairro].filter(Boolean).join(" · ");
  if (!base && !cep) return "";
  return cep ? `${base} · ${cep}` : base;
}

export function ClienteDashModal({ open, onClose, item, onPagamentoSalvo }: Props) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [linhas, setLinhas] = useState<OrcamentoLinha[]>([]);
  const [resumo, setResumo] = useState<RecebimentoResumo | null>(null);
  const [pagamentos, setPagamentos] = useState<InventarioRecebimentoItem[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editTipo, setEditTipo] = useState("sinal");
  const [editPagoEm, setEditPagoEm] = useState("");
  const [editObs, setEditObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setLinhas([]);
      setResumo(null);
      setPagamentos([]);
      setErro("");
      setEditandoId(null);
      return;
    }
    const inventarioId = item.id;
    const itensFallback = item.orcamentoItens;
    let cancelado = false;
    setLoading(true);
    setErro("");
    void Promise.all([
      fetchRecebimentosInventario(inventarioId),
      fetchOrcamentoInventario(inventarioId).catch(() => null),
    ])
      .then(([pag, orc]) => {
        if (cancelado) return;
        setResumo(pag.resumo);
        setPagamentos(pag.recebimentos);
        setLinhas(orc?.partData ?? itensFallback ?? []);
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Não foi possível abrir a ficha.");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [open, item?.id, item?.orcamentoItens]);

  useEffect(() => {
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [open, onClose]);

  function iniciarEdicao(rec: InventarioRecebimentoItem) {
    setEditandoId(rec.id);
    setEditValor(rec.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEditTipo(rec.tipo);
    setEditPagoEm(pagoEmParaCampo(rec.pago_em));
    setEditObs(rec.observacao?.trim() ?? "");
    setErro("");
  }

  async function salvarEdicao() {
    if (!item || !editandoId || salvando) return;
    const atual = pagamentos.find((r) => r.id === editandoId);
    if (!atual) return;
    const valorNum = parseMoneyBr(normalizarValorPagamento(editValor));
    const teto = (resumo?.saldoPendente ?? 0) + atual.valor;
    if (valorNum <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    if (valorNum > teto + 0.009) {
      setErro(`O valor passa do saldo. O máximo deste pagamento é R$ ${formatMoeda(teto)}.`);
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const data = await atualizarRecebimentoInventario(item.id, editandoId, {
        valor: valorNum,
        tipo: editTipo,
        pago_em: editPagoEm,
        observacao: editObs.trim() || undefined,
      });
      setPagamentos(data.recebimentos);
      setResumo(data.resumo);
      setEditandoId(null);
      onPagamentoSalvo?.({
        valorRecebido: data.resumo.valorRecebido,
        saldoPendente: data.resumo.saldoPendente,
        quitado: data.resumo.quitado,
        qtdPagamentos: data.resumo.qtdPagamentos,
      });
      dashToast("Pagamento atualizado.", "success");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível atualizar o pagamento.");
    } finally {
      setSalvando(false);
    }
  }

  function abrir(recebimentoId: number) {
    if (!item) return;
    try {
      abrirRecibo(item.id, recebimentoId);
    } catch (err) {
      dashToast(err instanceof Error ? err.message : "Não foi possível abrir o recibo.", "danger");
    }
  }

  if (!open || !item) return null;

  const nome = nomeExibicao(item.nome);
  const total = Number(item.valor) || 0;
  const recebido = resumo?.valorRecebido ?? item.valorRecebido ?? 0;
  const saldo = resumo?.saldoPendente ?? item.saldoPendente ?? Math.max(0, total - recebido);
  const quitado = resumo?.quitado ?? item.quitado ?? false;
  const entrada = pagamentos.find((rec) => rec.tipo === "sinal") ?? null;
  const endereco = enderecoFicha(item);
  const mapa = endereco ? googleMapsUrlEndereco(endereco) : "";
  const whats = telefoneWhatsappLink(item.telefone);
  const doc = formatOsDocumento(item.cpfCnpj);
  const montagem = dataMontagemExibicao(item.dataMontagem);
  const progresso = total > 0 ? Math.min(100, Math.round((recebido / total) * 100)) : 0;

  return (
    <div className="cli-sheet" role="dialog" aria-modal="true" aria-label={`Ficha de ${nome}`}>
      <div className="cli-sheet__inner">
        <div className="cli-sheet__bar">
          <p className="cli-sheet__crumb">Ficha do cliente</p>
          <button type="button" className="cli-sheet__voltar" onClick={onClose}>
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Voltar
          </button>
        </div>

        <header className="cli-sheet__hero">
          <div className="cli-sheet__nome-linha">
            <h1>{nome}</h1>
            <span className="cli-sheet__pill">{statusPipeline(item.status)}</span>
          </div>
          <p className="cli-sheet__sub">
            <span>OS #{item.id}</span>
            {montagem ? <span>Montagem {montagem}</span> : null}
            {doc !== "—" ? <span>{doc}</span> : null}
          </p>
        </header>

        {erro ? <div className="alert alert-danger py-2">{erro}</div> : null}

        {loading ? (
          <p className="cli-sheet__loading">
            <Loader2 className="spin" size={18} /> Carregando ficha…
          </p>
        ) : (
          <>
            <section className="cli-sheet__kpis" aria-label="Resumo financeiro">
              <article>
                <span>Serviço</span>
                <strong>R$ {formatMoeda(total)}</strong>
              </article>
              <article>
                <span>Já pago</span>
                <strong className="is-ok">R$ {formatMoeda(recebido)}</strong>
              </article>
              <article>
                <span>Em aberto</span>
                <strong className={quitado ? "is-ok" : "is-pendente"}>
                  {quitado ? "Quitado" : `R$ ${formatMoeda(saldo)}`}
                </strong>
              </article>
              <article>
                <span>Entrada</span>
                <strong>{entrada ? `R$ ${formatMoeda(entrada.valor)}` : "—"}</strong>
                <small>{entrada ? dataCurta(entrada.pago_em) : "Ainda não registrada"}</small>
              </article>
            </section>

            <div className="cli-sheet__bar-progress" aria-hidden="true">
              <span style={{ width: `${progresso}%` }} />
            </div>
            <p className="cli-sheet__progress-label">{progresso}% recebido deste serviço</p>

            <div className="cli-sheet__grid">
              <section className="cli-sheet__card">
                <h2>Contato</h2>
                <div className="cli-sheet__contato">
                  <div>
                    <span>Telefone</span>
                    <strong>{formatarTelefone(item.telefone)}</strong>
                    <span>Endereço</span>
                    <strong>{endereco || "—"}</strong>
                  </div>
                </div>
                <div className="cli-sheet__acoes">
                  {mapa ? (
                    <a className="cli-sheet__atalho" href={mapa} target="_blank" rel="noopener noreferrer">
                      <i className="bi bi-geo-alt" aria-hidden="true" />
                      Mapa
                    </a>
                  ) : null}
                  {whats ? (
                    <a className="cli-sheet__atalho" href={whats} target="_blank" rel="noopener noreferrer">
                      <i className="bi bi-whatsapp" aria-hidden="true" />
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              </section>

              <section className="cli-sheet__card">
                <h2>Serviço</h2>
                {linhas.length === 0 ? (
                  <p className="cli-sheet__vazio">Nenhum item lançado neste orçamento.</p>
                ) : (
                  <ul className={`cli-sheet__servicos${linhas.length > 5 ? " is-scroll" : ""}`}>
                    {linhas.map((linha, i) => {
                      const partes = splitMaterialOrcamentoLabel(linha.material);
                      const qtd = quantidadeLinhaOrcamento(linha);
                      return (
                        <li key={`${linha.material}-${i}`}>
                          <div>
                            <strong>{partes.titulo || linha.material}</strong>
                            {partes.perfil ? <span>{partes.perfil}</span> : null}
                          </div>
                          <em>
                            {qtd} × R$ {formatMoeda(Number(linha.valor) || 0)}
                          </em>
                          <b>R$ {formatMoeda(totalLinhaOrcamento(linha))}</b>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <section className="cli-sheet__card cli-sheet__pag">
              <h2>Pagamentos</h2>
              {pagamentos.length === 0 ? (
                <p className="cli-sheet__vazio">Nenhum pagamento registrado neste serviço.</p>
              ) : (
                <div className="cli-sheet__tabela">
                  <table>
                    <thead>
                      <tr>
                        <th>Valor</th>
                        <th>Tipo</th>
                        <th>Data</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagamentos.map((rec) => {
                        const ehEntrada = rec.tipo === "sinal";
                        return (
                          <tr
                            key={rec.id}
                            className={`${ehEntrada ? "is-entrada" : ""}${editandoId === rec.id ? " is-editing" : ""}`}
                          >
                            <td className="cli-sheet__valor">R$ {formatMoeda(rec.valor)}</td>
                            <td>
                              <span className={`cli-sheet__tag${ehEntrada ? " is-entrada" : ""}`}>
                                {labelRecebimentoTipo(rec.tipo)}
                              </span>
                            </td>
                            <td>{dataCurta(rec.pago_em)}</td>
                            <td>
                              <div className="cli-sheet__acoes">
                                <button
                                  type="button"
                                  className="cli-sheet__pdf"
                                  onClick={() => iniciarEdicao(rec)}
                                >
                                  <i className="bi bi-pencil" aria-hidden="true" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="cli-sheet__pdf"
                                  onClick={() => abrir(rec.id)}
                                >
                                  <i className="bi bi-file-earmark-pdf" aria-hidden="true" />
                                  Recibo PDF
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
              {editandoId ? (
                <form
                  className="cli-sheet__edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void salvarEdicao();
                  }}
                >
                  <label>
                    Valor (R$)
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={editValor}
                      onChange={(e) => setEditValor(e.target.value)}
                      onBlur={() => setEditValor((atual) => normalizarValorPagamento(atual))}
                    />
                  </label>
                  <label>
                    Tipo
                    <select value={editTipo} onChange={(e) => setEditTipo(e.target.value)}>
                      {RECEBIMENTO_TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {labelRecebimentoTipo(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Data e hora
                    <input
                      type="datetime-local"
                      required
                      value={editPagoEm}
                      onChange={(e) => setEditPagoEm(e.target.value)}
                    />
                  </label>
                  <label>
                    Observação
                    <input
                      type="text"
                      maxLength={255}
                      value={editObs}
                      placeholder="Pix, comprovante…"
                      onChange={(e) => setEditObs(e.target.value)}
                    />
                  </label>
                  <div className="cli-sheet__edit-acoes">
                    <button type="submit" className="cli-sheet__pdf" disabled={salvando}>
                      {salvando ? "Salvando…" : "Atualizar"}
                    </button>
                    <button type="button" className="cli-sheet__pdf" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
