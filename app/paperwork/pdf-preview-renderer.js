export async function renderPdfFirstPageImage(bytes) {
  if (typeof document === "undefined") {
    return { imageUrl: "", pageCount: 0, error: "PDF preview is only available in the browser." };
  }

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

    const data = new Uint8Array(bytes.byteLength);
    data.set(bytes);

    const loadingTask = pdfjs.getDocument({ data });
    const documentProxy = await loadingTask.promise;
    const page = await documentProxy.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const previewWidth = 1100;
    const scale = Math.max(1, Math.min(2.2, previewWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });
    const outputScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) throw new Error("PDF preview canvas is not available on this device.");

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    const pageCount = documentProxy.numPages || 1;
    await loadingTask.destroy();
    if (!blob) throw new Error("PDF preview image could not be created on this device.");

    return {
      imageUrl: URL.createObjectURL(blob),
      pageCount,
      error: "",
    };
  } catch (error) {
    console.error(error);
    return {
      imageUrl: "",
      pageCount: 0,
      error: error instanceof Error ? error.message : "PDF preview image could not be created.",
    };
  }
}
