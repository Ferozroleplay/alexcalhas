import { useEffect, useRef, useState } from "react";

import {
  BRAND_COLOR_DEFAULT,
  BRAND_COLOR_PRESETS,
  BRAND_MENU_TEXT_PRESETS,
  BRAND_SITE_TEXT_DEFAULT,
  BRAND_SITE_TEXT_PRESETS,
  BRAND_SITE_TITLE_DEFAULT,
  BRAND_SITE_TITLE_PRESETS,
  BRAND_TEXT_DEFAULT_DARK,
  applyBrandTheme,
  getSavedBrandTheme,
  resetBrandTheme,
  saveBrandTheme,
  type BrandTheme,
} from "@/lib/brand-colors";

type ColorSectionProps = {
  icon: string;
  title: string;
  hint: string;
  value: string;
  presets: readonly { id: string; label: string; hex: string }[];
  onChange: (hex: string) => void;
};

function ColorSection({ icon, title, hint, value, presets, onChange }: ColorSectionProps) {
  return (
    <section className="dash-brand-color__card">
      <div className="dash-brand-color__card-head">
        <div className="dash-brand-color__card-title">
          <span className="dash-brand-color__card-icon" aria-hidden="true">
            <i className={`bi ${icon}`} />
          </span>
          <div>
            <strong>{title}</strong>
            <p>{hint}</p>
          </div>
        </div>
        <label className="dash-brand-color__picker" title="Cor personalizada">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={title}
          />
          <span style={{ background: value }} />
        </label>
      </div>
      <div className="dash-brand-color__presets" role="list">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            role="listitem"
            className={`dash-brand-color__swatch${
              value.toLowerCase() === p.hex.toLowerCase() ? " is-active" : ""
            }`}
            style={{ background: p.hex }}
            title={p.label}
            aria-label={p.label}
            onClick={() => onChange(p.hex)}
          />
        ))}
      </div>
    </section>
  );
}

/** Botão no topbar: cores do painel e do site. */
export function BrandColorPicker() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<BrandTheme>({
    primary: BRAND_COLOR_DEFAULT,
    text: BRAND_TEXT_DEFAULT_DARK,
    siteText: BRAND_SITE_TEXT_DEFAULT,
    siteTitle: BRAND_SITE_TITLE_DEFAULT,
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = getSavedBrandTheme();
    setTheme(saved);
    applyBrandTheme(saved);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function patch(partial: Partial<BrandTheme>) {
    const next = saveBrandTheme({ ...theme, ...partial });
    setTheme(next);
  }

  return (
    <div className="dash-brand-color" ref={wrapRef}>
      <button
        type="button"
        className="dash-topbar__theme-btn dash-brand-color__btn"
        aria-label="Personalizar cores"
        title="Personalizar cores"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <i className="bi bi-palette2" aria-hidden="true" />
        <span className="dash-brand-color__dot" style={{ background: theme.primary }} aria-hidden="true" />
      </button>

      {open ? (
        <div className="dash-brand-color__panel dash-brand-color__panel--pro" role="dialog" aria-label="Personalizar cores">
          <div className="dash-brand-color__head">
            <div>
              <span className="dash-brand-color__eyebrow">Personalização</span>
              <strong>Cores do sistema</strong>
              <p>Painel e site — escolha cada grupo à vontade.</p>
            </div>
            <button
              type="button"
              className="dash-brand-color__close"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>

          <div className="dash-brand-color__scroll">
            <ColorSection
              icon="bi-lightning-charge-fill"
              title="Botões e destaques"
              hint="Menu ativo, CTAs, badges"
              value={theme.primary}
              presets={BRAND_COLOR_PRESETS}
              onChange={(hex) => patch({ primary: hex })}
            />

            <ColorSection
              icon="bi-list-ul"
              title="Textos do painel"
              hint="Menu lateral e labels"
              value={theme.text}
              presets={BRAND_MENU_TEXT_PRESETS}
              onChange={(hex) => patch({ text: hex })}
            />

            <ColorSection
              icon="bi-globe2"
              title="Texto do site"
              hint="Parágrafos e descrições"
              value={theme.siteText}
              presets={BRAND_SITE_TEXT_PRESETS}
              onChange={(hex) => patch({ siteText: hex })}
            />

            <ColorSection
              icon="bi-type-h1"
              title="Títulos do site"
              hint="Headlines e menu do site"
              value={theme.siteTitle}
              presets={BRAND_SITE_TITLE_PRESETS}
              onChange={(hex) => patch({ siteTitle: hex })}
            />

            <div className="dash-brand-color__preview dash-brand-color__preview--pro" aria-hidden="true">
              <div className="dash-brand-color__preview-site" style={{ color: theme.siteText }}>
                <strong style={{ color: theme.siteTitle }}>Título do site</strong>
                <span>Texto corrido da home</span>
              </div>
              <span className="dash-brand-color__preview-btn" style={{ background: theme.primary }}>
                Botão
              </span>
              <span className="dash-brand-color__preview-text" style={{ color: theme.text }}>
                Menu
              </span>
            </div>
          </div>

          <div className="dash-brand-color__footer">
            <button
              type="button"
              className="dash-brand-color__reset"
              onClick={() => setTheme(resetBrandTheme())}
            >
              Restaurar padrão
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
