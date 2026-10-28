import { getPrisma } from "@/lib/db.server";

export type CnpjFornecedorDados = {
  razao_social: string;
  nome_fantasia: string;
  email: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type ConsultaDocumentoResult = {
  status: "sucesso" | "erro";
  nome?: string | null;
  telefone?: string | null;
  cep?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  numero?: string | null;
  tipo?: string | null;
  fonte?: string | null;
  mensagem?: string | null;
};

function apenasDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

async function httpGetJson(url: string): Promise<{ code: number; data: Record<string, unknown> | null }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "AlexCalhas/1.0",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { code: res.status, data: null };
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== "object") return { code: res.status, data: null };
    return { code: res.status, data: raw as Record<string, unknown> };
  } catch {
    return { code: 0, data: null };
  }
}

function extrairNomeCnpj(data: Record<string, unknown>): string | null {
  let fantasia = str(data.nome_fantasia || data.fantasia).trim();
  const razao = str(data.razao_social || data.nome).trim();
  const est = data.estabelecimento;
  if (est && typeof est === "object") {
    const e = est as Record<string, unknown>;
    const fantasiaEst = str(e.nome_fantasia).trim();
    if (fantasiaEst && fantasiaEst.toUpperCase() !== "N/A") fantasia = fantasiaEst;
  }
  if (fantasia && !["N/A", "NA", "-"].includes(fantasia.toUpperCase())) return fantasia;
  return razao || null;
}

function montarTelefoneCnpj(data: Record<string, unknown>, est?: Record<string, unknown> | null): string {
  const fontes = est ? [est, data] : [data];
  for (const item of fontes) {
    const ddd = apenasDigitos(str(item.ddd_telefone_1 || item.ddd1 || item.ddd));
    const tel = apenasDigitos(str(item.telefone_1 || item.telefone1 || item.telefone));
    if (ddd || tel) return `${ddd ? `(${ddd}) ` : ""}${tel}`.trim();
  }
  return "";
}

function montarLogradouro(fonte: Record<string, unknown>): string {
  let logradouro = str(fonte.logradouro || fonte.descricao_logradouro || fonte.endereco || fonte.rua).trim();
  const tipo = str(
    fonte.tipo_logradouro || fonte.descricao_tipo_de_logradouro || fonte.tipo_de_logradouro,
  ).trim();
  if (!logradouro && tipo) return tipo;
  if (logradouro && tipo && !logradouro.toLowerCase().includes(tipo.toLowerCase())) {
    return `${tipo} ${logradouro}`.trim();
  }
  return logradouro;
}

function montarNumero(fonte: Record<string, unknown>): string {
  return str(fonte.numero || fonte.numero_endereco).trim();
}

function montarComplemento(fonte: Record<string, unknown>): string {
  return str(fonte.complemento || fonte.complemento_endereco || fonte.complemento_extra).trim();
}

function normalizarRespostaCnpjFornecedor(data: Record<string, unknown>): CnpjFornecedorDados {
  let razao = str(data.razao_social || data.nome).trim();
  let fantasia = str(data.nome_fantasia || data.fantasia).trim();
  const estRaw = data.estabelecimento;
  const est = estRaw && typeof estRaw === "object" ? (estRaw as Record<string, unknown>) : null;
  const fonteEndereco = est ?? data;

  if (est) {
    if (!fantasia) fantasia = str(est.nome_fantasia).trim();
    if (!razao) razao = str(data.razao_social).trim();
  }

  let cidade = "";
  const cidadeObj = fonteEndereco.cidade;
  if (cidadeObj && typeof cidadeObj === "object") {
    cidade = str((cidadeObj as Record<string, unknown>).nome).trim();
  }
  if (!cidade) cidade = str(fonteEndereco.municipio || data.municipio || data.cidade).trim();

  let uf = "";
  const estadoObj = fonteEndereco.estado;
  if (estadoObj && typeof estadoObj === "object") {
    uf = str((estadoObj as Record<string, unknown>).sigla).trim().toUpperCase();
  }
  if (!uf) uf = str(fonteEndereco.uf || data.uf).trim().toUpperCase();

  const cep = apenasDigitos(str(fonteEndereco.cep || data.cep));

  return {
    razao_social: razao || extrairNomeCnpj(data) || "",
    nome_fantasia: fantasia,
    email: str(fonteEndereco.email || data.email || data.email_empresa).trim(),
    telefone: montarTelefoneCnpj(data, est),
    cep,
    endereco: montarLogradouro(fonteEndereco as Record<string, unknown>),
    numero: montarNumero(fonteEndereco as Record<string, unknown>),
    complemento: montarComplemento(fonteEndereco as Record<string, unknown>),
    bairro: str(fonteEndereco.bairro || data.bairro || data.bairro_municipio).trim(),
    cidade,
    uf,
  };
}

async function completarEnderecoViaCep(payload: CnpjFornecedorDados): Promise<CnpjFornecedorDados> {
  const cep = apenasDigitos(payload.cep);
  if (cep.length !== 8) return payload;

  const precisaLogradouro = !payload.endereco.trim();
  const precisaBairro = !payload.bairro.trim();
  const precisaCidade = !payload.cidade.trim();
  const precisaUf = !payload.uf.trim();
  if (!precisaLogradouro && !precisaBairro && !precisaCidade && !precisaUf) return payload;

  const res = await httpGetJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (res.code !== 200 || !res.data || res.data.erro) return payload;

  const via = res.data;
  return {
    ...payload,
    endereco: precisaLogradouro ? str(via.logradouro).trim() : payload.endereco,
    bairro: precisaBairro ? str(via.bairro).trim() || payload.bairro : payload.bairro,
    cidade: precisaCidade ? str(via.localidade).trim() || payload.cidade : payload.cidade,
    uf: precisaUf ? str(via.uf).trim().toUpperCase() || payload.uf : payload.uf,
  };
}

function pontuarEnderecoFornecedor(payload: CnpjFornecedorDados): number {
  const campos: (keyof CnpjFornecedorDados)[] = [
    "endereco",
    "numero",
    "complemento",
    "bairro",
    "cep",
    "cidade",
    "uf",
  ];
  return campos.filter((c) => str(payload[c]).trim() !== "").length;
}

function mesclarMelhorEndereco(base: CnpjFornecedorDados, novo: CnpjFornecedorDados): CnpjFornecedorDados {
  const out = { ...base };
  const keys: (keyof CnpjFornecedorDados)[] = [
    "endereco",
    "numero",
    "complemento",
    "bairro",
    "cep",
    "cidade",
    "uf",
    "email",
    "telefone",
    "nome_fantasia",
  ];
  for (const k of keys) {
    if (!str(out[k]).trim() && str(novo[k]).trim()) out[k] = novo[k];
  }
  if (!out.razao_social.trim() && novo.razao_social.trim()) out.razao_social = novo.razao_social;
  return out;
}

export async function consultarCnpjFornecedor(
  cnpjRaw: string,
): Promise<{ ok: true; dados: CnpjFornecedorDados; fonte?: string } | { ok: false; message: string }> {
  const cnpj = apenasDigitos(cnpjRaw);
  if (cnpj.length !== 14) {
    return { ok: false, message: "Informe um CNPJ válido com 14 dígitos." };
  }

  const apis = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://publica.cnpj.ws/cnpj/${cnpj}`,
    `https://minhareceita.org/${cnpj}`,
    `https://receitaws.com.br/v1/cnpj/${cnpj}`,
  ];

  let ultimoErro = "Não foi possível consultar o CNPJ. Tente novamente em instantes.";
  let melhorPayload: CnpjFornecedorDados | null = null;
  let fonteUsada: string | undefined;

  for (const url of apis) {
    const res = await httpGetJson(url);
    if (res.code === 429) {
      ultimoErro = "Consulta temporariamente limitada. Aguarde alguns segundos e tente de novo.";
      continue;
    }
    if (res.code !== 200 || !res.data) continue;
    if (str(res.data.status).toUpperCase() === "ERROR") continue;

    let payload = normalizarRespostaCnpjFornecedor(res.data);
    if (!payload.razao_social.trim()) continue;

    payload = await completarEnderecoViaCep(payload);
    const pontos = pontuarEnderecoFornecedor(payload);

    if (!melhorPayload) {
      melhorPayload = payload;
      try {
        fonteUsada = new URL(url).hostname;
      } catch {
        fonteUsada = undefined;
      }
    } else {
      melhorPayload = mesclarMelhorEndereco(melhorPayload, payload);
    }

    if (pontos >= 6) break;
  }

  if (melhorPayload) {
    melhorPayload = await completarEnderecoViaCep(melhorPayload);
    return { ok: true, dados: melhorPayload, fonte: fonteUsada };
  }

  return { ok: false, message: ultimoErro };
}

function formatarCepExibicao(cep: string): string {
  const d = apenasDigitos(cep);
  if (d.length !== 8) return cep.trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatarTelefoneExibicao(tel: string): string {
  const d = apenasDigitos(tel);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel.trim();
}

function montarEnderecoLinha(logradouro: string, cidade: string, uf: string): string {
  return [logradouro, cidade, uf].map((p) => p.trim()).filter(Boolean).join(" - ");
}

function extrairDadosCnpjCliente(data: Record<string, unknown>): {
  nome: string;
  telefone: string;
  cep: string;
  endereco: string;
  bairro: string;
  numero: string;
} | null {
  const nome = extrairNomeCnpj(data);
  if (!nome) return null;

  let cep = "";
  let logradouro = "";
  let bairro = "";
  let numero = "";
  let telefone = "";
  let cidade = "";
  let uf = "";

  const estRaw = data.estabelecimento;
  if (estRaw && typeof estRaw === "object") {
    const est = estRaw as Record<string, unknown>;
    cep = str(est.cep);
    const tipoLog = str(est.tipo_logradouro).trim();
    const log = str(est.logradouro).trim();
    logradouro = `${tipoLog} ${log}`.trim();
    bairro = str(est.bairro).trim();
    numero = str(est.numero).trim();
    const ddd = str(est.ddd1 || est.ddd);
    const tel = str(est.telefone1 || est.telefone);
    if (ddd && tel) telefone = ddd + tel;
    const cidadeObj = est.cidade;
    if (cidadeObj && typeof cidadeObj === "object") {
      cidade = str((cidadeObj as Record<string, unknown>).nome).trim();
    } else {
      cidade = str(est.municipio).trim();
    }
    const estadoObj = est.estado;
    if (estadoObj && typeof estadoObj === "object") {
      uf = str((estadoObj as Record<string, unknown>).sigla).trim();
    } else {
      uf = str(est.uf).trim();
    }
  } else {
    cep = str(data.cep);
    logradouro = str(data.logradouro).trim();
    bairro = str(data.bairro).trim();
    numero = str(data.numero).trim();
    cidade = str(data.municipio || data.cidade).trim();
    uf = str(data.uf).trim();
    telefone = apenasDigitos(str(data.ddd_telefone_1 || data.telefone));
  }

  return {
    nome,
    telefone,
    cep,
    endereco: montarEnderecoLinha(logradouro, cidade, uf),
    bairro,
    numero,
  };
}

async function buscaCnpjDadosCliente(
  cnpj: string,
): Promise<Record<string, string> | { erro: "limite" } | null> {
  const apis = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://publica.cnpj.ws/cnpj/${cnpj}`,
    `https://minhareceita.org/${cnpj}`,
    `https://receitaws.com.br/v1/cnpj/${cnpj}`,
  ];
  let ultimoCodigo = 0;
  for (const url of apis) {
    const res = await httpGetJson(url);
    ultimoCodigo = res.code;
    if (res.code === 429) continue;
    if (!res.data) continue;
    const dados = extrairDadosCnpjCliente(res.data);
    if (dados?.nome) return dados;
  }
  if (ultimoCodigo === 429) return { erro: "limite" };
  return null;
}

async function garantirTabelaCache(): Promise<void> {
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS documento_nome_cache (
      documento VARCHAR(14) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      telefone VARCHAR(50) NULL,
      cep VARCHAR(12) NULL,
      endereco VARCHAR(255) NULL,
      bairro VARCHAR(120) NULL,
      numero VARCHAR(30) NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (documento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
}

type ClienteRow = {
  nome: string;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  bairro: string | null;
  numero: string | null;
};

async function buscaInventarioCliente(doc: string): Promise<ClienteRow | null> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT nome, telefone, cep, endereco, bairro, numero
     FROM inventario
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(\`cpf-cnpj\`, '.', ''), '-', ''), '/', ''), ' ', '') = '${doc}'
     ORDER BY id DESC
     LIMIT 1`,
  );
  const r = rows[0];
  if (!r || !str(r.nome).trim()) return null;
  return {
    nome: str(r.nome),
    telefone: r.telefone ? str(r.telefone) : null,
    cep: r.cep ? str(r.cep) : null,
    endereco: r.endereco ? str(r.endereco) : null,
    bairro: r.bairro ? str(r.bairro) : null,
    numero: r.numero ? str(r.numero) : null,
  };
}

async function buscaCacheCliente(doc: string): Promise<ClienteRow | null> {
  const prisma = await getPrisma();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT nome, telefone, cep, endereco, bairro, numero
     FROM documento_nome_cache WHERE documento = '${doc}' LIMIT 1`,
  );
  const r = rows[0];
  if (!r || !str(r.nome).trim()) return null;
  return {
    nome: str(r.nome),
    telefone: r.telefone ? str(r.telefone) : null,
    cep: r.cep ? str(r.cep) : null,
    endereco: r.endereco ? str(r.endereco) : null,
    bairro: r.bairro ? str(r.bairro) : null,
    numero: r.numero ? str(r.numero) : null,
  };
}

async function salvarCacheCliente(doc: string, dados: ClienteRow): Promise<void> {
  if (!dados.nome.trim()) return;
  const prisma = await getPrisma();
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  const tel = esc(apenasDigitos(dados.telefone ?? ""));
  const cep = esc(apenasDigitos(dados.cep ?? ""));
  await prisma.$executeRawUnsafe(`
    INSERT INTO documento_nome_cache (documento, nome, telefone, cep, endereco, bairro, numero)
    VALUES ('${esc(doc)}', '${esc(dados.nome.trim())}', NULLIF('${tel}',''), NULLIF('${cep}',''),
      NULLIF('${esc((dados.endereco ?? "").trim())}',''), NULLIF('${esc((dados.bairro ?? "").trim())}',''),
      NULLIF('${esc((dados.numero ?? "").trim())}',''))
    ON DUPLICATE KEY UPDATE
      nome = VALUES(nome),
      telefone = COALESCE(NULLIF(VALUES(telefone), ''), telefone),
      cep = COALESCE(NULLIF(VALUES(cep), ''), cep),
      endereco = COALESCE(NULLIF(VALUES(endereco), ''), endereco),
      bairro = COALESCE(NULLIF(VALUES(bairro), ''), bairro),
      numero = COALESCE(NULLIF(VALUES(numero), ''), numero)
  `);
}

function normalizarClienteConsulta(
  row: ClienteRow,
  tipo: string,
  fonte: string,
): ConsultaDocumentoResult {
  return {
    status: "sucesso",
    nome: row.nome.trim(),
    telefone: formatarTelefoneExibicao(row.telefone ?? ""),
    cep: formatarCepExibicao(row.cep ?? ""),
    endereco: (row.endereco ?? "").trim(),
    bairro: (row.bairro ?? "").trim(),
    numero: (row.numero ?? "").trim(),
    tipo,
    fonte,
    mensagem: null,
  };
}

export async function consultarDocumento(
  documentoRaw: string,
  opts?: { incluirCadastro?: boolean },
): Promise<ConsultaDocumentoResult> {
  const incluirCadastro = opts?.incluirCadastro !== false;
  const doc = apenasDigitos(documentoRaw);
  const len = doc.length;

  if (len !== 11 && len !== 14) {
    return {
      status: "erro",
      mensagem: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.",
    };
  }

  const tipo = len === 11 ? "cpf" : "cnpj";

  try {
    await garantirTabelaCache();
  } catch {
    /* tabela opcional */
  }

  if (incluirCadastro) {
    const inv = await buscaInventarioCliente(doc).catch(() => null);
    if (inv) {
      const payload = normalizarClienteConsulta(inv, tipo, "cadastro");
      void salvarCacheCliente(doc, inv).catch(() => {});
      return payload;
    }
  }

  if (len === 14) {
    const resultado = await buscaCnpjDadosCliente(doc);
    if (resultado && "erro" in resultado && resultado.erro === "limite") {
      return {
        status: "erro",
        mensagem: "Serviço da Receita temporariamente ocupado. Aguarde alguns segundos e tente de novo.",
      };
    }
    if (resultado && !("erro" in resultado) && resultado.nome) {
      const row: ClienteRow = {
        nome: resultado.nome,
        telefone: resultado.telefone,
        cep: resultado.cep,
        endereco: resultado.endereco,
        bairro: resultado.bairro,
        numero: resultado.numero,
      };
      void salvarCacheCliente(doc, row).catch(() => {});
      return normalizarClienteConsulta(row, "cnpj", "receita");
    }
  }

  if (incluirCadastro || len === 14) {
    const cache = await buscaCacheCliente(doc).catch(() => null);
    if (cache) {
      return normalizarClienteConsulta(cache, tipo, "cache");
    }
  }

  if (len === 14) {
    return { status: "erro", mensagem: "CNPJ não encontrado na Receita Federal." };
  }

  if (!incluirCadastro) {
    return {
      status: "erro",
      mensagem: "Informe os dados manualmente.",
    };
  }

  return {
    status: "erro",
    mensagem:
      "CPF não encontrado nos cadastros anteriores. Informe os dados manualmente — na próxima vez o sistema lembrará.",
  };
}
