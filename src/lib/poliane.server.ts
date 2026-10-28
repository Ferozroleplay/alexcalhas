import {
  buildInventarioCreateData,
  ensureInventarioTextosCliente,
  horariosLivresVisita,
  toDataVisitaBr,
} from "@/lib/agendamento.server";
import { getPrisma } from "@/lib/db.server";
import { pontoHojeIso } from "@/lib/ponto-timezone";

export type PolianeFicha = {
  servico?: string;
  descricao?: string;
  nome?: string;
  telefone?: string;
  responsavel?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
  referencia?: string;
  dataIso?: string;
  periodo?: "manha" | "tarde";
  hora?: string;
  intencao?: "agendar" | "remarcar" | "cancelar";
  agendamentoId?: number;
  protocolo?: number;
  pendenteConfirmacao?: boolean;
  enderecoConfirmado?: boolean;
  aguardandoConfirmaCadastro?: boolean;
  aguardandoMaisAjuda?: boolean;
};

export type PolianePill = { label: string; value: string };

export type PolianeResult = {
  reply: string;
  ficha: PolianeFicha;
  pills: PolianePill[];
  done?: boolean;
};

const SERVICOS: { id: string; label: string; re: RegExp }[] = [
  { id: "calhas", label: "Instalação de calhas", re: /\bcalhas?\b/i },
  { id: "manutencao", label: "Troca ou manutenção de calhas", re: /\b(troca|manuten|reforma)\b/i },
  { id: "rufos", label: "Instalação de rufos", re: /\brufos?\b/i },
  { id: "condutores", label: "Instalação de condutores", re: /\bcondutores?\b/i },
  { id: "vazamento", label: "Reparos em vazamentos", re: /\b(vazamento|goteira|infiltra)/i },
  { id: "limpeza", label: "Limpeza de calhas", re: /\blimpeza\b/i },
  { id: "orcamento", label: "Solicitação de orçamento", re: /\b(or[cç]amento|quanto custa|pre[cç]o)\b/i },
  { id: "visita", label: "Visita técnica", re: /\bvisita\b/i },
];

function limparFicha(raw: unknown): PolianeFicha {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const str = (k: string, max: number) =>
    typeof o[k] === "string" ? o[k].trim().slice(0, max) : undefined;
  const num = (k: string) => {
    const n = Number(o[k]);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
  };
  const periodo = o.periodo === "manha" || o.periodo === "tarde" ? o.periodo : undefined;
  const intencao =
    o.intencao === "agendar" || o.intencao === "remarcar" || o.intencao === "cancelar"
      ? o.intencao
      : undefined;
  return {
    servico: str("servico", 80),
    descricao: str("descricao", 400),
    nome: str("nome", 120),
    telefone: str("telefone", 20),
    responsavel: str("responsavel", 80),
    rua: str("rua", 120),
    numero: str("numero", 10),
    bairro: str("bairro", 80),
    cidade: str("cidade", 80),
    cep: str("cep", 10),
    referencia: str("referencia", 120),
    dataIso: str("dataIso", 10),
    periodo,
    hora: str("hora", 5),
    intencao,
    agendamentoId: num("agendamentoId"),
    protocolo: num("protocolo"),
    pendenteConfirmacao: o.pendenteConfirmacao === true,
    enderecoConfirmado: o.enderecoConfirmado === true,
    aguardandoConfirmaCadastro: o.aguardandoConfirmaCadastro === true,
    aguardandoMaisAjuda: o.aguardandoMaisAjuda === true,
  };
}

function chaveTel(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.replace(/^0+/, "");
}

function telOk(d: string): boolean {
  return d.length === 10 || d.length === 11;
}

function formatTel(raw: string): string {
  const d = chaveTel(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function weekdayIso(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}

function ehDiaUtil(iso: string): boolean {
  const w = weekdayIso(iso);
  return w >= 1 && w <= 5;
}

function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

function formatarDia(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function slotsDoPeriodo(horas: string[], periodo?: "manha" | "tarde"): string[] {
  if (periodo === "manha") return horas.filter((h) => h <= "12:00");
  if (periodo === "tarde") return horas.filter((h) => h >= "14:00");
  return horas;
}

function extrairTelefone(texto: string): string | undefined {
  const m = texto.replace(/\D/g, " ").match(/\b(55)?\s*0?(\d{2}\s*\d{4,5}\s*\d{4})\b/);
  if (!m) return undefined;
  const d = chaveTel(m[2]);
  return telOk(d) ? d : undefined;
}

function extrairCep(texto: string): string | undefined {
  const rotulo = texto.match(/\bcep\s*(?:é|:)?\s*(\d{5})-?(\d{3})\b/i);
  if (rotulo) return `${rotulo[1]}${rotulo[2]}`;
  const semTel = texto.replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?[\s-]*)?\d{4,5}[-\s]?\d{4}\b/g, " ");
  const m = semTel.match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : undefined;
}

function extrairHora(texto: string): string | undefined {
  const m = texto.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/);
  if (!m) return undefined;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function extrairNumeroImovel(texto: string): string | undefined {
  const t = textoEndereco(texto);
  const m =
    t.match(/\bn[uú]mero\s*(?:é|:)?\s*(\d+[A-Za-z]?)\b/i) ||
    t.match(/\bn[ºo°]\s*(\d+[A-Za-z]?)\b/i) ||
    t.match(/,\s*(\d{1,5}[A-Za-z]?)\s*$/) ||
    t.match(/\b(?:rua|r\.|av\.?|avenida|travessa|alameda|estrada|rodovia|pra[cç]a)\b.*\s(\d{1,6}[A-Za-z]?)\s*$/i);
  return numeroImovelOk(m?.[1]) ? m[1] : undefined;
}

function proximoDiaNome(hoje: string, alvo: number): string | undefined {
  for (let i = 0; i <= 8; i++) {
    const iso = somarDias(hoje, i === 0 ? 0 : i);
    if (weekdayIso(iso) === alvo && iso >= hoje && ehDiaUtil(iso)) return iso;
  }
  return undefined;
}

function extrairData(texto: string, hoje: string): string | undefined {
  const t = texto.toLowerCase();
  if (/\bhoje\b/.test(t)) return hoje;
  if (/\bdepois de amanh[ãa]\b/.test(t)) return somarDias(hoje, 2);
  if (/\bamanh[ãa]\b/.test(t)) return somarDias(hoje, 1);
  const nomes: [RegExp, number][] = [
    [/\bdomingo\b/, 0],
    [/\bsegunda\b/, 1],
    [/\bter[cç]a\b/, 2],
    [/\bquarta\b/, 3],
    [/\bquinta\b/, 4],
    [/\bsexta\b/, 5],
    [/\bs[áa]bado\b/, 6],
  ];
  for (const [re, w] of nomes) {
    if (re.test(t)) return proximoDiaNome(hoje, w);
  }
  const br = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (br) {
    const d = br[1].padStart(2, "0");
    const m = br[2].padStart(2, "0");
    const y = br[3] ? (br[3].length === 2 ? `20${br[3]}` : br[3]) : hoje.slice(0, 4);
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

function extrairPeriodo(texto: string): "manha" | "tarde" | undefined {
  const t = texto.toLowerCase();
  if (/\bmanh[ãa]\b/.test(t)) return "manha";
  if (/\btarde\b/.test(t)) return "tarde";
  return undefined;
}

function extrairServico(texto: string): string | undefined {
  for (const s of SERVICOS) {
    if (s.re.test(texto)) return s.label;
  }
  return undefined;
}

function sim(texto: string): boolean {
  return /^(sim|isso|confirmo|ok|fechado|certo|pode ser|confirma|sim,? esse endere[cç]o|sim,? mesmo endere[cç]o)[\s!.]*$/i.test(
    texto.trim(),
  );
}

function nao(texto: string): boolean {
  return /^(n[aã]o|agora n[aã]o|cancela isso)[\s!.]*$/i.test(texto.trim());
}

function querMaisAjuda(texto: string): boolean {
  return /^(sim|isso|quero|pode|claro|pode sim|sim,? por favor)[\s!.]*$/i.test(texto.trim());
}

function encerraAtendimento(texto: string): boolean {
  const t = texto.trim();
  if (querMaisAjuda(t)) return false;
  if (nao(t)) return true;
  return /^(n[aã]o\b.*|obrigad[oa].*|valeu.*|tchau.*|s[oó] isso.*|por enquanto.*|n[aã]o precisa.*|pode deixar.*|ok([,!.]?\s*obrigad[oa])?)[\s!.😅😊💜🙏]*$/i.test(
    t,
  );
}

function querOutroEndereco(texto: string): boolean {
  return /\b(outro endere[cç]o|endere[cç]o (errado|diferente)|trocar (o )?endere[cç]o|mudar (o )?endere[cç]o|n[aã]o [eé] (esse|o mesmo))\b/i.test(
    texto,
  );
}

function ehSaudacao(texto: string): boolean {
  return /^(boa\s*(noite|tarde|dia)|bom\s*dia|ol[aá]|oi+|eae+|e\s*a[ií]|blz|beleza|tudo\s*(bem|bom)|obrigad[oa]|valeu|tchau)[\s,!.😅😊💜🙏]*$/i.test(
    texto.trim(),
  );
}

function deuEmCima(texto: string): boolean {
  const t = texto.trim();
  if (
    /^(linda|gata|gostosa|amor|beb[eê]|princesa|rainha|del[ií]cia|safada)[\s!.😍😘💜💋]*$/i.test(t)
  ) {
    return true;
  }
  return /\b((voc[eê] )?[eé] (solteira|casada)|tem namorad[oa]|seu marido|fica comigo|casar comigo|te amo|meu amor|gatinha|gostos[ao]|del[ií]cia|safad[ao]|quero te|me beija|beijo|manda (nudes?|foto)|sua foto|n[uú]mero (pessoal|particular)|sair comigo|voc[eê] [eé] (linda|gata|gostosa|bonita)|que linda|q linda|oi linda|oi gata)\b/i.test(
    t,
  );
}

function cumprimentoAgora(): string {
  const hora = Number(
    new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).slice(0, 2),
  );
  if (hora < 12) return "Bom dia! 😊";
  if (hora < 18) return "Boa tarde! 😊";
  return "Boa noite! 😊";
}

function cumprimentoDe(texto: string): string {
  const t = texto.toLowerCase();
  if (/noite/.test(t)) return "Boa noite! 😊";
  if (/tarde/.test(t)) return "Boa tarde! 😊";
  if (/\bdia\b/.test(t)) return "Bom dia! 😊";
  if (/^(oi+|ol[aá])\b/.test(t.trim())) return "Oi! Tudo bem? 😊";
  return "Oi! 😊";
}

function fala(...partes: Array<string | undefined>): string {
  return partes.map((p) => p?.trim()).filter(Boolean).join("\n\n");
}

function textoEndereco(texto: string): string {
  return texto
    .trim()
    .replace(/^(boa\s*(noite|tarde|dia)|bom\s*dia|ol[aá]|oi+|eae+|e\s*a[ií]|blz|beleza)[\s,!.😅😊💜🙏]*/i, "")
    .replace(
      /^(n[aã]o)[\s,!.]+(?=.*(rua|r\.|av\.?|avenida|travessa|alameda|estrada|rodovia|pra[cç]a|\d))/i,
      "",
    )
    .replace(/^cep\s*(?:é|:)?\s*/i, "")
    .trim();
}

function pareceRua(texto: string): boolean {
  const t = textoEndereco(texto);
  if (t.length < 5) return false;
  if (ehSaudacao(t)) return false;
  if (/^(sim|n[aã]o|isso|ok|eu|o mesmo|a mesma|sou eu|prefiro|manh[ãa]|tarde|cep)\b/i.test(t)) return false;
  if (/^\d{5}-?\d{3}$/.test(t.replace(/\s/g, ""))) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return false;
  if (!/[a-zA-ZÀ-ÿ]{3,}/.test(t)) return false;
  return true;
}

function numeroImovelOk(n: string | undefined): n is string {
  if (!n) return false;
  const d = n.replace(/\D/g, "");
  return d.length >= 1 && d.length <= 6;
}

function capNome(s: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
  return s
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w, i) => {
      const l = w.toLowerCase();
      if (i > 0 && small.has(l)) return l;
      return l.charAt(0).toUpperCase() + l.slice(1);
    })
    .join(" ");
}

function comTipoLogradouro(rua: string): string {
  const t = rua.trim().replace(/\s+/g, " ");
  if (!t) return t;
  if (/^(rua|r\.|av\.?|avenida|travessa|alameda|estrada|rodovia|pra[cç]a)\b/i.test(t)) {
    return capNome(t.replace(/^r\.\s*/i, "Rua ").replace(/^av\.?\s*/i, "Avenida "));
  }
  return `Rua ${capNome(t)}`;
}

const CIDADE_PADRAO = { nome: "Tarumã", uf: "SP" };

const CIDADES_ATENDIMENTO: { re: RegExp; nome: string; uf: string }[] = [
  { re: /\bparagua[cç]u(?:\s+paulista)?\b/i, nome: "Paraguaçu Paulista", uf: "SP" },
  { re: /\bc[aâ]ndido\s+mota\b/i, nome: "Cândido Mota", uf: "SP" },
  { re: /\bpedrinhas(?:\s+paulista)?\b/i, nome: "Pedrinhas Paulista", uf: "SP" },
  { re: /\boscar\s+bressane\b/i, nome: "Oscar Bressane", uf: "SP" },
  { re: /\btarum[aã]\b/i, nome: "Tarumã", uf: "SP" },
  { re: /\bassis\b/i, nome: "Assis", uf: "SP" },
  { re: /\bmaraca[ií]\b/i, nome: "Maracaí", uf: "SP" },
  { re: /\bpalmital\b/i, nome: "Palmital", uf: "SP" },
  { re: /\bcruz[aá]lia\b/i, nome: "Cruzália", uf: "SP" },
  { re: /\bflor[ií]nea\b/i, nome: "Florínea", uf: "SP" },
  { re: /\biep[eê]\b/i, nome: "Iepê", uf: "SP" },
  { re: /\bplatina\b/i, nome: "Platina", uf: "SP" },
  { re: /\bnantes\b/i, nome: "Nantes", uf: "SP" },
];

type ViaCepHit = { cep: string; rua: string; bairro: string; cidade: string };

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugViaCep(s: string): string {
  return semAcento(s)
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normAddr(s: string): string {
  return slugViaCep(s)
    .toLowerCase()
    .replace(/\b(rua|r|av|avenida|travessa|alameda|estrada|rodovia|praca)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensAddr(s: string): string[] {
  const stop = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
  return normAddr(s).split(" ").filter((w) => w.length >= 2 && !stop.has(w));
}

function nomeRuaBusca(rua: string): string {
  return slugViaCep(rua.replace(/^(rua|r\.|av\.?|avenida|travessa|alameda|estrada|rodovia|pra[cç]a)\s+/i, ""));
}

function ufDaCidade(cidade: string): string {
  const base = cidade.split("/")[0].trim();
  const hit = CIDADES_ATENDIMENTO.find((c) => c.re.test(base) || normAddr(c.nome) === normAddr(base));
  return hit?.uf ?? CIDADE_PADRAO.uf;
}

function cidadeParaViaCep(cidade: string): string {
  const base = cidade.split("/")[0].trim();
  const hit = CIDADES_ATENDIMENTO.find((c) => c.re.test(base) || normAddr(c.nome) === normAddr(base));
  return slugViaCep(hit?.nome ?? base);
}

function tirarCidadeDoTexto(t: string): { cidade?: string; uf?: string; resto: string } {
  let s = t.trim();
  let uf: string | undefined;
  const comUf = s.match(/^(.*?)[/\s,-]+(SP|PR|MS)$/i);
  if (comUf) {
    s = comUf[1].trim();
    uf = comUf[2].toUpperCase();
  }
  for (const c of CIDADES_ATENDIMENTO) {
    const m = c.re.exec(s);
    if (!m || m.index === undefined) continue;
    const after = s.slice(m.index + m[0].length).trim();
    if (after) continue;
    const resto = s.slice(0, m.index).replace(/[,-]+$/g, "").trim();
    return { cidade: c.nome, uf: c.uf, resto };
  }
  return { cidade: undefined, uf, resto: s };
}

function tirarBairroDoTexto(t: string): { bairro?: string; resto: string } {
  const m = t.match(
    /^(.*?)\s+(vila|vl\.?|jardim|jd\.?|parque|pq\.?|conjunto|cj\.?|residencial|distrito(?:\s+industrial)?|bairro)\b(.*)$/i,
  );
  if (m && m[1].trim().length >= 3) {
    const bruto = `${m[2]} ${m[3]}`.replace(/^bairro\s+/i, "").replace(/\s+/g, " ").trim();
    return { bairro: capNome(bruto || m[2]), resto: m[1].trim() };
  }
  return { resto: t };
}

function acharNumeroNoTexto(t: string): { numero: string; antes: string; depois: string } | null {
  const labeled = t.match(/^(.*?)\b(?:n[uú]mero|n[ºo°])\s+(\d{1,6}[A-Za-z]?)\b(.*)$/i);
  if (labeled && numeroImovelOk(labeled[2])) {
    return { antes: labeled[1].trim(), numero: labeled[2], depois: labeled[3].trim() };
  }
  for (const m of t.matchAll(/\b(\d{1,6}[A-Za-z]?)\b/g)) {
    const idx = m.index ?? 0;
    const depois = t.slice(idx + m[0].length).trim();
    const antes = t.slice(0, idx).trim();
    if (/^d[aeo]s?\b/i.test(depois)) continue;
    if (!antes || antes.length < 3) continue;
    if (!numeroImovelOk(m[1])) continue;
    return { numero: m[1], antes, depois };
  }
  return null;
}

function semFraseRepetida(s: string): string {
  const w = s.split(/\s+/).filter(Boolean);
  const half = Math.floor(w.length / 2);
  if (half >= 1 && w.slice(0, half).join(" ").toLowerCase() === w.slice(half).join(" ").toLowerCase()) {
    return w.slice(0, half).join(" ");
  }
  return s;
}

function partirBairroCidade(depois: string): { bairro?: string; cidade?: string } {
  const t = semFraseRepetida(
    depois
      .replace(/[-–—]/g, " ")
      .replace(/\b(bairro|cidade)\s*:?\s*/gi, "")
      .replace(/\b\d{1,6}[A-Za-z]?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (!t) return {};
  const pref = t.match(/^(vila|vl\.?|jardim|jd\.?|parque|pq\.?|conjunto|cj\.?|residencial|centro)\b(.*)$/i);
  if (pref) {
    const rest = pref[2].trim().split(/\s+/).filter(Boolean);
    if (rest.length >= 2) {
      return {
        bairro: capNome(`${pref[1]} ${rest.slice(0, -1).join(" ")}`),
        cidade: capNome(rest[rest.length - 1]),
      };
    }
    if (rest.length === 1) return { bairro: capNome(`${pref[1]} ${rest[0]}`) };
    return { bairro: capNome(pref[1]) };
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1) return { cidade: capNome(words[0]) };
  if (words.length === 2) return { bairro: capNome(words[0]), cidade: capNome(words[1]) };
  return { bairro: capNome(words.slice(0, -1).join(" ")), cidade: capNome(words[words.length - 1]) };
}

function parseEnderecoLivre(texto: string): Partial<PolianeFicha> {
  let t = textoEndereco(texto);
  if (!t) return {};
  const out: Partial<PolianeFicha> = {};
  const cep = extrairCep(t);
  if (cep) {
    out.cep = cep;
    t = t.replace(/\bcep\s*:?\s*/gi, "").replace(/\b\d{5}-?\d{3}\b/, "").trim();
  }
  t = t.replace(/[;,]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return out;

  const cid = tirarCidadeDoTexto(t);
  if (cid.cidade) out.cidade = cid.cidade;
  t = cid.resto;

  const achado = acharNumeroNoTexto(t);
  if (achado) {
    out.numero = achado.numero;
    t = [achado.antes, achado.depois].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  const bai = tirarBairroDoTexto(t);
  if (bai.bairro) out.bairro = bai.bairro;
  t = bai.resto.replace(/[,-]+$/g, "").trim();

  if (!out.bairro && !out.cidade && achado?.depois) {
    const resto = partirBairroCidade(achado.depois);
    if (resto.bairro) out.bairro = resto.bairro;
    if (resto.cidade && !out.cidade) out.cidade = resto.cidade;
    if (achado.antes) t = achado.antes;
  }

  if (t && /[a-zA-ZÀ-ÿ]{3,}/.test(t)) {
    const temPrefixo = /^(rua|r\.|av\.?|avenida|travessa|alameda|estrada|rodovia|pra[cç]a)\b/i.test(t);
    if (temPrefixo || out.bairro || out.cidade || out.numero) {
      out.rua = comTipoLogradouro(t);
    }
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function limparDuplicatasRua(f: PolianeFicha): PolianeFicha {
  let rua = (f.rua ?? "").trim();
  if (!rua) return f;
  if (f.numero) {
    rua = rua
      .replace(new RegExp(`\\b(?:n[uú]mero|n[ºo°])\\s*${escapeRe(f.numero)}\\b`, "ig"), " ")
      .replace(new RegExp(`[,\\s]+${escapeRe(f.numero)}\\s*$`, "i"), " ");
  }
  if (f.bairro) rua = rua.replace(new RegExp(`[,\\s]+${escapeRe(f.bairro)}\\s*$`, "i"), " ");
  if (f.cidade) rua = rua.replace(new RegExp(`[,\\s]+${escapeRe(f.cidade)}\\s*$`, "i"), " ");
  rua = rua.replace(/\s+/g, " ").trim().replace(/[,-]$/, "").trim();
  if (rua && (pareceRua(rua) || /[a-zA-ZÀ-ÿ]{3,}/.test(rua))) {
    return { ...f, rua: comTipoLogradouro(rua) };
  }
  return { ...f, rua: rua || undefined };
}

function enderecoPronto(f: PolianeFicha): boolean {
  return Boolean(
    f.rua &&
      pareceRua(f.rua) &&
      !ehSaudacao(f.rua) &&
      numeroImovelOk(f.numero) &&
      f.bairro &&
      f.bairro.trim().length >= 2 &&
      !/^cep\b/i.test(f.bairro.trim()) &&
      f.cidade &&
      f.cidade.trim().length >= 2,
  );
}

function sanitizarEnderecoFicha(f: PolianeFicha): PolianeFicha {
  let next = { ...f };
  const rua = (next.rua ?? "").trim();
  const ruaBaguncada =
    rua.length > 0 &&
    (/\b(n[uú]mero|vila|jardim|parque|bairro)\b/i.test(rua) ||
      (/\b\d{1,6}\b/.test(rua) && rua.split(/\s+/).length >= 4));
  if (ruaBaguncada) {
    const parsed = parseEnderecoLivre(rua);
    const ruaNova = parsed.rua || next.rua;
    if (ruaNova !== rua || parsed.numero || parsed.bairro) {
      next.enderecoConfirmado = false;
      next.pendenteConfirmacao = false;
    }
    next = {
      ...next,
      rua: ruaNova,
      numero: parsed.numero || next.numero,
      bairro: parsed.bairro || next.bairro,
      cidade: parsed.cidade || next.cidade,
      cep: parsed.cep || next.cep,
    };
  }
  next = limparDuplicatasRua(next);
  if (next.rua && (ehSaudacao(next.rua) || !/[a-zA-ZÀ-ÿ]{3,}/.test(next.rua))) {
    next.rua = undefined;
    next.enderecoConfirmado = false;
  }
  if (next.bairro && /^cep\b/i.test(next.bairro.trim())) {
    next.bairro = undefined;
    next.enderecoConfirmado = false;
  }
  if (next.numero && !numeroImovelOk(next.numero)) {
    next.numero = undefined;
    next.enderecoConfirmado = false;
  }
  if (next.rua) next.rua = comTipoLogradouro(next.rua);
  if (next.bairro) next.bairro = capNome(next.bairro);
  if (next.cidade) {
    const [local, uf] = next.cidade.split("/");
    next.cidade = uf ? `${capNome(local)}/${uf.trim().toUpperCase()}` : capNome(local);
  }
  return next;
}

function pedirEndereco(f: PolianeFicha, prefixo = "", opts?: { naoAchouRua?: boolean }): PolianeResult | null {
  if (!f.rua && !f.cep) {
    return {
      reply: fala(prefixo, "Qual seu endereço?"),
      ficha: f,
      pills: [],
    };
  }
  if (!f.rua || ehSaudacao(f.rua) || !pareceRua(f.rua)) {
    return {
      reply: fala(prefixo, "Qual a rua?"),
      ficha: { ...f, rua: undefined, enderecoConfirmado: false },
      pills: [],
    };
  }
  if (!f.cep && !f.cidade) {
    return {
      reply: fala(
        prefixo,
        opts?.naoAchouRua ? "Não achei essa rua em Tarumã. Qual a cidade?" : "Qual a cidade?",
      ),
      ficha: { ...f, enderecoConfirmado: false },
      pills: [],
    };
  }
  if (!numeroImovelOk(f.numero)) {
    return {
      reply: fala(prefixo, f.rua ? `Qual o número da casa na ${f.rua}?` : "Qual o número da casa?"),
      ficha: { ...f, enderecoConfirmado: false },
      pills: [],
    };
  }
  if (!f.bairro || /^cep\b/i.test(f.bairro)) {
    return {
      reply: fala(prefixo, "Qual o bairro?"),
      ficha: { ...f, bairro: undefined, enderecoConfirmado: false },
      pills: [],
    };
  }
  if (!f.cidade) {
    return {
      reply: fala(prefixo, "De qual cidade?"),
      ficha: { ...f, enderecoConfirmado: false },
      pills: [],
    };
  }
  if (!enderecoPronto(f)) {
    return {
      reply: fala(prefixo, "Me passa o endereço completo: rua, número, bairro e cidade."),
      ficha: { ...f, enderecoConfirmado: false },
      pills: [],
    };
  }
  return null;
}

function limparEndereco(f: PolianeFicha, opts?: { manterCep?: boolean }): PolianeFicha {
  return {
    ...f,
    rua: undefined,
    numero: undefined,
    bairro: undefined,
    cidade: undefined,
    cep: opts?.manterCep ? f.cep : undefined,
    referencia: undefined,
    enderecoConfirmado: false,
    aguardandoConfirmaCadastro: false,
    pendenteConfirmacao: false,
  };
}

function enderecoLinha(f: PolianeFicha): string {
  return [f.rua, f.cidade].filter(Boolean).join(" - ");
}

function enderecoCompleto(f: PolianeFicha): string {
  const ruaNum = [f.rua, f.numero].filter(Boolean).join(", ");
  const local = [f.bairro, f.cidade].filter(Boolean).join(", ");
  return [ruaNum, local, f.cep ? `CEP ${f.cep}` : "", f.referencia].filter(Boolean).join(" — ");
}

function cadastroTemEndereco(cli: { endereco: string | null; numero: string | null; bairro: string | null }): boolean {
  return (
    (cli.endereco ?? "").trim().length >= 5 &&
    (cli.numero ?? "").trim().length >= 1 &&
    (cli.bairro ?? "").trim().length >= 2
  );
}

function fichaDeCadastro(cli: {
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cep: string | null;
}): PolianeFicha {
  const numero = (cli.numero ?? "").trim() || undefined;
  const bairro = (cli.bairro ?? "").trim() || undefined;
  const partes = (cli.endereco ?? "").split(" - ").map((p) => p.trim()).filter(Boolean);
  let rua = partes[0] || (cli.endereco ?? "").trim();
  const cidadeDash = partes.length >= 2 ? partes[partes.length - 1] : undefined;
  if (numero) {
    rua = rua
      .replace(new RegExp(`,\\s*${escapeRe(numero)}$`, "i"), "")
      .replace(new RegExp(`\\b(?:n[uú]mero\\s*)?${escapeRe(numero)}\\b`, "ig"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (bairro) rua = rua.replace(new RegExp(escapeRe(bairro), "ig"), " ").replace(/\s+/g, " ").trim();
  const parsed = parseEnderecoLivre([rua, numero, bairro, cidadeDash].filter(Boolean).join(" "));
  return sanitizarEnderecoFicha({
    rua: parsed.rua || rua || undefined,
    numero: numero || parsed.numero,
    bairro: bairro && !/^cep\b/i.test(bairro) ? capNome(bairro) : parsed.bairro,
    cidade: parsed.cidade || (cidadeDash ? capNome(cidadeDash) : undefined),
    cep: cli.cep?.replace(/\D/g, "").slice(0, 8) || parsed.cep,
  });
}

function formatarCadastro(cli: {
  nome: string;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cep: string | null;
}): string {
  const limpo = enderecoCompleto(fichaDeCadastro(cli));
  if (limpo) return limpo;
  return [cli.endereco, cli.numero, cli.bairro, cli.cep ? `CEP ${cli.cep}` : ""].filter(Boolean).join(", ");
}

function aplicarEnderecoColado(f: PolianeFicha, texto: string): PolianeFicha {
  const p = parseEnderecoLivre(texto);
  if (!p.rua && !p.numero && !p.bairro && !p.cidade && !p.cep) return f;
  return sanitizarEnderecoFicha({
    ...f,
    rua: p.rua || f.rua,
    numero: p.numero || f.numero,
    bairro: p.bairro || f.bairro,
    cidade: p.cidade || f.cidade,
    cep: p.cep || f.cep,
    enderecoConfirmado: false,
  });
}

function aplicarCadastro(
  ficha: PolianeFicha,
  cli: { nome: string; endereco: string | null; numero: string | null; bairro: string | null; cep: string | null },
): PolianeFicha {
  const limpo = fichaDeCadastro(cli);
  return {
    ...ficha,
    rua: limpo.rua || ficha.rua,
    numero: limpo.numero || ficha.numero,
    bairro: limpo.bairro || ficha.bairro,
    cidade: limpo.cidade || ficha.cidade,
    cep: limpo.cep || ficha.cep,
    enderecoConfirmado: false,
    aguardandoConfirmaCadastro: false,
  };
}

function hitDeViaCep(data: {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}): ViaCepHit | null {
  if (!data || data.erro) return null;
  const cep = (data.cep ?? "").replace(/\D/g, "");
  const rua = data.logradouro?.trim();
  const bairro = data.bairro?.trim();
  const local = data.localidade?.trim();
  const uf = data.uf?.trim()?.toUpperCase();
  const cidade = local ? (uf ? `${capNome(local)}/${uf}` : capNome(local)) : "";
  if (!cep && !rua && !bairro) return null;
  return {
    cep,
    rua: rua ?? "",
    bairro: bairro ?? "",
    cidade: cidade || CIDADE_PADRAO.nome,
  };
}

function aplicarViaCep(f: PolianeFicha, end: ViaCepHit): PolianeFicha {
  return sanitizarEnderecoFicha({
    ...f,
    rua: end.rua ? comTipoLogradouro(end.rua) : f.rua,
    bairro: end.bairro ? capNome(end.bairro) : f.bairro,
    cidade: end.cidade || f.cidade,
    cep: end.cep || f.cep,
    enderecoConfirmado: false,
  });
}

function scoreHit(queryRua: string, queryBairro: string | undefined, hit: ViaCepHit): number {
  const q = tokensAddr(queryRua);
  const h = tokensAddr(hit.rua);
  if (!q.length || !h.length) return 0;
  if (q.join(" ") === h.join(" ")) return 1000;
  let s = 0;
  for (const w of h) s += q.includes(w) ? 12 : -10;
  for (const w of q) if (!h.includes(w)) s -= 4;
  if (queryBairro && normAddr(queryBairro) === normAddr(hit.bairro)) s += 25;
  else if (queryBairro && tokensAddr(queryBairro).every((w) => tokensAddr(hit.bairro).includes(w))) s += 18;
  return s;
}

function escolherHits(ficha: PolianeFicha, hits: ViaCepHit[]): { best?: ViaCepHit; ambigua?: ViaCepHit[] } {
  if (!hits.length) return {};
  if (hits.length === 1) return { best: hits[0] };
  const scored = hits
    .map((h) => ({ h, s: scoreHit(ficha.rua ?? "", ficha.bairro, h) }))
    .sort((a, b) => b.s - a.s);
  const top = scored[0];
  const second = scored[1];
  if (!second || top.s >= second.s + 8) return { best: top.h };
  const proximas = scored.filter((x) => top.s - x.s <= 8 && x.s > 0).map((x) => x.h);
  if (proximas.length > 1) return { ambigua: proximas.slice(0, 3) };
  return { best: top.h };
}

async function viaCep(cep: string): Promise<ViaCepHit | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    return hitDeViaCep((await res.json()) as Parameters<typeof hitDeViaCep>[0]);
  } catch {
    return null;
  }
}

async function viaCepPorRua(rua: string, cidade: string, uf: string): Promise<ViaCepHit[]> {
  const logradouro = nomeRuaBusca(rua);
  const cid = cidadeParaViaCep(cidade);
  if (logradouro.replace(/\s/g, "").length < 3 || cid.length < 3) return [];
  try {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cid)}/${encodeURIComponent(logradouro)}/json/`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => hitDeViaCep(row as Parameters<typeof hitDeViaCep>[0])).filter((h): h is ViaCepHit => Boolean(h?.rua));
  } catch {
    return [];
  }
}

async function viaCepPorRuaFlex(rua: string, cidade: string, uf: string): Promise<ViaCepHit[]> {
  const nome = nomeRuaBusca(rua);
  const words = nome.split(/\s+/).filter(Boolean);
  const queries = [nome];
  if (words.length > 4) queries.push(words.slice(0, 4).join(" "));
  const seen = new Set<string>();
  for (const q of queries) {
    const key = normAddr(q);
    if (seen.has(key) || key.replace(/\s/g, "").length < 3) continue;
    seen.add(key);
    const hits = await viaCepPorRua(q, cidade, uf);
    if (hits.length) return hits;
  }
  return [];
}

async function completarEnderecoPeloCep(f: PolianeFicha): Promise<{
  ficha: PolianeFicha;
  ambigua?: ViaCepHit[];
  naoAchouRua?: boolean;
}> {
  let ficha = { ...f };
  const cepDigits = (ficha.cep ?? "").replace(/\D/g, "");
  if (cepDigits.length === 8 && (!ficha.rua || ehSaudacao(ficha.rua) || !ficha.bairro || !ficha.cidade)) {
    const end = await viaCep(cepDigits);
    if (end) return { ficha: aplicarViaCep({ ...ficha, cep: cepDigits }, end) };
  }
  if (ficha.cep && ficha.rua && ficha.bairro && ficha.cidade) return { ficha };
  if (!ficha.rua || ehSaudacao(ficha.rua) || !pareceRua(ficha.rua)) return { ficha };

  const cidade = ficha.cidade || CIDADE_PADRAO.nome;
  const hits = await viaCepPorRuaFlex(ficha.rua, cidade, ufDaCidade(cidade));
  if (!hits.length) return { ficha, naoAchouRua: true };
  const pick = escolherHits(ficha, hits);
  if (pick.ambigua) return { ficha, ambigua: pick.ambigua };
  if (pick.best) ficha = aplicarViaCep(ficha, pick.best);
  return { ficha };
}

async function proximosLivres(
  periodo?: "manha" | "tarde",
  dataAlvo?: string,
): Promise<{ iso: string; horas: string[] }[]> {
  const prisma = await getPrisma();
  const hoje = pontoHojeIso();
  const saida: { iso: string; horas: string[] }[] = [];
  if (dataAlvo) {
    if (!ehDiaUtil(dataAlvo) || dataAlvo < hoje) return [];
    const horas = slotsDoPeriodo(await horariosLivresVisita(prisma, dataAlvo), periodo);
    return horas.length ? [{ iso: dataAlvo, horas }] : [];
  }
  for (let i = 0; i < 16 && saida.length < 4; i++) {
    const iso = somarDias(hoje, i);
    if (!ehDiaUtil(iso)) continue;
    const horas = slotsDoPeriodo(await horariosLivresVisita(prisma, iso), periodo);
    if (horas.length) saida.push({ iso, horas });
  }
  return saida;
}

function textoOpcoes(dias: { iso: string; horas: string[] }[]): { text: string; pills: PolianePill[] } {
  const linhas = dias.map((d) => `• ${formatarDia(d.iso)} — ${d.horas.join(", ")}`);
  const pills: PolianePill[] = [];
  for (const d of dias) {
    for (const h of d.horas.slice(0, 4)) {
      pills.push({ label: `${formatarDia(d.iso).replace("-feira", "")} ${h}`, value: `${d.iso} ${h}` });
    }
  }
  return {
    text: fala("Temos alguns horários disponíveis. Qual fica melhor pra você?", linhas.join("\n")),
    pills: pills.slice(0, 8),
  };
}

async function consultarCliente(telefone: string) {
  const chave = chaveTel(telefone);
  if (!telOk(chave)) return null;
  const prisma = await getPrisma();
  const rows = await prisma.inventario.findMany({
    where: { telefone: { not: "" } },
    orderBy: { id: "desc" },
    take: 400,
    select: {
      id: true,
      nome: true,
      telefone: true,
      endereco: true,
      bairro: true,
      numero: true,
      cep: true,
      status: true,
      dataVisita: true,
      horaVisita: true,
    },
  });
  return rows.find((r) => chaveTel(r.telefone) === chave) ?? null;
}

async function agendadoAberto(telefone: string) {
  const chave = chaveTel(telefone);
  if (!telOk(chave)) return null;
  const prisma = await getPrisma();
  const rows = await prisma.inventario.findMany({
    where: { status: "agendado" },
    orderBy: { id: "desc" },
    take: 200,
    select: {
      id: true,
      nome: true,
      telefone: true,
      endereco: true,
      bairro: true,
      numero: true,
      dataVisita: true,
      horaVisita: true,
    },
  });
  return rows.find((r) => chaveTel(r.telefone) === chave) ?? null;
}

function resumo(f: PolianeFicha): string {
  return [
    `👤 Cliente: ${f.nome}`,
    `📞 Telefone: ${formatTel(f.telefone ?? "")}`,
    `📍 Endereço: ${enderecoCompleto(f)}`,
    `🔧 Serviço: ${f.servico}`,
    `📅 Data: ${f.dataIso ? formatarDia(f.dataIso) : "—"}`,
    `🕒 Horário: ${f.hora ?? "—"}`,
  ].join("\n");
}

function confirmacao(f: PolianeFicha, id: number): string {
  return fala(
    "Ok, vou fazer seu agendamento.",
    `${resumo(f)}\n📌 Protocolo: ${id}`,
    "A visita é pra orçamento e medição.",
    "Te ajudo em algo mais?",
  );
}

async function criarVisita(f: PolianeFicha): Promise<{ id: number; hora: string } | { erro: string; horas?: string[] }> {
  if (!f.nome || !f.telefone || !enderecoPronto(f) || !f.enderecoConfirmado || !f.dataIso || !f.hora) {
    return { erro: "Não posso salvar sem o endereço completo e confirmado: rua, número, bairro e cidade." };
  }
  const prisma = await getPrisma();
  const livres = await horariosLivresVisita(prisma, f.dataIso);
  if (!livres.includes(f.hora)) {
    return {
      erro: "Esse horário não está mais disponível. Escolha outro.",
      horas: livres,
    };
  }
  await ensureInventarioTextosCliente();
  const dup = await prisma.inventario.findFirst({
    where: {
      status: "agendado",
      numero: f.numero.slice(0, 50),
      bairro: f.bairro.slice(0, 80),
    },
  });
  if (dup) {
    return { erro: "Já existe uma visita agendada para esse endereço. Se quiser, posso remarcar." };
  }
  const obs = [
    f.servico ? `Serviço: ${f.servico}` : "",
    f.descricao ? `Detalhe: ${f.descricao}` : "",
    f.responsavel ? `Recebe a equipe: ${f.responsavel}` : "",
    f.referencia ? `Referência: ${f.referencia}` : "",
    "Agendado pela Poliane (chat do site).",
  ]
    .filter(Boolean)
    .join("\n");
  const row = await prisma.inventario.create({
    data: buildInventarioCreateData(
      {
        nome: f.nome,
        telefone: formatTel(f.telefone),
        endereco: enderecoLinha(f).slice(0, 180),
        bairro: f.bairro,
        numero: f.numero,
        cep: f.cep ?? "",
        data: f.dataIso,
        hora: f.hora,
        observacao: obs,
        origem: "site",
      },
      null,
    ),
  });
  return { id: row.id, hora: f.hora };
}

function aplicarTexto(ficha: PolianeFicha, texto: string, hoje: string): PolianeFicha {
  const f = { ...ficha };
  const tel = extrairTelefone(texto);
  if (tel) f.telefone = tel;
  const cep = extrairCep(texto);
  if (cep) f.cep = cep;
  const data = extrairData(texto, hoje);
  if (data) f.dataIso = data;
  const periodo = extrairPeriodo(texto);
  if (periodo) f.periodo = periodo;
  const hora = extrairHora(texto);
  if (hora) f.hora = hora;
  const servico = extrairServico(texto);
  if (servico && !f.servico) f.servico = servico;
  const num = extrairNumeroImovel(texto);
  if (num && !f.numero) f.numero = num;

  const isoHora = texto.match(/\b(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\b/);
  if (isoHora) {
    f.dataIso = isoHora[1];
    f.hora = isoHora[2];
  }

  const t = texto.trim();
  if (/\b(remarcar|reagendar|mudar (a )?data|trocar (o )?dia)\b/i.test(t)) f.intencao = "remarcar";
  if (/\b(cancelar|desmarcar)\b/i.test(t)) f.intencao = "cancelar";

  return f;
}

function campoPendente(f: PolianeFicha): string | null {
  if (!f.servico) return "servico";
  if (!f.nome) return "nome";
  if (!f.rua && !f.cep) return "endereco";
  if (!f.rua) return "rua";
  if (!f.cep && !f.cidade) return "cidade";
  if (!f.numero) return "numero";
  if (!f.bairro) return "bairro";
  if (!f.cidade) return "cidade";
  if (!f.dataIso || !f.hora) return "agenda";
  if (!f.telefone) return "telefone";
  return null;
}

export async function atenderPoliane(mensagem: string, fichaRaw: unknown): Promise<PolianeResult> {
  const hoje = pontoHojeIso();
  const antes = sanitizarEnderecoFicha(limparFicha(fichaRaw));
  const faltava = campoPendente(antes);
  let ficha = sanitizarEnderecoFicha(aplicarTexto(antes, mensagem, hoje));
  const texto = mensagem.trim();
  const soTexto = texto.replace(/[^a-zA-ZÀ-ÿ0-9\s/-]/g, "").trim();
  const prefixo = ehSaudacao(texto) ? cumprimentoDe(texto) : "";

  if (deuEmCima(texto)) {
    return {
      reply: fala(
        "Sou casada com o Alex, viu 😊",
        ficha.aguardandoMaisAjuda ? "Te ajudo em algo mais?" : ficha.servico ? undefined : "Em que posso ajudar?",
      ),
      ficha,
      pills: [],
    };
  }

  if (ficha.aguardandoMaisAjuda) {
    if (encerraAtendimento(texto)) {
      return {
        reply: fala("Ok! Obrigada pela preferência.", "Qualquer dúvida, estou aqui."),
        ficha: { ...ficha, aguardandoMaisAjuda: false },
        pills: [],
        done: true,
      };
    }
    if (querMaisAjuda(texto)) {
      return {
        reply: fala("Claro!", "Em que posso ajudar?"),
        ficha: {
          ...ficha,
          aguardandoMaisAjuda: false,
          servico: undefined,
          descricao: undefined,
          dataIso: undefined,
          hora: undefined,
          periodo: undefined,
          intencao: undefined,
          protocolo: undefined,
        },
        pills: [],
      };
    }
    ficha = {
      ...ficha,
      aguardandoMaisAjuda: false,
      servico: extrairServico(texto),
      descricao: undefined,
      dataIso: undefined,
      hora: undefined,
      periodo: undefined,
      protocolo: undefined,
    };
  }

  if (/\b(whatsapp|atendente humano|falar com (uma )?pessoa|operador)\b/i.test(texto)) {
    return {
      reply: fala("Sem problema!", "Pode falar direto com a equipe no WhatsApp. Eu fico aqui se quiser agendar pelo chat."),
      ficha,
      pills: [{ label: "Abrir WhatsApp", value: "__whatsapp__" }],
    };
  }

  if (/\b(pre[cç]o|valor|quanto custa|desconto)\b/i.test(texto) && !ficha.pendenteConfirmacao) {
    return {
      reply: fala(
        "Valor e prazo a gente só passa depois da visita, com a medida no local.",
        "Quer que eu marque uma visita técnica? Sem compromisso de fazer o serviço no mesmo dia.",
      ),
      ficha,
      pills: [],
    };
  }

  if (nao(texto) && ficha.pendenteConfirmacao) {
    ficha = { ...ficha, pendenteConfirmacao: false, dataIso: undefined, hora: undefined };
    return {
      reply: fala("Tudo bem, não salvei.", "Quer trocar a data, o horário ou o endereço?"),
      ficha,
      pills: [
        { label: "Trocar data", value: "quero outra data" },
        { label: "Trocar endereço", value: "quero mudar o endereço" },
      ],
    };
  }

  if (ficha.intencao === "cancelar") {
    if (!ficha.telefone) {
      return {
        reply: "Para cancelar, me passa o telefone com DDD que usou no agendamento?",
        ficha,
        pills: [],
      };
    }
    const atual = await agendadoAberto(ficha.telefone);
    if (!atual) {
      return {
        reply: "Não achei uma visita em aberto nesse telefone. Se quiser, posso marcar uma nova.",
        ficha: { ...ficha, intencao: "agendar" },
        pills: [],
      };
    }
    if (!sim(texto) && !/cancelar/.test(texto.toLowerCase())) {
      return {
        reply: `Encontrei a visita nº ${atual.id} de ${atual.nome} em ${atual.dataVisita}${atual.horaVisita ? ` às ${atual.horaVisita}` : ""}. Confirma o cancelamento?`,
        ficha: { ...ficha, agendamentoId: atual.id },
        pills: [
          { label: "Sim, cancelar", value: "sim" },
          { label: "Não", value: "não" },
        ],
      };
    }
    if (nao(texto)) {
      return { reply: "Ok, mantive o agendamento.", ficha: { ...ficha, intencao: undefined }, pills: [] };
    }
    const prisma = await getPrisma();
    await prisma.inventario.delete({ where: { id: atual.id } });
    return {
      reply: `Pronto, cancelei a visita nº ${atual.id}. Se precisar de novo, é só chamar.`,
      ficha: { intencao: undefined },
      pills: [{ label: "Agendar outra visita", value: "quero agendar uma visita" }],
      done: true,
    };
  }

  if (ficha.intencao === "remarcar") {
    if (!ficha.telefone) {
      return {
        reply: "Para remarcar, me passa o telefone com DDD do agendamento?",
        ficha,
        pills: [],
      };
    }
    const atual = await agendadoAberto(ficha.telefone);
    if (!atual) {
      return {
        reply: "Não achei visita em aberto nesse telefone. Posso marcar uma nova, se quiser.",
        ficha: { ...ficha, intencao: "agendar" },
        pills: [],
      };
    }
    ficha.agendamentoId = atual.id;
    ficha.nome = ficha.nome || atual.nome;
    if (!ficha.dataIso || !ficha.hora) {
      const dias = await proximosLivres(ficha.periodo);
      if (!dias.length) {
        return {
          reply: "A agenda próxima está cheia nos dias úteis. Me diga outro dia (segunda a sexta) que eu confiro.",
          ficha,
          pills: [],
        };
      }
      const op = textoOpcoes(dias);
      return { reply: `Vou remarcar a visita nº ${atual.id}. ${op.text}`, ficha, pills: op.pills };
    }
    const prisma = await getPrisma();
    const livres = await horariosLivresVisita(prisma, ficha.dataIso);
    if (!ehDiaUtil(ficha.dataIso) || !livres.includes(ficha.hora)) {
      const dias = await proximosLivres(ficha.periodo);
      const op = textoOpcoes(dias);
      return {
        reply: `Esse horário não está livre. ${op.text}`,
        ficha: { ...ficha, dataIso: undefined, hora: undefined },
        pills: op.pills,
      };
    }
    await prisma.inventario.update({
      where: { id: atual.id },
      data: { dataVisita: toDataVisitaBr(ficha.dataIso), horaVisita: ficha.hora },
    });
    return {
      reply: `Remarcado! 💜 Visita nº ${atual.id} agora em ${formatarDia(ficha.dataIso)} às ${ficha.hora}.`,
      ficha: { ...ficha, intencao: undefined, protocolo: atual.id, pendenteConfirmacao: false },
      pills: [],
      done: true,
    };
  }

  const enderecoNovoNoTexto = parseEnderecoLivre(texto);
  const mandouEnderecoNovo = Boolean(enderecoNovoNoTexto.rua || enderecoNovoNoTexto.numero);

  if ((querOutroEndereco(texto) || (nao(texto) && mandouEnderecoNovo)) && mandouEnderecoNovo) {
    ficha = aplicarEnderecoColado(limparEndereco(ficha, { manterCep: true }), texto);
  } else if (querOutroEndereco(texto)) {
    ficha = limparEndereco(ficha, { manterCep: true });
    return {
      reply: "Certo. Me passa o endereço completo da visita: rua, número, bairro e cidade. Sem o local correto eu não agendo.",
      ficha,
      pills: [],
    };
  }

  if (ficha.aguardandoConfirmaCadastro) {
    if ((nao(texto) || querOutroEndereco(texto)) && mandouEnderecoNovo) {
      ficha = aplicarEnderecoColado(limparEndereco(ficha, { manterCep: true }), texto);
    } else if (nao(texto) || querOutroEndereco(texto)) {
      ficha = limparEndereco(ficha, { manterCep: true });
      return {
        reply: "Beleza, vou anotar o endereço correto. Qual a rua, o número, o bairro e a cidade da visita?",
        ficha,
        pills: [],
      };
    } else if (sim(texto) || /mesmo endere[cç]o/i.test(texto)) {
      const cli = ficha.telefone ? await consultarCliente(ficha.telefone) : null;
      if (!cli || !cadastroTemEndereco(cli)) {
        ficha = limparEndereco(ficha, { manterCep: true });
        return {
          reply: "Não consegui reaproveitar o cadastro. Me passa o endereço completo: rua, número, bairro e cidade.",
          ficha,
          pills: [],
        };
      }
      ficha = sanitizarEnderecoFicha(aplicarCadastro(ficha, cli));
    } else if (mandouEnderecoNovo) {
      ficha = aplicarEnderecoColado(limparEndereco(ficha, { manterCep: true }), texto);
    } else {
      return {
        reply: "A visita é no endereço que já temos no cadastro, ou é outro local?",
        ficha,
        pills: [
          { label: "Mesmo endereço", value: "sim, mesmo endereço" },
          { label: "Outro endereço", value: "não, é outro endereço" },
        ],
      };
    }
  }

  if (!ehSaudacao(texto)) {
    if (faltava === "servico" && !ficha.servico && soTexto.length > 2 && !extrairCep(texto) && !mandouEnderecoNovo) {
      ficha.servico = texto.slice(0, 80);
    }
    if (faltava === "nome" && !ficha.nome && soTexto.length >= 2 && !extrairTelefone(texto) && !mandouEnderecoNovo) {
      ficha.nome = capNome(texto.replace(/meu nome [eé]\s*/i, "").trim()).slice(0, 120);
    }
    const pedindoEndereco =
      faltava === "endereco" ||
      faltava === "rua" ||
      faltava === "numero" ||
      faltava === "bairro" ||
      faltava === "cidade";
    if (pedindoEndereco && mandouEnderecoNovo) {
      ficha = aplicarEnderecoColado(ficha, texto);
    } else if ((faltava === "endereco" || faltava === "rua") && !ficha.rua && pareceRua(textoEndereco(texto))) {
      ficha = aplicarEnderecoColado(ficha, texto);
      if (!ficha.rua) {
        ficha = sanitizarEnderecoFicha({
          ...ficha,
          rua: comTipoLogradouro(textoEndereco(texto)),
          enderecoConfirmado: false,
        });
      }
    }
    if (faltava === "numero" && !numeroImovelOk(ficha.numero)) {
      const soNumero = textoEndereco(texto);
      const n = extrairNumeroImovel(texto) || (/^\d{1,6}[A-Za-z]?$/.test(soNumero) ? soNumero : undefined);
      if (numeroImovelOk(n)) ficha.numero = n;
    }
    if (faltava === "bairro" && !ficha.bairro && soTexto.length >= 2 && !sim(texto) && !nao(texto) && !ehSaudacao(texto)) {
      ficha.bairro = capNome(textoEndereco(texto)).slice(0, 80);
    }
    if (faltava === "cidade" && !ficha.cidade && soTexto.length >= 2 && !sim(texto) && !nao(texto) && !ehSaudacao(texto)) {
      if (!/^\d+[A-Za-z]?$/.test(soTexto)) {
        const cid = tirarCidadeDoTexto(textoEndereco(texto));
        ficha.cidade = cid.cidade || capNome(textoEndereco(texto)).slice(0, 80);
      }
    }
  }

  ficha = sanitizarEnderecoFicha(ficha);
  if (ficha.nome && !ficha.responsavel) ficha.responsavel = ficha.nome;

  const cepRua = await completarEnderecoPeloCep(ficha);
  ficha = cepRua.ficha;
  if (cepRua.ambigua?.length) {
    return {
      reply: fala("Achei mais de uma rua com esse nome. Qual é?"),
      ficha,
      pills: cepRua.ambigua.map((a) => ({
        label: a.rua.replace(/^Rua\s+/i, ""),
        value: a.rua,
      })),
    };
  }
  if (enderecoPronto(ficha)) ficha.enderecoConfirmado = true;

  if (!ficha.servico) {
    return {
      reply: fala(prefixo || cumprimentoAgora(), "Em que posso ajudar?"),
      ficha,
      pills: [],
    };
  }
  if (!ficha.nome) {
    return {
      reply: fala(prefixo, "Ok, me informa seu nome completo."),
      ficha,
      pills: [],
    };
  }

  if (
    ficha.telefone &&
    !ficha.rua &&
    !ficha.aguardandoConfirmaCadastro
  ) {
    const cli = await consultarCliente(ficha.telefone);
    if (cli && cadastroTemEndereco(cli)) {
      return {
        reply: fala(
          prefixo,
          "Achei um cadastro nesse telefone.",
          `👤 ${cli.nome}\n📍 ${formatarCadastro(cli)}`,
          "A visita é nesse mesmo endereço?",
        ),
        ficha: { ...ficha, aguardandoConfirmaCadastro: true },
        pills: [
          { label: "Mesmo endereço", value: "sim, mesmo endereço" },
          { label: "Outro endereço", value: "não, é outro endereço" },
        ],
      };
    }
  }

  const faltaEnd = pedirEndereco(ficha, prefixo, { naoAchouRua: cepRua.naoAchouRua });
  if (faltaEnd) return faltaEnd;

  if (!ficha.descricao && /\b(goteira|telhado|muro|port[aã]o|cozinha|quarto)\b/i.test(texto) && texto.length > 12) {
    ficha.descricao = texto.slice(0, 400);
  }

  if (!ficha.dataIso || !ficha.hora) {
    if (ficha.dataIso && !ehDiaUtil(ficha.dataIso)) {
      ficha.dataIso = undefined;
      return {
        reply: fala("A gente atende de segunda a sexta, das 8h às 18h.", "Escolhe um dia útil pra mim?"),
        ficha,
        pills: [],
      };
    }
    const dias = await proximosLivres(ficha.periodo, ficha.dataIso && !ficha.hora ? ficha.dataIso : undefined);
    if (!dias.length) {
      return {
        reply: ficha.dataIso
          ? fala("Esse dia já está cheio.", "Me passa outro dia útil que eu olho na agenda?")
          : fala("Não achei horário livre nos próximos dias.", "Me diz uma data, de segunda a sexta, que eu confiro."),
        ficha: { ...ficha, dataIso: undefined, hora: undefined },
        pills: [
          { label: "Manhã", value: "prefiro de manhã" },
          { label: "Tarde", value: "prefiro de tarde" },
        ],
      };
    }
    const op = textoOpcoes(dias);
    return { reply: op.text, ficha, pills: op.pills };
  }

  if (!ehDiaUtil(ficha.dataIso)) {
    return {
      reply: fala("Esse dia a gente não atende.", "Segunda a sexta, das 8h às 18h — me passa outra data?"),
      ficha: { ...ficha, dataIso: undefined, hora: undefined },
      pills: [],
    };
  }

  if (!ficha.telefone) {
    return {
      reply: fala("Ok!", "Me passa um telefone com DDD que eu fecho o agendamento."),
      ficha,
      pills: [],
    };
  }

  if (!enderecoPronto(ficha)) {
    return {
      reply: fala("Ainda falta o endereço completo.", "Me passa rua, número, bairro e cidade."),
      ficha: { ...ficha, enderecoConfirmado: false },
      pills: [],
    };
  }

  if (ficha.protocolo) {
    return {
      reply: fala("Seu agendamento já está feito.", "Te ajudo em algo mais?"),
      ficha: { ...ficha, aguardandoMaisAjuda: true },
      pills: [],
    };
  }

  try {
    const criado = await criarVisita(ficha);
    if ("erro" in criado) {
      ficha.pendenteConfirmacao = false;
      ficha.hora = undefined;
      const extra = criado.horas?.length ? `\nLivres nesse dia: ${criado.horas.join(", ")}` : "";
      return { reply: `${criado.erro}${extra}`, ficha, pills: [] };
    }
    ficha.protocolo = criado.id;
    ficha.aguardandoMaisAjuda = true;
    return {
      reply: confirmacao(ficha, criado.id),
      ficha,
      pills: [],
    };
  } catch (err) {
    console.error("[poliane criar]", err);
    return {
      reply: fala(
        "Não consegui gravar no sistema agora.",
        "Vou te passar pro WhatsApp da equipe pra não perder o atendimento.",
      ),
      ficha,
      pills: [{ label: "Abrir WhatsApp", value: "__whatsapp__" }],
    };
  }
}
