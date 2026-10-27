import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { useAdminAuth } from "@/components/admin/admin-auth";
import { sairImpersonacao } from "@/lib/usuarios-client";
import { getAdminTheme, setAdminTheme } from "@/components/admin/AdminTheme";
import { BrandColorPicker } from "@/components/admin/BrandColorPicker";
import { DashPageHero, NovaVisitaCta } from "@/components/admin/DashPageHero";
import { DashBrandLogo } from "@/components/admin/DashBrandLogo";
import { PainelVisaoGuard } from "@/components/admin/PainelVisaoGuard";
import { DashRadio } from "@/components/admin/DashRadio";
import { UserThumb } from "@/components/admin/UserThumb";
import type { AdminVisao } from "@/lib/visao.server";
import { applyBrandTheme, getSavedBrandTheme } from "@/lib/brand-colors";

type ProdutoMenu = { id: number; nome: string };

const NAV_MAIN: { to: string; label: string; icon: string; exact?: boolean }[] = [
  { to: "/painel", label: "Caixa", icon: "bi-cash-coin", exact: true },
  { to: "/painel/visitas", label: "Visitas", icon: "bi-journal-text" },
  { to: "/painel/orcamentado", label: "Orçamentado", icon: "bi-clipboard2-pulse" },
  { to: "/painel/confirmado", label: "Confirmado", icon: "bi-journal-bookmark" },
  { to: "/painel/finalizado", label: "Finalizado", icon: "bi-journal-check" },
  { to: "/painel/pendencias", label: "Pendências", icon: "bi-exclamation-circle" },
];

const NAV_ADMIN: { to: string; label: string; icon: string }[] = [
  { to: "/painel/empresa", label: "Empresa", icon: "bi-buildings" },
  { to: "/painel/clientes", label: "Clientes", icon: "bi-person-vcard" },
  { to: "/painel/material", label: "Materiais", icon: "bi-box-seam" },
  { to: "/painel/parceiros", label: "Parceiros", icon: "bi-building" },
  { to: "/painel/calculadora-bobina", label: "Calculadora", icon: "bi-calculator" },
  { to: "/painel/calculadora-condutores", label: "Condutores", icon: "bi-rulers" },
  { to: "/painel/usuarios", label: "Usuários", icon: "bi-people" },
  { to: "/painel/fornecedores", label: "Entregas", icon: "bi-inbox" },
  { to: "/painel/financeiro", label: "Financeiro", icon: "bi-cash-coin" },
  { to: "/painel/despesas", label: "Despesas", icon: "bi-receipt" },
  { to: "/painel/funcionarios", label: "Funcionários", icon: "bi-people-fill" },
  { to: "/painel/ponto-controle", label: "Bate-ponto", icon: "bi-clock" },
  { to: "/painel/logs", label: "Log do sistema", icon: "bi-journal-code" },
];

function navActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to || pathname === `${to}/`;
  return pathname.startsWith(to);
}

function visaoAtiva(user: { visao: AdminVisao } | null): AdminVisao {
  return user?.visao ?? "admin";
}

function visaoDemonstracaoLabel(visao: AdminVisao): string {
  if (visao === "funcionário") return "Funcionário";
  if (visao === "fornecedor") return "Fornecedor";
  return "Admin";
}

export function AdminShell() {
  const { user, logout, setVisao } = useAdminAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [produtosOpen, setProdutosOpen] = useState(pathname.includes("produto"));
  const [adminOpen, setAdminOpen] = useState(NAV_ADMIN.some((n) => pathname.startsWith(n.to)));
  const [produtosMenu, setProdutosMenu] = useState<ProdutoMenu[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMini, setSidebarMini] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("dash_sidebar_mini") === "1";
  });
  const [navMobile, setNavMobile] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    document.body.classList.toggle("dashboard-has-visao-banner", Boolean(user?.simulando));
    return () => document.body.classList.remove("dashboard-has-visao-banner");
  }, [user?.simulando]);

  useEffect(() => {
    document.body.classList.toggle("dashboard-sidebar-mini", sidebarMini);
    localStorage.setItem("dash_sidebar_mini", sidebarMini ? "1" : "0");
    return () => document.body.classList.remove("dashboard-sidebar-mini");
  }, [sidebarMini]);

  useEffect(() => {
    setTheme(getAdminTheme());
    applyBrandTheme(getSavedBrandTheme());
    const mq = window.matchMedia("(max-width: 899px)");
    const syncNav = () => setNavMobile(mq.matches);
    syncNav();
    mq.addEventListener("change", syncNav);
    fetch("/api/admin/produtos-menu", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { itens?: ProdutoMenu[] }) => setProdutosMenu(d.itens ?? []))
      .catch(() => setProdutosMenu([]));
    return () => mq.removeEventListener("change", syncNav);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setAdminTheme(next);
    setTheme(next);
    applyBrandTheme(getSavedBrandTheme());
  }

  const visao = visaoAtiva(user);
  const isAdminVisao = visao === "admin";
  const isFuncVisao = visao === "funcionário";
  const isFornVisao = visao === "fornecedor";
  const podeSimular = Boolean(user?.podeSimular);

  async function trocar(v: AdminVisao) {
    setSidebarOpen(false);
    await setVisao(v);
  }

  function toggleSidebar() {
    if (navMobile) {
      setSidebarOpen((v) => !v);
      return;
    }
    setSidebarMini((v) => !v);
  }

  function openGroupIfMini(open: () => void) {
    if (sidebarMini && !navMobile) {
      setSidebarMini(false);
    }
    open();
  }

  const sidebarMenuExpanded = navMobile ? sidebarOpen : !sidebarMini;

  return (
    <>
      <PainelVisaoGuard />
      <div
        className={`menu-backdrop${sidebarOpen ? " is-visible" : ""}`}
        id="menu-backdrop"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      {user?.simulando && (
        <div className="dash-visao-banner" role="status">
          <span>
            Modo demonstração — visão <strong>{visaoDemonstracaoLabel(visao)}</strong>. Seu acesso real continua
            admin.
          </span>
          <button type="button" className="dash-visao-banner__btn" onClick={() => void trocar("admin")}>
            Voltar ao admin
          </button>
        </div>
      )}

      <header className="dash-topbar" id="menu-top">
        <button
          type="button"
          className={`dash-topbar__menu-btn${sidebarMini ? " is-sidebar-mini" : ""}`}
          aria-label={
            navMobile
              ? sidebarMenuExpanded
                ? "Fechar menu"
                : "Abrir menu"
              : sidebarMini
                ? "Expandir menu"
                : "Minimizar menu (somente ícones)"
          }
          aria-expanded={sidebarMenuExpanded}
          aria-controls="nav-menu"
          onClick={toggleSidebar}
        >
          {navMobile ? (
            <i className="bi bi-list" aria-hidden="true" />
          ) : (
            <span className="dash-topbar__menu-arrow-wrap" aria-hidden="true">
              <i
                className={`bi ${sidebarMini ? "bi-chevron-double-right" : "bi-chevron-double-left"} dash-topbar__menu-arrow`}
              />
            </span>
          )}
        </button>
        <div className="dash-topbar__spacer" aria-hidden="true" />
        <div className="dash-topbar__toolbar">
          <Link to="/" className="dash-topbar__icon-link" title="Site público" aria-label="Site público">
            <i className="bi bi-globe-americas" aria-hidden="true" />
          </Link>
          <BrandColorPicker />
          <button
            type="button"
            className="dash-topbar__theme-btn"
            onClick={toggleTheme}
            aria-label="Alternar tema"
            title={theme === "dark" ? "Tema escuro" : "Tema claro"}
          >
            <i className={`bi bi-${theme === "dark" ? "moon-stars" : "sun"}-fill`} aria-hidden="true" />
          </button>
          {user?.impersonando ? (
            <button
              type="button"
              className="dash-topbar__impersonar"
              title={`Voltar para sua conta admin (${user.impersonadorNome || "Administrador"})`}
              onClick={() => {
                void sairImpersonacao().then(({ redirect }) => window.location.assign(redirect));
              }}
            >
              <i className="bi bi-shield-check" aria-hidden="true" /> Admin
            </button>
          ) : null}
          <details
            className="dash-topbar__user-menu"
            open={userMenuOpen || undefined}
            onToggle={(e) => setUserMenuOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="dash-topbar__user-toggle">
              <div className="dash-topbar__user-text">
                <p className="dash-topbar__user-name">{user?.nome ?? "Usuário"}</p>
              </div>
              <span className="dash-topbar__user-avatar">
                <UserThumb
                  nome={user?.nome ?? "Usuário"}
                  thumb={user?.thumb ?? "nao.png"}
                  size="sm"
                  className="dash-topbar__user-thumb"
                />
              </span>
            </summary>
            <div className="dash-topbar__dropdown-panel">
              <button type="button" onClick={() => void logout()}>
                <i className="bi bi-box-arrow-right" aria-hidden="true" /> Sair
              </button>
            </div>
          </details>
        </div>
      </header>

      <aside
        id="nav-menu"
        className={`dash-sidebar${podeSimular ? " dash-sidebar--visao-switch" : ""}${sidebarMini ? " dash-sidebar--mini" : ""}${sidebarOpen ? " is-open" : ""}`}
        aria-label="Menu principal"
      >
        <div className="dash-sidebar__brand">
          <div className="dash-sidebar__brand-logo">
            <Link to="/painel" className="dash-sidebar__brand-link" onClick={() => setSidebarOpen(false)}>
              <DashBrandLogo />
            </Link>
          </div>
          <DashRadio />
        </div>

        <nav className="dash-sidebar__nav">
          <ul className="nav flex-column dash-nav-list">
            {isFornVisao && (() => {
              const fid = user?.fornecedorPreviewId ?? 0;
              const inicioSearch = fid > 0 ? { controle: fid } : undefined;
              const entregasSearch = fid > 0 ? { controle: fid } : undefined;
              return (
                <>
                  <li
                    className={
                      navActive(pathname, "/painel/inicio-fornecedor") ? "activeMenu" : ""
                    }
                  >
                    <Link
                      to="/painel/inicio-fornecedor"
                      search={inicioSearch}
                      className="dash-nav-link"
                      title="Início"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <i className="bi bi-house-door-fill" aria-hidden="true" />
                      <span>Início</span>
                    </Link>
                  </li>
                  <li className={navActive(pathname, "/painel/fornecedores") ? "activeMenu" : ""}>
                    <Link
                      to="/painel/fornecedores"
                      search={entregasSearch}
                      className="dash-nav-link"
                      title="Minhas entregas"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <i className="bi bi-truck" aria-hidden="true" />
                      <span>Minhas entregas</span>
                    </Link>
                  </li>
                </>
              );
            })()}

            {isFuncVisao && (
              <>
                <li className={navActive(pathname, "/painel/visitas") ? "activeMenu" : ""}>
                  <Link
                    to="/painel/visitas"
                    className="dash-nav-link"
                    title="Visitas"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className="bi bi-journal-text" aria-hidden="true" />
                    <span>Visitas</span>
                  </Link>
                </li>
                <li className={navActive(pathname, "/painel/ponto") ? "activeMenu" : ""}>
                  <Link
                    to="/painel/ponto"
                    className="dash-nav-link"
                    title="Bate-ponto"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className="bi bi-clock-history" aria-hidden="true" />
                    <span>Bate-ponto</span>
                  </Link>
                </li>
                <li className={navActive(pathname, "/painel/despesas") ? "activeMenu" : ""}>
                  <Link
                    to="/painel/despesas"
                    className="dash-nav-link"
                    title="Despesas"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className="bi bi-receipt" aria-hidden="true" />
                    <span>Despesas</span>
                  </Link>
                </li>
                <li className={navActive(pathname, "/painel/funcionarios") ? "activeMenu" : ""}>
                  <Link
                    to="/painel/funcionarios"
                    className="dash-nav-link"
                    title="Meus pagamentos"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className="bi bi-wallet2" aria-hidden="true" />
                    <span>Meus pagamentos</span>
                  </Link>
                </li>
                <li className={navActive(pathname, "/painel/calculadora-bobina") ? "activeMenu" : ""}>
                  <Link
                    to="/painel/calculadora-bobina"
                    className="dash-nav-link"
                    title="Calculadora"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className="bi bi-calculator" aria-hidden="true" />
                    <span>Calculadora</span>
                  </Link>
                </li>
                <li className={navActive(pathname, "/painel/calculadora-condutores") ? "activeMenu" : ""}>
                  <Link
                    to="/painel/calculadora-condutores"
                    className="dash-nav-link"
                    title="Condutores"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className="bi bi-rulers" aria-hidden="true" />
                    <span>Condutores</span>
                  </Link>
                </li>
              </>
            )}

            {isAdminVisao &&
              NAV_MAIN.map(({ to, label, icon, exact }) => (
                <li key={to} className={navActive(pathname, to, exact) ? "activeMenu" : ""}>
                  <Link to={to} className="dash-nav-link" title={label} onClick={() => setSidebarOpen(false)}>
                    <i className={`bi ${icon}`} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}

            {isAdminVisao && (
            <li className={`dash-nav-group${produtosOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="dash-nav-group__toggle"
                aria-expanded={produtosOpen}
                title="Produtos"
                onClick={() => openGroupIfMini(() => setProdutosOpen((v) => !v))}
              >
                <span className="dash-nav-group__label">
                  <i className="bi bi-images" aria-hidden="true" />
                  <span className="dash-nav-group__text">Produtos</span>
                </span>
                <i className="bi bi-chevron-down dash-nav-group__chevron" aria-hidden="true" />
              </button>
              <ul className="dash-nav-sub">
                <li
                  className={
                    pathname.startsWith("/painel/produtos") && !pathname.includes("galeria")
                      ? "activeMenu"
                      : ""
                  }
                >
                  <Link
                    to="/painel/produtos"
                    className="dash-nav-link dash-nav-link--sub"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className="bi bi-grid-3x3-gap" aria-hidden="true" />
                    <span>Catálogo</span>
                  </Link>
                </li>
                {produtosMenu.map((p) => (
                  <li
                    key={p.id}
                    className={pathname.includes("galeria") ? "activeMenu" : ""}
                  >
                    <Link
                      to="/painel/produtos-galeria"
                      search={{ produto: p.id }}
                      className="dash-nav-link dash-nav-link--sub"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <i className="bi bi-camera" aria-hidden="true" />
                      <span>{p.nome}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
            )}

            {isAdminVisao && (
            <li className={`dash-nav-group${adminOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="dash-nav-group__toggle"
                aria-expanded={adminOpen}
                title="Administração"
                onClick={() => openGroupIfMini(() => setAdminOpen((v) => !v))}
              >
                <span className="dash-nav-group__label">
                  <i className="bi bi-shield-lock" aria-hidden="true" />
                  <span className="dash-nav-group__text">Administração</span>
                </span>
                <i className="bi bi-chevron-down dash-nav-group__chevron" aria-hidden="true" />
              </button>
              <ul className="dash-nav-sub">
                {NAV_ADMIN.filter(
                  (item) => item.to !== "/painel/usuarios" || user?.podeGerenciarUsuarios,
                ).map(({ to, label, icon }) => (
                  <li key={to} className={pathname.startsWith(to) ? "activeMenu" : ""}>
                    <Link
                      to={to}
                      className="dash-nav-link dash-nav-link--sub"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <i className={`bi ${icon}`} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
            )}
          </ul>
        </nav>

        {podeSimular && (
          <div className="dash-sidebar__footer">
            <p className="dash-sidebar__visao-label">Ver sistema como</p>
            <div className="dash-sidebar__visao-switch" role="group" aria-label="Alternar visão do sistema">
              <button
                type="button"
                className={`dash-sidebar__visao-btn${visao === "admin" ? " is-active" : ""}`}
                title="Administrador"
                aria-label="Visão administrador"
                aria-pressed={visao === "admin"}
                onClick={() => void trocar("admin")}
              >
                <svg className="dash-sidebar__visao-svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M2.5 12h11v1h-11v-1zm0-1l1.2-4.8 2.3 2.2L8 3.5l2 4.9 2.3-2.2L13.5 11H2.5z" />
                </svg>
              </button>
              <button
                type="button"
                className={`dash-sidebar__visao-btn${visao === "funcionário" ? " is-active" : ""}`}
                title="Funcionário"
                aria-label="Visão funcionário"
                aria-pressed={visao === "funcionário"}
                onClick={() => void trocar("funcionário")}
              >
                <i className="bi bi-person" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`dash-sidebar__visao-btn${visao === "fornecedor" ? " is-active" : ""}`}
                title="Fornecedor"
                aria-label="Visão fornecedor"
                aria-pressed={visao === "fornecedor"}
                onClick={() => void trocar("fornecedor")}
              >
                <i className="bi bi-truck" aria-hidden="true" />
              </button>
            </div>
            {user?.simulando && (
              <p className="dash-sidebar__visao-hint">
                Modo demonstração — seu acesso real continua sendo admin.
              </p>
            )}
          </div>
        )}
      </aside>

      <div className="dashboard-wrap">
        <div className="dashboard-main-col">
          <div className="bg-custom dashboard-content">
            <div className="dashboard-content-inner">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function AdminPageHeader({
  title,
  subtitle,
  showNovaVisita = true,
  iconClass = "bi-grid",
  accent,
  cta,
}: {
  title: string;
  subtitle?: string;
  showNovaVisita?: boolean;
  iconClass?: string;
  accent?: string;
  cta?: ReactNode;
}) {
  return (
    <DashPageHero
      title={title}
      subtitle={subtitle}
      iconClass={iconClass}
      accent={accent}
      layout="header"
      cta={cta ?? (showNovaVisita ? <NovaVisitaCta /> : undefined)}
    />
  );
}
