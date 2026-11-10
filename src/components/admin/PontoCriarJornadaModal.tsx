import { useEffect, useMemo, useState } from "react";

import { AdminModal } from "@/components/admin/modals/AdminModal";
import { dashToast } from "@/lib/dash-ui";
import { pontoLabelTipo } from "@/lib/ponto-display";
import { PONTO_JORNADA } from "@/lib/ponto-jornada";
import { montarDatetimePonto } from "@/lib/ponto-timezone";

type FuncionarioOpt = { id: number; nome: string };

type JornadaExistente = {
  usuario_id: number;
  usuario_nome: string;
  data: string;
  data_fmt: string;
};

type BatidaCampo = {
  tipo: "entrada" | "almoco" | "retorno_almoco" | "saida";
  hora: string;
};

const CAMPOS: { tipo: BatidaCampo["tipo"]; padrao: string }[] = [
  { tipo: "entrada", padrao: PONTO_JORNADA.entrada },
  { tipo: "almoco", padrao: PONTO_JORNADA.almoco },
  { tipo: "retorno_almoco", padrao: PONTO_JORNADA.retorno },
  { tipo: "saida", padrao: PONTO_JORNADA.saida },
];

type Props = {
  open: boolean;
  onClose: () => void;
  funcionarios: FuncionarioOpt[];
  usuarioInicial: number;
  dataInicial: string;
  jornadas: JornadaExistente[];
  onSaved: (info: { usuarioId: number; data: string }) => void;
  onEditarExistente: (jornada: JornadaExistente) => void;
};

function minutosHora(hora: string): number | null {
  const m = hora.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mi = Number(m[2]);
  if (hh > 23 || mi > 59) return null;
  return hh * 60 + mi;
}

function validarHorarios(horas: Record<BatidaCampo["tipo"], string>): string | null {
  const entrada = horas.entrada.trim();
  const almoco = horas.almoco.trim();
  const retorno = horas.retorno_almoco.trim();
  const saida = horas.saida.trim();

  if (!entrada || !saida) return "Informe a entrada e a saída.";

  const e = minutosHora(entrada);
  const a = almoco ? minutosHora(almoco) : null;
  const r = retorno ? minutosHora(retorno) : null;
  const s = minutosHora(saida);
  if (e == null) return "Horário de entrada inválido.";
  if (almoco && a == null) return "Horário de almoço inválido.";
  if (retorno && r == null) return "Horário de retorno inválido.";
  if (s == null) return "Horário de saída inválido.";
  if (a != null && a <= e) return "O almoço precisa ser depois da entrada.";
  if ((a == null) !== (r == null)) return "Informe almoço e retorno juntos, ou deixe os dois vazios.";
  if (a != null && r != null && r <= a) return "O retorno precisa ser depois do almoço.";
  const anterior = r ?? a ?? e;
  if (s <= anterior) return "A saída precisa ser depois das batidas anteriores.";
  return null;
}

export function PontoCriarJornadaModal({
  open,
  onClose,
  funcionarios,
  usuarioInicial,
  dataInicial,
  jornadas,
  onSaved,
  onEditarExistente,
}: Props) {
  const [usuarioId, setUsuarioId] = useState("");
  const [data, setData] = useState("");
  const [horas, setHoras] = useState<Record<BatidaCampo["tipo"], string>>({
    entrada: PONTO_JORNADA.entrada,
    almoco: PONTO_JORNADA.almoco,
    retorno_almoco: PONTO_JORNADA.retorno,
    saida: PONTO_JORNADA.saida,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const inicial =
      usuarioInicial > 0 && funcionarios.some((f) => f.id === usuarioInicial)
        ? String(usuarioInicial)
        : String(funcionarios[0]?.id ?? "");
    setUsuarioId(inicial);
    setData(dataInicial);
    setHoras({
      entrada: PONTO_JORNADA.entrada,
      almoco: PONTO_JORNADA.almoco,
      retorno_almoco: PONTO_JORNADA.retorno,
      saida: PONTO_JORNADA.saida,
    });
    setSaving(false);
  }, [open, usuarioInicial, dataInicial, funcionarios]);

  const existente = useMemo(() => {
    const uid = Number(usuarioId) || 0;
    if (uid <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
    return jornadas.find((j) => j.usuario_id === uid && j.data === data) ?? null;
  }, [jornadas, usuarioId, data]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const uid = Number(usuarioId) || 0;
    if (uid <= 0) {
      dashToast("Escolha o funcionário.", "danger");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      dashToast("Escolha a data do ponto.", "danger");
      return;
    }
    if (existente) {
      dashToast(`Já existe ponto de ${existente.usuario_nome} em ${existente.data_fmt}.`, "warning");
      return;
    }

    const erro = validarHorarios(horas);
    if (erro) {
      dashToast(erro, "danger");
      return;
    }

    const batidas = CAMPOS.flatMap((c) => {
      const hora = horas[c.tipo].trim();
      if (!hora) return [];
      const registrado_em = montarDatetimePonto(data, hora);
      return registrado_em ? [{ tipo: c.tipo, registrado_em, label: pontoLabelTipo(c.tipo) }] : [];
    });
    if (batidas.length === 0) {
      dashToast("Informe a entrada e a saída.", "danger");
      return;
    }

    setSaving(true);
    const criados: number[] = [];
    try {
      for (const b of batidas) {
        const res = await fetch("/api/admin/ponto-controle", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usuario_id: uid,
            tipo: b.tipo,
            registrado_em: b.registrado_em,
          }),
        });
        const json = (await res.json()) as { ok?: boolean; message?: string; id?: number };
        if (!res.ok) throw new Error(json.message ?? `Não foi possível criar ${b.label}.`);
        if (typeof json.id === "number" && json.id > 0) criados.push(json.id);
      }

      const nome = funcionarios.find((f) => f.id === uid)?.nome ?? "funcionário";
      dashToast(`Ponto criado para ${nome}.`, "success");
      onSaved({ usuarioId: uid, data });
      onClose();
    } catch (err) {
      for (const id of [...criados].reverse()) {
        await fetch(`/api/admin/ponto-controle?id=${id}`, {
          method: "DELETE",
          credentials: "include",
        }).catch(() => undefined);
      }
      dashToast(err instanceof Error ? err.message : "Erro ao criar o ponto.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal open={open} onClose={saving ? () => undefined : onClose} dialogClass="modal-md" closeOnBackdrop={!saving}>
      <form className="modal-content visitas-orc-modal__content" onSubmit={(e) => void salvar(e)}>
        <div className="modal-header visitas-orc-modal__header flex-shrink-0">
          <div className="visitas-orc-modal__head">
            <span className="visitas-orc-modal__head-icon" aria-hidden="true">
              <i className="bi bi-plus-lg" />
            </span>
            <div>
              <h4 className="modal-title visitas-orc-modal__title mb-0">Criar ponto</h4>
              <p className="visitas-orc-modal__subtitle mb-0">
                Quando o funcionário esquece de bater
              </p>
            </div>
          </div>
          <button type="button" className="btn-close" aria-label="Fechar" disabled={saving} onClick={onClose} />
        </div>

        <div className="modal-body dash-edit-modal__body">
          <p className="text-muted small mb-3">
            A jornada padrão já vem preenchida ({PONTO_JORNADA.entrada}–{PONTO_JORNADA.almoco} e{" "}
            {PONTO_JORNADA.retorno}–{PONTO_JORNADA.saida}). Ajuste os horários se o dia foi diferente.
          </p>
          <div className="row g-3">
            <div className="col-12">
              <label className="dash-edit-modal__label" htmlFor="ponto-criar-func">
                Funcionário
              </label>
              <select
                id="ponto-criar-func"
                className="form-select dash-edit-modal__input"
                value={usuarioId}
                disabled={saving}
                onChange={(e) => setUsuarioId(e.target.value)}
              >
                {funcionarios.length === 0 ? <option value="">Nenhum funcionário</option> : null}
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="dash-edit-modal__label" htmlFor="ponto-criar-data">
                Data
              </label>
              <input
                id="ponto-criar-data"
                type="date"
                className="form-control dash-edit-modal__input"
                value={data}
                disabled={saving}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            {CAMPOS.map((c) => (
              <div key={c.tipo} className="col-12 col-sm-6">
                <label className="dash-edit-modal__label" htmlFor={`ponto-criar-${c.tipo}`}>
                  {pontoLabelTipo(c.tipo)}
                </label>
                <input
                  id={`ponto-criar-${c.tipo}`}
                  type="time"
                  className="form-control dash-edit-modal__input dash-ponto-edit-time"
                  value={horas[c.tipo]}
                  disabled={saving}
                  onChange={(e) =>
                    setHoras((prev) => ({
                      ...prev,
                      [c.tipo]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          {existente ? (
            <div className="alert alert-warning mt-3 mb-0">
              Já existe ponto de {existente.usuario_nome} em {existente.data_fmt}. Corrija os horários
              em vez de criar outro.
              <div className="mt-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-dark"
                  onClick={() => onEditarExistente(existente)}
                >
                  Corrigir este dia
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="modal-footer visitas-orc-modal__footer flex-shrink-0">
          <button type="button" className="btn dash-edit-modal__btn-cancel" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn dash-edit-modal__btn-save"
            disabled={saving || Boolean(existente) || funcionarios.length === 0}
          >
            {saving ? "Salvando…" : "Criar ponto"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
