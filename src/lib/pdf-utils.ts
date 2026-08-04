import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type PdfOrientation = "portrait" | "landscape";

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();

  return sanitized || `relatorio-${Date.now()}`;
}

function getSafeBreakPoints(element: HTMLElement, canvasHeight: number) {
  const elementRect = element.getBoundingClientRect();
  const renderedHeight = Math.max(element.scrollHeight, elementRect.height);
  const scaleY = canvasHeight / renderedHeight;

  return Array.from(element.querySelectorAll("tr, thead, header, section, footer"))
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return Math.round((rect.bottom - elementRect.top) * scaleY);
    })
    .filter((point) => point > 0 && point < canvasHeight)
    .sort((a, b) => a - b);
}

function addPageNumbers(pdf: jsPDF) {
  const pageCount = pdf.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(90, 90, 90);

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.text(`Página ${page} de ${pageCount}`, pageWidth - 7, pageHeight - 4, { align: "right" });
  }
}

function applyPdfSafeColors(clonedDocument: Document, elementId: string) {
  const safeElementId = elementId.replace(/[^a-zA-Z0-9-_]/g, "");
  const root = clonedDocument.documentElement;
  const body = clonedDocument.body;

  root.style.setProperty("background-color", "#ffffff", "important");
  root.style.setProperty("color", "#000000", "important");
  body.style.setProperty("background-color", "#ffffff", "important");
  body.style.setProperty("color", "#000000", "important");

  const safeVariables: Record<string, string> = {
    "--background": "#ffffff",
    "--foreground": "#000000",
    "--card": "#ffffff",
    "--card-foreground": "#000000",
    "--muted": "#f2f2f2",
    "--muted-foreground": "#666666",
    "--border": "#000000",
    "--input": "#000000",
    "--ring": "#000000",
    "--color-background": "#ffffff",
    "--color-foreground": "#000000",
    "--color-border": "#000000",
  };

  for (const [property, value] of Object.entries(safeVariables)) {
    root.style.setProperty(property, value, "important");
    body.style.setProperty(property, value, "important");
  }

  const style = clonedDocument.createElement("style");
  style.textContent = `
    #${safeElementId}, #${safeElementId} * {
      box-sizing: border-box !important;
      color: #000000 !important;
      border-color: #000000 !important;
      outline-color: #000000 !important;
      text-decoration-color: #000000 !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }
    #${safeElementId} {
      background-color: #ffffff !important;
    }
    #${safeElementId} table {
      border-collapse: collapse !important;
      border-spacing: 0 !important;
      max-width: 100% !important;
    }
    #${safeElementId} th,
    #${safeElementId} td {
      min-width: 0 !important;
      max-width: 100% !important;
      overflow: hidden !important;
      overflow-wrap: anywhere !important;
      vertical-align: middle !important;
    }
    #${safeElementId} .font-mono {
      font-family: Arial, Helvetica, sans-serif !important;
      font-variant-numeric: tabular-nums !important;
      letter-spacing: -0.01em !important;
    }
    #${safeElementId} .text-right,
    #${safeElementId} .text-center {
      font-variant-numeric: tabular-nums !important;
    }
    #${safeElementId} [class~="bg-white"] {
      background-color: #ffffff !important;
    }
    #${safeElementId} [class~="bg-black"] {
      background-color: #000000 !important;
      color: #ffffff !important;
    }
    #${safeElementId} [class~="bg-black"] * {
      color: #ffffff !important;
    }
    #${safeElementId} [class~="bg-black/10"] {
      background-color: #e6e6e6 !important;
    }
    #${safeElementId} [class~="bg-black/5"] {
      background-color: #f2f2f2 !important;
    }
    #${safeElementId} [class~="text-white"] {
      color: #ffffff !important;
    }
    #${safeElementId} [class~="text-black/60"] {
      color: #666666 !important;
    }
    #${safeElementId} [class~="text-black/70"] {
      color: #4d4d4d !important;
    }
    #${safeElementId} [class~="text-blue-700"] {
      color: #1d4ed8 !important;
    }
    #${safeElementId} [class~="text-red-600"] {
      color: #dc2626 !important;
    }
  `;
  clonedDocument.head.appendChild(style);
}

export async function downloadAsPdf(
  elementId: string,
  filename: string,
  orientation: PdfOrientation = "portrait",
) {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Não foi possível encontrar o conteúdo do relatório.");

  if (document.fonts?.ready) await document.fonts.ready;

  const originalDisplay = element.style.display;
  const originalPosition = element.style.position;
  const originalLeft = element.style.left;
  const hidden = window.getComputedStyle(element).display === "none";

  if (hidden) {
    element.style.display = "block";
    element.style.position = "absolute";
    element.style.left = "-100000px";
  }

  try {
    const explicitPages = Array.from(
      element.querySelectorAll<HTMLElement>("[data-pdf-page]"),
    );

    if (explicitPages.length > 0) {
      const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 4;
      const marginTop = 4;
      const marginBottom = 9;
      const contentWidth = pageWidth - marginX * 2;
      const contentHeight = pageHeight - marginTop - marginBottom;

      for (let pageIndex = 0; pageIndex < explicitPages.length; pageIndex += 1) {
        const pageElement = explicitPages[pageIndex];
        const pageRect = pageElement.getBoundingClientRect();
        const captureWidth = Math.ceil(Math.max(pageElement.scrollWidth, pageRect.width));
        const captureHeight = Math.ceil(Math.max(pageElement.scrollHeight, pageRect.height));

        const pageCanvas = await html2canvas(pageElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          width: captureWidth,
          height: captureHeight,
          windowWidth: captureWidth,
          windowHeight: captureHeight,
          onclone: (clonedDocument) => {
            applyPdfSafeColors(clonedDocument, elementId);
            const clonedElement = clonedDocument.getElementById(elementId);
            if (!clonedElement) return;

            clonedElement.style.boxShadow = "none";
            clonedElement
              .querySelectorAll<HTMLElement>(".overflow-x-auto, .overflow-auto")
              .forEach((node) => {
                node.style.overflow = "visible";
              });
          },
        });

        if (!pageCanvas.width || !pageCanvas.height) {
          throw new Error("Uma das páginas do relatório está vazia.");
        }

        const scale = Math.min(
          contentWidth / pageCanvas.width,
          contentHeight / pageCanvas.height,
        );
        const renderedWidth = pageCanvas.width * scale;
        const renderedHeight = pageCanvas.height * scale;
        const x = (pageWidth - renderedWidth) / 2;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(
          pageCanvas.toDataURL("image/png"),
          "PNG",
          x,
          marginTop,
          renderedWidth,
          renderedHeight,
          undefined,
          "FAST",
        );
      }

      addPageNumbers(pdf);
      pdf.save(`${sanitizeFilename(filename)}.pdf`);
      return;
    }

    const rect = element.getBoundingClientRect();
    const captureWidth = Math.ceil(Math.max(element.scrollWidth, rect.width));
    const captureHeight = Math.ceil(Math.max(element.scrollHeight, rect.height));

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      onclone: (clonedDocument) => {
        applyPdfSafeColors(clonedDocument, elementId);
        const clonedElement = clonedDocument.getElementById(elementId);
        if (!clonedElement) return;

        clonedElement.style.boxShadow = "none";
        clonedElement
          .querySelectorAll<HTMLElement>(".overflow-x-auto, .overflow-auto")
          .forEach((node) => {
            node.style.overflow = "visible";
          });
      },
    });

    if (!canvas.width || !canvas.height) throw new Error("O relatório está vazio.");

    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 7;
    const marginTop = 7;
    const marginBottom = 11;
    const contentWidth = pageWidth - marginX * 2;
    const contentHeight = pageHeight - marginTop - marginBottom;
    const heightAtFullWidth = (canvas.height * contentWidth) / canvas.width;

    // Relatórios que já têm proporção de uma folha A4 devem permanecer em uma única página.
    if (heightAtFullWidth <= contentHeight * 1.06) {
      const scale = Math.min(contentWidth / canvas.width, contentHeight / canvas.height);
      const renderedWidth = canvas.width * scale;
      const renderedHeight = canvas.height * scale;
      const x = (pageWidth - renderedWidth) / 2;

      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        x,
        marginTop,
        renderedWidth,
        renderedHeight,
        undefined,
        "FAST",
      );
    } else {
      const millimetersPerPixel = contentWidth / canvas.width;
      const maximumSliceHeight = Math.floor(contentHeight / millimetersPerPixel);
      const safeBreakPoints = getSafeBreakPoints(element, canvas.height);
      let sliceStart = 0;
      let pageIndex = 0;

      while (sliceStart < canvas.height) {
        const proposedEnd = Math.min(sliceStart + maximumSliceHeight, canvas.height);
        let sliceEnd = proposedEnd;

        if (proposedEnd < canvas.height) {
          const minimumUsefulEnd = sliceStart + maximumSliceHeight * 0.55;
          const safeEnd = safeBreakPoints
            .filter((point) => point >= minimumUsefulEnd && point <= proposedEnd)
            .at(-1);

          if (safeEnd && safeEnd > sliceStart) sliceEnd = safeEnd;
        }

        if (sliceEnd <= sliceStart) sliceEnd = proposedEnd;

        const sliceHeight = sliceEnd - sliceStart;
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar uma página do PDF.");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(
          canvas,
          0,
          sliceStart,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(
          pageCanvas.toDataURL("image/png"),
          "PNG",
          marginX,
          marginTop,
          contentWidth,
          sliceHeight * millimetersPerPixel,
          undefined,
          "FAST",
        );

        sliceStart = sliceEnd;
        pageIndex += 1;
      }
    }

    addPageNumbers(pdf);
    pdf.save(`${sanitizeFilename(filename)}.pdf`);
  } finally {
    element.style.display = originalDisplay;
    element.style.position = originalPosition;
    element.style.left = originalLeft;
  }
}
