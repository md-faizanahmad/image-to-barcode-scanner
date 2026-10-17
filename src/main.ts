import "./style.css";
import { extractText, type OCRLine } from "./modules/ocr/ocr";
import { extractArticleCandidates } from "./modules/ocr/article-number";
import {
  findCorrection,
  saveSourceImage,
} from "./modules/storage/correction-store";
import { cleanupExpiredTemporaryData } from "./modules/storage/cleanup";

await cleanupExpiredTemporaryData();

const fileInput = document.querySelector<HTMLInputElement>("#manifest-file")!;
const fileStatus = document.querySelector<HTMLElement>("#file-status")!;
const previewContainer =
  document.querySelector<HTMLElement>("#preview-container")!;
const previewImage =
  document.querySelector<HTMLImageElement>("#manifest-preview")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear-button")!;
const extractButton = document.querySelector<HTMLButtonElement>(
  "#extract-text-button",
)!;
const ocrStatus = document.querySelector<HTMLElement>("#ocr-status")!;
const ocrOutput = document.querySelector<HTMLTextAreaElement>("#ocr-output")!;
const confidenceOutput =
  document.querySelector<HTMLElement>("#ocr-confidence")!;
const articleResults = document.querySelector<HTMLElement>("#article-results")!;

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const STORAGE_KEY = "manifest-article-candidates";

interface StoredCandidate {
  raw: string;
  candidate: string;
  suggestedCorrection: string | null;
  validFormat: boolean;
  needsReview: boolean;
  corrections: string[];
  crop?: OCRLine["box"];
}

let previewUrl: string | null = null;
let extractionId = 0;
let extractionInProgress = false;
let lastLines: OCRLine[] = [];

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function findLine(candidate: string, lines: OCRLine[]): OCRLine | undefined {
  const target = normalize(candidate);

  return lines.find((line) => {
    const text = normalize(line.text);
    return target.length > 0 && text.includes(target);
  });
}

function renderArticleResults(): void {
  articleResults.replaceChildren();

  const heading = document.createElement("h2");
  heading.id = "article-results-heading";
  heading.textContent = "Detected Numbers";
  articleResults.append(heading);

  const candidates = extractArticleCandidates(
    ocrOutput.value,
  ) as StoredCandidate[];

  if (!candidates.length) {
    const message = document.createElement("p");
    message.textContent =
      "No number candidates found. Review the recognized text.";
    articleResults.append(message);
    return;
  }

  for (const candidate of candidates) {
    const matchedLine = findLine(
      candidate.raw || candidate.candidate,
      lastLines,
    );
    if (matchedLine) candidate.crop = matchedLine.box;

    // Offer a prior verified correction as a suggestion, never apply it silently.
    const prior = findCorrection(candidate.raw || candidate.candidate);
    if (prior && prior.corrected !== candidate.candidate) {
      candidate.suggestedCorrection = prior.corrected;
    }
  }

  const summary = document.createElement("p");
  summary.textContent = `${candidates.length} candidate(s) detected. Review numbers before generating barcodes.`;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Review numbers and barcodes";

  button.addEventListener("click", () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
      window.location.href = "/results.html";
    } catch {
      ocrStatus.textContent =
        "Unable to prepare results. Try a smaller image or clear browser storage.";
    }
  });

  articleResults.append(summary, button);
}

function clearImage(): void {
  extractionId++;
  extractionInProgress = false;
  lastLines = [];

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;

  fileInput.value = "";
  previewImage.removeAttribute("src");
  previewContainer.hidden = true;

  fileStatus.textContent = "No image selected.";
  ocrStatus.textContent = "Upload an image to begin.";
  confidenceOutput.textContent = "";
  ocrOutput.value = "";

  extractButton.disabled = true;
  extractButton.textContent = "Extract text";
  clearButton.disabled = true;

  renderArticleResults();
}

fileInput.addEventListener("change", async () => {
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
    fileStatus.textContent = "Image is too large. Maximum size is 15 MB.";
    return;
  }

  extractionId++;
  extractionInProgress = false;

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);

  previewImage.src = previewUrl;
  previewContainer.hidden = false;
  fileStatus.textContent = `${file.name} (${(file.size / 1048576).toFixed(1)} MB)`;
  ocrStatus.textContent = "Image ready.";
  confidenceOutput.textContent = "";
  ocrOutput.value = "";
  lastLines = [];

  extractButton.disabled = false;
  extractButton.textContent = "Extract text";
  clearButton.disabled = false;

  try {
    await saveSourceImage(file);
  } catch (error) {
    console.error("Image storage failed:", error);
    ocrStatus.textContent =
      "Image selected, but local crop storage failed. Check device storage.";
  }

  renderArticleResults();
});

clearButton.addEventListener("click", clearImage);

extractButton.addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  if (!file || extractionInProgress) return;

  const currentId = ++extractionId;
  extractionInProgress = true;
  extractButton.disabled = true;
  extractButton.textContent = "Extracting…";
  ocrStatus.textContent = "Reading text and locating number lines…";

  try {
    const result = await extractText(file);
    if (currentId !== extractionId) return;

    lastLines = result.lines;
    ocrOutput.value = result.text;
    confidenceOutput.textContent = `OCR confidence: ${result.confidence.toFixed(1)}%`;
    ocrStatus.textContent =
      "Extraction complete. Review the text and detected numbers.";
    renderArticleResults();
  } catch (error) {
    if (currentId !== extractionId) return;
    console.error("OCR failed:", error);
    ocrStatus.textContent = "Text extraction failed. Try a clearer image.";
  } finally {
    if (currentId === extractionId) {
      extractionInProgress = false;
      extractButton.disabled = !fileInput.files?.length;
      extractButton.textContent = "Extract text";
    }
  }
});

ocrOutput.addEventListener("input", renderArticleResults);
renderArticleResults();
