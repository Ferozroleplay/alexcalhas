import { AdminModal } from "@/components/admin/modals/AdminModal";
import { LogoUploader } from "@/components/admin/parceiros/LogoUploader";
import { formatarWhatsappInput } from "@/components/admin/parceiros/format-whatsapp";

export type PartnerEditState = {
  id: number;
  nome: string;
  whatsapp: string;
  ativo: boolean;
  logo_url: string;
};

type Props = {
  open: boolean;
  edit: PartnerEditState | null;
  editLogo: File | null;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<PartnerEditState>) => void;
  onLogoChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function PartnerEditModal({
  open,
  edit,
  editLogo,
  saving,
  onClose,
  onChange,
  onLogoChange,
  onSubmit,
}: Props) {
  return (
    <AdminModal open={open} onClose={onClose} dialogClass="modal-lg">
      <div className="modal-content dash-edit-modal__content parceiros-modal">
        <div className="modal-header dash-edit-modal__header">
          <div className="dash-edit-modal__head">
            <h5 className="dash-edit-modal__title mb-0">Editar parceiro</h5>
            <p className="dash-edit-modal__subtitle mb-0">
              Alterações refletem na faixa de parceiros da página inicial.
            </p>
          </div>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
        </div>
        {edit ? (
          <form onSubmit={onSubmit}>
            <div className="modal-body dash-edit-modal__body">
              <div className="parceiros-form__grid parceiros-form__grid--modal">
                <div className="parceiros-form__fields">
                  <div className="parceiros-field">
                    <label className="parceiros-field__label" htmlFor="edit-parceiro-nome">
                      Nome do parceiro
                    </label>
                    <input
                      id="edit-parceiro-nome"
                      className="parceiros-field__input"
                      value={edit.nome}
                      onChange={(e) => onChange({ nome: e.target.value })}
                      maxLength={120}
                      required
                    />
                  </div>
                  <div className="parceiros-field">
                    <label className="parceiros-field__label" htmlFor="edit-parceiro-wa">
                      WhatsApp
                    </label>
                    <div className="parceiros-field__input-group">
                      <span className="parceiros-field__addon" aria-hidden="true">
                        <i className="bi bi-whatsapp" />
                      </span>
                      <input
                        id="edit-parceiro-wa"
                        className="parceiros-field__input"
                        value={edit.whatsapp}
                        onChange={(e) =>
                          onChange({ whatsapp: formatarWhatsappInput(e.target.value) })
                        }
                        placeholder="(18) 99999-9999"
                        inputMode="tel"
                      />
                    </div>
                  </div>
                  <label className="parceiros-check">
                    <input
                      type="checkbox"
                      className="parceiros-check__input"
                      checked={edit.ativo}
                      onChange={(e) => onChange({ ativo: e.target.checked })}
                    />
                    <span className="parceiros-check__box" aria-hidden="true" />
                    <span className="parceiros-check__label">Exibir na página inicial</span>
                  </label>
                </div>
                <LogoUploader
                  nome={edit.nome}
                  logoUrl={edit.logo_url}
                  file={editLogo}
                  onFileChange={onLogoChange}
                  id="edit-parceiro-logo"
                />
              </div>
            </div>
            <div className="modal-footer dash-edit-modal__footer">
              <button type="button" className="dash-edit-modal__btn-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="dash-edit-modal__btn-save" disabled={saving}>
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </AdminModal>
  );
}
