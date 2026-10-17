import JsBarcode from "jsbarcode";

const ARTICLE_NUMBER_PATTERN = /^[A-Z]{2}\d{9}IN$/;

export function renderCode128(
  svg: SVGSVGElement,
  articleNumber: string,
): boolean {
  const value = articleNumber.trim().toUpperCase();

  svg.replaceChildren();
  svg.removeAttribute("viewBox");
  svg.removeAttribute("width");
  svg.removeAttribute("height");

  if (!ARTICLE_NUMBER_PATTERN.test(value)) {
    return false;
  }

  try {
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: true,
      text: value,
      font: "monospace",
      fontSize: 14,
      textMargin: 6,
      width: 2,
      height: 64,
      margin: 12,
      background: "#ffffff",
      lineColor: "#111111",
    });

    return true;
  } catch (error) {
    console.error("Barcode generation failed:", error);
    svg.replaceChildren();
    return false;
  }
}
