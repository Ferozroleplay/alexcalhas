import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const fotos = await p.produtoFoto.findMany({
  take: 20,
  orderBy: { id: "desc" },
  select: { id: true, arquivo: true, legenda: true, produtoId: true, ehCapa: true },
});
console.log(JSON.stringify(fotos, null, 2));
await p.$disconnect();
