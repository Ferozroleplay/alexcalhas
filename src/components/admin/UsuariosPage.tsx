import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { InvActionBtn, InvRowActions } from "@/components/admin/admin-row-actions";
import { AdminModal } from "@/components/admin/modals/AdminModal";
import { DashConfirmModal } from "@/components/admin/DashConfirmModal";
import { DashPageHero } from "@/components/admin/DashPageHero";
import { UserThumb } from "@/components/admin/UserThumb";
import { UsuarioAvatarPicker } from "@/components/admin/UsuarioAvatarPicker";
import { fetchFornecedoresSelect, type FornecedorSelect } from "@/lib/admin-api";
import { dashAlert } from "@/lib/dash-ui";
import {
  atualizarUsuario,
  criarUsuario,
  enviarThumbUsuario,
  fetchUsuario,
  fetchUsuarios,
  impersonarUsuario,
  type UsuarioItem,
} from "@/lib/usuarios-client";

type NivelCadastro = "admin" | "funcionário" | "fornecedor";

function nivelClass(nivel: string): string {
  return nivel.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nivelLabel(u: UsuarioItem): string {
  if (u.nivel === "fornecedor" && u.fornecedor_nome) {
    return `Fornecedor · ${u.fornecedor_nome}`;
  }
  if (u.nivel === "funcionário" || u.nivel === "funcionario") return "Funcionário";
  if (u.nivel === "admin") return "Admin";
  if (u.nivel === "fornecedor") return "Fornecedor";
  if (u.nivel === "inativo") return "Sem acesso";
  return u.nivel;
}

export function UsuariosPage() {
  const { user, ready, refreshSession } = useAdminAuth();
  const navigate = useNavigate();
  const [itens, setItens] = useState<UsuarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [tipoOpen, setTipoOpen] = useState(false);
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [nivelCadastro, setNivelCadastro] = useState<NivelCadastro>("admin");
  const [salvando, setSalvando] = useState(false);
  const [impersonarAlvo, setImpersonarAlvo] = useState<UsuarioItem | null>(null);
  const [impersonando, setImpersonando] = useState(false);

  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cadastroAvatar, setCadastroAvatar] = useState<File | null>(null);
  const [fornecedorCadastroId, setFornecedorCadastroId] = useState("");
  const [fornecedores, setFornecedores] = useState<FornecedorSelect[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editThumb, setEditThumb] = useState("nao.png");
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSenha, setEditSenha] = useState("");
  const [editNivel, setEditNivel] = useState<NivelCadastro>("admin");
  const [editFornecedorId, setEditFornecedorId] = useState("");
  const [editAvatar, setEditAvatar] = useState<File | null>(null);
  const [editCarregando, setEditCarregando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      setItens(await fetchUsuarios());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar usuários.");
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user?.podeGerenciarUsuarios) {
      void navigate({ to: "/painel" });
      return;
    }
    void load();
  }, [load, ready, user, navigate]);

  async function confirmarImpersonacao() {
    if (!impersonarAlvo) return;
    setImpersonando(true);
    setErro("");
    try {
      const { redirect } = await impersonarUsuario(impersonarAlvo.id);
      window.location.assign(redirect);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao impersonar.");
      setImpersonando(false);
      setImpersonarAlvo(null);
    }
  }

  function abrirCadastro(tipo: NivelCadastro) {
    setNivelCadastro(tipo);
    setTipoOpen(false);
    setCadastroOpen(true);
  }

  function fecharCadastro() {
    setCadastroOpen(false);
    setNome("");
    setUsuario("");
    setEmail("");
    setSenha("");
    setCadastroAvatar(null);
    setFornecedorCadastroId("");
  }

  function fecharEdicao() {
    setEditOpen(false);
    setEditId(null);
    setEditNome("");
    setEditEmail("");
    setEditSenha("");
    setEditThumb("nao.png");
    setEditAvatar(null);
    setEditFornecedorId("");
  }

  async function abrirEdicao(u: UsuarioItem) {
    setErro("");
    setEditCarregando(true);
    setEditOpen(true);
    setEditId(u.id);
    setEditThumb(u.thumb);
    setEditAvatar(null);
    try {
      const [detalhe, forns] = await Promise.all([
        fetchUsuario(u.id),
        fetchFornecedoresSelect().catch(() => [] as FornecedorSelect[]),
      ]);
      setFornecedores(forns);
      setEditNome(detalhe.nome);
      setEditEmail(detalhe.email);
      setEditSenha("");
      setEditThumb(detalhe.thumb);
      const nv = detalhe.nivel === "funcionario" ? "funcionário" : detalhe.nivel;
      setEditNivel(
        nv === "admin" || nv === "fornecedor" || nv === "funcionário"
          ? nv
          : "funcionário",
      );
      setEditFornecedorId(detalhe.fornecedor_id ? String(detalhe.fornecedor_id) : "");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao carregar usuário.");
      fecharEdicao();
    } finally {
      setEditCarregando(false);
    }
  }

  async function handleCadastrar(e: React.FormEvent) {
    e.preventDefault();
    if (nivelCadastro === "fornecedor" && !fornecedorCadastroId) {
      setErro("Selecione a empresa fornecedora.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const criado = await criarUsuario({
        nome: nome.trim(),
        usuario: usuario.trim(),
        email: email.trim(),
        senha,
        nivel: nivelCadastro,
        fornecedor_id:
          nivelCadastro === "fornecedor" ? Number(fornecedorCadastroId) : null,
      });
      if (cadastroAvatar) {
        await enviarThumbUsuario(criado.id, cadastroAvatar);
      }
      setMsg("Usuário cadastrado com sucesso.");
      fecharCadastro();
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao cadastrar.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    if (editNivel === "fornecedor" && !editFornecedorId) {
      setErro("Selecione a empresa fornecedora.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      await atualizarUsuario(editId, {
        nome: editNome.trim(),
        email: editEmail.trim(),
        senha: editSenha.trim() || undefined,
        nivel: editNivel,
        fornecedor_id:
          editNivel === "fornecedor" ? Number(editFornecedorId) : null,
      });
      if (editAvatar) {
        await enviarThumbUsuario(editId, editAvatar);
      }
      if (editId === user?.id) {
        await refreshSession();
      }
      setMsg("Usuário atualizado com sucesso.");
      fecharEdicao();
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (!cadastroOpen && !editOpen) return;
    void fetchFornecedoresSelect()
      .then(setFornecedores)
      .catch(() => setFornecedores([]));
  }, [cadastroOpen, editOpen]);

  const tituloCadastro =
    nivelCadastro === "admin"
      ? "Cadastrar administrador"
      : nivelCadastro === "fornecedor"
        ? "Cadastrar fornecedor"
        : "Cadastrar funcionário";

  return (
    <div className="analytics-page dash-form-page--pro dashboard-page--usuarios">
      <DashPageHero
        title="Usuários"
        subtitle="Equipe com acesso ao painel — cadastre e gerencie permissões."
        iconClass="bi-people"
        accent="usuarios"
        layout="header"
        cta={
          <button
            type="button"
            className="dash-form-page__cta dash-form-page__cta--solid border-0"
            onClick={() => setTipoOpen(true)}
          >
            <i className="bi bi-person-fill-add" aria-hidden="true" />
            <span>Cadastrar</span>
          </button>
        }
      />

      <div className="dash-page-body dash-page-body--with-header">
        {msg ? (
          <div className="alert alert-success alert-dismissible fade show" role="alert">
            {msg}
            <button
              type="button"
              className="btn-close"
              aria-label="Fechar"
              onClick={() => setMsg("")}
            />
          </div>
        ) : null}
        {erro ? (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        ) : null}

        <div className="dash-user-page user-list-grid-wrap">
          {loading ? (
            <p className="text-muted mb-0 py-3">Carregando usuários…</p>
          ) : itens.length === 0 ? (
            <p className="text-muted mb-0 py-3">Nenhum usuário cadastrado.</p>
          ) : (
            <div className="user-list-grid">
              {itens.map((u) => (
                <article key={u.id} className="user-list-card">
                  <div className="user-list-card__head">
                    <UserThumb nome={u.nome} thumb={u.thumb} listCard />
                    <span
                      className={`user-list-card__badge user-list-card__badge--${nivelClass(u.nivel)}`}
                    >
                      {nivelLabel(u)}
                    </span>
                  </div>
                  <div className="user-list-card__body">
                    <h2 className="user-list-card__name">{u.nome}</h2>
                    <p className="user-list-card__email" title={u.email}>
                      <i className="bi bi-envelope" aria-hidden="true" />
                      {u.email}
                    </p>
                    <p className="user-list-card__login">
                      <i className="bi bi-person" aria-hidden="true" />@{u.usuario}
                    </p>
                  </div>
                  <div className="user-list-card__actions">
                    <InvRowActions
                      ariaLabel={`Mais ações #${u.id}`}
                      primary={
                        <InvActionBtn
                          icon="bi-pencil-square"
                          title="Editar usuário"
                          variant="secondary"
                          onClick={() => void abrirEdicao(u)}
                        />
                      }
                      menu={[
                        ...(user && u.id !== user.id
                          ? [
                              {
                                label: "Entrar como este usuário",
                                icon: "bi-box-arrow-in-right",
                                onClick: () => setImpersonarAlvo(u),
                              },
                            ]
                          : []),
                        {
                          label: "Excluir",
                          icon: "bi-trash",
                          className: "text-danger",
                          onClick: () =>
                            void dashAlert({
                              title: "Em breve",
                              message:
                                "Exclusão pelo React em breve. Use o painel PHP se precisar agora.",
                              variant: "info",
                            }),
                        },
                      ]}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <AdminModal open={tipoOpen} onClose={() => setTipoOpen(false)} dialogClass="dash-edit-modal__dialog">
        <div className="modal-content dash-user-modal">
          <div className="modal-header border-bottom">
            <h4 className="modal-title h5 mb-0">
              <i className="bi bi-person-fill-add text-primary" aria-hidden="true" /> O que deseja
              cadastrar?
            </h4>
            <button type="button" className="btn-close" aria-label="Fechar" onClick={() => setTipoOpen(false)} />
          </div>
          <div className="modal-body">
            <p className="text-muted small mb-3">
              Escolha o tipo de acesso. Cada perfil tem permissões diferentes no painel.
            </p>
            <div className="dash-user-tipo-grid">
              <button type="button" className="dash-user-tipo-card" onClick={() => abrirCadastro("admin")}>
                <span className="dash-user-tipo-card__icon dash-user-tipo-card__icon--admin">
                  <i className="bi bi-shield-check" aria-hidden="true" />
                </span>
                <span className="dash-user-tipo-card__title">Administrador</span>
                <span className="dash-user-tipo-card__desc">Acesso total ao sistema</span>
              </button>
              <button
                type="button"
                className="dash-user-tipo-card"
                onClick={() => abrirCadastro("funcionário")}
              >
                <span className="dash-user-tipo-card__icon dash-user-tipo-card__icon--func">
                  <i className="bi bi-person-badge" aria-hidden="true" />
                </span>
                <span className="dash-user-tipo-card__title">Funcionário</span>
                <span className="dash-user-tipo-card__desc">Orçamentos, visitas e painel</span>
              </button>
              <button
                type="button"
                className="dash-user-tipo-card"
                onClick={() => abrirCadastro("fornecedor")}
              >
                <span className="dash-user-tipo-card__icon dash-user-tipo-card__icon--forn">
                  <i className="bi bi-truck" aria-hidden="true" />
                </span>
                <span className="dash-user-tipo-card__title">Fornecedor</span>
                <span className="dash-user-tipo-card__desc">Envia entregas e notas de material</span>
              </button>
            </div>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={cadastroOpen}
        onClose={fecharCadastro}
        dialogClass="modal-lg dash-edit-modal__dialog"
      >
        <form onSubmit={handleCadastrar} className="dash-edit-modal__form">
          <div className="modal-content dash-user-modal dash-edit-modal__content">
            <div className="modal-header dash-edit-modal__header border-bottom flex-shrink-0">
              <div className="dash-edit-modal__head">
                <span className="dash-edit-modal__head-icon" aria-hidden="true">
                  <i className="bi bi-person-plus" />
                </span>
                <div>
                  <h4 className="modal-title dash-edit-modal__title mb-0">{tituloCadastro}</h4>
                  <p className="dash-edit-modal__subtitle mb-0">Login, senha e dados de contato</p>
                </div>
              </div>
              <button type="button" className="btn-close" aria-label="Fechar" onClick={fecharCadastro} />
            </div>
            <div className="modal-body dash-edit-modal__body">
              <UsuarioAvatarPicker
                nome={nome}
                thumb="nao.png"
                file={cadastroAvatar}
                onFileChange={setCadastroAvatar}
              />
              {nivelCadastro === "fornecedor" ? (
                <div className="mb-3">
                  <label className="dash-edit-modal__label" htmlFor="cad-fornecedor">
                    Empresa fornecedora
                  </label>
                  <select
                    id="cad-fornecedor"
                    className="form-select dash-edit-modal__input"
                    value={fornecedorCadastroId}
                    onChange={(e) => setFornecedorCadastroId(e.target.value)}
                    required
                  >
                    <option value="">Selecione…</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome_fantasia?.trim() || f.razao_social}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <section className="dash-edit-modal__panel">
                <div className="row g-2">
                  <div className="col-12 col-sm-6">
                    <label className="dash-edit-modal__label" htmlFor="cad-usuario">
                      Usuário (login)
                    </label>
                    <input
                      id="cad-usuario"
                      className="form-control dash-edit-modal__input"
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      placeholder="nome.login"
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="dash-edit-modal__label" htmlFor="cad-senha">
                      Senha
                    </label>
                    <input
                      id="cad-senha"
                      type="password"
                      className="form-control dash-edit-modal__input"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="dash-edit-modal__label" htmlFor="cad-nome">
                      Nome completo
                    </label>
                    <input
                      id="cad-nome"
                      className="form-control dash-edit-modal__input"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome e sobrenome"
                      required
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="dash-edit-modal__label" htmlFor="cad-email">
                      E-mail
                    </label>
                    <input
                      id="cad-email"
                      type="email"
                      className="form-control dash-edit-modal__input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
              </section>
            </div>
            <div className="modal-footer dash-edit-modal__footer">
              <button type="button" className="btn dash-edit-modal__btn-cancel" onClick={fecharCadastro}>
                Fechar
              </button>
              <button type="submit" className="btn dash-edit-modal__btn-save" disabled={salvando}>
                <i className="bi bi-check-lg" aria-hidden="true" />
                {salvando ? "Cadastrando…" : "Cadastrar"}
              </button>
            </div>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={editOpen}
        onClose={fecharEdicao}
        dialogClass="modal-lg dash-edit-modal__dialog"
      >
        <form onSubmit={handleEditar} className="dash-edit-modal__form">
          <div className="modal-content dash-user-modal dash-edit-modal__content">
            <div className="modal-header dash-edit-modal__header border-bottom flex-shrink-0">
              <div className="dash-edit-modal__head">
                <span className="dash-edit-modal__head-icon" aria-hidden="true">
                  <i className="bi bi-pencil-square" />
                </span>
                <div>
                  <h4 className="modal-title dash-edit-modal__title mb-0">Editar usuário</h4>
                  <p className="dash-edit-modal__subtitle mb-0">Dados, permissão e foto de perfil</p>
                </div>
              </div>
              <button type="button" className="btn-close" aria-label="Fechar" onClick={fecharEdicao} />
            </div>
            <div className="modal-body dash-edit-modal__body">
              {editCarregando ? (
                <p className="text-muted mb-0">Carregando…</p>
              ) : (
                <>
                  <UsuarioAvatarPicker
                    nome={editNome}
                    thumb={editThumb}
                    file={editAvatar}
                    onFileChange={setEditAvatar}
                  />
                  <section className="dash-edit-modal__panel">
                    <div className="row g-2">
                      <div className="col-12">
                        <label className="dash-edit-modal__label" htmlFor="edit-nome">
                          Nome completo
                        </label>
                        <input
                          id="edit-nome"
                          className="form-control dash-edit-modal__input"
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          required
                        />
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="dash-edit-modal__label" htmlFor="edit-email">
                          E-mail
                        </label>
                        <input
                          id="edit-email"
                          type="email"
                          className="form-control dash-edit-modal__input"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          autoComplete="email"
                          required
                        />
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="dash-edit-modal__label" htmlFor="edit-senha">
                          Senha
                        </label>
                        <input
                          id="edit-senha"
                          type="password"
                          className="form-control dash-edit-modal__input"
                          value={editSenha}
                          onChange={(e) => setEditSenha(e.target.value)}
                          placeholder="Deixe em branco para manter"
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="col-12 col-sm-6">
                        <label className="dash-edit-modal__label" htmlFor="edit-cargo">
                          Nível de acesso
                        </label>
                        <select
                          id="edit-cargo"
                          className="form-select dash-edit-modal__input"
                          value={editNivel}
                          onChange={(e) => setEditNivel(e.target.value as NivelCadastro)}
                          required
                        >
                          <option value="admin">Administrador</option>
                          <option value="funcionário">Funcionário</option>
                          <option value="fornecedor">Fornecedor</option>
                        </select>
                      </div>
                      {editNivel === "fornecedor" ? (
                        <div className="col-12 col-sm-6">
                          <label className="dash-edit-modal__label" htmlFor="edit-fornecedor">
                            Empresa fornecedora
                          </label>
                          <select
                            id="edit-fornecedor"
                            className="form-select dash-edit-modal__input"
                            value={editFornecedorId}
                            onChange={(e) => setEditFornecedorId(e.target.value)}
                            required
                          >
                            <option value="">Selecione…</option>
                            {fornecedores.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.nome_fantasia?.trim() || f.razao_social}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </section>
                </>
              )}
            </div>
            <div className="modal-footer dash-edit-modal__footer">
              <button type="button" className="btn dash-edit-modal__btn-cancel" onClick={fecharEdicao}>
                Fechar
              </button>
              <button
                type="submit"
                className="btn dash-edit-modal__btn-save"
                disabled={salvando || editCarregando}
              >
                <i className="bi bi-check-lg" aria-hidden="true" />
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </form>
      </AdminModal>

      <DashConfirmModal
        open={Boolean(impersonarAlvo)}
        loading={impersonando}
        options={
          impersonarAlvo
            ? {
                title: "Entrar no painel deste usuário?",
                message: "Você verá o sistema com as permissões e o menu desta conta.",
                hint: "Para voltar à sua conta admin, use o botão Admin no topo do painel.",
                confirmText: "Entrar como usuário",
                cancelText: "Cancelar",
                variant: "primary",
                icon: "bi-box-arrow-in-right",
                detail: (
                  <div className="dash-alert-modal__subject">
                    <UserThumb nome={impersonarAlvo.nome} thumb={impersonarAlvo.thumb} listCard />
                    <div className="dash-alert-modal__subject-text">
                      <span className="dash-alert-modal__subject-name">{impersonarAlvo.nome}</span>
                      <span
                        className={`user-list-card__badge user-list-card__badge--${nivelClass(impersonarAlvo.nivel)}`}
                      >
                        {nivelLabel(impersonarAlvo)}
                      </span>
                      {impersonarAlvo.email ? (
                        <span className="dash-alert-modal__subject-email">
                          <i className="bi bi-envelope" aria-hidden="true" />
                          {impersonarAlvo.email}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ),
              }
            : null
        }
        onConfirm={() => void confirmarImpersonacao()}
        onCancel={() => {
          if (!impersonando) setImpersonarAlvo(null);
        }}
      />
    </div>
  );
}
