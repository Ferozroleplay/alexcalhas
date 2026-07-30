import { existsSync } from "node:fs";
import path from "node:path";

import { HOME_SITE, HOME_PARTNERS, siteAsset, type HomeGaleriaItem, type HomeLandingData, type HomePartner, type HomeServico, type HomeSlide } from "@/data/home-config";
import { getPrisma } from "@/lib/db.server";
import { listParceirosPublicos } from "@/lib/parceiros.server";
import { resolveProdutoImagemUrl } from "@/lib/produtos-site.server";
import { fotoPublicUrl } from "@/lib/produtos-upload.server";

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

function resolvePublicUrl(rel: string): string {
  const local = path.join(process.cwd(), "public", rel.replace(/^\//, ""));
  if (existsSync(local)) return rel;
  const base = HOME_SITE.mediaBaseUrl;
  const remote = rel.startsWith("/") ? rel : `/${rel}`;
  return `${base}${remote}`;
}

async function buildFromDb(): Promise<Omit<HomeLandingData, "parceiros"> | null> {
  const prisma = await getPrisma();
  const produtos = await prisma.produtoSite.findMany({
    where: { ativo: 1 },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  if (produtos.length === 0) return null;

  const servicos: HomeServico[] = [];
  const galeria: HomeGaleriaItem[] = [];

  for (const p of produtos) {
    const img = await resolveProdutoImagemUrl(prisma, p.id, p.slug);
    servicos.push({
      slug: p.slug,
      titulo: p.nome,
      texto: p.descricao?.trim() || "",
      img: img || resolvePublicUrl(`/images/galeria/${p.slug}.jpg`),
    });

    const fotos = await prisma.produtoFoto.findMany({
      where: { produtoId: p.id },
      orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }, { id: "asc" }],
    });

    if (fotos.length === 0) {
      galeria.push({ src: img, legenda: p.nome });
      continue;
    }

    const antes = galeria.length;
    for (const f of fotos) {
      if (!f.arquivo) continue;
      galeria.push({
        src: fotoPublicUrl(f.arquivo),
        legenda: f.legenda?.trim() || p.nome,
      });
    }
    if (fotos.length > 0 && galeria.length === antes) {
      galeria.push({ src: img, legenda: p.nome });
    }
  }

  const heroSlides: HomeSlide[] =
    galeria.length > 0
      ? galeria.map((g) => ({ src: g.src, alt: g.legenda || "Alex Calhas" }))
      : staticLanding().heroSlides;

  return { servicos, galeria, heroSlides };
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

export async function loadHomeLandingData(): Promise<HomeLandingData> {
  const parceiros = await loadParceirosHome();
  try {
    const fromDb = await buildFromDb();
    if (fromDb) return { ...fromDb, parceiros };
  } catch (err) {
    console.error("[loadHomeLandingData]", err);
  }
  return { ...staticLanding(), parceiros };
}
