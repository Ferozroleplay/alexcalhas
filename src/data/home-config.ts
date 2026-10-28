/** Configuração da landing — espelho de `Alex/app/components/site/home-config.php`. */

export const HOME_SITE = {
  mediaBaseUrl: (
    typeof process !== "undefined"
      ? process.env.VITE_MEDIA_BASE_URL ?? process.env.MEDIA_BASE_URL
      : import.meta.env.VITE_MEDIA_BASE_URL
  )?.replace(/\/$/, "") ?? "https://alexcalhas.com",
  whatsapp: "5518996475269",
  whatsappSec: "5518996069273",
  whatsappMsg: "Olá, gostaria de solicitar um orçamento para serviços da Alex Calhas.",
  email: "contato@alexcalhas.com",
  telefone1: "(18) 99647-5269",
  telefone2: "(18) 99606-9273",
  endereco: "Rua Angelim, 137, Parque Industrial, Tarumã/SP",
  mapsEmbed:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4579.960142125039!2d-50.59408071330557!3d-22.754300126151044!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94952f51afe09709%3A0x22fc652289f1c7da!2sR.%20Angelim%2C%20137%2C%20Tarum%C3%A3%20-%20SP%2C%2019820-000!5e1!3m2!1spt-BR!2sbr!4v1779991257669!5m2!1spt-BR!2sbr",
  chat: {
    nome: "Poliane",
    cargo: "Atendimento Alex Calhas",
    foto: "/images/perfil/poliane.jpg",
    mensagem: "Oi! 😊 Sou a {nome}, da Alex Calhas.\n\nEm que posso ajudar?",
  },
  img: {
    logoHeader: "/images/logo/logo-home.png",
    logoFooter: "/images/logo/logo-branco.png",
    heroSlides: [
      { src: "/images/galeria/image7.png", alt: "Instalação de calha em telhado com telhas" },
      { src: "/images/galeria/image6.png", alt: "Instalação de calha residencial com céu azul" },
      { src: "/images/galeria/image8.png", alt: "Acabamento em rufo sob medida" },
      { src: "/images/galeria/image5.png", alt: "Sistema de calhas e condutores instalados" },
      { src: "/images/galeria/image3.png", alt: "Acabamento profissional em calhas" },
      { src: "/images/galeria/image2.png", alt: "Fabricação personalizada Alex Calhas" },
    ],
    galeria: [
      { src: "/images/galeria/image6.png", legenda: "Instalação de calha residencial" },
      { src: "/images/galeria/image8.png", legenda: "Acabamento em rufo sob medida" },
      { src: "/images/galeria/image2.png", legenda: "Fabricação personalizada" },
      { src: "/images/galeria/image7.png", legenda: "Instalação de calha em telhado" },
    ],
    servicos: [
      { slug: "calhas", titulo: "Calhas", texto: "Proteção eficiente contra infiltrações e desvio de água da chuva.", img: "/images/galeria/calhas.jpg" },
      { slug: "rufos", titulo: "Rufos", texto: "Vedação e acabamento que garantem durabilidade e segurança.", img: "/images/galeria/rufos.jpg" },
      { slug: "pingadeiras", titulo: "Pingadeiras", texto: "Acabamento que evita manchas e protege paredes e fachadas.", img: "/images/galeria/pingadeiras.jpg" },
      { slug: "condutores", titulo: "Condutores", texto: "Escoamento de água com segurança e alto desempenho.", img: "/images/galeria/condutores.jpg" },
      { slug: "coifas", titulo: "Coifas", texto: "Ventilação e proteção para churrasqueiras e sistemas de exaustão.", img: "/images/galeria/coifas.jpg" },
      { slug: "caixas", titulo: "Caixas térmicas", texto: "Soluções térmicas sob medida para diversos segmentos.", img: "/images/galeria/caixas.jpg" },
    ],
  },
} as const;

export type HomeServico = {
  slug: string;
  titulo: string;
  texto: string;
  img: string;
};

export type HomeSlide = { src: string; alt: string };
export type HomeGaleriaItem = { src: string; legenda: string };

export type HomePartner = {
  name: string;
  /** Caminho em /public (ex.: /images/parceiros/marca.png) */
  logo?: string;
  url?: string;
};

/** Fallback estático quando não há parceiros no banco */
export const HOME_PARTNERS: HomePartner[] = [];

export type HomeLandingData = {
  servicos: HomeServico[];
  heroSlides: HomeSlide[];
  galeria: HomeGaleriaItem[];
  parceiros: HomePartner[];
};

/** Resolve caminho relativo do PHP ou URL absoluta (com fallback remoto). */
export function siteAsset(path: string): string {
  const p = path.trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  let rel = p.replace(/^\.\//, "").replace(/^app\/public\//, "");
  if (!rel.startsWith("/")) rel = `/${rel}`;
  return rel;
}

export function waUrl(number: string, msg?: string): string {
  const base = `https://wa.me/${number.replace(/\D/g, "")}`;
  if (!msg?.trim()) return base;
  return `${base}?text=${encodeURIComponent(msg)}`;
}

/** Título, favicon e compartilhamento (aba do navegador / WhatsApp). */
export const SITE_META = {
  name: "Alex Calhas",
  description:
    "Calhas, rufos, pingadeiras e condutores com fabricação sob medida e instalação profissional em Tarumã e região.",
  logoPreto: "/images/logo/logo-preto.png",
  ogImagePath: "/images/logo/logo-preto.png",
  get ogImageUrl() {
    return `${HOME_SITE.mediaBaseUrl}${this.ogImagePath}`;
  },
};
