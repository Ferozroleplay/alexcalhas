import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { DashPageHero } from "@/components/admin/DashPageHero";
import { Route as FornecedoresRoute } from "@/routes/painel/fornecedores";
import { FornecedorNovaEntregaSection } from "@/components/admin/FornecedorNovaEntregaSection";
import {
  fetchFornecedorPortal,
  postFornecedorPortalAction,
  type CarrinhoItemEntrega,
  type EntregaDetalhe,
  type EntregaListaRow,
  type MaterialLiberadoRow,
} from "@/lib/fornecedores-client";
import {
  entregaNumeroNota,
  formatDataHora,
  formatMoeda,
  fornecedorRotuloEmpresa,
} from "@/lib/fornecedores-display";
import { dashConfirm, dashToast } from "@/lib/dash-ui";
import { abrirNotaEntrega } from "@/lib/fornecedor-nota-pdf";

function badgePagamentoFornecedor(ent: EntregaListaRow | EntregaDetalhe) {
  if (ent.status !== "recebido" && ent.status !== "parcial") {
    return <span className="badge text-bg-secondary">Aguardando</span>;
  }
  if (ent.qtd_itens_recebidos === 0) {
    return <span className="badge text-bg-secondary">—</span>;
  }
  if (ent.qtd_itens_pg_pendentes > 0) {
    return <span className="badge text-bg-warning">Pagamento pendente</span>;
  }
  if (ent.qtd_itens_pago_aguard_conf > 0) {
    return <span className="badge text-bg-info">Confirme o recebimento</span>;
  }
  return <span className="badge text-bg-success">Pagamento confirmado</span>;
}

function controleSearch(fid: number) {
  return fid > 0 ? { controle: fid } : {};
}

export function FornecedorPortalPage() {
  const { user, ready } = useAdminAuth();
  const navigate = useNavigate({ from: FornecedoresRoute.fullPath });
  const search = FornecedoresRoute.useSearch();
  const status = search.status ?? "todas";
  const verId = search.ver ?? 0;
  const controleUrl = search.controle ?? 0;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [fornecedorId, setFornecedorId] = useState(0);
  const [entregas, setEntregas] = useState<EntregaListaRow[]>([]);
  const [detalhe, setDetalhe] = useState<EntregaDetalhe | null>(null);
  const [materiais, setMateriais] = useState<MaterialLiberadoRow[]>([]);
  const [carrinho, setCarrinho] = useState<CarrinhoItemEntrega[]>([]);
  const [confirmandoPagId, setConfirmandoPagId] = useState(0);
  const fid = fornecedorId || controleUrl || user?.fornecedorPreviewId || 0;
  const baseSearch = controleSearch(fid);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const data = await fetchFornecedorPortal({
        controle: controleUrl > 0 ? controleUrl : undefined,
        status: status === "todas" ? "todas" : status,
        ver: verId > 0 ? verId : undefined,
      });
      if (data.erro === "sem_vinculo") {
        setFornecedorId(0);
        setErro("sem_vinculo");
        return;
      }
      setFornecedorId(data.fornecedor_id);
      setNomeEmpresa(data.nome_empresa ?? "");
      if (data.entrega) {
        setDetalhe(data.entrega);
        setEntregas([]);
        setMateriais([]);
        setCarrinho([]);
      } else {
        setDetalhe(null);
        setEntregas(data.entregas ?? []);
        setMateriais(data.materiais ?? []);
        setCarrinho(data.carrinho ?? []);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [controleUrl, status, verId]);

  useEffect(() => {
    if (!ready) return;
    if (user && user.visao !== "fornecedor") {
      void navigate({ to: "/painel" });
      return;
    }
    void load();
  }, [load, ready, user, navigate]);

  useEffect(() => {
    document.body.classList.add("dashboard-page--fornecedores");
    return () => document.body.classList.remove("dashboard-page--fornecedores");
  }, []);

  const titulo = nomeEmpresa || "Minhas entregas";

  async function confirmarRecebimentoPagamento(entregaId: number) {
    const ok = await dashConfirm({
      title: "Confirmar recebimento do pagamento?",
      message: `Confirma que sua empresa já recebeu o pagamento da nota ${entregaNumeroNota(entregaId)}? Esta ação fica registrada no sistema.`,
      confirmText: "Sim, recebi o pagamento",
      variant: "success",
      icon: "bi-cash-coin",
    });
    if (!ok) return;
    setConfirmandoPagId(entregaId);
    try {
      const res = await postFornecedorPortalAction(
        { action: "confirmar_pagamento", entrega_id: entregaId },
        controleUrl > 0 ? controleUrl : undefined,
      );
      dashToast(res.message, res.ok ? "success" : "danger");
      if (res.ok) void load();
    } catch (e) {
      dashToast(e instanceof Error ? e.message : "Erro ao confirmar.", "danger");
    } finally {
      setConfirmandoPagId(0);
    }
  }

  return (
    <div className="analytics-page dash-form-page--pro dashboard-page--fornecedores">
      <DashPageHero
        title={titulo}
        subtitle="Envie notas de entrega de materiais à Alex Calhas."
        iconClass="bi-truck"
        accent="fornecedores"
        layout="header"
        showNovaVisita={false}
        cta={
          <Link
            to="/painel/inicio-fornecedor"
            search={baseSearch}
            className="analytics-btn analytics-btn--outline analytics-btn--sm"
          >
            <i className="bi bi-house-door" aria-hidden="true" /> Início
          </Link>
        }
      />

      <div className="dash-page-body dash-page-body--with-header">
        {erro === "sem_vinculo" ? (
          <div className="alert alert-danger" role="alert">
            <strong>Conta sem empresa vinculada.</strong> Peça ao administrador para vincular seu
            usuário ao fornecedor em Usuários.
          </div>
        ) : null}
        {erro && erro !== "sem_vinculo" ? (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        ) : null}
        {loading ? <p className="text-muted py-3">Carregando…</p> : null}

        {!loading && !erro && detalhe ? (
          <section className="dash-form-card mb-3 forn-entrega-detalhe forn-entrega-detalhe--fornecedor">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <h2 className="dash-form-block__title h5 mb-1">{entregaNumeroNota(detalhe.id)}</h2>
                <p className="mb-0 text-muted small">
                  <strong>{fornecedorRotuloEmpresa(detalhe)}</strong>
                </p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="analytics-btn analytics-btn--outline analytics-btn--sm"
                  onClick={() => abrirNotaEntrega(detalhe.id)}
                >
                  <i className="bi bi-file-text" aria-hidden="true" /> Ver nota
                </button>
                <button
                  type="button"
                  className="analytics-btn analytics-btn--outline analytics-btn--sm"
                  onClick={() => abrirNotaEntrega(detalhe.id, { print: true })}
                >
                  <i className="bi bi-printer" aria-hidden="true" /> Imprimir
                </button>
                <Link
                  to="/painel/fornecedores"
                  search={baseSearch}
                  className="analytics-btn analytics-btn--outline analytics-btn--sm"
                >
                  Fechar
                </Link>
              </div>
            </div>
            {detalhe.qtd_itens_pago_aguard_conf > 0 ? (
              <div className="dash-entregas-alerta dash-entregas-alerta--destaque mb-3" role="status">
                <div className="dash-entregas-alerta__text">
                  <i className="bi bi-cash-coin" aria-hidden="true" /> A Alex Calhas informou o pagamento
                  desta nota. Confirme quando o valor cair na conta da sua empresa.
                </div>
                <button
                  type="button"
                  className="analytics-btn analytics-btn--primary analytics-btn--sm"
                  disabled={confirmandoPagId === detalhe.id}
                  onClick={() => void confirmarRecebimentoPagamento(detalhe.id)}
                >
                  <i className="bi bi-check2-circle" aria-hidden="true" />{" "}
                  {confirmandoPagId === detalhe.id
                    ? "Confirmando…"
                    : "Confirmar recebimento do pagamento"}
                </button>
              </div>
            ) : null}
            <div className="d-flex flex-wrap gap-2 mb-3">
              {badgePagamentoFornecedor(detalhe)}
              {detalhe.status === "recebido" || detalhe.status === "parcial" ? (
                <span className="badge text-bg-success">Recebida pela Alex Calhas</span>
              ) : (
                <span className="badge text-bg-warning">Aguardando conferência</span>
              )}
            </div>
            <div className="table-responsive">
              <table className="table inv-data-table table-sm align-middle mb-0 forn-entrega-itens-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="text-end">Metros</th>
                    <th className="text-end">R$/metro</th>
                    <th className="text-end">Total</th>
                    <th>Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.itens.map((item) => (
                    <tr key={item.id}>
                      <td>{item.material_nome}</td>
                      <td className="text-end">{formatMoeda(item.metros)}</td>
                      <td className="text-end">R$ {formatMoeda(item.valor_unitario)}</td>
                      <td className="text-end">
                        <strong>R$ {formatMoeda(item.total)}</strong>
                      </td>
                      <td>
                        {!item.recebido ? (
                          <span className="text-muted small">Aguardando recebimento</span>
                        ) : item.pagamento_status !== "pago" ? (
                          <span className="forn-entrega-badge forn-entrega-badge--pg-pend">
                            Pendente
                          </span>
                        ) : item.pagamento_confirmado_forn ? (
                          <span className="forn-entrega-badge forn-entrega-badge--pago">
                            Confirmado
                          </span>
                        ) : (
                          <span className="forn-entrega-badge forn-entrega-badge--aguard-conf">
                            Aguard. confirmação
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="forn-entrega-itens-table__foot">
                  <tr className="forn-entrega-itens-table__total-row">
                    <td colSpan={3} className="text-end">
                      <strong>Total nota</strong>
                    </td>
                    <td className="text-end forn-entrega-itens-table__total-valor">
                      <strong>R$ {formatMoeda(detalhe.total_geral)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ) : null}

        {!loading && !erro && !detalhe ? (
          <>
            <FornecedorNovaEntregaSection
              fornecedorId={fornecedorId}
              controleUrl={controleUrl}
              materiais={materiais}
              carrinho={carrinho}
              onCarrinhoChange={setCarrinho}
              onEnviado={() => {
                void navigate({
                  to: "/painel/fornecedores",
                  search: { ...baseSearch, status: "enviado" },
                });
                void load();
              }}
            />

            <div className="forn-entrega-filtros mb-3" role="tablist" aria-label="Filtrar entregas">
              <Link
                to="/painel/fornecedores"
                search={{ ...baseSearch, status: "enviado" }}
                className={`analytics-btn analytics-btn--sm${status === "enviado" ? " analytics-btn--primary" : " analytics-btn--outline"}`}
              >
                <i className="bi bi-hourglass-split" aria-hidden="true" /> Aguardando
              </Link>
              <Link
                to="/painel/fornecedores"
                search={{ ...baseSearch, status: "recebido" }}
                className={`analytics-btn analytics-btn--sm${status === "recebido" ? " analytics-btn--primary" : " analytics-btn--outline"}`}
              >
                <i className="bi bi-check2-circle" aria-hidden="true" /> Recebidas
              </Link>
              <Link
                to="/painel/fornecedores"
                search={{ ...baseSearch, status: "todas" }}
                className={`analytics-btn analytics-btn--sm${status === "todas" ? " analytics-btn--primary" : " analytics-btn--outline"}`}
              >
                Todas
              </Link>
            </div>

            {entregas.length === 0 ? (
              <div className="inv-empty-state mb-4" role="status">
                <div className="inv-empty-state__icon inv-empty-state__icon--fornecedores">
                  <i className="bi bi-inbox" aria-hidden="true" />
                </div>
                <h2 className="inv-empty-state__title">Nenhuma entrega por aqui</h2>
                <p className="inv-empty-state__text">Nenhuma nota neste filtro.</p>
              </div>
            ) : (
              <div className="inv-table-shell mb-4">
                <div className="table-responsive">
                  <table className="table inv-data-table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Nota</th>
                        <th>Data</th>
                        <th className="text-end">Itens</th>
                        <th className="text-end">Total</th>
                        <th>Status</th>
                        <th>Pagamento</th>
                        <th className="inv-col-actions text-end">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregas.map((ent) => (
                        <tr key={ent.id}>
                          <td>
                            <strong>{entregaNumeroNota(ent.id)}</strong>
                          </td>
                          <td>
                            <small>{formatDataHora(ent.enviado_em)}</small>
                          </td>
                          <td className="text-end">{ent.qtd_itens}</td>
                          <td className="text-end">R$ {formatMoeda(ent.total_valor)}</td>
                          <td>
                            {ent.status === "recebido" ? (
                              <span className="badge text-bg-success">Recebida</span>
                            ) : (
                              <span className="badge text-bg-warning">Aguardando</span>
                            )}
                          </td>
                          <td>{badgePagamentoFornecedor(ent)}</td>
                          <td className="text-end inv-col-actions">
                            <div className="inv-action-group inv-action-group--row-end forn-portal-entregas-actions">
                              {ent.qtd_itens_pago_aguard_conf > 0 ? (
                                <button
                                  type="button"
                                  className="inv-action-btn inv-action-btn--confirm"
                                  title="Confirmar recebimento do pagamento"
                                  aria-label="Confirmar recebimento do pagamento"
                                  disabled={confirmandoPagId === ent.id}
                                  onClick={() => void confirmarRecebimentoPagamento(ent.id)}
                                >
                                  <i
                                    className={`bi ${confirmandoPagId === ent.id ? "bi-arrow-repeat forn-portal-action-spin" : "bi-check2-circle"}`}
                                    aria-hidden="true"
                                  />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="inv-action-btn inv-action-btn--secondary"
                                title="Ver nota de entrega"
                                aria-label="Ver nota de entrega"
                                onClick={() => abrirNotaEntrega(ent.id)}
                              >
                                <i className="bi bi-file-text" aria-hidden="true" />
                              </button>
                              <Link
                                to="/painel/fornecedores"
                                search={{ ...baseSearch, ver: ent.id, status }}
                                className="inv-action-btn inv-action-btn--secondary"
                                title="Ver detalhes"
                                aria-label="Ver detalhes da nota"
                              >
                                <i className="bi bi-eye" aria-hidden="true" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
