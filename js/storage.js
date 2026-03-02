// --- STORAGE ---
// Persistence layer: variants in localStorage, version history in IndexedDB.

const Storage = (() => {
    const STORAGE_PREFIX = 'cvv2_';
    const ACTIVE_KEY = STORAGE_PREFIX + 'active_variant';
    const DB_NAME = 'CVEditorHistory';
    const DB_VERSION = 1;
    const STORE_NAME = 'snapshots';
    const MAX_SNAPSHOTS_PER_VARIANT = 20;

    // --- VARIANT MANAGEMENT (localStorage) ---

    function listVariants() {
        const variants = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(STORAGE_PREFIX + 'var_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    variants.push({
                        id: key.replace(STORAGE_PREFIX + 'var_', ''),
                        name: data._variantName || 'Untitled',
                        updatedAt: data._updatedAt || null
                    });
                } catch (e) { /* skip corrupt entries */ }
            }
        }
        return variants.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    }

    function saveVariant(id, name, state) {
        const data = deepClone(state);
        data._variantName = name;
        data._updatedAt = new Date().toISOString();
        // Strip image buffer to avoid localStorage bloat — save separately if needed
        try {
            localStorage.setItem(STORAGE_PREFIX + 'var_' + id, JSON.stringify(data));
        } catch (e) {
            // If quota exceeded, try without image
            console.warn('Storage full, saving without image');
            data.image = null;
            localStorage.setItem(STORAGE_PREFIX + 'var_' + id, JSON.stringify(data));
        }
        localStorage.setItem(ACTIVE_KEY, id);
    }

    function loadVariant(id) {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'var_' + id);
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            return migrateData(data);
        } catch (e) {
            console.error('Failed to load variant', e);
            return null;
        }
    }

    function deleteVariant(id) {
        localStorage.removeItem(STORAGE_PREFIX + 'var_' + id);
        if (getActiveVariantId() === id) {
            localStorage.removeItem(ACTIVE_KEY);
        }
    }

    function renameVariant(id, newName) {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'var_' + id);
        if (!raw) return;
        try {
            const data = JSON.parse(raw);
            data._variantName = newName;
            localStorage.setItem(STORAGE_PREFIX + 'var_' + id, JSON.stringify(data));
        } catch (e) { /* ignore */ }
    }

    function cloneVariant(id, newName) {
        const raw = localStorage.getItem(STORAGE_PREFIX + 'var_' + id);
        if (!raw) return null;
        const newId = generateUUID();
        try {
            const data = JSON.parse(raw);
            data._variantName = newName;
            data._updatedAt = new Date().toISOString();
            localStorage.setItem(STORAGE_PREFIX + 'var_' + newId, JSON.stringify(data));
        } catch (e) { return null; }
        return newId;
    }

    function getActiveVariantId() {
        return localStorage.getItem(ACTIVE_KEY) || null;
    }

    function setActiveVariantId(id) {
        localStorage.setItem(ACTIVE_KEY, id);
    }

    // --- LEGACY MIGRATION ---
    // Migrate from old cv_editor_v20 key if present

    function migrateLegacy() {
        const old = localStorage.getItem('cv_editor_v20');
        if (!old) return null;
        try {
            const data = JSON.parse(old);
            const migrated = migrateData(data);
            const id = generateUUID();
            saveVariant(id, 'Migrated CV', migrated);
            localStorage.removeItem('cv_editor_v20');
            return id;
        } catch (e) {
            console.error('Legacy migration failed', e);
            return null;
        }
    }

    // --- VERSION HISTORY (IndexedDB) ---

    function _openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('variantId', 'variantId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async function snapshot(variantId, state, label = null) {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            const entry = {
                id: generateUUID(),
                variantId,
                timestamp: new Date().toISOString(),
                label: label || null,
                name: state.personal?.name || 'Untitled',
                state: deepClone(state)
            };

            // Remove image from snapshot to save space
            if (entry.state.image) {
                entry.state.image = null;
            }

            store.add(entry);
            await new Promise((res, rej) => {
                tx.oncomplete = res;
                tx.onerror = rej;
            });

            // Prune old snapshots
            await _pruneSnapshots(variantId);
            db.close();
        } catch (e) {
            console.warn('Snapshot failed', e);
        }
    }

    async function _pruneSnapshots(variantId) {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('variantId');
            const request = index.getAll(variantId);

            request.onsuccess = () => {
                const all = request.result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
                if (all.length > MAX_SNAPSHOTS_PER_VARIANT) {
                    const toRemove = all.slice(MAX_SNAPSHOTS_PER_VARIANT);
                    toRemove.forEach(entry => store.delete(entry.id));
                }
            };

            await new Promise((res, rej) => {
                tx.oncomplete = res;
                tx.onerror = rej;
            });
            db.close();
        } catch (e) { /* non-critical */ }
    }

    async function listSnapshots(variantId) {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('variantId');
            const request = index.getAll(variantId);

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const sorted = request.result
                        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                        .map(e => ({
                            id: e.id,
                            timestamp: e.timestamp,
                            label: e.label,
                            name: e.name
                        }));
                    db.close();
                    resolve(sorted);
                };
                request.onerror = () => { db.close(); reject(request.error); };
            });
        } catch (e) {
            return [];
        }
    }

    async function restoreSnapshot(snapshotId) {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(snapshotId);

            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    db.close();
                    if (request.result) {
                        resolve(migrateData(request.result.state));
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => { db.close(); reject(request.error); };
            });
        } catch (e) {
            return null;
        }
    }

    async function deleteSnapshot(snapshotId) {
        try {
            const db = await _openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(snapshotId);
            await new Promise((res, rej) => {
                tx.oncomplete = res;
                tx.onerror = rej;
            });
            db.close();
        } catch (e) { /* non-critical */ }
    }

    // --- EXPORT / IMPORT ---

    async function exportJSON(state, filename) {
        const data = deepClone(state);
        data.schemaVersion = SCHEMA_VERSION;
        const json = JSON.stringify(data, null, 2);

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: (filename || 'cv-project') + '.json',
                    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }

        // Fallback
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (filename || 'cv-project') + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(migrateData(data));
                } catch (err) {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsText(file);
        });
    }

    function exportPDF(pdfBytes, filename) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (filename || 'resume') + '.pdf';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    return {
        listVariants, saveVariant, loadVariant, deleteVariant,
        renameVariant, cloneVariant, getActiveVariantId, setActiveVariantId,
        migrateLegacy,
        snapshot, listSnapshots, restoreSnapshot, deleteSnapshot,
        exportJSON, importJSON, exportPDF
    };
})();
