export const RECIBO_PDF_DONE = "recibo-pdf-done";
export const RECIBO_PDF_ERROR = "recibo-pdf-error";

export function nomeArquivoReciboPdf(inventarioId: number, nome: string, tipo: string): string {
  const slug =
    (nome || "cliente")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "cliente";
  const tipoSlug = tipo === "sinal" ? "entrada" : tipo || "pagamento";
  return `Recibo-${tipoSlug}-${inventarioId}-${slug}.pdf`;
}

/** Abre o recibo na tela. O download fica no botão da própria página. */
export function abrirRecibo(inventarioId: number, recebimentoId: number): void {
  const url = `/recibo?inventario=${inventarioId}&pagamento=${recebimentoId}`;
  const opened = window.open(url, "_blank");
  if (!opened) {
    throw new Error("O navegador bloqueou a abertura do recibo. Permita janelas deste site.");
  }
  opened.opener = null;
}

/** Gera o PDF num iframe claro, fora do tema escuro do painel. */
export function baixarPdfRecibo(inventarioId: number, recebimentoId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Indisponível neste ambiente."));
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.title = "Gerando recibo em PDF";
    iframe.style.cssText =
      "position:fixed;left:-12000px;top:0;width:800px;height:1400px;border:0;opacity:0;pointer-events:none;overflow:hidden";

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Tempo esgotado ao gerar o recibo."));
    }, 60000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; id?: number; message?: string };
      if (data?.id !== recebimentoId) return;
      if (data.type === RECIBO_PDF_DONE) {
        cleanup();
        resolve();
      }
      if (data.type === RECIBO_PDF_ERROR) {
        cleanup();
        reject(new Error(data.message ?? "Erro ao gerar o recibo."));
      }
    }

    window.addEventListener("message", onMessage);
    iframe.src = `/recibo?inventario=${inventarioId}&pagamento=${recebimentoId}&download=true`;
    document.body.appendChild(iframe);
  });
}

