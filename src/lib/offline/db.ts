// Await transaction completion, not just request success: quota/commit failures must reach the caller.
export async function offlineStore<T>(store: "outbox" | "reads", mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("luxor-offline-v1", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("outbox", { keyPath: "id" });
      request.result.createObjectStore("reads", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Phone storage unavailable")); };
  });
}
