import "./style.css";
import { extractText } from "./modules/ocr/ocr";
import {
  extractArticleCandidates,
  type ArticleCandidate,
} from "./modules/ocr/article-number";

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

  const heading = document.createElement("h3");
  heading.textContent = `Article candidates (${candidates.length})`;
  articleResults.append(heading);

  if (candidates.length === 0) {
    const message = document.createElement("p");
    message.textContent =
      "No article-number candidates found. Try cropping the article-number column.";
    articleResults.append(message);
    return;
  }

  const list = document.createElement("div");
  list.className = "article-candidate-list";

  candidates.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "article-candidate";

    const label = document.createElement("label");
    label.htmlFor = `article-candidate-${index}`;
    label.textContent = `Candidate ${index + 1}`;

    const input = document.createElement("input");
    input.id = `article-candidate-${index}`;
    input.type = "text";
    input.value = item.suggestedCorrection ?? item.candidate;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 13;

    const original = document.createElement("p");
    original.textContent = `OCR: ${item.raw}`;

    const status = document.createElement("p");

    function updateStatus(): void {
      const value = input.value.trim().toUpperCase();
      const valid = /^[A-Z]{2}\d{9}IN$/.test(value);

      status.textContent = valid
        ? "Format valid — verify against the printed sheet."
        : "Needs correction: expected 2 letters + 9 digits + IN.";

      status.dataset.valid = String(valid);
    }

    input.addEventListener("input", updateStatus);
    updateStatus();

    card.append(label, input, original, status);

    if (item.suggestedCorrection) {
      const suggestion = document.createElement("p");
      suggestion.textContent = `Suggested correction: ${item.suggestedCorrection}`;
      card.append(suggestion);
    }

    list.append(card);
  });

  articleResults.append(list);
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
