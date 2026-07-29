import { HOME_SITE, HOME_PARTNERS, siteAsset, type HomeLandingData, type HomePartner } from "@/data/home-config";
import { listParceirosPublicos } from "@/lib/parceiros.server";

/** Landing padrão do site (imagens e textos fixos do design). */
function staticLanding(): HomeLandingData {
  const servicos = HOME_SITE.img.servicos.map((s) => ({
    ...s,
    img: siteAsset(s.img),
  }));
  const heroSlides = HOME_SITE.img.heroSlides.map((s) => ({
    src: siteAsset(s.src),
    alt: s.alt,
  }));
  const galeria = HOME_SITE.img.galeria.map((g) => ({
    src: siteAsset(g.src),
    legenda: g.legenda,
  }));
  return { servicos, heroSlides, galeria, parceiros: HOME_PARTNERS };
}

async function loadParceirosHome(): Promise<HomePartner[]> {
  try {
    const fromDb = await listParceirosPublicos();
    if (fromDb.length > 0) return fromDb;
  } catch (err) {
    console.error("[loadParceirosHome]", err);
  }
  return HOME_PARTNERS;
}

/** Home sempre no layout/imagens padrão; parceiros vêm do painel quando houver. */
export async function loadHomeLandingData(): Promise<HomeLandingData> {
  const parceiros = await loadParceirosHome();
  return { ...staticLanding(), parceiros };
}
