function slugNome(nome: string): string {
  return (
    (nome || "funcionario")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "funcionario"
  );
}

export function nomeArquivoHolerite(nome: string, mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes.trim());
  const ref = m ? `${m[2]}-${m[1]}` : mes.replace(/[^\d-]/g, "");
  return `Holerite-${slugNome(nome)}-${ref}.pdf`;
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

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function abrirIframeClaro(): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Gerando holerite";
  iframe.style.cssText =
    "position:fixed;left:-12000px;top:0;width:1123px;height:900px;border:0;opacity:0;pointer-events:none;background:#fff";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Não foi possível montar o holerite.");
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <link rel="stylesheet" href="/css/holerite.css" />
</head>
<body class="holerite-embed"></body>
</html>`);
  doc.close();

  const link = doc.querySelector("link");
  if (link && !link.sheet) {
    await new Promise<void>((resolve) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(() => resolve(), 1500);
    });
  } else {
    await esperar(50);
  }

  return iframe;
}

async function pdfDaFolha(folha: HTMLElement, filename: string): Promise<void> {
  const canvasMod = await import("html2canvas");
  const html2canvas = canvasMod.default;
  if (!html2canvas) throw new Error("Biblioteca de imagem indisponível.");
  const { jsPDF } = await import("jspdf");

  const widthPx = 1123;
  const heightPx = Math.ceil(Math.max(folha.scrollHeight, folha.offsetHeight, 1));
  const canvas = await html2canvas(folha, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    width: widthPx,
    windowWidth: widthPx,
    height: heightPx,
    windowHeight: heightPx,
    onclone: (doc) => {
      doc.documentElement.style.colorScheme = "light";
      doc.body.style.background = "#fff";
      doc.body.style.color = "#173528";
    },
  });

  const pxToMm = 25.4 / 96;
  const widthMm = Math.round(widthPx * pxToMm * 10) / 10;
  const heightMm = Math.round(heightPx * pxToMm * 10) / 10;
  const pdf = new jsPDF({
    unit: "mm",
    format: [widthMm, heightMm],
    orientation: widthMm >= heightMm ? "landscape" : "portrait",
    compress: true,
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, pageW, pageH);

  const blob = pdf.output("blob");
  if (!blob || blob.size < 500) throw new Error("PDF gerado está vazio. Tente novamente.");
  baixarBlob(blob, filename);
}

export async function gerarPdfsHolerite(
  folhas: { el: HTMLElement; nome: string; mes: string }[],
): Promise<number> {
  if (folhas.length === 0) return 0;
  const iframe = await abrirIframeClaro();
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Não foi possível montar o holerite.");
  }

  try {
    let gerados = 0;
    for (const item of folhas) {
      const clone = item.el.cloneNode(true) as HTMLElement;
      clone.classList.remove("holerite-folha--page");
      clone.style.margin = "0";
      doc.body.replaceChildren(clone);
      await aguardarImagens(clone);
      await esperar(40);
      await pdfDaFolha(clone, nomeArquivoHolerite(item.nome, item.mes));
      gerados += 1;
      if (gerados < folhas.length) await esperar(400);
    }
    return gerados;
  } finally {
    iframe.remove();
  }
}
