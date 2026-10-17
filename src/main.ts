import "./style.css";

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

const MAX_FILE_SIZE = 15 * 1024 * 1024;

let currentObjectUrl: string | null = null;

function closeViewer(): void {
  if (imageViewer.open) {
    imageViewer.close();
  }

  largePreviewImage.removeAttribute("src");
}

function clearImage(): void {
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

  // Release the previous image URL before creating another.
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(file);

  previewImage.src = currentObjectUrl;
  previewContainer.hidden = false;
  clearButton.disabled = false;

  fileStatus.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
});

viewLargeButton.addEventListener("click", () => {
  if (!currentObjectUrl) return;

  largePreviewImage.src = currentObjectUrl;

  if (!imageViewer.open) {
    imageViewer.showModal();
  }
});

closeViewerButton.addEventListener("click", closeViewer);

imageViewer.addEventListener("click", (event) => {
  if (event.target === imageViewer) {
    closeViewer();
  }
});

// Clean up the large preview when the dialog closes via Escape.
imageViewer.addEventListener("close", () => {
  largePreviewImage.removeAttribute("src");
});

clearButton.addEventListener("click", clearImage);
