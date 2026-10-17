import "./style.css";
import { extractText } from "./modules/ocr/ocr";
import { extractArticleCandidates } from "./modules/ocr/article-number";

const fileInput = document.querySelector<HTMLInputElement>("#manifest-file")!;
const fileStatus = document.querySelector<HTMLElement>("#file-status")!;
const previewContainer =
  document.querySelector<HTMLElement>("#preview-container")!;
const previewImage =
  document.querySelector<HTMLImageElement>("#manifest-preview")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear-button")!;
const extractTextButton = document.querySelector<HTMLButtonElement>(
  "#extract-text-button",
)!;
const ocrStatus = document.querySelector<HTMLElement>("#ocr-status")!;
const ocrOutput = document.querySelector<HTMLTextAreaElement>("#ocr-output")!;
const ocrConfidence = document.querySelector<HTMLElement>("#ocr-confidence")!;
const articleResults = document.querySelector<HTMLElement>("#article-results")!;

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const STORAGE_KEY = "manifest-article-candidates";

let previewUrl: string | null = null;
let extractionId = 0;
let extractionInProgress = false;

interface ArticleCandidate {
  raw: string;
  candidate: string;
  suggestedCorrection: string | null;
  validFormat: boolean;
  needsReview: boolean;
  corrections: string[];
}

function setArticleResults(candidates: ArticleCandidate[]): void {
  articleResults.replaceChildren();

  const heading = document.createElement("h2");
  heading.id = "article-results-heading";
  heading.textContent = "Article numbers";
  articleResults.append(heading);

  if (candidates.length === 0) {
    const message = document.createElement("p");
    message.textContent =
      "No article-number candidates found. Review the recognized text or try a clearer image.";
    articleResults.append(message);
    return;
  }

  const summary = document.createElement("p");
  summary.textContent = `${candidates.length} candidate${
    candidates.length === 1 ? "" : "s"
  } found. Review them before generating barcodes.`;

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open barcode sheet";

  openButton.addEventListener("click", () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
      window.location.href = "/results.html";
    } catch {
      ocrStatus.textContent =
        "Unable to save candidates in this browser session. Check browser storage settings and try again.";
    }
  });

  articleResults.append(summary, openButton);
}

function updateArticleResults(): void {
  const candidates = extractArticleCandidates(ocrOutput.value);
  setArticleResults(candidates);
}

function clearImage(): void {
  extractionId++;
  extractionInProgress = false;

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  fileInput.value = "";
  previewImage.removeAttribute("src");
  previewContainer.hidden = true;

  fileStatus.textContent = "No image selected.";
  ocrStatus.textContent = "Upload an image to begin.";
  ocrConfidence.textContent = "";
  ocrOutput.value = "";
  ocrOutput.disabled = false;

  extractTextButton.disabled = true;
  extractTextButton.textContent = "Extract text";
  clearButton.disabled = true;

  articleResults.replaceChildren();

  const heading = document.createElement("h2");
  heading.id = "article-results-heading";
  heading.textContent = "Article numbers";

  const message = document.createElement("p");
  message.textContent = "Extract text to review article-number candidates.";

  articleResults.append(heading, message);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];

  if (!file) {
    clearImage();
    return;
  }

  if (!file.type.startsWith("image/")) {
    clearImage();
    fileStatus.textContent = "Please select an image file.";
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    clearImage();
    fileStatus.textContent = "Image is too large. Maximum file size is 15 MB.";
    return;
  }

  extractionId++;
  extractionInProgress = false;

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(file);
  previewImage.src = previewUrl;
  previewContainer.hidden = false;

  fileStatus.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  ocrStatus.textContent = "Ready to extract text.";
  ocrConfidence.textContent = "";
  ocrOutput.value = "";

  extractTextButton.disabled = false;
  extractTextButton.textContent = "Extract text";
  clearButton.disabled = false;

  updateArticleResults();
});

clearButton.addEventListener("click", clearImage);

extractTextButton.addEventListener("click", async () => {
  const file = fileInput.files?.[0];

  if (!file || extractionInProgress) {
    return;
  }

  const currentId = ++extractionId;
  extractionInProgress = true;

  extractTextButton.disabled = true;
  extractTextButton.textContent = "Extracting…";
  ocrStatus.textContent = "Preparing image and running OCR…";
  ocrConfidence.textContent = "";

  try {
    const result = await extractText(file);

    if (currentId !== extractionId) {
      return;
    }

    ocrOutput.value = result.text;
    ocrConfidence.textContent = `OCR confidence: ${result.confidence.toFixed(1)}%`;
    ocrStatus.textContent = result.text.trim()
      ? "Extraction complete. Review and correct the recognized text."
      : "No text recognized. Try a clearer or more tightly cropped image.";

    updateArticleResults();
  } catch (error) {
    if (currentId !== extractionId) {
      return;
    }

    console.error("OCR failed:", error);
    ocrStatus.textContent =
      "Text extraction failed. Try another image or reload the page.";
  } finally {
    if (currentId === extractionId) {
      extractionInProgress = false;
      extractTextButton.disabled = !fileInput.files?.length;
      extractTextButton.textContent = "Extract text";
    }
  }
});

ocrOutput.addEventListener("input", updateArticleResults);
