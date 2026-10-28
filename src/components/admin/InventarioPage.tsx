import { Link } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { DashPageHero } from "@/components/admin/DashPageHero";
import {
  EnderecoCell,
  INVENTARIO_PER_PAGE,
  InvActionBtn,
  InvPagination,
  InvRecebidoCell,
  InvRowActions,
  ListingHeaderMeta,
  ObservacaoVisitaCell,
  paginateItems,
  TelefoneCell,
  VisitaDataCell,
  VisitaDataHoraCell,
  VisitaHoraCell,
} from "@/components/admin/inventario-ui";
import {
  dataReferenciaAtraso,
  diasAtrasoPagamento,
  horaParaExibicaoVisita,
  labelDiasAtraso,
  ordenarInventarioPorAtraso,
  ordenarInventarioPorMontagem,
  ordenarInventarioPorVisita,
} from "@/lib/inventario-format";
import { ModalConfirmarMontagem } from "@/components/admin/modals/ModalConfirmarMontagem";
import { ModalFinalizarServico } from "@/components/admin/modals/ModalFinalizarServico";
import { ModalEditarCliente } from "@/components/admin/modals/ModalEditarCliente";
import { ModalOrcamento } from "@/components/admin/modals/ModalOrcamento";
import { ClienteDashModal } from "@/components/admin/modals/ClienteDashModal";
import { ModalRecebimentos } from "@/components/admin/modals/ModalRecebimentos";
import { dashConfirm, dashToast } from "@/lib/dash-ui";
import {
  deleteAgendamento,
  fetchAgendamentos,
  type AgendamentoItem,
} from "@/lib/admin-api";
import { INVENTARIO_LISTING_META } from "@/lib/inventario-listing-meta";
import {
  abrirWhatsappCobranca,
  abrirWhatsappMontagem,
  abrirWhatsappOrcamento,
  abrirWhatsappVisita,
  gerarOS,
} from "@/lib/whatsapp-orcamento";
export type InventarioVariant = "visitas" | "orcamentado" | "confirmado" | "finalizado" | "pendencias";

const STATUS_FILTER: Record<InventarioVariant, string> = {
  visitas: "agendado",
  orcamentado: "orcamentado",
  confirmado: "confirmado",
  finalizado: "finalizado",
  pendencias: "pendencias",
};

function normalizarBusca(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function MateriaisDetalhes({ item }: { item: AgendamentoItem }) {
  const n = item.materiaisCount ?? item.orcamentoItens?.length ?? 0;
  if (n === 0) return <span className="inv-detail-empty">Sem itens</span>;
  return (
    <span className="inv-detail-chip">
      <i className="bi bi-box-seam" aria-hidden="true" />
      <span>Material ({n})</span>
    </span>
  );
}

function MobileKeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="inv-mobile-kv">
      <span className="inv-mobile-kv__label">{label}</span>
      <span className="inv-mobile-kv__value">{value}</span>
    </div>
  );
}

function AtrasoCell({ item }: { item: AgendamentoItem }) {
  const dias = diasAtrasoPagamento(dataReferenciaAtraso(item));
  const tone = dias >= 7 ? "late" : dias >= 1 ? "warn" : "ok";
  return <span className={`inv-atraso inv-atraso--${tone}`}>{labelDiasAtraso(dias)}</span>;
}

export function InventarioPage({ variant }: { variant: InventarioVariant }) {
  const meta = INVENTARIO_LISTING_META[
    variant === "visitas" ? "agendado" : variant
  ];
  const listingSlug = variant;
  const { user } = useAdminAuth();
  const isAdmin = user?.visao === "admin";

  const [items, setItems] = useState<AgendamentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  const [orcamentoOpen, setOrcamentoOpen] = useState(false);
  const [orcamentoMode, setOrcamentoMode] = useState<"novo" | "editar">("novo");
  const [activeItem, setActiveItem] = useState<AgendamentoItem | null>(null);

  const [editClienteOpen, setEditClienteOpen] = useState(false);
  const [editClienteId, setEditClienteId] = useState<number | null>(null);

  const [montagemOpen, setMontagemOpen] = useState(false);
  const [montagemItem, setMontagemItem] = useState<AgendamentoItem | null>(null);

  const [recebimentosOpen, setRecebimentosOpen] = useState(false);
  const [recebimentosItem, setRecebimentosItem] = useState<AgendamentoItem | null>(null);
  const [fichaItem, setFichaItem] = useState<AgendamentoItem | null>(null);
  const [finalizarOpen, setFinalizarOpen] = useState(false);
  const [finalizarItem, setFinalizarItem] = useState<AgendamentoItem | null>(null);
  const statusFilter = STATUS_FILTER[variant];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(
        await fetchAgendamentos(statusFilter, {
          q: buscaDebounced,
          limit: 1000,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, buscaDebounced]);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscaDebounced(busca.trim()), 350);
    return () => window.clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(() => {
    if (variant === "visitas") return ordenarInventarioPorVisita(items);
    if (variant === "confirmado") return ordenarInventarioPorMontagem(items);
    if (variant === "pendencias") return ordenarInventarioPorAtraso(items);
    return items;
  }, [items, variant]);

  const filteredItems = useMemo(() => {
    const q = normalizarBusca(busca);
    if (!q) return sortedItems;
    return sortedItems.filter((item) => {
      const nome = normalizarBusca(item.nome);
      const telefone = item.telefone.replace(/\D/g, "");
      const id = String(item.id);
      const qDigits = q.replace(/\D/g, "");
      return (
        nome.includes(q) ||
        id.includes(q) ||
        (qDigits.length >= 3 && telefone.includes(qDigits))
      );
    });
  }, [sortedItems, busca]);

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / INVENTARIO_PER_PAGE));
  const pageSafe = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [busca]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => paginateItems(filteredItems, pageSafe, INVENTARIO_PER_PAGE),
    [filteredItems, pageSafe],
  );

  function openOrcamentoNovo(item: AgendamentoItem) {
    setActiveItem(item);
    setOrcamentoMode("novo");
    setOrcamentoOpen(true);
  }

  function openOrcamentoEditar(item: AgendamentoItem) {
    setActiveItem(item);
    setOrcamentoMode("editar");
    setOrcamentoOpen(true);
  }

  function openEditarCliente(id: number) {
    setEditClienteId(id);
    setEditClienteOpen(true);
  }

  function openRecebimentos(item: AgendamentoItem) {
    setRecebimentosItem(item);
    setRecebimentosOpen(true);
  }

  function patchRecebimentosItem(
    id: number,
    patch: Pick<AgendamentoItem, "valorRecebido" | "saldoPendente" | "quitado" | "qtdPagamentos">,
  ) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setRecebimentosItem((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
    setFichaItem((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }

  async function handleCancelar(id: number) {
    if (!isAdmin) {
      setError("Somente admin pode excluir.");
      return;
    }
    if (
      !(await dashConfirm({
        title: "Excluir registro?",
        message: "Excluir este registro?",
        confirmText: "Excluir",
        variant: "danger",
      }))
    ) {
      return;
    }
    try {
      await deleteAgendamento(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  function handleFinalizar(item: AgendamentoItem) {
    setFinalizarItem(item);
    setFinalizarOpen(true);
  }

  async function onOrcamentoSaved(item: AgendamentoItem) {
    if (variant === "visitas") {
      setItems((prev) => prev.filter((r) => r.id !== item.id));
    } else if (
      (variant === "orcamentado" || variant === "confirmado") &&
      orcamentoMode === "editar"
    ) {
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, ...item } : r)));
    } else {
      void load();
    }
    if (
      orcamentoMode === "novo" &&
      (await dashConfirm({
        title: "Enviar no WhatsApp?",
        message: "Orçamento salvo. Deseja enviar o link no WhatsApp?",
        confirmText: "Enviar",
        variant: "success",
        icon: "bi-whatsapp",
      }))
    ) {
      abrirWhatsappOrcamento({
        id: item.id,
        nome: item.nome,
        telefone: item.telefone,
        valor: Number(item.valor),
        osToken: item.osToken,
      });
    }
  }

  function abrirOS(item: AgendamentoItem) {
    gerarOS(item.id, item.osToken);
  }

  function abrirZapOrcamento(item: AgendamentoItem) {
    abrirWhatsappOrcamento({
      id: item.id,
      nome: item.nome,
      telefone: item.telefone,
      valor: Number(item.valor),
      osToken: item.osToken,
    });
  }

  function abrirZapEtapa(item: AgendamentoItem) {
    if (variant === "visitas") {
      abrirWhatsappVisita(item);
      return;
    }
    if (variant === "confirmado") {
      abrirWhatsappMontagem(item);
      return;
    }
    if (variant === "pendencias") {
      abrirWhatsappCobranca({
        nome: item.nome,
        telefone: item.telefone,
        saldo: Number(item.saldoPendente ?? 0),
        diasAtraso: diasAtrasoPagamento(dataReferenciaAtraso(item)),
      });
      return;
    }
    abrirZapOrcamento(item);
  }

  function renderActions(item: AgendamentoItem) {
    if (variant === "visitas") {
      return (
        <InvRowActions
          ariaLabel={`Mais ações #${item.id}`}
          primary={
            <>
              <InvActionBtn
                icon="bi-whatsapp"
                title="Avisar que estamos a caminho"
                variant="whatsapp"
                onClick={() => abrirWhatsappVisita(item)}
              />
              <InvActionBtn
                icon="bi-check-lg"
                title="Preencher orçamento e enviar"
                onClick={() => openOrcamentoNovo(item)}
              />
            </>
          }
          menu={[
            {
              label: "Avisar visita no WhatsApp",
              icon: "bi-whatsapp",
              onClick: () => abrirWhatsappVisita(item),
            },
            {
              label: "Editar",
              icon: "bi-pencil-square",
              className: "inv-dropdown-item--edit",
              onClick: () => openEditarCliente(item.id),
            },
            ...(isAdmin
              ? [{ label: "Cancelar", icon: "bi-trash", onClick: () => void handleCancelar(item.id) }]
              : []),
          ]}
        />
      );
    }

    if (variant === "orcamentado") {
      const primary = (
        <>
          <InvActionBtn
            icon="bi-cash-coin"
            title="Registrar entrada"
            variant="secondary"
            onClick={() => openRecebimentos(item)}
          />
          <InvActionBtn
            icon="bi-check-lg"
            title="Confirmar montagem"
            onClick={() => {
              setMontagemItem(item);
              setMontagemOpen(true);
            }}
          />
          <InvActionBtn icon="bi-file-text" title="Ver orçamento (OS)" variant="secondary" onClick={() => abrirOS(item)} />
          <InvActionBtn
            icon="bi-whatsapp"
            title="Enviar orçamento no WhatsApp"
            variant="whatsapp"
            onClick={() => abrirZapOrcamento(item)}
          />
        </>
      );
      const menu = [
        {
          label: "Ver orçamento",
          icon: "bi-file-text",
          onClick: () => abrirOS(item),
        },
        {
          label: "Pagamentos",
          icon: "bi-cash-coin",
          onClick: () => openRecebimentos(item),
        },
        {
          label: "Ficha do cliente",
          icon: "bi-eye",
          onClick: () => setFichaItem(item),
        },
        {
          label: "Editar",
          icon: "bi-pencil-square",
          className: "inv-dropdown-item--edit",
          onClick: () => openEditarCliente(item.id),
        },
        ...(isAdmin
          ? [
              {
                label: "Editar orçamento",
                icon: "bi-receipt",
                onClick: () => openOrcamentoEditar(item),
              },
              { label: "Excluir", icon: "bi-trash", onClick: () => void handleCancelar(item.id) },
            ]
          : []),
      ];
      return <InvRowActions ariaLabel={`Mais ações #${item.id}`} primary={primary} menu={menu} />;
    }

    if (variant === "confirmado") {
      const primary = (
        <>
          <InvActionBtn
            icon="bi-cash-coin"
            title="Registrar entrada"
            variant="secondary"
            onClick={() => openRecebimentos(item)}
          />
          <InvActionBtn
            icon="bi-check-lg"
            title="Finalizar"
            onClick={() => handleFinalizar(item)}
          />
          <InvActionBtn icon="bi-file-text" title="Ver orçamento (OS)" variant="secondary" onClick={() => abrirOS(item)} />
          <InvActionBtn
            icon="bi-whatsapp"
            title="Avisar data da montagem"
            variant="whatsapp"
            onClick={() => abrirWhatsappMontagem(item)}
          />
        </>
      );
      return (
        <InvRowActions
          ariaLabel={`Mais ações #${item.id}`}
          primary={primary}
          menu={[
            {
              label: "Ver orçamento",
              icon: "bi-file-text",
              onClick: () => abrirOS(item),
            },
            {
              label: "Pagamentos",
              icon: "bi-cash-coin",
              onClick: () => openRecebimentos(item),
            },
            {
              label: "Ficha do cliente",
              icon: "bi-eye",
              onClick: () => setFichaItem(item),
            },
            {
              label: "Editar",
              icon: "bi-pencil-square",
              className: "inv-dropdown-item--edit",
              onClick: () => openEditarCliente(item.id),
            },
            ...(isAdmin
              ? [
                  {
                    label: "Editar orçamento",
                    icon: "bi-receipt",
                    onClick: () => openOrcamentoEditar(item),
                  },
                  { label: "Excluir", icon: "bi-trash", onClick: () => void handleCancelar(item.id) },
                ]
              : []),
          ]}
        />
      );
    }

    if (variant === "pendencias") {
      const dias = diasAtrasoPagamento(dataReferenciaAtraso(item));
      const saldo = Number(item.saldoPendente ?? 0);
      const primary = (
        <>
          <InvActionBtn
            icon="bi-whatsapp"
            title="Cobrar no WhatsApp"
            variant="whatsapp"
            onClick={() =>
              abrirWhatsappCobranca({
                nome: item.nome,
                telefone: item.telefone,
                saldo,
                diasAtraso: dias,
              })
            }
          />
          <InvActionBtn
            icon="bi-cash-coin"
            title="Registrar pagamento"
            variant="secondary"
            onClick={() => openRecebimentos(item)}
          />
          <InvActionBtn icon="bi-file-text" title="Ver orçamento (OS)" variant="secondary" onClick={() => abrirOS(item)} />
        </>
      );
      return (
        <InvRowActions
          ariaLabel={`Mais ações #${item.id}`}
          primary={primary}
          menu={[
            {
              label: "Cobrar no WhatsApp",
              icon: "bi-whatsapp",
              onClick: () =>
                abrirWhatsappCobranca({
                  nome: item.nome,
                  telefone: item.telefone,
                  saldo,
                  diasAtraso: dias,
                }),
            },
            {
              label: "Registrar pagamento",
              icon: "bi-cash-coin",
              onClick: () => openRecebimentos(item),
            },
            {
              label: "Ver orçamento",
              icon: "bi-file-text",
              onClick: () => abrirOS(item),
            },
            {
              label: "Ficha do cliente",
              icon: "bi-eye",
              onClick: () => setFichaItem(item),
            },
            {
              label: "Editar",
              icon: "bi-pencil-square",
              className: "inv-dropdown-item--edit",
              onClick: () => openEditarCliente(item.id),
            },
            ...(isAdmin
              ? [{ label: "Excluir", icon: "bi-trash", onClick: () => void handleCancelar(item.id) }]
              : []),
          ]}
        />
      );
    }

    const primary = (
      <>
        <InvActionBtn icon="bi-file-text" title="Ver orçamento (OS)" variant="secondary" onClick={() => abrirOS(item)} />
        <InvActionBtn
          icon="bi-whatsapp"
          title="Enviar OS no WhatsApp"
          variant="whatsapp"
          onClick={() => abrirZapOrcamento(item)}
        />
      </>
    );
    return (
      <InvRowActions
        ariaLabel={`Mais ações #${item.id}`}
        primary={primary}
        menu={[
          {
            label: "Ver orçamento",
            icon: "bi-file-text",
            onClick: () => abrirOS(item),
          },
          {
            label: "Ficha do cliente",
            icon: "bi-eye",
            onClick: () => setFichaItem(item),
          },
          {
            label: "Editar",
            icon: "bi-pencil-square",
            className: "inv-dropdown-item--edit",
            onClick: () => openEditarCliente(item.id),
          },
          ...(isAdmin
            ? [{ label: "Excluir", icon: "bi-trash", onClick: () => void handleCancelar(item.id) }]
            : []),
        ]}
      />
    );
  }

  const showVisita = variant === "visitas";
  const showValor = variant !== "visitas";
  const showRecebido = variant === "orcamentado" || variant === "confirmado" || variant === "pendencias";
  const showMontagem = variant === "confirmado";
  const showAtraso = variant === "pendencias";
  const showDetalhes = variant === "orcamentado";

  const pageCta =
    variant === "visitas" ? (
      <Link to="/painel/agendar" className="analytics-btn analytics-btn--primary analytics-btn--sm">
        <i className="bi bi-calendar4-range" aria-hidden="true" /> Agendar visita
      </Link>
    ) : variant === "orcamentado" ? (
      <Link to="/painel/visitas" className="analytics-btn analytics-btn--primary analytics-btn--sm">
        <i className="bi bi-person-plus" aria-hidden="true" /> Novo orçamento
      </Link>
    ) : null;

  return (
    <div className={`analytics-page dash-form-page--pro dashboard-page--${listingSlug}`}>
      {fichaItem ? (
        <ClienteDashModal
          open
          onClose={() => setFichaItem(null)}
          item={fichaItem}
          onPagamentoSalvo={(patch) => patchRecebimentosItem(fichaItem.id, patch)}
        />
      ) : (
      <>
      <DashPageHero
        title={meta.title}
        subtitle={meta.subtitle}
        iconClass={meta.icon}
        accent={listingSlug}
        headerMeta={
          loading ? null : (
            <ListingHeaderMeta total={total} page={pageSafe} totalPages={totalPages} />
          )
        }
        cta={pageCta}
        showNovaVisita={pageCta != null}
      />
      <div className="dash-page-body dash-page-body--with-header dash-page-body--solo">
        <div className={`dashboard-listing inv-listing inv-listing--${listingSlug}`}>
          {error ? (
            <div className="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 mb-3" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="inv-empty-state d-flex justify-content-center py-5">
              <Loader2 className="spin text-primary" size={32} aria-label="Carregando" />
            </div>
          ) : items.length === 0 ? (
            <div className="inv-empty-state" role="status">
              <div className={`inv-empty-state__icon inv-empty-state__icon--${listingSlug}`}>
                <i className={`bi ${meta.icon}`} aria-hidden="true" />
              </div>
              <h2 className="inv-empty-state__title">{meta.emptyTitle}</h2>
              <p className="inv-empty-state__text">{meta.emptyText}</p>
            </div>
          ) : (
            <>
              <div className="inv-search-bar">
                <label className="inv-search-bar__field" htmlFor={`inv-busca-${listingSlug}`}>
                  <i className="bi bi-search" aria-hidden="true" />
                  <input
                    id={`inv-busca-${listingSlug}`}
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome do cliente…"
                    autoComplete="off"
                  />
                  {busca ? (
                    <button
                      type="button"
                      className="inv-search-bar__clear"
                      onClick={() => setBusca("")}
                      aria-label="Limpar busca"
                      title="Limpar"
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  ) : null}
                </label>
                {busca.trim() ? (
                  <span className="inv-search-bar__hint" role="status">
                    {total === 0
                      ? "Nenhum resultado"
                      : `${total} resultado${total === 1 ? "" : "s"}`}
                  </span>
                ) : null}
              </div>

              {filteredItems.length === 0 ? (
                <div className="inv-empty-state" role="status">
                  <div className={`inv-empty-state__icon inv-empty-state__icon--${listingSlug}`}>
                    <i className="bi bi-search" aria-hidden="true" />
                  </div>
                  <h2 className="inv-empty-state__title">Nenhum cliente encontrado</h2>
                  <p className="inv-empty-state__text">
                    Não achamos ninguém com “{busca.trim()}”. Tente outro nome.
                  </p>
                  <div className="inv-empty-state__actions">
                    <button
                      type="button"
                      className="analytics-btn analytics-btn--outline analytics-btn--sm"
                      onClick={() => setBusca("")}
                    >
                      Limpar busca
                    </button>
                  </div>
                </div>
              ) : (
                <>
              <div className="dashboard-data-desktop inv-table-shell">
                <div className="table-responsive inv-table-scroll">
                  <table
                    className={`table inv-data-table inv-data-table--balanced align-middle mb-0${showVisita ? " inv-data-table--visitas" : ""}`}
                  >
                    <thead>
                      <tr>
                        <th className="inv-col-id">ID</th>
                        <th className="inv-col-cliente">Cliente</th>
                        <th className="inv-col-telefone">Telefone</th>
                        <th className="inv-col-endereco">Endereço</th>
                        {showVisita ? <th className="inv-col-datetime">Data / Hora</th> : null}
                        {showVisita ? <th className="inv-col-observacao">Observação</th> : null}
                        {showMontagem ? <th className="inv-col-montagem">Montagem</th> : null}
                        {showAtraso ? <th className="inv-col-atraso">Atraso</th> : null}
                        {showValor ? <th className="inv-col-valor">Valor</th> : null}
                        {showRecebido ? <th className="inv-col-recebido">Recebido</th> : null}
                        {showDetalhes ? <th className="inv-col-detalhes">Detalhes</th> : null}
                        <th className="inv-col-actions">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item) => (
                        <tr key={item.id} className="inv-data-row">
                          <th scope="row" className="inv-col-id">
                            <span className="inv-id-badge">#{item.id}</span>
                          </th>
                          <td className="inv-col-cliente">
                            <span className="inv-cliente-cell">
                              {!showVisita ? (
                                <button
                                  type="button"
                                  className="cli-eye"
                                  title="Abrir ficha do cliente"
                                  aria-label={`Abrir ficha de ${item.nome}`}
                                  onClick={() => setFichaItem(item)}
                                >
                                  <i className="bi bi-eye" aria-hidden="true" />
                                </button>
                              ) : null}
                              <span className="inv-cliente-nome">{item.nome}</span>
                            </span>
                          </td>
                          <td className="inv-col-telefone">
                            <TelefoneCell
                              telefone={item.telefone}
                              title={
                                variant === "visitas"
                                  ? "Avisar que estamos a caminho"
                                  : variant === "confirmado"
                                    ? "Avisar data da montagem"
                                    : variant === "pendencias"
                                      ? "Cobrar no WhatsApp"
                                      : "Chamar no WhatsApp"
                              }
                              onWhatsApp={() => abrirZapEtapa(item)}
                            />
                          </td>
                          <td className="inv-col-endereco inv-col-endereco--compact">
                            <EnderecoCell item={item} />
                          </td>
                          {showVisita ? (
                            <td className="inv-col-datetime">
                              <VisitaDataHoraCell
                                data={item.dataVisita}
                                hora={horaParaExibicaoVisita(item)}
                              />
                            </td>
                          ) : null}
                          {showVisita ? (
                            <td className="inv-col-observacao">
                              <ObservacaoVisitaCell texto={item.observacao} />
                            </td>
                          ) : null}
                          {showMontagem ? (
                            <td className="inv-col-montagem">{item.dataMontagem || "—"}</td>
                          ) : null}
                          {showAtraso ? (
                            <td className="inv-col-atraso">
                              <AtrasoCell item={item} />
                            </td>
                          ) : null}
                          {showValor ? (
                            <td className="inv-col-valor">
                              <span className="inv-valor-tag">
                                {Number(item.valor).toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </span>
                            </td>
                          ) : null}
                          {showRecebido ? (
                            <td className="inv-col-recebido">
                              <InvRecebidoCell
                                valorOrcamento={Number(item.valor)}
                                valorRecebido={item.valorRecebido}
                                saldoPendente={item.saldoPendente}
                                quitado={item.quitado}
                                qtdPagamentos={item.qtdPagamentos}
                                onClick={() => openRecebimentos(item)}
                              />
                            </td>
                          ) : null}
                          {showDetalhes ? (
                            <td className="inv-col-detalhes">
                              <MateriaisDetalhes item={item} />
                            </td>
                          ) : null}
                          <td className="inv-col-actions">{renderActions(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dashboard-data-mobile inv-cards" aria-label={`${meta.title} (modo celular)`}>
                {pageItems.map((item) => (
                  <article key={item.id} className="inv-card">
                    <header className="inv-card__head">
                      <div className="inv-card__title">
                        <span className="inv-id-badge">#{item.id}</span>
                        <span className="inv-cliente-cell">
                          {!showVisita ? (
                            <button
                              type="button"
                              className="cli-eye"
                              title="Abrir ficha do cliente"
                              aria-label={`Abrir ficha de ${item.nome}`}
                              onClick={() => setFichaItem(item)}
                            >
                              <i className="bi bi-eye" aria-hidden="true" />
                            </button>
                          ) : null}
                          <strong className="inv-card__name">{item.nome}</strong>
                        </span>
                      </div>
                      <div className="inv-card__actions">{renderActions(item)}</div>
                    </header>

                    <div className="inv-card__body">
                      <MobileKeyValue
                        label="Telefone"
                        value={
                          <TelefoneCell
                            telefone={item.telefone}
                            title={
                              variant === "visitas"
                                ? "Avisar que estamos a caminho"
                                : variant === "confirmado"
                                  ? "Avisar data da montagem"
                                  : variant === "pendencias"
                                    ? "Cobrar no WhatsApp"
                                    : "Chamar no WhatsApp"
                            }
                            onWhatsApp={() => abrirZapEtapa(item)}
                          />
                        }
                      />
                      <MobileKeyValue label="Endereço" value={<EnderecoCell item={item} />} />
                      {showVisita ? (
                        <>
                          <MobileKeyValue label="Data" value={<VisitaDataCell data={item.dataVisita} />} />
                          <MobileKeyValue
                            label="Hora"
                            value={<VisitaHoraCell hora={horaParaExibicaoVisita(item)} />}
                          />
                          <MobileKeyValue
                            label="Observação"
                            value={<ObservacaoVisitaCell texto={item.observacao} />}
                          />
                        </>
                      ) : null}
                      {showMontagem ? (
                        <MobileKeyValue label="Montagem" value={item.dataMontagem || "—"} />
                      ) : null}
                      {showAtraso ? (
                        <MobileKeyValue label="Atraso" value={<AtrasoCell item={item} />} />
                      ) : null}
                      {showValor ? (
                        <MobileKeyValue
                          label="Valor"
                          value={
                            <span className="inv-valor-tag">
                              {Number(item.valor).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </span>
                          }
                        />
                      ) : null}
                      {showRecebido ? (
                        <MobileKeyValue
                          label="Recebido"
                          value={
                            <InvRecebidoCell
                              valorOrcamento={Number(item.valor)}
                              valorRecebido={item.valorRecebido}
                              saldoPendente={item.saldoPendente}
                              quitado={item.quitado}
                              qtdPagamentos={item.qtdPagamentos}
                              onClick={() => openRecebimentos(item)}
                            />
                          }
                        />
                      ) : null}
                      {showDetalhes ? <MobileKeyValue label="Detalhes" value={<MateriaisDetalhes item={item} />} /> : null}
                    </div>
                  </article>
                ))}
              </div>

              <InvPagination
                page={pageSafe}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
              />
                </>
              )}
            </>
          )}
        </div>
      </div>
      </>
      )}

      <ModalOrcamento
        open={orcamentoOpen}
        onClose={() => setOrcamentoOpen(false)}
        inventarioId={activeItem?.id ?? null}
        clienteNome={activeItem?.nome}
        cpfInicial={activeItem?.cpfCnpj ?? ""}
        mode={orcamentoMode}
        onSaved={onOrcamentoSaved}
      />
      <ModalEditarCliente
        open={editClienteOpen}
        onClose={() => setEditClienteOpen(false)}
        inventarioId={editClienteId}
        onSaved={(item) => {
          setItems((prev) => prev.map((r) => (r.id === item.id ? item : r)));
        }}
      />
      <ModalConfirmarMontagem
        open={montagemOpen}
        onClose={() => {
          setMontagemOpen(false);
          setMontagemItem(null);
        }}
        item={montagemItem}
        onSaved={() => {
          setItems((prev) => prev.filter((r) => r.id !== montagemItem?.id));
        }}
      />
      <ModalRecebimentos
        open={recebimentosOpen}
        onClose={() => {
          setRecebimentosOpen(false);
          setRecebimentosItem(null);
        }}
        item={recebimentosItem}
        onSaved={(patch) => {
          if (!recebimentosItem) return;
          if (variant === "pendencias" && (patch.quitado || (patch.saldoPendente ?? 0) <= 0.009)) {
            setItems((prev) => prev.filter((r) => r.id !== recebimentosItem.id));
            return;
          }
          patchRecebimentosItem(recebimentosItem.id, patch);
        }}
      />
      <ModalFinalizarServico
        open={finalizarOpen}
        item={finalizarItem}
        onClose={() => {
          setFinalizarOpen(false);
          setFinalizarItem(null);
        }}
        onSaved={() => {
          setItems((prev) => prev.filter((r) => r.id !== finalizarItem?.id));
        }}
      />
    </div>
  );
}
