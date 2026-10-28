import { saudacaoPeriodoDia } from "@/lib/whatsapp-orcamento";

export const AVISO_MODELOS: { id: string; label: string; texto: string }[] = [
  {
    id: "geral",
    label: "Aviso geral",
    texto:
      "{saudacao}, {nome}!\n\nAqui é da *Alex Calhas*.\n\n\n\nQualquer dúvida é só chamar.",
  },
  {
    id: "retorno",
    label: "Revisão",
    texto:
      "{saudacao}, {nome}!\n\nAqui é da *Alex Calhas*. Vale conferir calha e rufo de vez em quando. Se notar vazamento ou folga, a gente vai até aí.\n\nResponde esta mensagem que agendamos.",
  },
  {
    id: "promocao",
    label: "Promoção",
    texto:
      "{saudacao}, {nome}!\n\nAqui é da *Alex Calhas*. Esta semana tem condição especial para calha, rufo e pingadeira.\n\nSe quiser orçamento, é só responder.",
  },
];

export function aplicarAvisoCliente(texto: string, nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] || "cliente";
  return texto
    .replaceAll("{saudacao}", saudacaoPeriodoDia())
    .replaceAll("{nome_completo}", nome.trim() || "cliente")
    .replaceAll("{nome}", primeiro);
}
