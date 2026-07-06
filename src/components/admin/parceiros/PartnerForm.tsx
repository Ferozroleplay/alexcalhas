import { LogoUploader } from "@/components/admin/parceiros/LogoUploader";
import { formatarWhatsappInput } from "@/components/admin/parceiros/format-whatsapp";

type Props = {
  nome: string;
  whatsapp: string;
  logoFile: File | null;
  salvando: boolean;
  onNomeChange: (value: string) => void;
  onWhatsappChange: (value: string) => void;
  onLogoChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function PartnerForm({
  nome,
  whatsapp,
  logoFile,
  salvando,
  onNomeChange,
  onWhatsappChange,
  onLogoChange,
  onSubmit,
}: Props) {
  return (
    <section className="parceiros-card parceiros-card--form" aria-labelledby="parceiros-form-title">
      <header className="parceiros-card__header">
        <div>
          <h2 id="parceiros-form-title" className="parceiros-card__title">
            <i className="bi bi-plus-circle" aria-hidden="true" />
            Novo parceiro
          </h2>
          <p className="parceiros-card__subtitle">
            Preencha os dados e envie o logo. Você pode editar depois na lista abaixo.
          </p>
        </div>
      </header>

      <form className="parceiros-form" onSubmit={onSubmit} noValidate>
        <div className="parceiros-form__grid">
          <div className="parceiros-form__fields">
            <div className="parceiros-field">
              <label className="parceiros-field__label" htmlFor="parceiro-nome">
                Nome do parceiro
              </label>
              <input
                id="parceiro-nome"
                className="parceiros-field__input"
                value={nome}
                onChange={(e) => onNomeChange(e.target.value)}
                placeholder="Ex.: Loja Parceira"
                maxLength={120}
                required
                autoComplete="organization"
              />
            </div>

            <div className="parceiros-field">
              <label className="parceiros-field__label" htmlFor="parceiro-wa">
                WhatsApp
              </label>
              <div className="parceiros-field__input-group">
                <span className="parceiros-field__addon" aria-hidden="true">
                  <i className="bi bi-whatsapp" />
                </span>
                <input
                  id="parceiro-wa"
                  className="parceiros-field__input"
                  value={whatsapp}
                  onChange={(e) => onWhatsappChange(formatarWhatsappInput(e.target.value))}
                  placeholder="(18) 99999-9999"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
              <span className="parceiros-field__help">Com DDD — usado no link ao clicar na logo na home.</span>
            </div>
          </div>

          <LogoUploader nome={nome} file={logoFile} onFileChange={onLogoChange} />
        </div>

        <footer className="parceiros-form__footer">
          <button type="submit" className="parceiros-btn parceiros-btn--primary" disabled={salvando}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
            {salvando ? "Cadastrando…" : "Cadastrar parceiro"}
          </button>
        </footer>
      </form>
    </section>
  );
}
