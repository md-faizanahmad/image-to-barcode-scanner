const DB_NAME = "image-barcode-scanner";
const STORE_NAME = "images";
const IMAGE_KEY = "current-manifest-image";
const HISTORY_KEY = "verified-article-corrections";

export interface CorrectionRecord {
  original: string;
  corrected: string;
  updatedAt: string;
}

export function saveSourceImage(file: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).put(file, IMAGE_KEY);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        const error = transaction.error;
        db.close();
        reject(error);
      };
    };
  });
}

export function loadSourceImage(): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        resolve(null);
        return;
      }

      const transaction = db.transaction(STORE_NAME, "readonly");
      const getRequest = transaction.objectStore(STORE_NAME).get(IMAGE_KEY);

      getRequest.onsuccess = () => {
        db.close();
        resolve(getRequest.result instanceof Blob ? getRequest.result : null);
      };

      getRequest.onerror = () => {
        db.close();
        reject(getRequest.error);
      };
    };
  });
}

export function getCorrectionHistory(): CorrectionRecord[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is CorrectionRecord =>
        item !== null &&
        typeof item === "object" &&
        typeof item.original === "string" &&
        typeof item.corrected === "string" &&
        typeof item.updatedAt === "string",
    );
  } catch {
    return [];
  }
}

export function findCorrection(original: string): CorrectionRecord | undefined {
  const key = original.trim().toUpperCase();

  return getCorrectionHistory().find(
    (record) => record.original.trim().toUpperCase() === key,
  );
}

export function saveCorrection(original: string, corrected: string): void {
  const source = original.trim().toUpperCase();
  const value = corrected.trim().toUpperCase();

  if (!source || !/^[A-Z]{2}\d{9}IN$/.test(value)) {
    throw new Error("A correction must be a valid article number.");
  }

  const history = getCorrectionHistory();
  const existingIndex = history.findIndex(
    (record) => record.original.trim().toUpperCase() === source,
  );

  const record: CorrectionRecord = {
    original: source,
    corrected: value,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    history[existingIndex] = record;
  } else {
    history.push(record);
  }

  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}
