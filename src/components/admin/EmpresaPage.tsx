import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import {
  EMPRESA_DEFAULTS,
  type EmpresaConfig,
  calcularFator,
  formatCnpjMask,
  formatFator,
  formatMoneyInput,
  formatPctInput,
  formatPhoneMask,
  loadEmpresaConfig,
  parseMoneyBr,
  saveEmpresaConfig,
} from "@/lib/empresa-config";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

type MoneyField =
  | "chapa043"
  | "chapa050"
  | "chapa065"
  | "margemRecomendada"
  | "margemMinima"
  | "taxaMaquininha12x"
  | "comprimentoBobina";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`empresa-field ${className}`.trim()}>
      <span className="empresa-field__label">{label}</span>
      {children}
    </label>
  );
}

export function EmpresaPage() {
  const logoInputId = useId();
  const logoRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<EmpresaConfig>(EMPRESA_DEFAULTS);
  const [moneyDraft, setMoneyDraft] = useState<Record<MoneyField, string>>({
    chapa043: formatMoneyInput(EMPRESA_DEFAULTS.chapa043),
    chapa050: formatMoneyInput(EMPRESA_DEFAULTS.chapa050),
    chapa065: formatMoneyInput(EMPRESA_DEFAULTS.chapa065),
    margemRecomendada: formatPctInput(EMPRESA_DEFAULTS.margemRecomendada),
    margemMinima: formatPctInput(EMPRESA_DEFAULTS.margemMinima),
    taxaMaquininha12x: formatPctInput(EMPRESA_DEFAULTS.taxaMaquininha12x),
    comprimentoBobina: formatPctInput(EMPRESA_DEFAULTS.comprimentoBobina),
  });
  const [ready, setReady] = useState(false);
  const [logoErro, setLogoErro] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loaded = loadEmpresaConfig();
    setCfg(loaded);
    setMoneyDraft({
      chapa043: formatMoneyInput(loaded.chapa043),
      chapa050: formatMoneyInput(loaded.chapa050),
      chapa065: formatMoneyInput(loaded.chapa065),
      margemRecomendada: formatPctInput(loaded.margemRecomendada),
      margemMinima: formatPctInput(loaded.margemMinima),
      taxaMaquininha12x: formatPctInput(loaded.taxaMaquininha12x),
      comprimentoBobina: formatPctInput(loaded.comprimentoBobina),
    });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveEmpresaConfig(cfg);
    }, 280);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [cfg, ready]);

  const fator = calcularFator(cfg.margemRecomendada);

  function patch(partial: Partial<EmpresaConfig>) {
    setCfg((prev) => ({ ...prev, ...partial }));
  }

  function onMoneyChange(field: MoneyField, raw: string) {
    const cleaned = raw.replace(/[^\d,.]/g, "");
    setMoneyDraft((prev) => ({ ...prev, [field]: cleaned }));
    patch({ [field]: parseMoneyBr(cleaned) });
  }

  function onMoneyBlur(field: MoneyField) {
    const n = cfg[field];
    const isMoney = field.startsWith("chapa");
    setMoneyDraft((prev) => ({
      ...prev,
      [field]: isMoney ? formatMoneyInput(n) : formatPctInput(n),
    }));
  }

  function onLogoFile(file: File | null) {
    setLogoErro("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoErro("Use PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoErro("A logo deve ter no máximo 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result.startsWith("data:image/")) patch({ logoDataUrl: result });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="analytics-page dash-form-page--pro empresa-page">
      <header className="empresa-page__hero">
        <div className="empresa-page__hero-text">
          <span className="empresa-page__eyebrow">Configurações</span>
          <h1 className="empresa-page__title">Empresa e formação de preços</h1>
          <p className="empresa-page__subtitle">
            Organize os dados da empresa, condições padrão e valores usados nos cálculos.
          </p>
        </div>
        <span className="empresa-page__saved" role="status">
          <span className="empresa-page__saved-dot" aria-hidden="true" />
          Salvo neste computador
        </span>
      </header>

      <div className="dash-page-body dash-page-body--with-header empresa-page__body">
        <div className="empresa-page__grid">
          <section className="empresa-card">
            <header className="empresa-card__head">
              <span className="empresa-card__icon" aria-hidden="true">
                <i className="bi bi-buildings" />
              </span>
              <div>
                <h2 className="empresa-card__title">Dados da empresa</h2>
                <p className="empresa-card__desc">
                  Informações que aparecem no orçamento, PDF e imagem.
                </p>
              </div>
            </header>

            <div className="empresa-logo-row">
              <div className="empresa-logo-upload">
                <span className="empresa-field__label">Logo da empresa</span>
                <input
                  ref={logoRef}
                  id={logoInputId}
                  type="file"
                  className="visually-hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    onLogoFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="empresa-logo-zone"
                  onClick={() => logoRef.current?.click()}
                >
                  <i className="bi bi-cloud-arrow-up" aria-hidden="true" />
                  <span>Clique para selecionar sua logo</span>
                  <small>PNG, JPG ou WEBP — máximo 2 MB</small>
                </button>
                {logoErro ? <p className="empresa-logo-erro">{logoErro}</p> : null}
              </div>

              <div className="empresa-logo-preview">
                <span className="empresa-field__label">Pré-visualização</span>
                <div className="empresa-logo-preview__box">
                  {cfg.logoDataUrl ? (
                    <img src={cfg.logoDataUrl} alt={`Logo ${cfg.nome || "da empresa"}`} />
                  ) : (
                    <span className="empresa-logo-preview__empty">Nenhuma logo selecionada</span>
                  )}
                </div>
                <button
                  type="button"
                  className="empresa-logo-remove"
                  disabled={!cfg.logoDataUrl}
                  onClick={() => patch({ logoDataUrl: "" })}
                >
                  <i className="bi bi-trash3" aria-hidden="true" />
                  Remover logo
                </button>
              </div>
            </div>

            <div className="empresa-fields">
              <Field label="Nome da empresa">
                <input
                  className="form-control empresa-input"
                  value={cfg.nome}
                  onChange={(e) => patch({ nome: e.target.value })}
                  placeholder="Nome da empresa"
                  autoComplete="organization"
                />
              </Field>
              <Field label="Nome do proprietário">
                <input
                  className="form-control empresa-input"
                  value={cfg.proprietario}
                  onChange={(e) => patch({ proprietario: e.target.value })}
                  placeholder="Nome do proprietário"
                  autoComplete="name"
                />
              </Field>
              <Field label="CNPJ">
                <input
                  className="form-control empresa-input"
                  value={cfg.cnpj}
                  onChange={(e) => patch({ cnpj: formatCnpjMask(e.target.value) })}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                />
              </Field>
              <Field label="E-mail">
                <input
                  className="form-control empresa-input"
                  type="email"
                  value={cfg.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  placeholder="contato@empresa.com.br"
                  autoComplete="email"
                />
              </Field>
              <Field label="Telefone">
                <input
                  className="form-control empresa-input"
                  value={cfg.telefone}
                  onChange={(e) => patch({ telefone: formatPhoneMask(e.target.value) })}
                  placeholder="(00) 0000-0000"
                  inputMode="tel"
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  className="form-control empresa-input"
                  value={cfg.whatsapp}
                  onChange={(e) => patch({ whatsapp: formatPhoneMask(e.target.value) })}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                />
              </Field>
              <Field label="Endereço" className="empresa-field--full">
                <input
                  className="form-control empresa-input"
                  value={cfg.endereco}
                  onChange={(e) => patch({ endereco: e.target.value })}
                  placeholder="Rua, número e bairro"
                  autoComplete="street-address"
                />
              </Field>
              <Field label="Cidade/UF" className="empresa-field--full">
                <input
                  className="form-control empresa-input"
                  value={cfg.cidadeUf}
                  onChange={(e) => patch({ cidadeUf: e.target.value })}
                  placeholder="Cidade/UF"
                />
              </Field>
            </div>
          </section>

          <section className="empresa-card">
            <header className="empresa-card__head">
              <span className="empresa-card__icon" aria-hidden="true">
                <i className="bi bi-calculator" />
              </span>
              <div>
                <h2 className="empresa-card__title">Parâmetros de cálculo</h2>
                <p className="empresa-card__desc">Custos, margens e taxa do cartão.</p>
              </div>
            </header>

            <div className="empresa-params">
              <p className="empresa-params__label">Valores das bobinas</p>
              <div className="empresa-params__row empresa-params__row--3">
                <Field label="Chapa 0,43">
                  <input
                    className="form-control empresa-input"
                    value={moneyDraft.chapa043}
                    onChange={(e) => onMoneyChange("chapa043", e.target.value)}
                    onBlur={() => onMoneyBlur("chapa043")}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Chapa 0,50">
                  <input
                    className="form-control empresa-input"
                    value={moneyDraft.chapa050}
                    onChange={(e) => onMoneyChange("chapa050", e.target.value)}
                    onBlur={() => onMoneyBlur("chapa050")}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Chapa 0,65">
                  <input
                    className="form-control empresa-input"
                    value={moneyDraft.chapa065}
                    onChange={(e) => onMoneyChange("chapa065", e.target.value)}
                    onBlur={() => onMoneyBlur("chapa065")}
                    inputMode="decimal"
                  />
                </Field>
              </div>

              <p className="empresa-params__label">Margens e cartão</p>
              <div className="empresa-params__row empresa-params__row--2">
                <Field label="Margem recomendada (%)">
                  <input
                    className="form-control empresa-input"
                    value={moneyDraft.margemRecomendada}
                    onChange={(e) => onMoneyChange("margemRecomendada", e.target.value)}
                    onBlur={() => onMoneyBlur("margemRecomendada")}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Margem mínima (%)">
                  <input
                    className="form-control empresa-input"
                    value={moneyDraft.margemMinima}
                    onChange={(e) => onMoneyChange("margemMinima", e.target.value)}
                    onBlur={() => onMoneyBlur("margemMinima")}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Taxa da maquininha 12x (%)">
                  <input
                    className="form-control empresa-input"
                    value={moneyDraft.taxaMaquininha12x}
                    onChange={(e) => onMoneyChange("taxaMaquininha12x", e.target.value)}
                    onBlur={() => onMoneyBlur("taxaMaquininha12x")}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Comprimento da bobina (m)">
                  <input
                    className="form-control empresa-input"
                    value={moneyDraft.comprimentoBobina}
                    onChange={(e) => onMoneyChange("comprimentoBobina", e.target.value)}
                    onBlur={() => onMoneyBlur("comprimentoBobina")}
                    inputMode="decimal"
                  />
                </Field>
              </div>
            </div>

            <div className="empresa-fator">
              <div>
                <p className="empresa-fator__title">Fator calculado</p>
                <p className="empresa-fator__hint">
                  Atualizado automaticamente pela margem recomendada
                </p>
              </div>
              <div className="empresa-fator__value" aria-live="polite">
                {formatFator(fator)}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
