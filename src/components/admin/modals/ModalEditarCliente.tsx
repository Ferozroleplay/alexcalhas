import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import {
  fetchClienteInventario,
  saveClienteInventario,
  type AgendamentoItem,
  type ClienteInventarioDados,
} from "@/lib/admin-api";

type Props = {
  open: boolean;
  onClose: () => void;
  inventarioId: number | null;
  onSaved: (item: AgendamentoItem) => void;
};

export function ModalEditarCliente({ open, onClose, inventarioId, onSaved }: Props) {
  const [dados, setDados] = useState<ClienteInventarioDados | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !inventarioId) return;
    setLoading(true);
    setError("");
    fetchClienteInventario(inventarioId)
      .then(setDados)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar."))
      .finally(() => setLoading(false));
  }, [open, inventarioId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dados || !inventarioId) return;
    setSaving(true);
    setError("");
    try {
      const item = await saveClienteInventario(inventarioId, dados);
      onSaved(item);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function buscarCep() {
    if (!dados?.cep) return;
    const cep = dados.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await res.json()) as { logradouro?: string; bairro?: string; erro?: boolean };
      if (j.erro) return;
      setDados((d) =>
        d
          ? {
              ...d,
              endereco: j.logradouro || d.endereco,
              bairro: j.bairro || d.bairro,
            }
          : d,
      );
    } catch {
      /* ignore */
    }
  }

  const showVisita = dados?.status === "agendado";
  const showMontagem =
    dados?.status === "confirmado" ||
    dados?.status === "orcamentado" ||
    dados?.status === "orçamentado";

  return (
    <AdminModal open={open} onClose={onClose}>
      <div className="modal-content">
        <div className="modal-header dash-edit-modal__header">
          <div className="dash-edit-modal__head">
            <span className="dash-edit-modal__head-icon" aria-hidden="true">
              <i className="bi bi-person-lines-fill" />
            </span>
            <div>
              <h4 className="modal-title mb-0">Editar dados do cliente</h4>
              <p className="mb-0 small text-muted">Nome, contato, endereço e visita</p>
            </div>
          </div>
          <button type="button" className="btn-close" aria-label="Fechar" onClick={onClose} />
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error ? <div className="alert alert-danger py-2">{error}</div> : null}
            {loading || !dados ? (
              <div className="d-flex justify-content-center py-4">
                <Loader2 className="spin" size={28} aria-label="Carregando" />
              </div>
            ) : (
              <>
                <section className="dash-edit-modal__panel">
                  <div className="row g-2">
                    <div className="col-12 col-md-6">
                      <label className="dash-edit-modal__label">Nome</label>
                      <input
                        className="form-control dash-edit-modal__input"
                        required
                        value={dados.nome}
                        onChange={(e) => setDados({ ...dados, nome: e.target.value })}
                      />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="dash-edit-modal__label">CPF/CNPJ</label>
                      <input
                        className="form-control dash-edit-modal__input"
                        value={dados.cpfCnpj}
                        onChange={(e) => setDados({ ...dados, cpfCnpj: e.target.value })}
                      />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="dash-edit-modal__label">Telefone</label>
                      <input
                        className="form-control dash-edit-modal__input"
                        value={dados.telefone}
                        onChange={(e) => setDados({ ...dados, telefone: e.target.value })}
                      />
                    </div>
                  </div>
                </section>
                <section className="dash-edit-modal__panel">
                  <div className="row g-2">
                    <div className="col-4 col-md-3">
                      <label className="dash-edit-modal__label">CEP</label>
                      <div className="input-group">
                        <input
                          className="form-control dash-edit-modal__input"
                          value={dados.cep}
                          onChange={(e) => setDados({ ...dados, cep: e.target.value })}
                          onBlur={() => void buscarCep()}
                        />
                        <button type="button" className="btn visitas-orc-add-btn" onClick={() => void buscarCep()}>
                          <i className="bi bi-search" />
                        </button>
                      </div>
                    </div>
                    <div className="col-8 col-md-9">
                      <label className="dash-edit-modal__label">Endereço</label>
                      <input
                        className="form-control dash-edit-modal__input"
                        required
                        value={dados.endereco}
                        onChange={(e) => setDados({ ...dados, endereco: e.target.value })}
                      />
                    </div>
                    <div className="col-6 col-md-4">
                      <label className="dash-edit-modal__label">Bairro</label>
                      <input
                        className="form-control dash-edit-modal__input"
                        required
                        value={dados.bairro}
                        onChange={(e) => setDados({ ...dados, bairro: e.target.value })}
                      />
                    </div>
                    <div className="col-6 col-md-2">
                      <label className="dash-edit-modal__label">Nº</label>
                      <input
                        className="form-control dash-edit-modal__input"
                        required
                        value={dados.numero}
                        onChange={(e) => setDados({ ...dados, numero: e.target.value })}
                      />
                    </div>
                  </div>
                </section>
                {showVisita ? (
                  <section className="dash-edit-modal__panel">
                    <div className="row g-2">
                      <div className="col-6">
                        <label className="dash-edit-modal__label">Data visita</label>
                        <input
                          type="date"
                          className="form-control dash-edit-modal__input"
                          value={dados.dataVisita}
                          onChange={(e) => setDados({ ...dados, dataVisita: e.target.value })}
                        />
                      </div>
                      <div className="col-6">
                        <label className="dash-edit-modal__label">Hora</label>
                        <input
                          type="time"
                          className="form-control dash-edit-modal__input"
                          value={dados.horaVisita}
                          onChange={(e) => setDados({ ...dados, horaVisita: e.target.value })}
                        />
                      </div>
                      <div className="col-12">
                        <label className="dash-edit-modal__label">Observação do cliente</label>
                        <textarea
                          className="form-control dash-edit-modal__input"
                          rows={3}
                          placeholder="Projeto, necessidade ou informações extras informadas no agendamento"
                          value={dados.observacao}
                          onChange={(e) => setDados({ ...dados, observacao: e.target.value })}
                        />
                      </div>
                    </div>
                  </section>
                ) : null}
                {showMontagem ? (
                  <section className="dash-edit-modal__panel">
                    <label className="dash-edit-modal__label">Data montagem</label>
                    <input
                      type="date"
                      className="form-control dash-edit-modal__input"
                      value={dados.dataMontagem}
                      onChange={(e) => setDados({ ...dados, dataMontagem: e.target.value })}
                    />
                  </section>
                ) : null}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn visitas-orc-save-btn" disabled={saving || loading || !dados}>
              {saving ? <Loader2 className="spin" size={18} /> : null}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </AdminModal>
  );
}
