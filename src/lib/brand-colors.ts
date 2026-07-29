/** Tema de cores do painel + site (botões, textos, destaques). */

export const BRAND_THEME_KEY = "alex-brand-theme-v3";
export const BRAND_THEME_KEY_LEGACY = "alex-brand-theme-v2";
/** @deprecated */ export const BRAND_COLOR_KEY = "alex-brand-color-v1";

export const BRAND_COLOR_DEFAULT = "#16ca85";
export const BRAND_TEXT_DEFAULT_DARK = "#c4cedd";
export const BRAND_TEXT_DEFAULT_LIGHT = "#6f839e";
export const BRAND_SITE_TEXT_DEFAULT = "#5d6b7c";
export const BRAND_SITE_TITLE_DEFAULT = "#152b45";

export type BrandTheme = {
  /** Botões e destaques */
  primary: string;
  /** Textos do menu / painel */
  text: string;
  /** Texto corrido do site */
  siteText: string;
  /** Títulos do site */
  siteTitle: string;
};

export const BRAND_COLOR_PRESETS = [
  { id: "verde", label: "Verde", hex: "#16ca85" },
  { id: "esmeralda", label: "Esmeralda", hex: "#07945A" },
  { id: "azul", label: "Azul", hex: "#3b82f6" },
  { id: "ciano", label: "Ciano", hex: "#06b6d4" },
  { id: "roxo", label: "Roxo", hex: "#8b5cf6" },
  { id: "laranja", label: "Laranja", hex: "#f59e0b" },
  { id: "vermelho", label: "Vermelho", hex: "#ef4444" },
  { id: "rosa", label: "Rosa", hex: "#ec4899" },
] as const;

export const BRAND_MENU_TEXT_PRESETS = [
  { id: "cinza", label: "Cinza", hex: "#94a3b8" },
  { id: "azul-acinzentado", label: "Azul acinzentado", hex: "#6f839e" },
  { id: "claro", label: "Claro", hex: "#e2e8f0" },
  { id: "escuro", label: "Escuro", hex: "#334155" },
  { id: "preto", label: "Preto", hex: "#0f172a" },
  { id: "branco", label: "Branco", hex: "#f8fafc" },
] as const;

/** @deprecated alias */
export const BRAND_TEXT_PRESETS = BRAND_MENU_TEXT_PRESETS;

export const BRAND_SITE_TEXT_PRESETS = [
  { id: "cinza", label: "Cinza", hex: "#5d6b7c" },
  { id: "slate", label: "Slate", hex: "#64748b" },
  { id: "azul", label: "Azul texto", hex: "#475569" },
  { id: "escuro", label: "Escuro", hex: "#334155" },
  { id: "navy", label: "Navy", hex: "#1e3a56" },
  { id: "preto", label: "Preto", hex: "#0f172a" },
] as const;

export const BRAND_SITE_TITLE_PRESETS = [
  { id: "navy", label: "Navy", hex: "#152b45" },
  { id: "azul", label: "Azul", hex: "#0f1f33" },
  { id: "slate", label: "Slate", hex: "#1e293b" },
  { id: "preto", label: "Preto", hex: "#0f172a" },
  { id: "grafite", label: "Grafite", hex: "#111827" },
  { id: "verde-escuro", label: "Verde escuro", hex: "#064e3b" },
] as const;

const STYLE_ID = "alex-brand-theme-style";

function clamp(n: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h) && !/^[0-9a-fA-F]{3}$/.test(h)) return null;
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex: string, withHex: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(withHex);
  if (!a || !b) return hex;
  const t = Math.min(1, Math.max(0, amount));
  return toHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function darken(hex: string, amount: number): string {
  return mix(hex, "#000000", amount);
}

function lighten(hex: string, amount: number): string {
  return mix(hex, "#ffffff", amount);
}

function rgba(hex: string, alpha: number): string {
  const p = parseHex(hex);
  if (!p) return `rgba(22, 202, 133, ${alpha})`;
  return `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha})`;
}

export function normalizeBrandHex(raw: string): string | null {
  const parsed = parseHex(raw);
  if (!parsed) return null;
  return toHex(parsed.r, parsed.g, parsed.b);
}

function defaultMenuText(): string {
  if (typeof document === "undefined") return BRAND_TEXT_DEFAULT_DARK;
  const light = document.documentElement.getAttribute("data-bs-theme") === "light";
  return light ? BRAND_TEXT_DEFAULT_LIGHT : BRAND_TEXT_DEFAULT_DARK;
}

function defaultTheme(): BrandTheme {
  return {
    primary: BRAND_COLOR_DEFAULT,
    text: defaultMenuText(),
    siteText: BRAND_SITE_TEXT_DEFAULT,
    siteTitle: BRAND_SITE_TITLE_DEFAULT,
  };
}

function normalizeTheme(parsed: Partial<BrandTheme> | null | undefined): BrandTheme {
  const base = defaultTheme();
  return {
    primary: normalizeBrandHex(parsed?.primary ?? "") ?? base.primary,
    text: normalizeBrandHex(parsed?.text ?? "") ?? base.text,
    siteText: normalizeBrandHex(parsed?.siteText ?? "") ?? base.siteText,
    siteTitle: normalizeBrandHex(parsed?.siteTitle ?? "") ?? base.siteTitle,
  };
}

export function getSavedBrandTheme(): BrandTheme {
  if (typeof window === "undefined") return defaultTheme();
  try {
    const raw =
      localStorage.getItem(BRAND_THEME_KEY) ?? localStorage.getItem(BRAND_THEME_KEY_LEGACY);
    if (raw) return normalizeTheme(JSON.parse(raw) as Partial<BrandTheme>);
    const legacy = localStorage.getItem(BRAND_COLOR_KEY);
    return normalizeTheme({
      primary: normalizeBrandHex(legacy ?? "") ?? BRAND_COLOR_DEFAULT,
    });
  } catch {
    return defaultTheme();
  }
}

/** @deprecated */
export function getSavedBrandColor(): string {
  return getSavedBrandTheme().primary;
}

function ensureStyleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

function buildOverrideCss(theme: BrandTheme): string {
  const { primary, text, siteText, siteTitle } = theme;
  const dark = darken(primary, 0.22);
  const darker = darken(primary, 0.35);
  const light = lighten(primary, 0.28);
  const soft = rgba(primary, 0.14);
  const softStrong = rgba(primary, 0.22);
  const mist = lighten(primary, 0.92);
  const textMuted = mix(text, "#64748b", 0.35);
  const grad = `linear-gradient(135deg, ${darker} 0%, ${primary} 30%, ${light} 55%, ${primary} 80%, ${dark} 100%)`;

  return `
:root, html, html[data-bs-theme="dark"], html[data-bs-theme="light"] {
  --primary: ${primary} !important;
  --primary-dark: ${dark} !important;
  --primary-soft: ${soft} !important;
  --primary-glow: ${softStrong} !important;
  --primary-foreground: #ffffff !important;
  --ring: ${primary} !important;
  --bs-primary: ${primary} !important;
  --bs-link-color: ${primary} !important;
  --bs-success: ${primary} !important;
  --brand-green: ${primary} !important;
  --brand-green-dark: ${dark} !important;
  --brand-green-soft: ${mist} !important;
  --brand-green-mist: ${mist} !important;
  --accent: ${mist} !important;
  --accent-foreground: ${dark} !important;
  --dash-nav-active-bg: ${primary} !important;
  --dash-nav-active-text: #ffffff !important;
  --text-secundary: ${text} !important;
  --text-anexo: ${textMuted} !important;
  --text-title-table: ${text} !important;
  --dash-nav-text: ${text} !important;
  --dash-nav-icon: ${textMuted} !important;
  --color-icon-mode: ${text} !important;
  --muted-foreground: ${textMuted} !important;
  --brand-muted: ${siteText} !important;
  --brand-text: ${siteTitle} !important;
  --ac-green: ${primary} !important;
  --ac-green-hover: ${dark} !important;
  --ac-green-bright: ${light} !important;
  --ac-green-light: ${mist} !important;
  --ac-green-glow: ${rgba(primary, 0.22)} !important;
  --ac-text: ${siteText} !important;
  --ac-navy: ${siteTitle} !important;
  --ac-navy-soft: ${mix(siteTitle, "#ffffff", 0.12)} !important;
}

html[data-bs-theme="light"][data-brand-theme] {
  --background-menu: ${primary} !important;
}

html[data-brand-theme] #nav-menu .activeMenu > .dash-nav-link,
html[data-brand-theme] #nav-menu .dash-nav-sub .activeMenu > .dash-nav-link,
html[data-brand-theme] .dash-nav-list .activeMenu > .dash-nav-link,
html[data-brand-theme] .dash-nav-sub .activeMenu > .dash-nav-link,
html[data-brand-theme] #nav-menu .activeMenu > .nav-link.dashboard-nav-link,
html[data-brand-theme][data-bs-theme="dark"] #nav-menu .activeMenu > .dash-nav-link,
html[data-brand-theme][data-bs-theme="dark"] .dash-nav-list .activeMenu > .dash-nav-link {
  background: ${grad} !important;
  background-size: 220% 220% !important;
  color: #fff !important;
  border-color: rgba(255,255,255,0.2) !important;
  box-shadow: 0 4px 16px ${softStrong}, inset 0 1px 0 rgba(255,255,255,0.2) !important;
}

html[data-brand-theme] #nav-menu .activeMenu > .dash-nav-link .bi,
html[data-brand-theme] .dash-nav-list .activeMenu > .dash-nav-link .bi {
  color: #fff !important;
}

html[data-brand-theme] #nav-menu .dash-nav-link:hover .bi,
html[data-brand-theme] .dash-nav-link:hover .bi {
  color: ${primary} !important;
}

html[data-brand-theme] .btn-success,
html[data-brand-theme] .visitas-orc-save-btn,
html[data-brand-theme] .visitas-orc-add-btn,
html[data-brand-theme] .caixa-action--primary,
html[data-brand-theme] .parceiros-btn--primary,
html[data-brand-theme] .analytics-btn--primary,
html[data-brand-theme] .orc-item-tab.is-active,
html[data-brand-theme] .ac-btn--primary,
html[data-brand-theme] .ac-btn.ac-btn--primary,
html[data-brand-theme] .dash-sidebar__visao-btn.is-active,
html[data-brand-theme] .ac-header__cta.ac-btn--primary {
  background: ${grad} !important;
  background-color: ${primary} !important;
  border-color: ${dark} !important;
  color: #fff !important;
}

html[data-brand-theme] .btn-outline-success,
html[data-brand-theme] .ac-btn--outline {
  background: transparent !important;
  color: ${primary} !important;
  border-color: ${primary} !important;
}

html[data-brand-theme] .caixa-side__eyebrow,
html[data-brand-theme] .caixa-side__status em,
html[data-brand-theme] .caixa-row--saldo .caixa-row__icon,
html[data-brand-theme] .caixa-row--saldo .caixa-row__label,
html[data-brand-theme] .caixa-row--saldo .caixa-row__value,
html[data-brand-theme] .caixa-fin__card strong.is-green,
html[data-brand-theme] .text-success,
html[data-brand-theme] .ac-hero__title-accent,
html[data-brand-theme] .ac-kicker,
html[data-brand-theme] .ac-partners__title,
html[data-brand-theme] .ac-section__eyebrow {
  color: ${primary} !important;
}

html[data-brand-theme] .caixa-row--saldo {
  background: ${soft} !important;
  border-color: ${rgba(primary, 0.35)} !important;
}

html[data-brand-theme] .caixa-cal__day.is-aberto {
  background: ${rgba(primary, 0.22)} !important;
  color: ${light} !important;
}

html[data-brand-theme] .caixa-cal__day.is-selected.is-aberto,
html[data-brand-theme] .caixa-cal__day.is-aberto.is-selected,
html[data-brand-theme] .caixa-cal__day.is-selected:not(.is-nao-aberto) {
  background: ${primary} !important;
  color: #052e16 !important;
}

html[data-brand-theme] body.dashboard-app .dash-nav-list li:not(.activeMenu) > .dash-nav-link {
  color: ${text} !important;
}

html[data-brand-theme] body.dashboard-app .dash-sidebar__nav li:not(.activeMenu) > .dash-nav-link .bi {
  color: ${textMuted} !important;
}

html[data-brand-theme] .dash-topbar__user-name {
  color: ${text} !important;
}

/* Textos do site */
html[data-brand-theme] body.ac-landing,
html[data-brand-theme] .ac-hero__desc,
html[data-brand-theme] .ac-benefit p,
html[data-brand-theme] .ac-section__desc,
html[data-brand-theme] .ac-text {
  color: ${siteText} !important;
}

html[data-brand-theme] .ac-hero__title,
html[data-brand-theme] .ac-benefit h3,
html[data-brand-theme] .ac-section__title,
html[data-brand-theme] .ac-header__brand,
html[data-brand-theme] .ac-navy {
  color: ${siteTitle} !important;
}

html[data-brand-theme] .ac-header__menu a {
  color: ${siteTitle} !important;
}

html[data-brand-theme] .ac-header__menu a:hover {
  color: ${primary} !important;
}

html[data-brand-theme] .ac-chat-fab,
html[data-brand-theme] .ac-site-chat__fab {
  background: ${grad} !important;
}
`.trim();
}

/** Aplica tema completo (botões + textos) no painel e no site. */
export function applyBrandTheme(themeInput: Partial<BrandTheme>): BrandTheme {
  const current = typeof document !== "undefined" ? getSavedBrandTheme() : defaultTheme();
  const theme = normalizeTheme({ ...current, ...themeInput });

  if (typeof document === "undefined") return theme;

  const { primary, text, siteText, siteTitle } = theme;
  const dark = darken(primary, 0.22);
  const soft = rgba(primary, 0.14);
  const softStrong = rgba(primary, 0.22);
  const mist = lighten(primary, 0.92);
  const textMuted = mix(text, "#64748b", 0.35);
  const root = document.documentElement;

  const vars: Record<string, string> = {
    "--primary": primary,
    "--primary-dark": dark,
    "--primary-soft": soft,
    "--primary-glow": softStrong,
    "--primary-foreground": "#ffffff",
    "--ring": primary,
    "--brand-green": primary,
    "--brand-green-dark": dark,
    "--brand-green-soft": mist,
    "--brand-green-mist": mist,
    "--accent": mist,
    "--accent-foreground": dark,
    "--bs-primary": primary,
    "--bs-link-color": primary,
    "--bs-success": primary,
    "--dash-nav-active-bg": primary,
    "--dash-nav-active-text": "#ffffff",
    "--text-secundary": text,
    "--text-anexo": textMuted,
    "--text-title-table": text,
    "--dash-nav-text": text,
    "--dash-nav-icon": textMuted,
    "--color-icon-mode": text,
    "--muted-foreground": textMuted,
    "--brand-muted": siteText,
    "--brand-text": siteTitle,
    "--ac-green": primary,
    "--ac-green-hover": dark,
    "--ac-green-bright": lighten(primary, 0.18),
    "--ac-green-light": mist,
    "--ac-green-glow": rgba(primary, 0.22),
    "--ac-text": siteText,
    "--ac-navy": siteTitle,
    "--ac-navy-soft": mix(siteTitle, "#ffffff", 0.12),
  };

  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }

  root.dataset.brandColor = primary;
  root.dataset.brandTheme = "1";
  root.dataset.brandText = text;
  root.dataset.brandSiteText = siteText;
  root.dataset.brandSiteTitle = siteTitle;

  ensureStyleEl().textContent = buildOverrideCss(theme);
  return theme;
}

/** @deprecated */
export function applyBrandColor(hexInput: string): string {
  return applyBrandTheme({ primary: hexInput }).primary;
}

export function saveBrandTheme(themeInput: Partial<BrandTheme>): BrandTheme {
  const theme = applyBrandTheme(themeInput);
  try {
    localStorage.setItem(BRAND_THEME_KEY, JSON.stringify(theme));
  } catch {
    /* ignore */
  }
  return theme;
}

/** @deprecated */
export function saveBrandColor(hexInput: string): string {
  return saveBrandTheme({ primary: hexInput }).primary;
}

export function resetBrandTheme(): BrandTheme {
  try {
    localStorage.removeItem(BRAND_THEME_KEY);
    localStorage.removeItem(BRAND_THEME_KEY_LEGACY);
    localStorage.removeItem(BRAND_COLOR_KEY);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.getElementById(STYLE_ID)?.remove();
    const root = document.documentElement;
    delete root.dataset.brandTheme;
    delete root.dataset.brandColor;
    delete root.dataset.brandText;
    delete root.dataset.brandSiteText;
    delete root.dataset.brandSiteTitle;
    [
      "--primary", "--primary-dark", "--primary-soft", "--primary-glow",
      "--dash-nav-active-bg", "--text-secundary", "--dash-nav-text",
      "--brand-green", "--bs-primary", "--ac-green", "--ac-text", "--ac-navy",
    ].forEach((k) => root.style.removeProperty(k));
  }
  return applyBrandTheme(defaultTheme());
}

/** @deprecated */
export function resetBrandColor(): string {
  return resetBrandTheme().primary;
}
