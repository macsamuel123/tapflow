// Demo photos live in IndexedDB: localStorage holds about 5 MB for the whole demo.
const DB = "tapflow-demo";
const STORE = "photos";

export const PHOTO_REF = "idb:";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const urls = new Map<string, string>();

export async function savePhoto(photo: Blob): Promise<string> {
  const id = crypto.randomUUID();
  await run("readwrite", (store) => store.put(photo, id));
  return `${PHOTO_REF}${id}`;
}

export async function deletePhoto(ref: string | null): Promise<void> {
  if (!ref?.startsWith(PHOTO_REF)) return;
  const url = urls.get(ref);
  if (url) URL.revokeObjectURL(url);
  urls.delete(ref);
  await run("readwrite", (store) => store.delete(ref.slice(PHOTO_REF.length)));
}

export async function clearPhotos(): Promise<void> {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  await run("readwrite", (store) => store.clear());
}

/** A URL an <img> can show. Pages only ever see URLs, as they will from the API. */
export async function photoUrl(ref: string | null): Promise<string | null> {
  if (!ref?.startsWith(PHOTO_REF)) return ref;
  const cached = urls.get(ref);
  if (cached) return cached;
  const blob = await run<Blob | undefined>("readonly", (store) => store.get(ref.slice(PHOTO_REF.length)));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(ref, url);
  return url;
}
