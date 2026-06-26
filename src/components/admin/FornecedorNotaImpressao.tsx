import { useEffect, useMemo, useRef, useState } from "react";

import { UserThumb } from "@/components/admin/UserThumb";
import { HOME_SITE } from "@/data/home-config";
import type { EntregaDetalhe } from "@/lib/fornecedores.server";
import {
  baixarImagemNotaEntrega,
  baixarPdfNotaEntrega,
} from "@/lib/fornecedor-nota-pdf";
import {
  documentoRotulo,
  entregaNumeroNota,
  formatDataHora,
  formatDocumentoExib,
  formatEnderecoFornecedor,
  formatMoeda,
  fornecedorRotulo,
  fornecedorRotuloEmpresa,
} from "@/lib/fornecedores-display";

type Props = {
  entrega: EntregaDetalhe;
  autoPrint?: boolean;
};

export function FornecedorNotaImpressao({ entrega, autoPrint = false }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"pdf" | "imagem" | null>(null);
  const [acaoMsg, setAcaoMsg] = useState("");
  const numeroNota = entregaNumeroNota(entrega.id);
  const empresa = fornecedorRotuloEmpresa(entrega);
  const nomeExibicao = fornecedorRotulo(entrega);
  const enviadoEm = formatDataHora(entrega.enviado_em);
  const recebido = entrega.status === "recebido";
  const razao = (entrega.razao_social ?? "").trim();
  const fantasia = (entrega.nome_fantasia ?? "").trim();
  const endereco = formatEnderecoFornecedor(entrega);
  const doc = (entrega.cnpj ?? "").trim();
  const usuarioNome = (entrega.usuario_nome ?? "").trim();

  const statusLabel = useMemo(() => {
    if (!recebido) return "Aguardando conferência";
    if (entrega.qtd_itens_pg_pendentes > 0) return "Recebido · pagamento pendente";
    if (entrega.qtd_itens_pago_aguard_conf > 0) return "Recebido · pagamento enviado";
    return "Recebido · pagamento confirmado";
  }, [entrega, recebido]);

  useEffect(() => {
    document.body.classList.add("fornecedor-nota-print-page");
    return () => document.body.classList.remove("fornecedor-nota-print-page");
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(t);
  }, [autoPrint, entrega.id]);

  async function handleBaixarPdf() {
    if (!sheetRef.current || busy) return;
    setAcaoMsg("");
    setBusy("pdf");
    try {
      await baixarPdfNotaEntrega(sheetRef.current, entrega.id);
      setAcaoMsg("PDF baixado com sucesso.");
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Erro ao gerar PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function handleBaixarImagem() {
    if (!sheetRef.current || busy) return;
    setAcaoMsg("");
    setBusy("imagem");
    try {
      await baixarImagemNotaEntrega(sheetRef.current, entrega.id);
      setAcaoMsg("Imagem baixada com sucesso.");
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Erro ao gerar imagem.");
    } finally {
      setBusy(null);
    }
  }

  const contatoRows = [
    (entrega.contato_nome ?? "").trim()
      ? { icon: "bi-person", label: "Responsável", value: entrega.contato_nome }
      : null,
    doc ? { icon: "bi-card-text", label: documentoRotulo(doc), value: formatDocumentoExib(doc) } : null,
    (entrega.telefone ?? "").trim()
      ? { icon: "bi-telephone", label: "Telefone", value: entrega.telefone }
      : null,
    endereco ? { icon: "bi-geo-alt", label: "Endereço", value: endereco } : null,
  ].filter(Boolean) as Array<{ icon: string; label: string; value: string }>;

  return (
    <div className="forn-nota">
      <div className="forn-nota__actions no-print">
        <button
          type="button"
          className="forn-nota__btn forn-nota__btn--primary"
          onClick={() => window.print()}
          disabled={busy != null}
        >
          <i className="bi bi-printer" aria-hidden="true" /> Imprimir
        </button>
        <button
          type="button"
          className="forn-nota__btn forn-nota__btn--outline"
          onClick={() => void handleBaixarPdf()}
          disabled={busy != null}
        >
          <i className="bi bi-file-earmark-pdf" aria-hidden="true" />{" "}
          {busy === "pdf" ? "Gerando PDF…" : "Baixar PDF"}
        </button>
        <button
          type="button"
          className="forn-nota__btn forn-nota__btn--imagem"
          onClick={() => void handleBaixarImagem()}
          disabled={busy != null}
        >
          <i className="bi bi-image" aria-hidden="true" />{" "}
          {busy === "imagem" ? "Gerando imagem…" : "Baixar imagem"}
        </button>
        <button
          type="button"
          className="forn-nota__btn"
          onClick={() => window.close()}
          disabled={busy != null}
        >
          Fechar
        </button>
      </div>
      {acaoMsg ? (
        <p className="forn-nota__acao-msg no-print" role="status">
          {acaoMsg}
        </p>
      ) : null}

      <div className="forn-nota__sheet" ref={sheetRef}>
        <div className="forn-nota__corner-tr" aria-hidden="true" />

        <header className="forn-nota__header">
          <div className="forn-nota__logo">
            <img src={HOME_SITE.img.logoHeader} width={168} height={48} alt="Alex Calhas" />
          </div>
          <h1 className="forn-nota__title">Nota de entrega — Alex Calhas</h1>
        </header>

        <section className="forn-nota__info-card">
          <div className="forn-nota__info-main">
            <span className="forn-nota__info-icon" aria-hidden="true">
              <i className="bi bi-file-earmark-text" />
            </span>
            <div className="forn-nota__info-text">
              <p className="forn-nota__info-nota">
                Nota de entrega: <strong>{numeroNota}</strong>
              </p>
              {enviadoEm !== "—" ? (
                <p className="forn-nota__info-meta">
                  <i className="bi bi-calendar3" aria-hidden="true" /> Enviado em {enviadoEm}
                </p>
              ) : null}
              {usuarioNome ? (
                <p className="forn-nota__info-meta">
                  <i className="bi bi-person" aria-hidden="true" /> Por {usuarioNome}
                </p>
              ) : null}
            </div>
          </div>
          <div className={`forn-nota__status-pill${recebido ? " is-recebido" : ""}`}>
            <span className="forn-nota__status-dot" aria-hidden="true" />
            {statusLabel}
          </div>
        </section>

        <section className="forn-nota__forn-card">
          <div className="forn-nota__forn-brand">
            <div className="forn-nota__forn-avatar">
              <UserThumb
                nome={usuarioNome || nomeExibicao || empresa}
                thumb={entrega.usuario_thumb ?? "nao.png"}
                className="forn-nota__user-thumb"
              />
            </div>
            <div className="forn-nota__forn-brand-text">
              <p className="forn-nota__forn-nome">{nomeExibicao || empresa}</p>
              {razao && fantasia && razao !== fantasia ? (
                <p className="forn-nota__forn-razao">{razao}</p>
              ) : null}
              {!fantasia && razao ? <p className="forn-nota__forn-razao">{razao}</p> : null}
              <span className="forn-nota__forn-line" aria-hidden="true" />
            </div>
          </div>

          {contatoRows.length > 0 ? (
            <div className="forn-nota__forn-details">
              {contatoRows.map((row) => (
                <div key={row.label} className="forn-nota__forn-detail">
                  <span className="forn-nota__forn-detail-icon" aria-hidden="true">
                    <i className={`bi ${row.icon}`} />
                  </span>
                  <div>
                    <span className="forn-nota__forn-detail-label">{row.label}</span>
                    <span className="forn-nota__forn-detail-value">{row.value}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <div className="forn-nota__table-wrap">
          <table className="forn-nota__table">
            <thead>
              <tr>
                <th>Produto / material</th>
                <th className="text-end">Metros</th>
                <th className="text-end">R$/metro</th>
                <th className="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              {entrega.itens.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.material_nome}
                    {(item.observacao ?? "").trim() ? (
                      <>
                        <br />
                        <small>{item.observacao}</small>
                      </>
                    ) : null}
                  </td>
                  <td className="text-end">{formatMoeda(item.metros)}</td>
                  <td className="text-end">R$ {formatMoeda(item.valor_unitario)}</td>
                  <td className="text-end forn-nota__cell-total">
                    <strong>R$ {formatMoeda(item.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="forn-nota__total-card">
          <span className="forn-nota__total-icon" aria-hidden="true">
            <i className="bi bi-currency-dollar" />
          </span>
          <span className="forn-nota__total-label">Total geral</span>
          <span className="forn-nota__total-val">R$ {formatMoeda(entrega.total_geral)}</span>
        </div>

        {(entrega.observacao ?? "").trim() ? (
          <div className="forn-nota__obs">
            <strong>Observação da entrega</strong>
            <p>{entrega.observacao}</p>
          </div>
        ) : null}

        <footer className="forn-nota__foot">
          <div className="forn-nota__foot-divider" aria-hidden="true">
            <span className="forn-nota__foot-line" />
            <span className="forn-nota__foot-icon">
              <i className="bi bi-shield-check" />
            </span>
            <span className="forn-nota__foot-line" />
          </div>
          <p>
            Documento gerado pelo sistema Alex Calhas — uso interno para conferência de materiais
            recebidos.
          </p>
        </footer>

        <div className="forn-nota__corner forn-nota__corner--bl" aria-hidden="true" />
        <div className="forn-nota__corner forn-nota__corner--br" aria-hidden="true" />
      </div>
    </div>
  );
}
