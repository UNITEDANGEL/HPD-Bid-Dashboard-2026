// Corrected paperwork waiting to be printed and signed in ink (you and the notary). Kept on this
// device (IndexedDB) until you mark it signed and sent: HPD rejects copies of signatures, so these are
// printed, signed by hand, stamped by the notary and mailed / handed in.

export type SavedCorrection = { omo: string; savedAt: string; rejectedAt: string; reason: string; fileName: string; pdf: Blob };

const DB = "hpd-corrections";
const STORE = "pdfs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "omo" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const saveCorrection = (c: SavedCorrection) => run("readwrite", (s) => s.put(c)).then(() => undefined);
export const listCorrections = () => run<SavedCorrection[]>("readonly", (s) => s.getAll() as IDBRequest<SavedCorrection[]>)
  .then((rows) => rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
  .catch(() => [] as SavedCorrection[]);
export const removeCorrection = (omo: string) => run("readwrite", (s) => s.delete(omo)).then(() => undefined);
