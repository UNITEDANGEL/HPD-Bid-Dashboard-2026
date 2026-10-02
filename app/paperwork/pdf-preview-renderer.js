export async function renderPdfFirstPageImage(bytes) {
  if (typeof document === "undefined") {
    return { imageUrl: "", imageUrls: [], pageCount: 0, error: "PDF preview is only available in the browser." };
  }

  const previewErrorMessage = (error) => {
    if (!error) return "PDF preview image could not be created.";
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      const name = typeof error.name === "string" ? error.name : "";
      const message = typeof error.message === "string" ? error.message : "";
      const details = typeof error.details === "string" ? error.details : "";
      const reason = [name, message, details].filter(Boolean).join(": ");
      if (reason) return reason;
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }
    return String(error);
  };

  try {
    // Legacy build: the modern pdfjs 6 build calls very new JS APIs (Map#getOrInsertComputed,
    // Promise.try, ...) that iPhone Safari and current Chrome lack, so previews failed there.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

    const data = new Uint8Array(bytes.byteLength);
    data.set(bytes);

    const loadingTask = pdfjs.getDocument({ data, stopAtErrors: false });
    const documentProxy = await loadingTask.promise;
    const pageCount = documentProxy.numPages || 1;
    const imageUrls = [];
    // Every page (affidavit pages + invoice) so the whole package can be reviewed before approval.
    for (let pageNumber = 1; pageNumber <= Math.min(pageCount, 8); pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const previewWidth = 1100;
      const scale = Math.max(1, Math.min(2.2, previewWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) throw new Error("PDF preview canvas is not available on this device.");

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: pdfjs.AnnotationMode?.DISABLE ?? 0,
      }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("PDF preview image could not be created on this device.");
      imageUrls.push(URL.createObjectURL(blob));
    }
    await loadingTask.destroy();

    return {
      imageUrl: imageUrls[0] || "",
      imageUrls,
      pageCount,
      error: "",
    };
  } catch (error) {
    console.error(error);
    return {
      imageUrl: "",
      imageUrls: [],
      pageCount: 0,
      error: previewErrorMessage(error),
    };
  }
}
