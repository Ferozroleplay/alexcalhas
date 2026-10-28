import { OS_ORCAMENTO_EMPRESA } from "@/lib/os-document";
import { formatMinutosPontoLabel } from "@/lib/ponto-display";
import { PONTO_CARGA_DIA_LABEL, PONTO_JORNADA } from "@/lib/ponto-jornada";

export type PontoFolhaJornada = {
  usuario_id: number;
  usuario_nome: string;
  data?: string;
  data_fmt: string;
  entrada_fmt: string;
  almoco_fmt: string;
  retorno_fmt: string;
  saida_fmt: string;
  intervalo_fmt: string;
  total_fmt: string;
  minutos_trabalhados: number | null;
  aberto: boolean;
};

type Grupo = {
  id: number;
  nome: string;
  jornadas: PontoFolhaJornada[];
  minutos: number;
  dias: number;
};

function dataSortKey(j: PontoFolhaJornada): string {
  if (j.data && /^\d{4}-\d{2}-\d{2}$/.test(j.data)) return j.data;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(j.data_fmt.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : j.data_fmt;
}

function agrupar(jornadas: PontoFolhaJornada[]): Grupo[] {
  const map = new Map<number, Grupo>();
  for (const j of jornadas) {
    let g = map.get(j.usuario_id);
    if (!g) {
      g = { id: j.usuario_id, nome: j.usuario_nome, jornadas: [], minutos: 0, dias: 0 };
      map.set(j.usuario_id, g);
    }
    g.jornadas.push(j);
    g.dias += 1;
    if (j.minutos_trabalhados != null && j.minutos_trabalhados > 0) {
      g.minutos += j.minutos_trabalhados;
    }
  }
  for (const g of map.values()) {
    g.jornadas.sort((a, b) => dataSortKey(a).localeCompare(dataSortKey(b)));
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type Props = {
  de: string;
  ate: string;
  jornadas: PontoFolhaJornada[];
};

export function PontoFolhaDocument({ de, ate, jornadas }: Props) {
  const grupos = agrupar(jornadas);
  const empresa = OS_ORCAMENTO_EMPRESA;
  const periodo = `Período ${dataBr(de)} a ${dataBr(ate)}`;
  const jornadaTxt = `Jornada ${PONTO_JORNADA.entrada}–${PONTO_JORNADA.almoco} e ${PONTO_JORNADA.retorno}–${PONTO_JORNADA.saida} (${PONTO_CARGA_DIA_LABEL})`;

  if (grupos.length === 0) {
    return (
      <article className="ponto-folha" id="ponto-folha-documento">
        <p className="ponto-folha__vazio">Nenhuma jornada neste período.</p>
      </article>
    );
  }

  return (
    <>
      {grupos.map((g) => {
        const temAberto = g.jornadas.some((j) => j.aberto);
        return (
          <article key={g.id} className="ponto-folha" id={`ponto-folha-${g.id}`}>
            <header className="ponto-folha__topo">
              <img src={empresa.logoSrc} alt="Alex Calhas" />
              <div>
                <h1>Folha de ponto</h1>
                <p>{periodo}</p>
                <small>
                  {jornadaTxt} · {g.dias} dia{g.dias === 1 ? "" : "s"} ·{" "}
                  {formatMinutosPontoLabel(g.minutos)}
                </small>
              </div>
            </header>

            <div className="ponto-folha__func-head">
              <strong>{g.nome}</strong>
              <span>
                {g.dias} dia{g.dias === 1 ? "" : "s"} · {formatMinutosPontoLabel(g.minutos)}
              </span>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Entrada</th>
                  <th>Almoço</th>
                  <th>Retorno</th>
                  <th>Saída</th>
                  <th>Intervalo</th>
                  <th>Horas</th>
                </tr>
              </thead>
              <tbody>
                {g.jornadas.map((j) => (
                  <tr key={`${j.usuario_id}-${dataSortKey(j)}-${j.entrada_fmt}`}>
                    <td>{j.data_fmt}</td>
                    <td>{j.entrada_fmt || "—"}</td>
                    <td>{j.almoco_fmt || "—"}</td>
                    <td>{j.retorno_fmt || "—"}</td>
                    <td>{j.saida_fmt || "—"}</td>
                    <td>{j.intervalo_fmt || "—"}</td>
                    <td>
                      {j.total_fmt || "—"}
                      {j.aberto ? " *" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={6}>Total do funcionário</th>
                  <td>{formatMinutosPontoLabel(g.minutos)}</td>
                </tr>
              </tfoot>
            </table>

            {temAberto ? (
              <p className="ponto-folha__nota">
                * Jornada em aberto. Horas calculadas até o momento da emissão.
              </p>
            ) : null}

            <div className="ponto-folha__assin">
              <div className="ponto-folha__assin-col">
                <span className="ponto-folha__assin-linha" />
                <span>Assinatura do funcionário</span>
              </div>
              <div className="ponto-folha__assin-col">
                <span className="ponto-folha__assin-linha" />
                <span>Data ____ / ____ / ________</span>
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
}
