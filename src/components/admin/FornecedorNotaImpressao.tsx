import { useEffect, useMemo } from "react";

import { HOME_SITE } from "@/data/home-config";
import type { EntregaDetalhe } from "@/lib/fornecedores.server";
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

function formatDataHoraAgora(): string {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FornecedorNotaImpressao({ entrega, autoPrint = true }: Props) {
  const numeroNota = entregaNumeroNota(entrega.id);
  const empresa = fornecedorRotuloEmpresa(entrega);
  const nomeExibicao = fornecedorRotulo(entrega);
  const enviadoEm = formatDataHora(entrega.enviado_em);
  const recebido = entrega.status === "recebido";
  const razao = (entrega.razao_social ?? "").trim();
  const fantasia = (entrega.nome_fantasia ?? "").trim();
  const endereco = formatEnderecoFornecedor(entrega);
  const doc = (entrega.cnpj ?? "").trim();
  const emitidoEm = useMemo(() => formatDataHoraAgora(), []);

  useEffect(() => {
    document.body.classList.add("fornecedor-nota-print-page");
    return () => document.body.classList.remove("fornecedor-nota-print-page");
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(t);
  }, [autoPrint, entrega.id]);

  const statusLabel = recebido
    ? entrega.pagamento_status === "pago"
      ? "Recebido · pagamento confirmado"
      : "Recebido · pagamento pendente"
    : "Aguardando conferência";

  const statusIcon = recebido ? "bi-check-circle-fill" : "bi-hourglass-split";

  return (
    <div className="forn-nota">
      <div className="forn-nota__actions no-print">
        <button type="button" className="forn-nota__btn forn-nota__btn--primary" onClick={() => window.print()}>
          Imprimir
        </button>
        <button type="button" className="forn-nota__btn" onClick={() => window.close()}>
          Fechar
        </button>
      </div>

      <div className="forn-nota__sheet">
        <div className="forn-nota__topbar">
          <span className="forn-nota__datetime">
            <i className="bi bi-calendar3" aria-hidden="true" /> {emitidoEm}
          </span>
          <div className="forn-nota__decor" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <h1 className="forn-nota__title">Nota de entrega — Alex Calhas</h1>

        <div className="forn-nota__logo">
          <img src={HOME_SITE.img.logoHeader} width={220} height={64} alt="Alex Calhas" />
        </div>

        <div className="forn-nota__card forn-nota__card--meta">
          <span className="forn-nota__card-icon" aria-hidden="true">
            <i className="bi bi-file-earmark-text" />
          </span>
          <div className="forn-nota__card-body">
            <p>
              <strong>Nota de entrega:</strong> {numeroNota}
            </p>
            {enviadoEm !== "—" ? <p>Enviado em {enviadoEm}</p> : null}
            {entrega.usuario_nome ? <p>Por {entrega.usuario_nome}</p> : null}
          </div>
        </div>

        <div className={`forn-nota__card forn-nota__card--status${recebido ? " is-recebido" : ""}`}>
          <span className="forn-nota__icon-circle" aria-hidden="true">
            <i className={`bi ${statusIcon}`} />
          </span>
          <span className="forn-nota__status-text">{statusLabel}</span>
        </div>

        <div className="forn-nota__card forn-nota__card--forn">
          <div className="forn-nota__forn-accent" aria-hidden="true" />
          <div className="forn-nota__forn-inner">
            <div className="forn-nota__forn-head">
              <span className="forn-nota__icon-circle forn-nota__icon-circle--lg" aria-hidden="true">
                <i className="bi bi-building" />
              </span>
              <div>
                <strong className="forn-nota__forn-nome">{nomeExibicao || empresa}</strong>
                {razao && fantasia && razao !== fantasia ? (
                  <span className="forn-nota__forn-razao">{razao}</span>
                ) : null}
                {!fantasia && razao ? <span className="forn-nota__forn-razao">{razao}</span> : null}
              </div>
            </div>

            {(entrega.contato_nome ?? "").trim() || doc || (entrega.telefone ?? "").trim() || endereco ? (
              <>
                <hr className="forn-nota__forn-divider" />
                <div className="forn-nota__forn-rows">
                  {(entrega.contato_nome ?? "").trim() ? (
                    <div className="forn-nota__forn-row">
                      <i className="bi bi-person" aria-hidden="true" />
                      <div>
                        <span className="forn-nota__forn-label">Responsável</span>
                        <span>{entrega.contato_nome}</span>
                      </div>
                    </div>
                  ) : null}
                  {doc ? (
                    <div className="forn-nota__forn-row">
                      <i className="bi bi-card-text" aria-hidden="true" />
                      <div>
                        <span className="forn-nota__forn-label">{documentoRotulo(doc)}</span>
                        <span>{formatDocumentoExib(doc)}</span>
                      </div>
                    </div>
                  ) : null}
                  {(entrega.telefone ?? "").trim() ? (
                    <div className="forn-nota__forn-row">
                      <i className="bi bi-telephone" aria-hidden="true" />
                      <div>
                        <span className="forn-nota__forn-label">Telefone</span>
                        <span>{entrega.telefone}</span>
                      </div>
                    </div>
                  ) : null}
                  {endereco ? (
                    <div className="forn-nota__forn-row">
                      <i className="bi bi-geo-alt" aria-hidden="true" />
                      <div>
                        <span className="forn-nota__forn-label">Endereço</span>
                        <span>{endereco}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>

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

        <div className="forn-nota__total-box">
          <span className="forn-nota__total-label">Total geral:</span>
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
              <i className="bi bi-check-circle-fill" />
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
