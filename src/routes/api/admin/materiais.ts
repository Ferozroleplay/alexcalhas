import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/agendamento.server";
import { isAdminRequest } from "@/lib/auth.server";
import { jsonResponse } from "@/lib/http.server";
import {
  createMaterial,
  deleteMaterial,
  findMaterialByNome,
  listMateriais,
  salvarMaterialFornecedoresLiberados,
  updateMaterial,
} from "@/lib/materiais.server";

function parseMoney(raw: unknown): number {
  const v = String(raw ?? "0").replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function materialValidationMessage(err: z.ZodError): string {
  for (const issue of err.issues) {
    if (issue.path[0] === "material" && issue.code === "too_big") {
      return "A descrição do material pode ter no máximo 50 caracteres.";
    }
    if (issue.path[0] === "material" && issue.code === "too_small") {
      return "Informe a descrição do material.";
    }
  }
  return "Dados inválidos.";
}

const postSchema = z.object({
  material: z.string().trim().min(1).max(50),
  valor_custo: z.union([z.number(), z.string()]).optional(),
  valor: z.union([z.number(), z.string()]),
});

const patchSchema = postSchema.extend({
  id: z.number().int().positive(),
  valor_fornecedor: z.union([z.number(), z.string()]).optional(),
  fornecedor_ids: z.array(z.number().int().positive()).optional(),
});

export const Route = createFileRoute("/api/admin/materiais")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdminRequest(request)) {
          return jsonResponse({ ok: false, message: "Não autorizado." }, 401);
        }
        try {
          const itens = await listMateriais();
          return jsonResponse({ ok: true, itens });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const parsed = postSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: materialValidationMessage(parsed.error) }, 422);
        }
        try {
          const dup = await findMaterialByNome(parsed.data.material);
          if (dup) {
            return jsonResponse({ ok: false, message: "Material já cadastrado." }, 409);
          }
          await createMaterial({
            material: parsed.data.material,
            valor_custo: parseMoney(parsed.data.valor_custo),
            valor: parseMoney(parsed.data.valor),
          });
          const itens = await listMateriais();
          const item = itens.find((m) => m.material === parsed.data.material);
          return jsonResponse({ ok: true, item });
        } catch (err) {
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      PATCH: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return jsonResponse({ ok: false, message: materialValidationMessage(parsed.error) }, 422);
        }
        try {
          await updateMaterial(parsed.data.id, {
            material: parsed.data.material,
            valor_custo: parseMoney(parsed.data.valor_custo),
            valor: parseMoney(parsed.data.valor),
            ...(parsed.data.valor_fornecedor !== undefined
              ? { valor_fornecedor: parseMoney(parsed.data.valor_fornecedor) }
              : {}),
          });
          if (parsed.data.fornecedor_ids !== undefined) {
            await salvarMaterialFornecedoresLiberados(parsed.data.id, parsed.data.fornecedor_ids);
          }
          const itens = await listMateriais();
          const item = itens.find((m) => m.id === parsed.data.id);
          if (!item) {
            return jsonResponse({ ok: false, message: "Material não encontrado." }, 404);
          }
          return jsonResponse({ ok: true, item });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Material não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },

      DELETE: async ({ request }) => {
        if (!isAdminRequest(request)) return jsonResponse({ ok: false }, 401);
        const url = new URL(request.url);
        const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
        if (!Number.isFinite(id) || id <= 0) {
          return jsonResponse({ ok: false, message: "ID inválido." }, 422);
        }
        try {
          await deleteMaterial(id);
          return jsonResponse({ ok: true });
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code: string }).code
              : "";
          if (code === "P2025") {
            return jsonResponse({ ok: false, message: "Material não encontrado." }, 404);
          }
          return jsonResponse({ ok: false, message: dbErrorMessage(err) }, 503);
        }
      },
    },
  },
});
