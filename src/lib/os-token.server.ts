import { createHmac, timingSafeEqual } from "node:crypto";

import { getAuthSecret } from "@/lib/config.server";

function osSecret(): string {
  return getAuthSecret() || "alexcalhas-os-public";
}

/** Token curto para o link da OS (WhatsApp / nova aba). */
export function criarOsToken(id: number): string {
  return createHmac("sha256", osSecret())
    .update(`os:${Math.trunc(id)}`)
    .digest("base64url")
    .slice(0, 22);
}

export function osTokenValido(id: number, token: string | null | undefined): boolean {
  const t = String(token ?? "").trim();
  if (!t) return false;
  const expected = criarOsToken(id);
  const a = Buffer.from(t);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
