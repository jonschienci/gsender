import type { GcodeFilePayload } from '../electron-bridge';
const keyFor = (name: string, path?: string) => path ? `path:${path}` : `name:${name}`;
const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open('pendant-recent-gcode', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});
export async function cacheRecentFile(payload: GcodeFilePayload) {
    const db = await open();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('files', 'readwrite');
            const store = tx.objectStore('files');
            store.put({ payload, savedAt: Date.now() }, keyFor(payload.name, payload.path));
            const entries: { key: IDBValidKey; savedAt: number }[] = [];
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
                const item = cursor.result;
                if (item) { entries.push({ key: item.key, savedAt: item.value.savedAt }); item.continue(); }
                else entries.sort((a, b) => b.savedAt - a.savedAt).slice(5).forEach(entry => store.delete(entry.key));
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally { db.close(); }
}
export async function readRecentFile(name: string, path?: string): Promise<GcodeFilePayload | undefined> {
    const db = await open();
    try {
        return await new Promise((resolve, reject) => {
            const request = db.transaction('files').objectStore('files').get(keyFor(name, path));
            request.onsuccess = () => resolve(request.result?.payload);
            request.onerror = () => reject(request.error);
        });
    } finally { db.close(); }
}
