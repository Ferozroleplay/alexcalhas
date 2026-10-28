import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { HOME_SITE, waUrl } from "@/data/home-config";
import { AcAgendarSucessoModal } from "@/components/site/home/AcAgendarSucessoModal";
import { enviarAgendamento, fetchHorariosVisita } from "@/lib/agendamentos";
import { pontoHojeIso } from "@/lib/ponto-timezone";
import { fetchConsultaDocumentoSite, fetchViaCep } from "@/lib/site-consulta-client";
import { agendamentoSiteSchema } from "@/lib/validation";

type FormState = {
  nome: string;
  cpfCnpj: string;
  telefone: string;
  endereco: string;
  bairro: string;
  cep: string;
  numero: string;
  data: string;
  hora: string;
  observacao: string;
};

const initial: FormState = {
  nome: "",
  cpfCnpj: "",
  telefone: "",
  endereco: "",
  bairro: "",
  cep: "",
  numero: "",
  data: "",
  hora: "",
  observacao: "",
};

function maskCpfCnpj(digits: string): string {
  const v = digits.replace(/\D/g, "").slice(0, 14);
  if (v.length <= 11) {
    return v
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return v
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskCep(digits: string): string {
  const v = digits.replace(/\D/g, "").slice(0, 8);
  if (v.length <= 5) return v;
  return `${v.slice(0, 5)}-${v.slice(5)}`;
}

function maskTelefone(digits: string): string {
  const v = digits.replace(/\D/g, "").slice(0, 11);
  if (v.length <= 10) {
    return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function AcAgendarForm() {
  const [form, setForm] = useState<FormState>(initial);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sucessoOpen, setSucessoOpen] = useState(false);
  const [sucessoInfo, setSucessoInfo] = useState<{ nome: string; data: string; hora?: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [horarios, setHorarios] = useState<string[]>([]);
  const [horaLoading, setHoraLoading] = useState(false);

  const lastCepFetched = useRef("");
  const lastDocFetched = useRef("");
  const cepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = document.getElementById("ac-ag-data") as HTMLInputElement | null;
    if (el) el.min = pontoHojeIso();
  }, []);

  const showError = (msg: string) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setErrorMsg(msg);
    window.setTimeout(() => {
      document.getElementById("ac-agendar-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };

  const aplicarViaCep = useCallback((data: NonNullable<Awaited<ReturnType<typeof fetchViaCep>>>) => {
    if (data.erro) return false;
    setForm((f) => ({
      ...f,
      bairro: data.bairro?.trim() || f.bairro,
      endereco:
        [data.logradouro, data.localidade, data.uf].filter(Boolean).join(" - ").trim() || f.endereco,
    }));
    return true;
  }, []);

  const buscarCep = useCallback(
    async (cepRaw?: string, silent = false) => {
      const cep = (cepRaw ?? form.cep).replace(/\D/g, "");
      if (cep.length !== 8) return;
      if (lastCepFetched.current === cep) return;

      setCepLoading(true);
      try {
        const data = await fetchViaCep(cep);
        if (!data || data.erro) {
          if (!silent) showError("CEP não encontrado.");
          return;
        }
        lastCepFetched.current = cep;
        aplicarViaCep(data);
        if (!silent) document.getElementById("ac-ag-numero")?.focus();
      } catch {
        if (!silent) showError("Erro ao buscar CEP. Tente novamente.");
      } finally {
        setCepLoading(false);
      }
    },
    [form.cep, aplicarViaCep],
  );

  const preencherDocumento = useCallback(
    async (data: {
      nome?: string | null;
      telefone?: string | null;
      cep?: string | null;
      endereco?: string | null;
      bairro?: string | null;
      numero?: string | null;
    }) => {
      setForm((f) => {
        const next = { ...f };
        if (data.nome?.trim()) next.nome = data.nome.trim();
        if (data.telefone?.trim()) next.telefone = maskTelefone(data.telefone.replace(/\D/g, ""));
        if (data.cep?.trim()) next.cep = maskCep(data.cep.replace(/\D/g, ""));
        if (data.endereco?.trim()) next.endereco = data.endereco.trim();
        if (data.bairro?.trim()) next.bairro = data.bairro.trim();
        if (data.numero?.trim()) next.numero = data.numero.trim();
        return next;
      });

      const cepDigits = (data.cep ?? "").replace(/\D/g, "");
      if (cepDigits.length === 8 && !data.bairro?.trim()) {
        lastCepFetched.current = "";
        await buscarCep(cepDigits, true);
      }
    },
    [buscarCep],
  );

  useEffect(() => {
    if (cepTimer.current) clearTimeout(cepTimer.current);
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      lastCepFetched.current = "";
      return;
    }
    cepTimer.current = setTimeout(() => {
      void buscarCep(digits, true);
    }, 450);
    return () => {
      if (cepTimer.current) clearTimeout(cepTimer.current);
    };
  }, [form.cep, buscarCep]);

  useEffect(() => {
    if (docTimer.current) clearTimeout(docTimer.current);
    const digits = form.cpfCnpj.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      lastDocFetched.current = "";
      setDocLoading(false);
      return;
    }

    docTimer.current = setTimeout(() => {
      if (lastDocFetched.current === digits) return;
      setDocLoading(true);
      void fetchConsultaDocumentoSite(digits)
        .then(async (res) => {
          if (res.status === "sucesso") {
            lastDocFetched.current = digits;
            await preencherDocumento(res);
          }
        })
        .catch(() => {})
        .finally(() => setDocLoading(false));
    }, 650);

    return () => {
      if (docTimer.current) clearTimeout(docTimer.current);
    };
  }, [form.cpfCnpj, preencherDocumento]);

  useEffect(() => {
    if (!form.data) {
      setHorarios([]);
      setHoraLoading(false);
      return;
    }

    const ac = new AbortController();
    setHoraLoading(true);
    void fetchHorariosVisita(form.data, ac.signal)
      .then((livres) => {
        setHorarios(livres);
        setForm((f) => ({ ...f, hora: livres.includes(f.hora) ? f.hora : "" }));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHorarios([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setHoraLoading(false);
      });

    return () => ac.abort();
  }, [form.data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = agendamentoSiteSchema.safeParse({
      ...form,
      origem: "site" as const,
    });
    if (!parsed.success) {
      showError(parsed.error.issues[0]?.message ?? "Preencha os campos obrigatórios.");
      return;
    }

    setSubmitting(true);
    try {
      const criado = await enviarAgendamento(parsed.data);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      setSucessoInfo({ nome: parsed.data.nome, data: parsed.data.data, hora: criado.hora });
      setSucessoOpen(true);
      setErrorMsg(null);
      setForm(initial);
      setHorarios([]);
      lastCepFetched.current = "";
      lastDocFetched.current = "";
      const el = document.getElementById("ac-ag-data") as HTMLInputElement | null;
      if (el) el.min = pontoHojeIso();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Não foi possível agendar. Tente novamente.");
      if (form.data) {
        void fetchHorariosVisita(form.data).then(setHorarios).catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || cepLoading || docLoading || horaLoading;

  return (
    <div className="ac-contact__form-wrap ac-agendar-card">
      <h2>Agendar visita</h2>
      <p className="ac-agendar-card__desc">
        Preencha os dados — o agendamento aparece na área administrativa na hora.
      </p>
      <form id="ac-agendar-form" className="ac-agendar-form" noValidate onSubmit={(e) => void onSubmit(e)}>
        <div className="ac-form-row">
          <div className="ac-form-group">
            <label htmlFor="ac-ag-nome">Nome</label>
            <input
              type="text"
              id="ac-ag-nome"
              required
              autoComplete="name"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            />
          </div>
          <div className="ac-form-group">
            <label htmlFor="ac-ag-cpf">CPF/CNPJ</label>
            <input
              type="text"
              id="ac-ag-cpf"
              placeholder="Opcional"
              inputMode="numeric"
              maxLength={18}
              autoComplete="off"
              value={form.cpfCnpj}
              aria-busy={docLoading}
              onChange={(e) => {
                lastDocFetched.current = "";
                setForm((f) => ({ ...f, cpfCnpj: maskCpfCnpj(e.target.value) }));
              }}
            />
          </div>
        </div>
        <div className="ac-form-row">
          <div className="ac-form-group">
            <label htmlFor="ac-ag-telefone">Telefone</label>
            <input
              type="tel"
              id="ac-ag-telefone"
              required
              autoComplete="tel"
              placeholder="(18) 99999-9999"
              value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: maskTelefone(e.target.value) }))}
            />
          </div>
          <div className="ac-form-group">
            <label htmlFor="ac-ag-endereco">Endereço</label>
            <input
              type="text"
              id="ac-ag-endereco"
              required
              autoComplete="street-address"
              value={form.endereco}
              onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
            />
          </div>
        </div>
        <div className="ac-form-row">
          <div className="ac-form-group">
            <label htmlFor="ac-ag-bairro">Bairro</label>
            <input
              type="text"
              id="ac-ag-bairro"
              required
              value={form.bairro}
              onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))}
            />
          </div>
          <div className="ac-form-group ac-form-group--cep">
            <label htmlFor="ac-ag-cep">CEP</label>
            <div className="ac-input-group">
              <input
                type="text"
                id="ac-ag-cep"
                placeholder="Opcional"
                maxLength={9}
                inputMode="numeric"
                value={form.cep}
                aria-busy={cepLoading}
                onChange={(e) => {
                  lastCepFetched.current = "";
                  setForm((f) => ({ ...f, cep: maskCep(e.target.value) }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void buscarCep();
                  }
                }}
              />
              <button
                type="button"
                className="ac-btn-cep"
                id="ac-buscar-cep"
                disabled={busy}
                onClick={() => void buscarCep(undefined, false)}
              >
                {cepLoading ? "…" : "Buscar"}
              </button>
            </div>
            {cepLoading ? (
              <p className="small text-muted mb-0 mt-1" role="status">
                Buscando CEP…
              </p>
            ) : null}
          </div>
        </div>
        <div className="ac-form-row">
          <div className="ac-form-group ac-form-group--num">
            <label htmlFor="ac-ag-numero">Nº</label>
            <input type="text" id="ac-ag-numero" required value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} />
          </div>
          <div className="ac-form-group">
            <label htmlFor="ac-ag-data">Data</label>
            <input
              type="date"
              id="ac-ag-data"
              required
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value, hora: "" }))}
            />
          </div>
        </div>
        <div className="ac-form-group">
          <span className="ac-agendar-hora-label" id="ac-ag-hora-label">
            Horário
          </span>
          {!form.data ? (
            <p className="ac-agendar-hora-hint">Escolha a data para ver os horários disponíveis.</p>
          ) : horaLoading ? (
            <p className="ac-agendar-hora-hint" role="status">
              Buscando horários…
            </p>
          ) : horarios.length === 0 ? (
            <p className="ac-agendar-hora-hint ac-agendar-hora-hint--warn">
              Esse dia já está cheio. Escolha outra data.
            </p>
          ) : (
            <>
              <div className="ac-hora-slots" role="group" aria-labelledby="ac-ag-hora-label">
                {horarios.map((hora) => (
                  <button
                    key={hora}
                    type="button"
                    className={`ac-hora-slot${form.hora === hora ? " is-selected" : ""}`}
                    aria-pressed={form.hora === hora}
                    disabled={busy}
                    onClick={() => setForm((f) => ({ ...f, hora }))}
                  >
                    {hora}
                  </button>
                ))}
              </div>
              <p className="ac-agendar-hora-hint">Horários com 2 horas de intervalo entre visitas.</p>
            </>
          )}
        </div>
        <div className="ac-form-group">
          <label htmlFor="ac-ag-obs">
            Observação <span className="ac-label-opt">(opcional)</span>
          </label>
          <textarea
            id="ac-ag-obs"
            rows={3}
            placeholder="Descreva seu projeto ou necessidade"
            value={form.observacao}
            onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
          />
        </div>
        {errorMsg ? (
          <div
            id="ac-agendar-error"
            className="ac-form-alert ac-form-alert--danger"
            role="alert"
            aria-live="assertive"
          >
            <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" /> {errorMsg}
          </div>
        ) : null}
        <button type="submit" className="ac-btn ac-btn--primary ac-btn--lg ac-btn--block" id="ac-agendar-submit" disabled={submitting}>
          <i className="bi bi-calendar-check" aria-hidden="true" /> {submitting ? "Enviando…" : "Agendar"}
        </button>
        <p className="ac-agendar-wa">
          Prefere falar agora?{" "}
          <a href={waUrl(HOME_SITE.whatsapp, HOME_SITE.whatsappMsg)} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </p>
      </form>
      {errorMsg ? (
        <div className="ac-form-toast ac-form-toast--danger" role="alert" aria-live="assertive">
          <i className="bi ac-form-toast__icon bi-exclamation-triangle-fill" aria-hidden="true" />
          <p className="ac-form-toast__text">{errorMsg}</p>
          <button type="button" className="ac-form-toast__close" aria-label="Fechar aviso" onClick={() => setErrorMsg(null)}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <AcAgendarSucessoModal
        open={sucessoOpen}
        onClose={() => setSucessoOpen(false)}
        nome={sucessoInfo?.nome}
        dataVisita={sucessoInfo?.data}
        horaVisita={sucessoInfo?.hora}
      />
    </div>
  );
}
