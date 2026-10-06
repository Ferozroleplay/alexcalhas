import type { InventarioRecebimentoItem, RecebimentoResumo } from "@/lib/admin-api";
import { formatMoeda } from "@/lib/financeiro-display";
import { parsePagoEm, valorReaisPorExtenso } from "@/lib/inventario-recebimento-display";
import { formatOsDocumento, formatOsTelefone, OS_ORCAMENTO_EMPRESA } from "@/lib/os-document";

export type ReciboServico = {
  nome: string;
  detalhe?: string;
  valor?: number;
};

export type ReciboCliente = {
  id: number;
  nome: string;
  cpfCnpj: string | null;
  telefone: string;
  endereco: string;
  numero: string;
  bairro: string;
  cep: string;
  dataMontagem?: string | null;
  formaPagamento?: string | null;
  servicos?: ReciboServico[];
};

type Props = {
  cliente: ReciboCliente;
  pagamento: InventarioRecebimentoItem;
  valorOrcamento: number;
  resumo: RecebimentoResumo;
};

const FORMAS = [
  { id: "pix", label: "Pix" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "cartao", label: "Cartão" },
  { id: "transferencia", label: "Transferência" },
  { id: "outro", label: "Outro" },
] as const;

function enderecoCliente(c: ReciboCliente): string {
  const end = c.endereco.trim();
  const num = c.numero.trim();
  const bairro = c.bairro.trim();
  const cep = c.cep.trim();

  let rua = end;
  if (num && end && !new RegExp(`\\b${num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(end)) {
    const corte = end.indexOf(" - ");
    rua = corte > 0 ? `${end.slice(0, corte)}, ${num}${end.slice(corte)}` : `${end}, ${num}`;
  } else if (num && !end) {
    rua = num;
  }

  const base = [rua, bairro].filter(Boolean).join(" — ");
  if (!base && !cep) return "";
  return cep ? `${base} — CEP ${cep}` : base;
}

function dataCurta(raw: string): string {
  const d = parsePagoEm(raw);
  if (!d) return "";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function capitalizar(texto: string): string {
  const t = texto.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formaMarcada(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "";
  if (t.startsWith("pix")) return "pix";
  if (t.startsWith("credito") || t.startsWith("crédito") || t.startsWith("debito") || t.startsWith("débito")) {
    return "cartao";
  }
  if (t.includes("dinheiro") || t.includes("espécie") || t.includes("especie")) return "dinheiro";
  if (t.includes("transfer")) return "transferencia";
  return "";
}

function situacaoMarcada(
  pagamento: InventarioRecebimentoItem,
  valorOrcamento: number,
  resumo: RecebimentoResumo,
): "integral" | "entrada" | "final" | "" {
  if (valorOrcamento > 0 && pagamento.valor + 0.009 >= valorOrcamento) return "integral";
  if (resumo.quitado && resumo.qtdPagamentos <= 1) return "integral";
  if (pagamento.tipo === "sinal") return "entrada";
  if (pagamento.tipo === "saldo" || resumo.quitado) return "final";
  return "";
}

function Ico({ children }: { children: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={children} />
    </svg>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={`recibo-check${on ? " is-on" : ""}`} aria-hidden="true">
      {on ? (
        <svg viewBox="0 0 24 24">
          <path fill="currentColor" d="M9.2 16.2 4.8 11.8l1.4-1.4 3 3 8.6-8.6 1.4 1.4z" />
        </svg>
      ) : null}
    </span>
  );
}

export function ReciboRecebimentoDocument({ cliente, pagamento, valorOrcamento, resumo }: Props) {
  const empresa = OS_ORCAMENTO_EMPRESA;
  const numero = String(pagamento.id).padStart(6, "0");
  const doc = formatOsDocumento(cliente.cpfCnpj);
  const fone = cliente.telefone.trim() ? formatOsTelefone(cliente.telefone) : "";
  const endereco = enderecoCliente(cliente);
  const servicos = (cliente.servicos ?? []).filter((item) => item.nome?.trim());
  const forma = formaMarcada(cliente.formaPagamento);
  const situacao = situacaoMarcada(pagamento, valorOrcamento, resumo);
  const extenso = capitalizar(valorReaisPorExtenso(pagamento.valor));
  const obsLivre = pagamento.observacao?.trim() ?? "";
  const saldo =
    resumo.quitado || resumo.saldoPendente <= 0.009 ? "" : `Saldo em aberto deste serviço: R$ ${formatMoeda(resumo.saldoPendente)}.`;

  return (
    <article className="recibo-page" id="recibo-documento">
      <header className="recibo-marca">
        <img className="recibo-logo" src={empresa.logoSrc} alt="Alex Calhas" />
        <ul className="recibo-selos">
          <li>
            <span>
              <Ico>M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.4 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.13-.54 1.63-.94l2.39.96c.23.1.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z</Ico>
            </span>
            Fabricação
            <br />
            personalizada
          </li>
          <li>
            <span>
              <Ico>M12 2 4 5v6.1c0 5 3.4 9.7 8 10.9 4.6-1.2 8-5.9 8-10.9V5zm-1.1 14.2-3.6-3.6 1.4-1.4 2.2 2.2 4.4-4.4 1.4 1.4z</Ico>
            </span>
            Materiais
            <br />
            de qualidade
          </li>
          <li>
            <span>
              <Ico>M16.5 11c1.4 0 2.5-1.3 2.5-2.8S17.9 5.5 16.5 5.5 14 6.8 14 8.2s1.1 2.8 2.5 2.8zM8 11c1.4 0 2.5-1.3 2.5-2.8S9.4 5.5 8 5.5 5.5 6.8 5.5 8.2 6.6 11 8 11zm0 1.5c-1.8 0-5.5.9-5.5 2.7V17h11v-1.8c0-1.8-3.7-2.7-5.5-2.7zm8.5 0c-.2 0-.5 0-.8.1 1 .7 1.8 1.7 1.8 2.9V17H22v-1.8c0-1.8-3.2-2.7-5.5-2.7z</Ico>
            </span>
            Atendimento
            <br />
            de confiança
          </li>
        </ul>
      </header>

      <section className="recibo-banner">
        <div className="recibo-banner__titulo">
          <span>
            <Ico>M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 7V3.5L18.5 9zM8 13h8v1.6H8zm0 3.2h8V18H8zm0-6.4h5v1.6H8z</Ico>
          </span>
          <div>
            <h1>Recibo de pagamento</h1>
            <p>Materiais e/ou serviços</p>
          </div>
        </div>
        <div className="recibo-banner__meta">
          <span>Nº do recibo</span>
          <strong>{numero}</strong>
          <span>Data</span>
          <strong>{dataCurta(pagamento.pago_em)}</strong>
          <span>OS</span>
          <strong>#{cliente.id}</strong>
        </div>
      </section>

      <section className="recibo-bloco">
        <h2>
          <span>
            <Ico>M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z</Ico>
          </span>
          Dados do cliente
        </h2>
        <div className="recibo-campos">
          <p>
            <span>Nome / razão social:</span>
            <strong>{cliente.nome || "—"}</strong>
          </p>
          <p>
            <span>CPF / CNPJ:</span>
            <strong>{doc !== "—" ? doc : ""}</strong>
          </p>
          <p>
            <span>Endereço:</span>
            <strong>{endereco}</strong>
          </p>
          <p>
            <span>Telefone:</span>
            <strong>{fone}</strong>
          </p>
        </div>
      </section>

      <section className="recibo-bloco">
        <h2>
          <span>
            <Ico>M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z</Ico>
          </span>
          Descrição do pagamento
        </h2>
        <table className="recibo-desc">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {servicos.length > 0 ? (
              servicos.map((item, i) => (
                <tr key={`${item.nome}-${i}`}>
                  <td>
                    {item.nome}
                    {item.detalhe ? <small>{item.detalhe}</small> : null}
                  </td>
                  <td>{typeof item.valor === "number" ? `R$ ${formatMoeda(item.valor)}` : ""}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>Materiais e/ou serviços conforme orçamento aprovado.</td>
                <td>R$ {formatMoeda(pagamento.valor)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="recibo-recebido">
        <div>
          <span>
            <Ico>M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5h-2V15h2zm0-3.2h-2v-6h2z</Ico>
          </span>
          <div>
            <strong>Valor recebido</strong>
            <em>({extenso})</em>
          </div>
        </div>
        <b>R$ {formatMoeda(pagamento.valor)}</b>
      </section>

      <section className="recibo-opcoes">
        <h2>
          <span>
            <Ico>M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 6H4V6h16z</Ico>
          </span>
          Forma de pagamento
        </h2>
        <div>
          {FORMAS.map((item) => (
            <label key={item.id}>
              <Check on={forma === item.id} />
              {item.label}
              {item.id === "outro" ? <i /> : null}
            </label>
          ))}
        </div>
      </section>

      <section className="recibo-opcoes">
        <h2>
          <span>
            <Ico>M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8zm0 7H8V7h6z</Ico>
          </span>
          Situação do pagamento
        </h2>
        <div>
          <label>
            <Check on={situacao === "integral"} />
            Pagamento integral
          </label>
          <label>
            <Check on={situacao === "entrada"} />
            Entrada
          </label>
          <label>
            <Check on={situacao === "final"} />
            Pagamento final
          </label>
        </div>
      </section>

      <section className="recibo-bloco">
        <h2>
          <span>
            <Ico>M4 4h16v12H5.2L4 17.2zm2 2v7h12V6z</Ico>
          </span>
          Observações
        </h2>
        <p className="recibo-obs">
          {obsLivre ? (
            <>
              {obsLivre}
              <br />
            </>
          ) : null}
          Este recibo comprova exclusivamente o recebimento do valor indicado acima, referente ao pagamento dos
          materiais e/ou serviços descritos no orçamento correspondente.
          {saldo ? (
            <>
              {" "}
              {saldo}
            </>
          ) : null}
        </p>
      </section>

      <footer className="recibo-assinaturas">
        <div>
          <img src={empresa.assinaturaSrc} alt="" />
          <span />
          <strong>{empresa.assinaturaNome}</strong>
          <small>{empresa.assinaturaCargo}</small>
        </div>
        <div>
          <span className="recibo-linha-cliente" />
          <strong>Assinatura do cliente</strong>
          <small>Data: ______ / ______ / __________</small>
        </div>
      </footer>

      <p className="recibo-obrigado">
        Agradecemos a preferência!
        <small>Alex Calhas — Qualidade em calhas, rufos e pingadeiras.</small>
      </p>

      <div className="recibo-rodape">
        <span>
          <Ico>M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 14.15c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.12.07-1.81-.11-.41-.11-.95-.31-1.64-.61-2.88-1.25-4.76-4.15-4.9-4.34-.14-.2-1.17-1.56-1.17-2.97 0-1.42.74-2.11 1-2.4.26-.28.57-.35.76-.35.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.57.8 1.97.87 2.11.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.37-.41.49-.14.14-.28.29-.12.56.16.28.7 1.16 1.51 1.88 1.04.92 1.91 1.21 2.18 1.35.28.14.44.12.6-.07.16-.19.69-.8.87-1.08.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.46.21.53.33.07.12.07.68-.17 1.36z</Ico>
          {empresa.telefone1}
        </span>
        <span>
          <Ico>M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 4.2A4.8 4.8 0 1 0 16.8 12 4.8 4.8 0 0 0 12 7.2zm6.1-.9a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1zM12 9.1A2.9 2.9 0 1 1 9.1 12 2.9 2.9 0 0 1 12 9.1z</Ico>
          @alexcalhas
        </span>
        <span>
          <Ico>M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm7.9 9h-3.1a15 15 0 0 0-1.2-5 8.1 8.1 0 0 1 4.3 5zM12 4c.8 1.1 1.9 3.2 2.2 7H9.8C10.1 7.2 11.2 5.1 12 4zM4.1 13h3.1a15 15 0 0 0 1.2 5 8.1 8.1 0 0 1-4.3-5zm3.1-2H4.1a8.1 8.1 0 0 1 4.3-5 15 15 0 0 0-1.2 5zM12 20c-.8-1.1-1.9-3.2-2.2-7h4.4c-.3 3.8-1.4 5.9-2.2 7zm2.6-2a15 15 0 0 0 1.2-5h3.1a8.1 8.1 0 0 1-4.3 5z</Ico>
          www.alexcalhas.com
        </span>
      </div>
    </article>
  );
}
