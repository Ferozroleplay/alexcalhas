import type { HoleriteFuncionario } from "@/lib/holerite";
import { PONTO_CARGA_DIA_LABEL, PONTO_JORNADA } from "@/lib/ponto-jornada";
import { OS_ORCAMENTO_EMPRESA, formatOsMoney } from "@/lib/os-document";

type Props = {
  holerites: HoleriteFuncionario[];
};

function money(n: number): string {
  if (n <= 0) return "";
  return formatOsMoney(n);
}

function Folha({ h }: { h: HoleriteFuncionario }) {
  const empresa = OS_ORCAMENTO_EMPRESA;
  const endereco = `${empresa.enderecoLinha1} · ${empresa.enderecoLinha2} · ${empresa.cidade}`;
  const linhasPad = Math.max(0, 5 - h.linhas.length);
  const rowspanAssina = 5 + h.linhas.length + linhasPad;

  return (
    <article id={`holerite-folha-${h.usuario_id}`} className="holerite-folha">
      <table className="h-sheet">
        <colgroup>
          <col className="h-c1" />
          <col className="h-c2" />
          <col className="h-c3" />
          <col className="h-c4" />
          <col className="h-c5" />
          <col className="h-c6" />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={3} className="h-emp">
              <span className="h-kicker">Empregador</span>
              <div className="h-emp__row">
                <img src={empresa.logoSrc} alt="" />
                <div>
                  <strong>Alex Calhas</strong>
                  <p>CNPJ {empresa.cnpj}</p>
                  <p>{endereco}</p>
                </div>
              </div>
            </td>
            <td colSpan={2} className="h-title">
              <h1>Recibo de pagamento de salário</h1>
              <p>Referente a {h.mes_label}</p>
            </td>
            <td rowSpan={rowspanAssina} className="h-sign">
              <div className="h-sign__box">
                <svg
                  className="h-sign__svg"
                  viewBox="0 0 100 520"
                  width="100"
                  height="520"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <g transform="translate(22,508) rotate(-90)">
                    <text
                      x="0"
                      y="0"
                      fill="#173528"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="8.5"
                      fontWeight="700"
                      letterSpacing="1.15"
                      textLength="490"
                      lengthAdjust="spacing"
                    >
                      DECLARO TER RECEBIDO A IMPORTÂNCIA LÍQUIDA DISCRIMINADA NESTE RECIBO.
                    </text>
                  </g>
                  <line x1="52" y1="16" x2="52" y2="408" stroke="#173528" strokeWidth="1.2" />
                  <g transform="translate(72,400) rotate(-90)">
                    <text
                      x="0"
                      y="0"
                      fill="#173528"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="8"
                      fontWeight="700"
                      letterSpacing="1.5"
                      textLength="230"
                      lengthAdjust="spacing"
                    >
                      ASSINATURA DO FUNCIONÁRIO
                    </text>
                  </g>
                  <g transform="translate(90,508) rotate(-90)">
                    <text
                      x="0"
                      y="0"
                      fill="#173528"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fontSize="8"
                      fontWeight="700"
                      letterSpacing="2"
                    >
                      DATA{"\u00A0\u00A0/\u00A0\u00A0\u00A0\u00A0\u00A0/"}
                    </text>
                  </g>
                </svg>
              </div>
            </td>
          </tr>

          <tr className="h-head">
            <th>Código</th>
            <th>Nome do funcionário</th>
            <th>Função</th>
            <th>Diária</th>
            <th>Período</th>
          </tr>
          <tr className="h-who">
            <td>{h.codigo}</td>
            <td className="h-name">{h.nome}</td>
            <td>{h.funcao}</td>
            <td className="h-num">R$ {formatOsMoney(h.valor_diario)}</td>
            <td>{h.mes_label}</td>
          </tr>

          <tr className="h-head">
            <th>Cód.</th>
            <th>Descrição</th>
            <th>Referência</th>
            <th>Proventos</th>
            <th>Descontos</th>
          </tr>
          {h.linhas.map((l) => (
            <tr key={l.codigo} className="h-item">
              <td>{l.codigo}</td>
              <td>{l.descricao}</td>
              <td>{l.referencia}</td>
              <td className="h-num">{money(l.provento)}</td>
              <td className="h-num">{money(l.desconto)}</td>
            </tr>
          ))}
          {Array.from({ length: linhasPad }).map((_, i) => (
            <tr key={`p-${i}`} className="h-item h-item--empty">
              <td>&nbsp;</td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}

          <tr className="h-foot">
            <td colSpan={3} className="h-msg">
              <strong>Mensagens</strong>
              <p>
                Jornada {PONTO_JORNADA.entrada}–{PONTO_JORNADA.almoco} e {PONTO_JORNADA.retorno}–
                {PONTO_JORNADA.saida} ({PONTO_CARGA_DIA_LABEL}).
              </p>
              <p>
                {h.dias_diaria} diária{h.dias_diaria === 1 ? "" : "s"}
                {h.dias_empreita > 0 ? ` · ${h.dias_empreita} empreita${h.dias_empreita === 1 ? "" : "s"}` : ""}
                {h.dias_falta > 0 ? ` · ${h.dias_falta} falta${h.dias_falta === 1 ? "" : "s"}` : " · nenhuma falta"}
                .
              </p>
              {h.faltas.length > 0 ? <p>Faltas: {h.faltas.join(", ")}.</p> : null}
              {h.empreitas.length > 0 ? (
                <p>
                  Comissão (empreitas):{" "}
                  {h.empreitas.map((e) => `${e.data_fmt} R$ ${formatOsMoney(e.valor)}`).join(" · ")}.
                </p>
              ) : null}
            </td>
            <td colSpan={2} className="h-tot">
              <div>
                <span>Total dos vencimentos</span>
                <strong>R$ {formatOsMoney(h.total_proventos)}</strong>
              </div>
              <div>
                <span>Total dos descontos</span>
                <strong>R$ {formatOsMoney(h.total_descontos)}</strong>
              </div>
              <div className="h-liq">
                <span>Líquido a receber</span>
                <strong>R$ {formatOsMoney(h.liquido)}</strong>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}

export function HoleriteDocument({ holerites }: Props) {
  if (holerites.length === 0) {
    return (
      <div className="holerite-doc" id="holerite-documento">
        <p className="holerite-vazio">Nenhum funcionário para este mês.</p>
      </div>
    );
  }

  return (
    <div className="holerite-doc" id="holerite-documento">
      {holerites.map((h) => (
        <Folha key={h.usuario_id} h={h} />
      ))}
    </div>
  );
}
