import { entregaNumeroNota } from "@/lib/fornecedores-display";
export function nomeArquivoNotaPdf(entregaId: number): string {
  return `${entregaNumeroNota(entregaId).replace(/\s+/g, "-")}.pdf`;
}

export function nomeArquivoNotaPng(entregaId: number): string {
  return `${entregaNumeroNota(entregaId).replace(/\s+/g, "-")}.png`;
}

export function abrirNotaEntrega(
  entregaId: number,
  opts?: { print?: boolean; controle?: number },
): void {
  const params = new URLSearchParams({ nota: String(entregaId) });
  if (opts?.print) params.set("print", "1");
  if (opts?.controle && opts.controle > 0) params.set("controle", String(opts.controle));
  window.open(`/nota-entrega?${params}`, "_blank", "noopener,noreferrer");
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

export async function baixarImagemNotaEntrega(el: HTMLElement, entregaId: number): Promise<void> {
  await aguardarImagens(el);

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
    width: el.scrollWidth,
    height: el.scrollHeight,
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob || blob.size < 500) {
    throw new Error("Imagem gerada está vazia. Tente novamente.");
  }

  baixarBlob(blob, nomeArquivoNotaPng(entregaId));
}
