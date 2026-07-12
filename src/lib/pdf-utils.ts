import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function downloadAsPdf(elementId: string, filename: string, orientation: "portrait" | "landscape" = "portrait") {
  const element = document.getElementById(elementId);
  if (!element) return;

  // Temporariamente mostrar o elemento para captura (se estiver oculto)
  const originalDisplay = element.style.display;
  element.style.display = "block";

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
    });

    const imgWidth = orientation === "landscape" ? 297 : 210;
    const pageHeight = orientation === "landscape" ? 210 : 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${filename}.pdf`);
  } finally {
    // Restaurar o display original
    element.style.display = originalDisplay;
  }
}
