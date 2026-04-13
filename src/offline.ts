// Offline storage using IndexedDB
// Stores pending occurrences when offline and syncs when back online

const DB_NAME = 'defesacivil-db'
const DB_VERSION = 1
const PENDING_STORE = 'pending'
const CACHE_STORE = 'ocorrencias-cache'

let _db: IDBDatabase | null = null

function getDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => { _db = req.result; resolve(_db) }
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: 'localId', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'id' })
      }
    }
  })
}

function run<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

// Pending queue (offline → server)
export function savePending(data: object): Promise<IDBValidKey> {
  return run(PENDING_STORE, 'readwrite', (s) =>
    s.add({ ...data, _savedAt: new Date().toISOString() })
  )
}

export function getPending(): Promise<any[]> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, 'readonly')
        const req = tx.objectStore(PENDING_STORE).getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export function removePending(localId: number): Promise<undefined> {
  return run(PENDING_STORE, 'readwrite', (s) => s.delete(localId)) as Promise<undefined>
}

export function countPending(): Promise<number> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, 'readonly')
        const req = tx.objectStore(PENDING_STORE).count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

// Occurrence cache (for offline read)
export function cacheOcorrencias(items: object[]): Promise<void> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite')
        const store = tx.objectStore(CACHE_STORE)
        store.clear()
        items.forEach((item) => store.put(item))
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

export function getCachedOcorrencias(): Promise<any[]> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readonly')
        const req = tx.objectStore(CACHE_STORE).getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export function addToCache(item: object & { id: number }): Promise<IDBValidKey> {
  return run(CACHE_STORE, 'readwrite', (s) => s.put(item))
}

// Geocoding via Nominatim (OpenStreetMap)
export async function geocodificarEndereco(endereco: string): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${endereco}, Ouro Branco, MG, Brasil`)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`,
      { headers: { 'User-Agent': 'DefesaCivilOuroBranco/1.0 (contato@defesacivil.mg.gov.br)' } }
    )
    const data = await res.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch {
    // offline or error
  }
  return null
}
