import "./results.css";
import { renderCode128 } from "./modules/barcode/barcode";

const ARTICLE_PATTERN = /^[A-Z]{2}\d{9}IN$/;

const status = document.querySelector<HTMLParagraphElement>("#results-status")!;

const list = document.querySelector<HTMLDivElement>("#barcode-list")!;

const addButton = document.querySelector<HTMLButtonElement>("#add-article")!;

const downloadButton =
  document.querySelector<HTMLButtonElement>("#download-image")!;

interface StoredCandidate {
  candidate?: string;
  suggestedCorrection?: string | null;
}

function loadArticles(): string[] {
  try {
    const saved = sessionStorage.getItem("manifest-article-candidates");

    if (!saved) return [];

    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return (parsed as StoredCandidate[]).map(
      (item) => item.suggestedCorrection || item.candidate || "",
    );
  } catch {
    return [];
  }
}

let articles = loadArticles();

function saveArticles(): void {
  sessionStorage.setItem(
    "manifest-article-candidates",
    JSON.stringify(
      articles.map((candidate) => ({
        candidate,
        suggestedCorrection: null,
      })),
    ),
  );
}

function renderList(): void {
  list.replaceChildren();

  if (articles.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No article numbers yet. Tap Add number to begin.";
    list.append(empty);
  }

  articles.forEach((article, index) => {
    const card = document.createElement("article");
    card.className = "barcode-card";

    const label = document.createElement("label");
    label.htmlFor = `article-${index}`;
    label.textContent = `Article ${index + 1}`;

    const input = document.createElement("input");
    input.id = `article-${index}`;
    input.type = "text";
    input.maxLength = 13;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "AA123456789IN";
    input.value = article;

    const validation = document.createElement("p");
    validation.className = "validation";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    svg.classList.add("barcode-preview");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-button";
    removeButton.textContent = "Remove";

    function update(): void {
      const value = input.value.trim().toUpperCase();

      articles[index] = value;

      const valid = ARTICLE_PATTERN.test(value);

      validation.textContent = valid
        ? "Valid format — verify against the manifest."
        : "Expected 2 letters, 9 digits, and IN.";

      validation.dataset.valid = String(valid);

      const generated = renderCode128(svg, value);

      svg.style.display = generated ? "block" : "none";

      saveArticles();
    }

    input.addEventListener("input", update);

    removeButton.addEventListener("click", () => {
      articles.splice(index, 1);
      saveArticles();
      renderList();
    });

    card.append(label, input, validation, svg, removeButton);
    list.append(card);

    update();
  });

  status.textContent = `${articles.length} article number(s). Review every number before exporting.`;
}

addButton.addEventListener("click", () => {
  articles.push("");
  renderList();

  const inputs = list.querySelectorAll<HTMLInputElement>("input");
  inputs[inputs.length - 1]?.focus();
});

async function createBarcodeSheet(): Promise<Blob> {
  if (articles.length === 0) {
    throw new Error("Add at least one article number.");
  }

  const values = articles.map((value) => value.trim().toUpperCase());

  const invalidIndex = values.findIndex(
    (value) => !ARTICLE_PATTERN.test(value),
  );

  if (invalidIndex !== -1) {
    throw new Error(`Correct article ${invalidIndex + 1} before exporting.`);
  }

  const width = 1200;
  const rowHeight = 190;
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = 100 + values.length * rowHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create the barcode image.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#111111";
  context.font = "bold 32px sans-serif";
  context.fillText("India Post — Barcode Sheet", 40, 48);

  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    if (!renderCode128(svg, value)) {
      throw new Error(`Could not generate barcode for ${value}.`);
    }

    const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    });

    const objectUrl = URL.createObjectURL(svgBlob);

    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();

      const maxWidth = 1080;
      const maxHeight = 120;
      const scale = Math.min(
        maxWidth / image.naturalWidth,
        maxHeight / image.naturalHeight,
      );

      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      const y = 75 + index * rowHeight;

      context.fillStyle = "#111111";
      context.font = "20px sans-serif";
      context.fillText(`Article ${index + 1}`, 40, y + 20);

      context.drawImage(
        image,
        (width - imageWidth) / 2,
        y + 28,
        imageWidth,
        imageHeight,
      );

      context.strokeStyle = "#dddddd";
      context.lineWidth = 1;

      if (index < values.length - 1) {
        context.beginPath();
        context.moveTo(30, y + rowHeight - 8);
        context.lineTo(width - 30, y + rowHeight - 8);
        context.stroke();
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("PNG export failed."));
      }
    }, "image/png");
  });
}

downloadButton.addEventListener("click", async () => {
  downloadButton.disabled = true;
  status.textContent = "Preparing high-resolution PNG...";

  try {
    const blob = await createBarcodeSheet();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "india-post-barcode-sheet.png";
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    status.textContent = "PNG generated. Check your browser downloads.";
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "Could not export the barcode sheet.";
  } finally {
    downloadButton.disabled = false;
  }
});

renderList();
