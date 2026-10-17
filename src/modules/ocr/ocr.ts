import { createWorker, PSM } from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number;
}

export type OcrProgressCallback = (progress: number, status: string) => void;

async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);

  try {
    const targetWidth = 2400;
    const maxUpscale = 2.5;

    const scale = Math.min(maxUpscale, Math.max(1, targetWidth / bitmap.width));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error("Could not initialize image preprocessing.");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const gray =
        0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;

      const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.2 + 128));

      pixels[i] = enhanced;
      pixels[i + 1] = enhanced;
      pixels[i + 2] = enhanced;
    }

    context.putImageData(imageData, 0, 0);

    return canvas;
  } finally {
    bitmap.close();
  }
}

export async function extractText(
  image: File,
  onProgress?: OcrProgressCallback,
): Promise<OcrResult> {
  const canvas = await preprocessImage(image);

  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      onProgress?.(Math.round(message.progress * 100), message.status);
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });

    const result = await worker.recognize(canvas);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
    };
  } finally {
    await worker.terminate();
  }
}
