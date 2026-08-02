import { AppState, EMPTY_STATE, loadCurrentState } from "./workout";

const DATABASE_NAME = "workout-tracker";
const DATABASE_VERSION = 1;
const STORE_NAME = "app-state";
const STATE_KEY = "current";

export type StoragePersistenceStatus =
  | "persistent"
  | "best-effort"
  | "unsupported";

type PersistenceStorageManager = Pick<
  StorageManager,
  "persisted" | "persist"
>;

function browserStorageManager(): PersistenceStorageManager | undefined {
  if (typeof navigator === "undefined" || !navigator.storage) return undefined;
  return navigator.storage;
}

export async function ensurePersistentStorage(
  storage: PersistenceStorageManager | undefined = browserStorageManager(),
): Promise<StoragePersistenceStatus> {
  if (
    !storage ||
    typeof storage.persisted !== "function" ||
    typeof storage.persist !== "function"
  ) {
    return "unsupported";
  }

  try {
    if (await storage.persisted()) return "persistent";
    return (await storage.persist()) ? "persistent" : "best-effort";
  } catch {
    return "best-effort";
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Workout storage is blocked by another app window."));
  });
}

export async function loadAppState(): Promise<AppState> {
  if (typeof indexedDB === "undefined") return structuredClone(EMPTY_STATE);
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(loadCurrentState(request.result));
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveAppState(state: AppState): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
