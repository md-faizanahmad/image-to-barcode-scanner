export interface ArticleCandidate {
  raw: string;
  candidate: string;
  suggestedCorrection: string | null;
  validFormat: boolean;
  needsReview: boolean;
  corrections: string[];
}

const ARTICLE_PATTERN = /^[A-Z]{2}\d{9}IN$/;

const NUMERIC_CONFUSIONS: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  B: "8",
  G: "6",
};

function suggestNumericCorrection(candidate: string): {
  value: string;
  corrections: string[];
} {
  if (candidate.length !== 13) {
    return {
      value: candidate,
      corrections: [],
    };
  }

  const prefix = candidate.slice(0, 2);
  const digits = candidate.slice(2, 11);
  const suffix = candidate.slice(11, 13);

  // The prefix must contain letters and the suffix must be IN.
  if (!/^[A-Z]{2}$/.test(prefix) || suffix !== "IN") {
    return {
      value: candidate,
      corrections: [],
    };
  }

  const corrections: string[] = [];

  const correctedDigits = [...digits]
    .map((character, index) => {
      if (/\d/.test(character)) {
        return character;
      }

      const replacement = NUMERIC_CONFUSIONS[character];

      if (!replacement) {
        return character;
      }

      corrections.push(
        `Numeric position ${index + 1}: ${character} → ${replacement}`,
      );

      return replacement;
    })
    .join("");

  return {
    value: `${prefix}${correctedDigits}${suffix}`,
    corrections,
  };
}

export function extractArticleCandidates(text: string): ArticleCandidate[] {
  const lines = text.toUpperCase().split(/\r?\n/);
  const results: ArticleCandidate[] = [];

  for (const line of lines) {
    const tokens = line.match(/[A-Z0-9]+/g) ?? [];

    for (const rawToken of tokens) {
      if (
        rawToken.length < 11 ||
        rawToken.length > 15 ||
        !rawToken.includes("IN")
      ) {
        continue;
      }

      // A leading row number may have been joined to the article ID.
      // Strip it only when the remaining token is exactly 13 characters.
      const candidate =
        rawToken.length === 14 &&
        /^\d[A-Z]/.test(rawToken) &&
        ARTICLE_PATTERN.test(rawToken.slice(1))
          ? rawToken.slice(1)
          : rawToken;

      const validFormat = ARTICLE_PATTERN.test(candidate);

      const suggestion = validFormat
        ? { value: candidate, corrections: [] }
        : suggestNumericCorrection(candidate);

      const suggestedCorrection =
        suggestion.corrections.length > 0 &&
        ARTICLE_PATTERN.test(suggestion.value)
          ? suggestion.value
          : null;

      results.push({
        raw: rawToken,
        candidate,
        suggestedCorrection,
        validFormat,
        needsReview: !validFormat || suggestedCorrection !== null,
        corrections: suggestion.corrections,
      });
    }
  }

  return results;
}
