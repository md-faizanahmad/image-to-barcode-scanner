const DATABASE_NAME = "image-barcode-scanner";
const IMAGE_STORE = "images";
const IMAGE_KEY = "current-manifest-image";

const CANDIDATES_KEY = "manifest-article-candidates";
const CORRECTIONS_KEY = "verified-article-corrections";
const CLEANUP_KEY = "temporary-data-last-cleanup";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function clearStoredImage(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);

    request.onsuccess = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.close();
        resolve();
        return;
      }

      const transaction = db.transaction(IMAGE_STORE, "readwrite");
      transaction.objectStore(IMAGE_STORE).delete(IMAGE_KEY);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      transaction.onerror = () => {
        const error = transaction.error;
        db.close();
        reject(error);
      };

      transaction.onabort = () => {
        const error = transaction.error;
        db.close();
        reject(error);
      };
    };

    request.onerror = () => reject(request.error);
  });
}

export async function cleanupExpiredTemporaryData(): Promise<void> {
  try {
    const lastCleanup = Number(localStorage.getItem(CLEANUP_KEY));
    const now = Date.now();

    if (
      Number.isFinite(lastCleanup) &&
      lastCleanup > 0 &&
      now - lastCleanup < TWENTY_FOUR_HOURS
    ) {
      return;
    }

    await clearStoredImage();

    sessionStorage.removeItem(CANDIDATES_KEY);
    localStorage.removeItem(CORRECTIONS_KEY);

    localStorage.setItem(CLEANUP_KEY, String(now));
  } catch (error) {
    console.error("Temporary data cleanup failed:", error);
  }
}
