import "./results.css";
import { renderCode128 } from "./modules/barcode/barcode";
import {
  findCorrection,
  loadSourceImage,
  saveCorrection,
} from "./modules/storage/correction-store";
import type { ArticleCandidate } from "./modules/ocr/article-number";
import { cleanupExpiredTemporaryData } from "./modules/storage/cleanup";

await cleanupExpiredTemporaryData();
const STORAGE_KEY = "manifest-article-candidates";
const PATTERN = /^[A-Z]{2}\d{9}IN$/;

interface StoredCandidate extends ArticleCandidate {
  crop?: { x: number; y: number; width: number; height: number };
}

const list = document.querySelector<HTMLElement>("#barcode-list")!;
const status = document.querySelector<HTMLElement>("#results-status")!;
const addButton = document.querySelector<HTMLButtonElement>("#add-article")!;
const downloadButton =
  document.querySelector<HTMLButtonElement>("#download-image")!;

let candidates: StoredCandidate[] = [];

try {
  const parsed: unknown = JSON.parse(
    sessionStorage.getItem(STORAGE_KEY) ?? "[]",
  );
  if (Array.isArray(parsed)) {
    candidates = parsed.filter(
      (item): item is StoredCandidate =>
        item !== null &&
        typeof item === "object" &&
        typeof item.candidate === "string",
    );
  }
} catch {
  candidates = [];
}

function persist(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
  } catch {
    status.textContent = "Could not save this scan's current results.";
  }
}

async function makeCrop(
  image: HTMLImageElement,
  box: StoredCandidate["crop"],
): Promise<string | null> {
  if (!box) return null;

  const canvas = document.createElement("canvas");
  const sx = Math.max(0, Math.floor(box.x * image.naturalWidth));
  const sy = Math.max(0, Math.floor(box.y * image.naturalHeight));
  const sw = Math.min(
    image.naturalWidth - sx,
    Math.ceil(box.width * image.naturalWidth),
  );
  const sh = Math.min(
    image.naturalHeight - sy,
    Math.ceil(box.height * image.naturalHeight),
  );

  if (sw <= 0 || sh <= 0) return null;

  const paddingX = Math.round(sw * 0.08);
  const paddingY = Math.round(sh * 0.3);
  const x = Math.max(0, sx - paddingX);
  const y = Math.max(0, sy - paddingY);
  const width = Math.min(image.naturalWidth - x, sw + paddingX * 2);
  const height = Math.min(image.naturalHeight - y, sh + paddingY * 2);

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function renderList(): Promise<void> {
  list.replaceChildren();

  let sourceImage: HTMLImageElement | null = null;

  try {
    const blob = await loadSourceImage();
    if (blob) {
      sourceImage = new Image();
      sourceImage.src = URL.createObjectURL(blob);
      await sourceImage.decode();
    }
  } catch (error) {
    console.error("Unable to load source image:", error);
  }

  candidates.forEach((candidate, index) => {
    const card = document.createElement("article");
    card.className = "article-candidate";

    const label = document.createElement("label");
    label.htmlFor = `article-${index}`;
    label.textContent = `Number ${index + 1}`;

    const input = document.createElement("input");
    input.id = `article-${index}`;
    input.value = candidate.candidate;
    input.placeholder = "AB123456789IN";
    input.autocomplete = "off";
    input.autocapitalize = "characters";
    input.spellcheck = false;
    input.maxLength = 13;

    const crop = document.createElement("img");
    crop.className = "number-crop";
    crop.alt = `Original image crop for number ${index + 1}`;

    if (sourceImage && candidate.crop) {
      void makeCrop(sourceImage, candidate.crop).then((src) => {
        if (src) crop.src = src;
        else crop.hidden = true;
      });
    } else {
      crop.hidden = true;
    }

    const message = document.createElement("p");
    message.setAttribute("aria-live", "polite");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("article-barcode");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Barcode for number ${index + 1}`);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-article-button";
    remove.textContent = "Remove";

    const prior = findCorrection(candidate.raw || candidate.candidate);
    const usePrior = document.createElement("button");
    usePrior.type = "button";
    usePrior.textContent = prior
      ? `Use saved correction: ${prior.corrected}`
      : "";
    usePrior.hidden = !prior;

    function update(): void {
      const value = input.value.trim().toUpperCase();
      candidate.candidate = value;
      candidate.validFormat = PATTERN.test(value);
      candidate.needsReview = !candidate.validFormat;

      message.dataset.valid = String(candidate.validFormat);
      message.textContent = candidate.validFormat
        ? "Format valid — confirm against the image."
        : "Check number: expected 2 letters, 9 digits, then IN.";

      svg.replaceChildren();

      if (candidate.validFormat) {
        renderCode128(svg, value);
      }

      persist();
      updateDownloadButton();
    }

    input.addEventListener("input", () => {
      confirm.disabled = false;
      confirm.textContent = "Confirm correction";
      confirm.setAttribute("aria-label", `Confirm number ${index + 1}`);

      update();
    });

    usePrior.addEventListener("click", () => {
      if (!prior) return;
      input.value = prior.corrected;
      update();
      status.textContent =
        "Saved correction applied. Verify it against the crop.";
    });

    const confirm = document.createElement("button");
    confirm.type = "button";

    const previouslyConfirmed = findCorrection(
      candidate.raw || candidate.candidate,
    );
    const alreadyConfirmed =
      !!previouslyConfirmed &&
      previouslyConfirmed.corrected ===
        candidate.candidate.trim().toUpperCase();

    confirm.textContent = alreadyConfirmed
      ? "Confirmed ✓"
      : "Confirm correction";
    confirm.disabled = alreadyConfirmed;
    confirm.setAttribute(
      "aria-label",
      alreadyConfirmed
        ? `Number ${index + 1} confirmed`
        : `Confirm number ${index + 1}`,
    );

    confirm.addEventListener("click", () => {
      const value = input.value.trim().toUpperCase();

      if (!PATTERN.test(value)) {
        status.textContent = "Enter a valid article number before confirming.";
        input.focus();
        return;
      }

      try {
        saveCorrection(candidate.raw || candidate.candidate, value);

        candidate.candidate = value;
        candidate.validFormat = true;
        candidate.needsReview = false;
        persist();

        confirm.textContent = "Confirmed ✓";
        confirm.disabled = true;
        confirm.setAttribute("aria-label", `Number ${index + 1} confirmed`);

        status.textContent = `Number ${index + 1} confirmed and saved on this device.`;
        update();
      } catch (error) {
        console.error("Correction save failed:", error);
        status.textContent =
          "Could not save correction. Check browser storage.";
      }
    });

    remove.addEventListener("click", () => {
      candidates.splice(index, 1);
      persist();
      void renderList();
    });

    card.append(label, crop, input, message, usePrior, confirm, svg, remove);
    list.append(card);
    update();
  });

  if (sourceImage?.src.startsWith("blob:")) {
    URL.revokeObjectURL(sourceImage.src);
  }

  updateDownloadButton();
}

function updateDownloadButton(): void {
  downloadButton.disabled =
    candidates.length === 0 ||
    !candidates.every((candidate) =>
      PATTERN.test(candidate.candidate.trim().toUpperCase()),
    );
}

async function downloadBarcodeSheet(): Promise<void> {
  const cards = Array.from(
    list.querySelectorAll<HTMLElement>(".article-candidate"),
  );
  if (!cards.length) return;

  const entries: { value: string; svg: SVGSVGElement }[] = [];

  for (const card of cards) {
    const input = card.querySelector<HTMLInputElement>("input");
    const svg = card.querySelector<SVGSVGElement>("svg");
    const value = input?.value.trim().toUpperCase() ?? "";

    if (!PATTERN.test(value) || !svg?.hasChildNodes()) {
      status.textContent = "Correct all numbers before downloading.";
      input?.focus();
      return;
    }

    entries.push({ value, svg });
  }

  status.textContent = "Preparing high-resolution PNG…";
  downloadButton.disabled = true;

  const scale = 3;
  const width = 600;
  const margin = 24;
  const rowHeight = 145;
  const height = 55 + entries.length * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext("2d");

  if (!context) {
    status.textContent = "Unable to create image on this device.";
    updateDownloadButton();
    return;
  }

  context.scale(scale, scale);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111827";
  context.font = "bold 18px system-ui";
  context.textAlign = "left";
  context.fillText("Image to Barcode Scanner", margin, 32);

  try {
    for (let i = 0; i < entries.length; i++) {
      const { value, svg } = entries[i];
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const vb = svg.viewBox.baseVal;
      const bounds = svg.getBoundingClientRect();
      const sw =
        vb.width ||
        Number.parseFloat(svg.getAttribute("width") ?? "") ||
        bounds.width;
      const sh =
        vb.height ||
        Number.parseFloat(svg.getAttribute("height") ?? "") ||
        bounds.height;

      if (!sw || !sh) throw new Error("Invalid barcode dimensions.");

      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(sw));
      clone.setAttribute("height", String(sh));

      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(clone)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );

      try {
        const image = new Image();
        image.src = url;
        await image.decode();

        const fit = Math.min((width - margin * 2) / sw, 90 / sh);
        const drawWidth = sw * fit;
        const drawHeight = sh * fit;
        const x = (width - drawWidth) / 2;
        const y = 43 + i * rowHeight;

        context.drawImage(image, x, y, drawWidth, drawHeight);
        context.fillStyle = "#111827";
        context.font = "bold 14px monospace";
        context.textAlign = "center";
        context.fillText(value, width / 2, y + drawHeight + 20);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("PNG export failed.")),
        "image/png",
      );
    });

    const file = new File([blob], "barcode-sheet.png", { type: "image/png" });
    const appleMobile =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (
      appleMobile &&
      navigator.share &&
      navigator.canShare?.({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: "Barcode sheet" });
      status.textContent = "Choose Save Image or Save to Files.";
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      status.textContent = "Download started.";
    }
  } catch (error) {
    console.error("PNG export failed:", error);
    status.textContent = "Could not export the image. Try again.";
  } finally {
    updateDownloadButton();
  }
}

addButton.addEventListener("click", () => {
  candidates.push({
    raw: "",
    candidate: "",
    suggestedCorrection: null,
    validFormat: false,
    needsReview: true,
    corrections: [],
  });
  persist();
  void renderList();
});

downloadButton.addEventListener("click", () => void downloadBarcodeSheet());

void renderList();
