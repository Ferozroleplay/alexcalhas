import { existsSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import { hasBlobStorage } from "@/lib/blob-upload.server";
import { getPrisma } from "@/lib/db.server";
import { fotoPublicUrl, produtosUploadDir } from "@/lib/produtos-upload.server";
import { isBlobPrivateRef } from "@/lib/usuario-thumb-url";
import type { ProdutoSiteHome } from "@/types/site";

export type { ProdutoSiteHome };

const SLUG_ALIASES: Record<string, string> = {
  "caixas-termicas": "caixas",
  "caixa-termica": "caixas",
  "caixas-termica": "caixas",
};

/** Caminhos estáticos do site (mesmos slugs do catálogo). */
const SLUG_STATIC_IMG: Record<string, string> = {
  calhas: "/images/galeria/calhas.jpg",
  rufos: "/images/galeria/rufos.jpg",
  pingadeiras: "/images/galeria/pingadeiras.jpg",
  condutores: "/images/galeria/condutores.jpg",
  coifas: "/images/galeria/coifas.jpg",
  caixas: "/images/galeria/caixas.jpg",
};

function slugImagemPadrao(slug: string): string {
  const s = slug.trim().toLowerCase();
  return SLUG_ALIASES[s] ?? s;
}

function staticFallback(slug: string): string {
  const key = slugImagemPadrao(slug);
  const rel = SLUG_STATIC_IMG[key];
  if (!rel) return "";
  const local = path.join(process.cwd(), "public", rel.replace(/^\//, ""));
  if (existsSync(local)) return rel;
  const base = process.env.PRODUTOS_FALLBACK_BASE?.replace(/\/$/, "") ?? "";
  if (base) return `${base}${rel}`;
  return rel;
}

export async function resolveProdutoImagemUrl(
  prisma: PrismaClient,
  produtoId: number,
  slug: string,
): Promise<string> {
  const fotos = await prisma.produtoFoto.findMany({
    where: { produtoId },
    orderBy: [{ ehCapa: "desc" }, { ordem: "asc" }, { id: "asc" }],
    take: 3,
  });

  const capa = fotos.find((f) => f.ehCapa === 1) ?? fotos[0];
  if (capa?.arquivo) {
    const arquivo = capa.arquivo.trim();
    const local = path.join(produtosUploadDir(), arquivo);
    if (existsSync(local)) return fotoPublicUrl(arquivo);

    // Blob privado sem token local → usa imagem estática do catálogo
    if (isBlobPrivateRef(arquivo) && !hasBlobStorage()) {
      return staticFallback(slug) || fotoPublicUrl(arquivo);
    }

    return fotoPublicUrl(arquivo);
  }

  return staticFallback(slug);
}

/** Produtos ativos do painel para a grade "Soluções completas" na home. */
export async function listProdutosSitePublicos(): Promise<ProdutoSiteHome[]> {
  const prisma = await getPrisma();
  const rows = await prisma.produtoSite.findMany({
    where: { ativo: 1 },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  return Promise.all(
    rows.map(async (r) => ({
      slug: r.slug,
      title: r.nome,
      description: r.descricao?.trim() || "",
      image: await resolveProdutoImagemUrl(prisma, r.id, r.slug),
    })),
  );
}
