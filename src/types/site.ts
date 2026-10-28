import type { LucideIcon } from "lucide-react";

export type Service = {
  slug: string;
  title: string;
  description: string;
  image: string;
};

/** Card da home — dados do painel (produtos ativos + capa). */
export type ProdutoSiteHome = {
  slug: string;
  title: string;
  description: string;
  image: string;
};

export type GalleryItem = {
  image: string;
  label: string;
  alt: string;
};

export type Benefit = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type Differential = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type NavLink = {
  label: string;
  href: string;
};

export type ContactInfo = {
  whatsapp: string;
  whatsappLink: string;
  phone: string;
  email: string;
  address: string;
};

/** Payload enviado ao backend (MySQL via /api/agendamentos). */
export type AgendamentoPayload = {
  nome: string;
  cpfCnpj?: string;
  telefone: string;
  endereco: string;
  bairro: string;
  cep?: string;
  numero: string;
  data: string;
  hora: string;
  observacao?: string;
  origem: "site";
};
