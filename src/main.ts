import "./style.css";
import { extractText } from "./modules/ocr/ocr";
import {
  extractArticleCandidates,
  type ArticleCandidate,
} from "./modules/ocr/article-number";
import { renderCode128 } from "./modules/barcode/barcode";

const fileInput = document.querySelector<HTMLInputElement>("#manifest-file")!;

const fileStatus =
  document.querySelector<HTMLParagraphElement>("#file-status")!;

const previewContainer =
  document.querySelector<HTMLDivElement>("#preview-container")!;

const previewImage =
  document.querySelector<HTMLImageElement>("#manifest-preview")!;

const clearButton = document.querySelector<HTMLButtonElement>("#clear-button")!;

const viewLargeButton =
  document.querySelector<HTMLButtonElement>("#view-large-button")!;

const imageViewer = document.querySelector<HTMLDialogElement>("#image-viewer")!;

const closeViewerButton = document.querySelector<HTMLButtonElement>(
  "#close-viewer-button",
)!;

const largePreviewImage = document.querySelector<HTMLImageElement>(
  "#large-manifest-preview",
)!;

const extractTextButton = document.querySelector<HTMLButtonElement>(
  "#extract-text-button",
)!;

const ocrStatus = document.querySelector<HTMLParagraphElement>("#ocr-status")!;

const ocrOutput = document.querySelector<HTMLTextAreaElement>("#ocr-output")!;

const ocrConfidence =
  document.querySelector<HTMLParagraphElement>("#ocr-confidence")!;

const articleResults =
  document.querySelector<HTMLDivElement>("#article-results");

const MAX_FILE_SIZE = 15 * 1024 * 1024;

let currentObjectUrl: string | null = null;
let extractionInProgress = false;
let extractionId = 0;

function closeViewer(): void {
  if (imageViewer.open) {
    imageViewer.close();
  }

  largePreviewImage.removeAttribute("src");
}

function clearArticleResults(): void {
  if (articleResults) {
    articleResults.replaceChildren();
  }
}

function clearOcrResults(): void {
  ocrOutput.value = "";
  ocrConfidence.textContent = "";
  ocrStatus.textContent = "Upload an image to begin.";
  clearArticleResults();
}

function clearImage(): void {
  extractionId++;
  extractionInProgress = false;
  extractTextButton.disabled = true;

  closeViewer();

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  fileInput.value = "";
  previewImage.removeAttribute("src");
  previewContainer.hidden = true;
  clearButton.disabled = true;

  fileStatus.textContent = "No image selected.";

  clearOcrResults();
}

function renderArticleResults(candidates: ArticleCandidate[]): void {
  if (!articleResults) return;

  articleResults.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Article numbers and barcodes";
  articleResults.append(heading);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add article number";

  const list = document.createElement("div");
  list.className = "article-candidate-list";

  function renderList(): void {
    list.replaceChildren();

    if (candidates.length === 0) {
      const empty = document.createElement("p");
      empty.textContent =
        "No article numbers yet. Add one manually or run OCR.";
      list.append(empty);
    }

    candidates.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "article-candidate";

      const label = document.createElement("label");
      label.htmlFor = `article-number-${index}`;
      label.textContent = `Article number ${index + 1}`;

      const input = document.createElement("input");
      input.id = `article-number-${index}`;
      input.type = "text";
      input.value = item.suggestedCorrection ?? item.candidate;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.maxLength = 13;
      input.placeholder = "AA123456789IN";

      const status = document.createElement("p");

      const barcode = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );

      barcode.classList.add("article-barcode");

      const barcodeStatus = document.createElement("p");
      barcodeStatus.className = "barcode-status";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.className = "remove-article-button";

      function updateArticle(): void {
        const value = input.value.trim().toUpperCase();
        const valid = /^[A-Z]{2}\d{9}IN$/.test(value);

        status.textContent = valid
          ? "Format valid — verify against the manifest."
          : "Invalid format: expected 2 letters, 9 digits, and IN.";

        status.dataset.valid = String(valid);

        const generated = renderCode128(barcode, value);

        barcode.style.display = generated ? "block" : "none";

        barcodeStatus.textContent = generated
          ? "Code 128 barcode generated."
          : "Enter a valid article number to generate its barcode.";
      }

      input.addEventListener("input", updateArticle);

      removeButton.addEventListener("click", () => {
        candidates.splice(index, 1);
        renderList();
      });

      card.append(label, input, status, barcodeStatus, barcode, removeButton);

      list.append(card);
      updateArticle();
    });
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

    renderList();

    const inputs = list.querySelectorAll<HTMLInputElement>(
      'input[id^="article-number-"]',
    );

    inputs[inputs.length - 1]?.focus();
  });

  articleResults.append(addButton, list);
  renderList();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    clearImage();
    fileStatus.textContent = "Please select a valid image.";
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    clearImage();
    fileStatus.textContent = "Image must be smaller than 15 MB.";
    return;
  }

  extractionId++;
  extractionInProgress = false;
  extractTextButton.disabled = false;

  closeViewer();

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(file);

  previewImage.src = currentObjectUrl;
  previewContainer.hidden = false;
  clearButton.disabled = false;

  fileStatus.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

  clearOcrResults();
});

viewLargeButton.addEventListener("click", () => {
  if (!currentObjectUrl || imageViewer.open) return;

  largePreviewImage.src = currentObjectUrl;
  imageViewer.showModal();
});

closeViewerButton.addEventListener("click", closeViewer);

imageViewer.addEventListener("click", (event) => {
  if (event.target === imageViewer) {
    closeViewer();
  }
});

imageViewer.addEventListener("close", () => {
  largePreviewImage.removeAttribute("src");
});

clearButton.addEventListener("click", clearImage);

extractTextButton.addEventListener("click", async () => {
  const file = fileInput.files?.[0];

  if (!file || extractionInProgress) return;

  extractionInProgress = true;
  extractTextButton.disabled = true;

  const currentId = ++extractionId;

  ocrOutput.value = "";
  ocrConfidence.textContent = "";
  clearArticleResults();

  ocrStatus.textContent = "Initializing OCR...";

  try {
    const result = await extractText(file, (progress, status) => {
      if (currentId !== extractionId) return;

      ocrStatus.textContent = `${status}: ${progress}%`;
    });

    if (currentId !== extractionId) return;

    ocrOutput.value = result.text;

    ocrConfidence.textContent = `OCR confidence: ${result.confidence.toFixed(1)}%`;

    ocrStatus.textContent = result.text.trim()
      ? "Extraction complete. Review the text and candidates below."
      : "No text detected. Try a clearer image.";

    const candidates = extractArticleCandidates(result.text);
    renderArticleResults(candidates);
  } catch (error) {
    if (currentId !== extractionId) return;

    console.error("OCR failed:", error);

    ocrStatus.textContent = "OCR failed. Check your connection and try again.";
  } finally {
    if (currentId === extractionId) {
      extractionInProgress = false;
      extractTextButton.disabled = !currentObjectUrl;
    }
  }
});

// Re-extract candidates when the user manually corrects OCR text.
ocrOutput.addEventListener("change", () => {
  const candidates = extractArticleCandidates(ocrOutput.value);
  renderArticleResults(candidates);
});
