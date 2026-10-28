import type { AgendamentoItem } from "@/lib/admin-api";
import { rotuloDocumentoOs } from "@/lib/os-document";
import type { OrcamentoLinha } from "@/lib/orcamento.server";

export function nomeArquivoOrcamentoPdf(id: number, nome?: string, status?: string): string {
  return `${baseNomeArquivoOrcamento(id, nome, status)}.pdf`;
}

export function nomeArquivoOrcamentoPng(id: number, nome?: string, status?: string): string {
  return `${baseNomeArquivoOrcamento(id, nome, status)}.png`;
}

function baseNomeArquivoOrcamento(id: number, nome?: string, status?: string): string {
  const slug =
    (nome ?? "cliente")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "cliente";
  const prefixo = rotuloDocumentoOs(status).arquivoPrefixo;
  return `${prefixo}-${id}-${slug}`;
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

/** Largura/altura A4 em px (96dpi — mesma base do .os-orc-page). */
export const PDF_A4_WIDTH_PX = 794;
export const PDF_A4_HEIGHT_PX = 1123;

/** Altura A4 em px na largura 794px do orçamento. */
const PDF_PAGE_HEIGHT_PX = PDF_A4_HEIGHT_PX;

function prepararElementoPdf(el: HTMLElement): () => void {
  const prev = {
    width: el.style.width,
    maxWidth: el.style.maxWidth,
    margin: el.style.margin,
    boxSizing: el.style.boxSizing,
  };
  el.style.width = `${PDF_A4_WIDTH_PX}px`;
  el.style.maxWidth = `${PDF_A4_WIDTH_PX}px`;
  el.style.margin = "0";
  el.style.boxSizing = "border-box";
  return () => {
    el.style.width = prev.width;
    el.style.maxWidth = prev.maxWidth;
    el.style.margin = prev.margin;
    el.style.boxSizing = prev.boxSizing;
  };
}

/** Garante que Pix + rodapé nunca sejam cortados entre páginas. */
function prepararQuebrasPdf(root: HTMLElement): void {
  const pixPage = root.querySelector(".os-orc-pix-page") as HTMLElement | null;
  if (!pixPage) return;

  pixPage.classList.remove("os-orc-pix-page--new-page");

  const pixTop = pixPage.offsetTop - root.offsetTop;
  const pixHeight = pixPage.offsetHeight;
  const startPage = Math.floor(pixTop / PDF_PAGE_HEIGHT_PX);
  const endPage = Math.floor((pixTop + Math.max(pixHeight, 1) - 1) / PDF_PAGE_HEIGHT_PX);
  const espacoRestante = (startPage + 1) * PDF_PAGE_HEIGHT_PX - pixTop;

  if (startPage !== endPage || pixHeight > espacoRestante) {
    pixPage.classList.add("os-orc-pix-page--new-page");
  }
}

function prepararCompactoPdf(el: HTMLElement): () => void {
  el.classList.add("os-orc-compact");
  return () => el.classList.remove("os-orc-compact");
}

export async function gerarPngDoElemento(el: HTMLElement, filename: string): Promise<void> {
  await aguardarImagens(el);
  const restaurarCompacto = prepararCompactoPdf(el);
  const restaurar = prepararElementoPdf(el);

  try {
    const mod = await import("html2canvas");
    const html2canvas = mod.default;
    if (!html2canvas) throw new Error("Biblioteca de imagem indisponível.");

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      width: PDF_A4_WIDTH_PX,
      windowWidth: PDF_A4_WIDTH_PX,
      height: el.scrollHeight,
      windowHeight: el.scrollHeight,
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob || blob.size < 500) {
      throw new Error("Imagem gerada está vazia. Tente novamente.");
    }

    baixarBlob(blob, filename);
  } finally {
    restaurar();
    restaurarCompacto();
  }
}

/** PDF no tamanho do conteúdo, sem folha A4 sobrando. */
export async function gerarPdfNoConteudo(el: HTMLElement, filename: string): Promise<void> {
  await aguardarImagens(el);
  const widthPx = Math.ceil(Math.max(el.scrollWidth, el.offsetWidth, 1));
  const heightPx = Math.ceil(Math.max(el.scrollHeight, el.offsetHeight, 1));
  const pxToMm = 25.4 / 96;
  const widthMm = Math.round(widthPx * pxToMm * 10) / 10;
  const heightMm = Math.round(heightPx * pxToMm * 10) / 10;

  const canvasMod = await import("html2canvas");
  const html2canvas = canvasMod.default;
  if (!html2canvas) throw new Error("Biblioteca de imagem indisponível.");

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    width: widthPx,
    height: heightPx,
    windowWidth: widthPx,
    windowHeight: heightPx,
  });

  const { jsPDF } = await import("jspdf");
  const landscape = widthMm >= heightMm;
  const pdf = new jsPDF({
    unit: "mm",
    format: [widthMm, heightMm],
    orientation: landscape ? "landscape" : "portrait",
    compress: true,
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, pageH);

  const blob = pdf.output("blob");
  if (!blob || blob.size < 500) {
    throw new Error("PDF gerado está vazio. Tente novamente.");
  }
  baixarBlob(blob, filename);
}

export async function gerarPdfDoElemento(el: HTMLElement, filename: string): Promise<void> {
  await aguardarImagens(el);
  prepararQuebrasPdf(el);
  const restaurarCompacto = prepararCompactoPdf(el);
  const restaurar = prepararElementoPdf(el);

  try {
    const mod = await import("html2pdf.js");
    const html2pdf = mod.default;
    if (!html2pdf) throw new Error("Biblioteca de PDF indisponível.");

    const blob = (await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: 0,
          width: PDF_A4_WIDTH_PX,
          windowWidth: PDF_A4_WIDTH_PX,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
        pagebreak: {
          mode: ["avoid-all", "css", "legacy"],
          before: [".os-orc-pix-page--new-page", ".holerite-folha--page"],
          avoid: [
            ".os-orc-pix-page",
            ".os-orc-pix-box",
            ".os-orc-pix__grid",
            ".os-orc-pix__col--qr",
            ".os-orc-aprovacao",
            ".os-orc-footer",
            ".holerite-folha",
          ],
        },
      })
      .from(el)
      .toPdf()
      .output("blob")) as Blob;

    if (!blob || blob.size < 500) {
      throw new Error("PDF gerado está vazio. Tente novamente.");
    }

    baixarBlob(blob, filename);
  } finally {
    restaurar();
    restaurarCompacto();
  }
}

export const PDF_MSG_DONE = "os-pdf-done";
export const PDF_MSG_ERROR = "os-pdf-error";
export const PNG_MSG_DONE = "os-png-done";
export const PNG_MSG_ERROR = "os-png-error";

/**
 * Gera o PDF num iframe da rota /os (sem CSS do painel admin / tema escuro).
 */
export function baixarPdfOrcamento(id: number, nome?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Indisponível neste ambiente."));
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.title = "Gerando PDF do orçamento";
    iframe.style.cssText =
      "position:fixed;left:-12000px;top:0;width:794px;height:2400px;border:0;opacity:0;pointer-events:none;overflow:hidden";

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Tempo esgotado ao gerar o PDF."));
    }, 60000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; id?: number; message?: string };
      if (data?.id !== id) return;
      if (data.type === PDF_MSG_DONE) {
        cleanup();
        resolve();
      }
      if (data.type === PDF_MSG_ERROR) {
        cleanup();
        reject(new Error(data.message ?? "Erro ao gerar PDF."));
      }
    }

    window.addEventListener("message", onMessage);
    const nomeParam = nome ? `&nome=${encodeURIComponent(nome)}` : "";
    iframe.src = `/os?id=${id}&embed=1&download=1${nomeParam}`;
    document.body.appendChild(iframe);
  });
}

/**
 * Gera a imagem PNG num iframe da rota /os (sem CSS do painel admin / tema escuro).
 */
export function baixarPngOrcamento(id: number, nome?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Indisponível neste ambiente."));
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.title = "Gerando imagem do orçamento";
    iframe.style.cssText =
      "position:fixed;left:-12000px;top:0;width:794px;height:2400px;border:0;opacity:0;pointer-events:none;overflow:hidden";

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Tempo esgotado ao gerar a imagem."));
    }, 60000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; id?: number; message?: string };
      if (data?.id !== id) return;
      if (data.type === PNG_MSG_DONE) {
        cleanup();
        resolve();
      }
      if (data.type === PNG_MSG_ERROR) {
        cleanup();
        reject(new Error(data.message ?? "Erro ao gerar imagem."));
      }
    }

    window.addEventListener("message", onMessage);
    const nomeParam = nome ? `&nome=${encodeURIComponent(nome)}` : "";
    iframe.src = `/os?id=${id}&embed=1&downloadPng=1${nomeParam}`;
    document.body.appendChild(iframe);
  });
}
