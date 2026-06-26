import { HOME_SITE } from "@/data/home-config";
import {
  entregaNumeroNota,
  formatMoeda,
  fornecedorRotuloEmpresa,
} from "@/lib/fornecedores-display";
import { telefoneWhatsappLink } from "@/lib/format-br";
import type { EntregaDetalhe } from "@/lib/fornecedores.server";

export function nomeArquivoNotaPdf(entregaId: number): string {
  return `${entregaNumeroNota(entregaId).replace(/\s+/g, "-")}.pdf`;
}

function baixarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

async function aguardarImagens(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

export function linkNotaEntrega(entregaId: number): string {
  if (typeof window === "undefined") return `/nota-entrega?nota=${entregaId}`;
  return `${window.location.origin}/nota-entrega?nota=${entregaId}`;
}

export function mensagemWhatsappNota(entrega: EntregaDetalhe): string {
  const numero = entregaNumeroNota(entrega.id);
  const empresa = fornecedorRotuloEmpresa(entrega);
  const total = formatMoeda(entrega.total_geral);
  const link = linkNotaEntrega(entrega.id);
  return (
    `Olá! Segue a *${numero}* (${empresa}) — total *R$ ${total}*.\n` +
    `Nota de entrega Alex Calhas:\n${link}`
  );
}

function telefoneWhatsappNota(entrega: EntregaDetalhe): string {
  const forn = telefoneWhatsappLink(entrega.telefone ?? "");
  if (forn) return forn;
  return `https://wa.me/${HOME_SITE.whatsapp}`;
}

export async function gerarPdfBlobNotaEntrega(el: HTMLElement, filename: string): Promise<Blob> {
  await aguardarImagens(el);

  const mod = await import("html2pdf.js");
  const html2pdf = mod.default;
  if (!html2pdf) throw new Error("Biblioteca de PDF indisponível.");

  const blob = (await html2pdf()
    .set({
      margin: [8, 8, 8, 8],
      filename,
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    })
    .from(el)
    .toPdf()
    .output("blob")) as Blob;

  if (!blob || blob.size < 500) {
    throw new Error("PDF gerado está vazio. Tente novamente.");
  }

  return blob;
}

export async function baixarPdfNotaEntrega(el: HTMLElement, entregaId: number): Promise<void> {
  const filename = nomeArquivoNotaPdf(entregaId);
  const blob = await gerarPdfBlobNotaEntrega(el, filename);
  baixarBlob(blob, filename);
}

export async function enviarWhatsappPdfNotaEntrega(
  el: HTMLElement,
  entrega: EntregaDetalhe,
): Promise<"shared" | "download"> {
  const filename = nomeArquivoNotaPdf(entrega.id);
  const blob = await gerarPdfBlobNotaEntrega(el, filename);
  const file = new File([blob], filename, { type: "application/pdf" });
  const text = mensagemWhatsappNota(entrega);

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      text,
      title: entregaNumeroNota(entrega.id),
    });
    return "shared";
  }

  baixarBlob(blob, filename);
  const waBase = telefoneWhatsappNota(entrega);
  const msg =
    `${text}\n\n` +
    "(O PDF foi baixado — anexe o arquivo *" +
    filename +
    "* na conversa do WhatsApp.)";
  window.open(`${waBase}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  return "download";
}
