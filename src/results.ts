import "./results.css";
import { renderCode128 } from "./modules/barcode/barcode";
import type { ArticleCandidate } from "./modules/ocr/article-number";

const STORAGE_KEY = "manifest-article-candidates";
const ARTICLE_PATTERN = /^[A-Z]{2}\d{9}IN$/;

const barcodeList = document.querySelector<HTMLElement>("#barcode-list")!;
const status = document.querySelector<HTMLElement>("#results-status")!;
const addButton = document.querySelector<HTMLButtonElement>("#add-article")!;
const downloadButton =
  document.querySelector<HTMLButtonElement>("#download-image")!;

const candidates: ArticleCandidate[] = loadCandidates();

function loadCandidates(): ArticleCandidate[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is ArticleCandidate =>
        item !== null &&
        typeof item === "object" &&
        typeof item.candidate === "string",
    );
  } catch {
    return [];
  }
}

function saveCandidates(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
  } catch {
    status.textContent = "Unable to save changes in this browser session.";
  }
}

function validateCandidate(candidate: ArticleCandidate): void {
  candidate.candidate = candidate.candidate.trim().toUpperCase();
  candidate.validFormat = ARTICLE_PATTERN.test(candidate.candidate);
  candidate.needsReview = !candidate.validFormat;
}

function createCandidate(value = ""): ArticleCandidate {
  return {
    raw: value,
    candidate: value,
    suggestedCorrection: null,
    validFormat: ARTICLE_PATTERN.test(value),
    needsReview: !ARTICLE_PATTERN.test(value),
    corrections: [],
  };
}

function renderList(): void {
  barcodeList.replaceChildren();

  if (candidates.length === 0) {
    const message = document.createElement("p");
    message.textContent = "No article numbers yet. Add one to get started.";
    barcodeList.append(message);
  }

  candidates.forEach((candidate, index) => {
    const card = document.createElement("article");
    card.className = "article-candidate";

    const label = document.createElement("label");
    label.htmlFor = `article-number-${index}`;
    label.textContent = `Article ${index + 1}`;

    const input = document.createElement("input");
    input.id = `article-number-${index}`;
    input.type = "text";
    input.value = candidate.candidate;
    input.placeholder = "AB123456789IN";
    input.autocomplete = "off";
    input.autocapitalize = "characters";
    input.spellcheck = false;
    input.maxLength = 13;
    input.setAttribute("aria-describedby", `article-status-${index}`);

    const articleStatus = document.createElement("p");
    articleStatus.id = `article-status-${index}`;
    articleStatus.setAttribute(
      "data-valid",
      String(ARTICLE_PATTERN.test(input.value.trim().toUpperCase())),
    );

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("article-barcode");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Barcode for article ${index + 1}`);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-article-button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove article ${index + 1}`);

    function updateCard(): void {
      candidate.candidate = input.value.toUpperCase();
      candidate.suggestedCorrection = null;
      candidate.corrections = [];
      validateCandidate(candidate);

      const valid = candidate.validFormat;

      articleStatus.dataset.valid = String(valid);
      articleStatus.textContent = valid
        ? "Valid format"
        : "Check format: expected 2 letters, 9 digits, then IN.";

      svg.replaceChildren();

      if (valid) {
        const rendered = renderCode128(svg, candidate.candidate);

        if (!rendered) {
          articleStatus.dataset.valid = "false";
          articleStatus.textContent = "Could not generate this barcode.";
        }
      }

      saveCandidates();
      updateDownloadButton();
    }

    input.addEventListener("input", updateCard);

    removeButton.addEventListener("click", () => {
      candidates.splice(index, 1);
      saveCandidates();
      renderList();
    });

    card.append(label, input, articleStatus, svg, removeButton);
    barcodeList.append(card);

    updateCard();
  });

  updateDownloadButton();
}

function updateDownloadButton(): void {
  const allValid =
    candidates.length > 0 &&
    candidates.every((candidate) =>
      ARTICLE_PATTERN.test(candidate.candidate.trim().toUpperCase()),
    );

  downloadButton.disabled = !allValid;
}

async function downloadBarcodeSheet(): Promise<void> {
  const cards = Array.from(
    barcodeList.querySelectorAll<HTMLElement>(".article-candidate"),
  );

  if (cards.length === 0) {
    status.textContent = "Add at least one article number first.";
    return;
  }

  const entries: { value: string; svg: SVGSVGElement }[] = [];

  for (const card of cards) {
    const input = card.querySelector<HTMLInputElement>("input");
    const svg = card.querySelector<SVGSVGElement>("svg");

    const value = input?.value.trim().toUpperCase() ?? "";

    if (!ARTICLE_PATTERN.test(value) || !svg || !svg.hasChildNodes()) {
      status.textContent =
        "Correct all article numbers before downloading the sheet.";
      input?.focus();
      return;
    }

    entries.push({ value, svg });
  }

  status.textContent = "Preparing high-resolution PNG…";
  downloadButton.disabled = true;

  const scale = 3;
  const pageWidth = 600;
  const margin = 24;
  const rowHeight = 145;
  const pageHeight = 55 + entries.length * rowHeight;

  const canvas = document.createElement("canvas");
  canvas.width = pageWidth * scale;
  canvas.height = pageHeight * scale;

  const context = canvas.getContext("2d");

  if (!context) {
    status.textContent = "Unable to create the image on this device.";
    updateDownloadButton();
    return;
  }

  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pageWidth, pageHeight);

  context.fillStyle = "#111827";
  context.font = "bold 18px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText("India Post Barcode Sheet", margin, 32);

  try {
    for (let index = 0; index < entries.length; index++) {
      const { value, svg } = entries[index];
      const clone = svg.cloneNode(true) as SVGSVGElement;

      const viewBox = svg.viewBox.baseVal;
      const bounds = svg.getBoundingClientRect();

      const sourceWidth =
        viewBox.width ||
        Number.parseFloat(svg.getAttribute("width") ?? "") ||
        bounds.width;

      const sourceHeight =
        viewBox.height ||
        Number.parseFloat(svg.getAttribute("height") ?? "") ||
        bounds.height;

      if (!sourceWidth || !sourceHeight) {
        throw new Error(`Invalid barcode dimensions for ${value}`);
      }

      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(sourceWidth));
      clone.setAttribute("height", String(sourceHeight));

      const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml;charset=utf-8",
      });

      const svgUrl = URL.createObjectURL(svgBlob);

      try {
        const image = new Image();
        image.src = svgUrl;
        await image.decode();

        const maxWidth = pageWidth - margin * 2;
        const maxHeight = 90;
        const fit = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);

        const drawWidth = sourceWidth * fit;
        const drawHeight = sourceHeight * fit;
        const x = (pageWidth - drawWidth) / 2;
        const y = 43 + index * rowHeight;

        context.drawImage(image, x, y, drawWidth, drawHeight);

        // Draw the article number separately for a clear sheet label.
        context.fillStyle = "#111827";
        context.font = "bold 14px monospace";
        context.textAlign = "center";
        context.fillText(value, pageWidth / 2, y + drawHeight + 20);

        if (index < entries.length - 1) {
          context.strokeStyle = "#e5e7eb";
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(margin, 43 + (index + 1) * rowHeight - 8);
          context.lineTo(pageWidth - margin, 43 + (index + 1) * rowHeight - 8);
          context.stroke();
        }
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("PNG export failed."));
      }, "image/png");
    });

    const file = new File([blob], "barcode-sheet.png", {
      type: "image/png",
    });

    const isAppleMobile =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (
      isAppleMobile &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        files: [file],
        title: "India Post Barcode Sheet",
      });

      status.textContent = "Image shared. Choose Save Image or Save to Files.";
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      status.textContent = "Barcode sheet download started.";
    }
  } catch (error) {
    console.error("Barcode sheet export failed:", error);
    status.textContent = "Could not export the image. Please try again.";
  } finally {
    updateDownloadButton();
  }
}

addButton.addEventListener("click", () => {
  candidates.push(createCandidate());
  saveCandidates();
  renderList();

  const inputs = barcodeList.querySelectorAll<HTMLInputElement>("input");
  inputs[inputs.length - 1]?.focus();
});

downloadButton.addEventListener("click", () => {
  void downloadBarcodeSheet();
});

renderList();

if (candidates.length === 0) {
  status.textContent = "Add an article number or return to scan a manifest.";
} else {
  status.textContent = `${candidates.length} article number(s) loaded. Review before saving.`;
}
