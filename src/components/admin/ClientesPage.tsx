import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { DashPageHero } from "@/components/admin/DashPageHero";
import { ModalEditarCliente } from "@/components/admin/modals/ModalEditarCliente";
import { Route as ClientesRoute } from "@/routes/painel/clientes";
import {
  fetchClienteDetalhe,
  fetchClientes,
  type ClienteDetalhe,
  type ClienteHistoricoItem,
  type ClienteResumo,
} from "@/lib/clientes-client";
import { EnderecoLink, EnderecoPartsCell, TelefoneCell } from "@/components/admin/inventario-ui";
import { telefoneWhatsappLink } from "@/lib/format-br";

function docValido(cpf: string | null): boolean {
  if (!cpf?.trim()) return false;
  const d = cpf.replace(/\D/g, "");
  return d.length > 0 && d !== "00000000000";
}

function formatDoc(cpf: string | null): string {
  if (!cpf || !docValido(cpf)) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return cpf;
}

function statusBadge(c: ClienteResumo) {
  const parts: { key: string; cls: string; label: string }[] = [];
  if (c.qtd_agendado > 0) parts.push({ key: "a", cls: "cli-inv-badge--pend", label: `${c.qtd_agendado} agend.` });
  if (c.qtd_orcamentado > 0) parts.push({ key: "o", cls: "cli-inv-badge--orc", label: `${c.qtd_orcamentado} orç.` });
  if (c.qtd_confirmado > 0) parts.push({ key: "c", cls: "cli-inv-badge--ok", label: `${c.qtd_confirmado} conf.` });
  if (c.qtd_finalizado > 0) parts.push({ key: "f", cls: "cli-inv-badge--fin", label: `${c.qtd_finalizado} fin.` });
  if (parts.length === 0) return <span className="cli-inv-badge cli-inv-badge--muted">—</span>;
  return (
    <span className="d-flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p.key} className={`cli-inv-badge ${p.cls}`}>
          {p.label}
        </span>
      ))}
    </span>
  );
}

function historicoStatusBadge(status: string) {
  const s = status.toLowerCase().replace("ç", "c");
  let cls = "cli-inv-badge--muted";
  if (s === "agendado") cls = "cli-inv-badge--pend";
  else if (s === "orcamentado") cls = "cli-inv-badge--orc";
  else if (s === "confirmado") cls = "cli-inv-badge--ok";
  else if (s === "finalizado") cls = "cli-inv-badge--fin";
  return <span className={`cli-inv-badge ${cls}`}>{status}</span>;
}

function temOrcamento(status: string, valor: number) {
  const s = status.toLowerCase().replace("ç", "c");
  return ["orcamentado", "confirmado", "finalizado"].includes(s) && valor > 0;
}

export function ClientesPage() {
  const navigate = useNavigate({ from: ClientesRoute.fullPath });
  const search = ClientesRoute.useSearch();
  const verId = search.ver ?? 0;
  const pag = search.pag ?? 1;
  const qBusca = search.q ?? "";

  const [qInput, setQInput] = useState(qBusca);
  const [itens, setItens] = useState<ClienteResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [detalhe, setDetalhe] = useState<ClienteDetalhe | null>(null);
  const [historico, setHistorico] = useState<ClienteHistoricoItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const loadLista = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const data = await fetchClientes({ q: qBusca || undefined, pag });
      setItens(data.itens);
      setTotal(data.total);
      setPaginas(data.paginas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, [qBusca, pag]);

  const loadDetalhe = useCallback(async (id: number) => {
    setLoading(true);
    setErro("");
    try {
      const data = await fetchClienteDetalhe(id);
      setDetalhe(data.detalhe);
      setHistorico(data.historico);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar cliente.");
      setDetalhe(null);
      setHistorico([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setQInput(qBusca);
  }, [qBusca]);

  useEffect(() => {
    if (verId > 0) void loadDetalhe(verId);
    else void loadLista();
  }, [verId, loadDetalhe, loadLista]);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    void navigate({ search: { q: qInput.trim() || undefined, pag: 1 } });
  }

  function limparBusca() {
    setQInput("");
    void navigate({ search: {} });
  }

  const title = detalhe ? `Cliente — ${detalhe.nome}` : "Clientes";
  const subtitle = detalhe
    ? "Histórico de visitas, orçamentos e serviços deste cliente."
    : "Cadastro automático a partir dos agendamentos. Edite dados e envie orçamentos pelo WhatsApp.";

  return (
    <div className="analytics-page dash-form-page--pro dashboard-page--clientes">
      <DashPageHero
        title={title}
        subtitle={subtitle}
        iconClass="bi-people"
        accent="clientes"
        layout="header"
        showNovaVisita={false}
        cta={
          verId > 0 ? (
            <Link
              to="/painel/clientes"
              search={{}}
              className="analytics-btn analytics-btn--outline analytics-btn--sm"
            >
              <i className="bi bi-arrow-left" aria-hidden="true" /> Voltar
            </Link>
          ) : undefined
        }
      />

      <div className="dash-page-body dash-page-body--with-header">
        {erro ? (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        ) : null}

        {loading ? <p className="text-muted mb-0 py-3">Carregando…</p> : null}

        {!loading && verId > 0 && detalhe ? (
          <>
            <div className="dash-form-card mb-3 cli-inv-detalhe">
              <div className="row g-3">
                <div className="col-md-6">
                  <p className="mb-1">
                    <strong>{detalhe.nome}</strong>
                  </p>
                  <p className="mb-1">
                    <TelefoneCell telefone={detalhe.telefone} />
                  </p>
                  {docValido(detalhe.cpf_cnpj) ? (
                    <p className="mb-0 small text-muted">CPF/CNPJ: {formatDoc(detalhe.cpf_cnpj)}</p>
                  ) : null}
                </div>
                <div className="col-md-6">
                  <p className="mb-0">
                    <EnderecoPartsCell
                      compact
                      parts={{
                        endereco: detalhe.endereco,
                        numero: detalhe.numero,
                        bairro: detalhe.bairro,
                        cep: detalhe.cep,
                      }}
                    />
                  </p>
                </div>
                <div className="col-12">
                  <button
                    type="button"
                    className="analytics-btn analytics-btn--outline analytics-btn--sm"
                    onClick={() => {
                      setEditId(detalhe.id);
                      setEditOpen(true);
                    }}
                  >
                    <i className="bi bi-pencil-square" aria-hidden="true" /> Editar dados do cliente
                  </button>
                </div>
              </div>
            </div>

            <div className="inv-table-shell mb-3">
              <div className="table-responsive">
                <table className="table inv-data-table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Visita</th>
                      <th className="text-end">Valor</th>
                      <th className="inv-col-actions">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-muted py-4">
                          Nenhum registro.
                        </td>
                      </tr>
                    ) : (
                      historico.map((h) => (
                        <tr key={h.id}>
                          <td>
                            <span className="inv-id-badge">#{h.id}</span>
                          </td>
                          <td>{historicoStatusBadge(h.status)}</td>
                          <td>
                            <small>
                              {h.data_visita} {h.hora_visita}
                            </small>
                          </td>
                          <td className="text-end">
                            {h.valor > 0
                              ? h.valor.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })
                              : "—"}
                          </td>
                          <td className="text-end">
                            <div className="inv-action-group inv-action-group--row-end">
                              {temOrcamento(h.status, h.valor) ? (
                                <>
                                  <a
                                    href={`/os?id=${h.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inv-action-btn inv-action-btn--secondary"
                                    title="Ver orçamento"
                                  >
                                    <i className="bi bi-file-text" aria-hidden="true" />
                                  </a>
                                  <a
                                    href={telefoneWhatsappLink(h.telefone)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inv-action-btn inv-action-btn--whatsapp"
                                    title="WhatsApp"
                                  >
                                    <i className="bi bi-whatsapp" aria-hidden="true" />
                                  </a>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {!loading && !verId ? (
          <>
            <div className="cli-toolbar dash-form-card mb-3">
              <div className="cli-toolbar__head">
                <div className="cli-toolbar__intro">
                  <span className="cli-toolbar__count" aria-label={`${total} clientes`}>
                    {total}
                  </span>
                  <div>
                    <p className="cli-toolbar__title mb-0">Clientes cadastrados</p>
                    <p className="cli-toolbar__hint mb-0">Cada agendamento entra aqui automaticamente</p>
                  </div>
                </div>
                <div className="cli-toolbar__ctas">
                  <Link to="/painel/avisos" className="cli-toolbar__cta cli-toolbar__cta--ghost">
                    <span className="cli-toolbar__cta-icon" aria-hidden="true">
                      <i className="bi bi-megaphone" />
                    </span>
                    <span className="cli-toolbar__cta-text">
                      <strong>Avisar clientes</strong>
                      <small>Mensagem no WhatsApp</small>
                    </span>
                  </Link>
                  <Link to="/painel/agendar" className="cli-toolbar__cta">
                    <span className="cli-toolbar__cta-icon" aria-hidden="true">
                      <i className="bi bi-calendar-plus" />
                    </span>
                    <span className="cli-toolbar__cta-text">
                      <strong>Agendar visita</strong>
                      <small>Novo cliente ou retorno</small>
                    </span>
                    <i className="bi bi-arrow-right cli-toolbar__cta-arrow" aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <form onSubmit={buscar} className="cli-toolbar__search row g-2 align-items-end">
                <div className="col-12 col-lg">
                  <label className="form-label cli-toolbar__label" htmlFor="busca-cliente">
                    Buscar cliente
                  </label>
                  <input
                    type="search"
                    id="busca-cliente"
                    className="form-control cli-toolbar__input"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    placeholder="Nome, telefone, CPF/CNPJ ou endereço…"
                  />
                </div>
                <div className="col-6 col-lg-auto">
                  <button
                    type="submit"
                    className="analytics-btn analytics-btn--primary analytics-btn--sm w-100 cli-toolbar__btn"
                  >
                    <i className="bi bi-search" aria-hidden="true" /> Buscar
                  </button>
                </div>
                <div className="col-6 col-lg-auto">
                  <button
                    type="button"
                    className="analytics-btn analytics-btn--outline analytics-btn--sm w-100 cli-toolbar__btn"
                    onClick={limparBusca}
                  >
                    Limpar
                  </button>
                </div>
              </form>
            </div>

            {itens.length === 0 ? (
              <div className="inv-empty-state" role="status">
                <div className="inv-empty-state__icon inv-empty-state__icon--visitas">
                  <i className="bi bi-people" aria-hidden="true" />
                </div>
                <h2 className="inv-empty-state__title">Nenhum cliente ainda</h2>
                <p className="inv-empty-state__text">
                  Quando alguém agendar uma visita, os dados aparecerão nesta lista.
                </p>
                <div className="inv-empty-state__actions">
                  <Link to="/painel/agendar" className="cli-toolbar__cta cli-toolbar__cta--center">
                    <span className="cli-toolbar__cta-icon" aria-hidden="true">
                      <i className="bi bi-calendar-plus" />
                    </span>
                    <span className="cli-toolbar__cta-text">
                      <strong>Agendar visita</strong>
                      <small>Cadastrar o primeiro cliente</small>
                    </span>
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="inv-table-shell mb-3">
                  <div className="table-responsive">
                    <table className="table inv-data-table inv-data-table--balanced align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Telefone</th>
                          <th>CPF/CNPJ</th>
                          <th>Endereço</th>
                          <th>Serviços</th>
                          <th>Situação</th>
                          <th className="inv-col-actions">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((c) => (
                            <tr key={c.ultimo_id} className="inv-data-row">
                              <td>
                                <span className="inv-cliente-nome">{c.nome}</span>
                              </td>
                              <td className="inv-col-telefone">
                                <TelefoneCell telefone={c.telefone} />
                              </td>
                              <td>{formatDoc(c.cpf_cnpj)}</td>
                              <td className="inv-col-endereco inv-col-endereco--compact">
                                <EnderecoPartsCell
                                  parts={{
                                    endereco: c.endereco,
                                    numero: c.numero,
                                    bairro: c.bairro,
                                    cep: c.cep,
                                  }}
                                />
                              </td>
                              <td>
                                <span className="inv-id-badge">{c.total_servicos}</span>
                              </td>
                              <td>{statusBadge(c)}</td>
                              <td className="inv-col-actions">
                                <div className="inv-action-group inv-action-group--row-end" role="group">
                                  <Link
                                    to="/painel/clientes"
                                    search={{ ver: c.ultimo_id }}
                                    className="inv-action-btn inv-action-btn--primary"
                                    title="Ver histórico"
                                    aria-label="Ver histórico"
                                  >
                                    <i className="bi bi-eye" aria-hidden="true" />
                                  </Link>
                                  <button
                                    type="button"
                                    className="inv-action-btn inv-action-btn--secondary"
                                    title="Editar cliente"
                                    aria-label="Editar cliente"
                                    onClick={() => {
                                      setEditId(c.ultimo_id);
                                      setEditOpen(true);
                                    }}
                                  >
                                    <i className="bi bi-pencil-square" aria-hidden="true" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {paginas > 1 ? (
                  <nav aria-label="Paginação clientes">
                    <ul className="pagination pagination-sm justify-content-center">
                      {Array.from({ length: paginas }, (_, i) => i + 1).map((p) => (
                        <li key={p} className={`page-item${p === pag ? " active" : ""}`}>
                          <Link
                            to="/painel/clientes"
                            search={{ q: qBusca || undefined, pag: p }}
                            className="page-link"
                          >
                            {p}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>

      <ModalEditarCliente
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditId(null);
        }}
        inventarioId={editId}
        onSaved={() => {
          setEditOpen(false);
          if (verId > 0) void loadDetalhe(verId);
          else void loadLista();
        }}
      />
    </div>
  );
}
