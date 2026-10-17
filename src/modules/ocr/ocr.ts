import { createWorker, PSM } from "tesseract.js";

export interface OCRLine {
  text: string;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResult {
  text: string;
  confidence: number;
  lines: OCRLine[];
}

export async function extractText(file: File): Promise<OCRResult> {
  const bitmap = await createImageBitmap(file);

  try {
    const maxDimension = 2400;
    const scale = Math.min(
      2.5,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Unable to prepare image for OCR.");

    context.drawImage(bitmap, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const gray =
        0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];

      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.2 + 128));

      pixels[i] = contrast;
      pixels[i + 1] = contrast;
      pixels[i + 2] = contrast;
    }

    context.putImageData(imageData, 0, 0);

    const worker = await createWorker("eng", 1);

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });

      const result = await worker.recognize(canvas);
      const data = result.data;

      const lines: OCRLine[] = (data.blocks ?? [])
        .flatMap((block) =>
          block.paragraphs.flatMap((paragraph) => paragraph.lines),
        )
        .filter((line) => line.text.trim().length > 0)
        .map((line) => ({
          text: line.text.trim(),
          box: {
            x: Math.max(0, line.bbox.x0 / width),
            y: Math.max(0, line.bbox.y0 / height),
            width: Math.min(1, (line.bbox.x1 - line.bbox.x0) / width),
            height: Math.min(1, (line.bbox.y1 - line.bbox.y0) / height),
          },
        }));

      return {
        text: data.text,
        confidence: data.confidence,
        lines,
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    bitmap.close();
  }
}
