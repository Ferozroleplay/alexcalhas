import { z } from "zod";

const agendamentoBase = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
  cpfCnpj: z.string().trim().max(20).optional().or(z.literal("")),
  telefone: z.string().trim().min(8, "Telefone inválido").max(20),
  endereco: z.string().trim().min(3, "Informe o endereço").max(180),
  bairro: z.string().trim().min(2, "Informe o bairro").max(80),
  cep: z.string().trim().max(10).optional().or(z.literal("")),
  numero: z.string().trim().min(1, "Informe o número").max(10),
  data: z.string().trim().min(1, "Selecione a data"),
  observacao: z.string().trim().max(1000).optional().or(z.literal("")),
  origem: z.literal("site"),
});

/** Site: horário escolhido na grade (08:00–18:00, 2h de intervalo). */
export const agendamentoSiteSchema = agendamentoBase.extend({
  hora: z.string().trim().min(1, "Selecione o horário").max(50),
});

/** Painel e outros fluxos que exigem hora. */
export const agendamentoSchema = agendamentoBase.extend({
  hora: z.string().trim().min(1, "Selecione a hora"),
});

export type AgendamentoSiteInput = z.infer<typeof agendamentoSiteSchema>;
export type AgendamentoInput = z.infer<typeof agendamentoSchema>;
