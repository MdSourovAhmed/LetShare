/**
 * transferDB.js — IndexedDB store for transfer records
 *
 * Provides a simple async API over IndexedDB to persist transfer records
 * across browser sessions. All reads/writes are async and non-blocking.
 *
 * Schema
 * ──────
 * Database:  'letshare'
 * Version:   1
 * Object store: 'transfers'
 *   keyPath: 'id'  (auto UUID)
 *   indexes: mode, role, timestamp
 *
 * All operations return Promises and are safe to fire-and-forget from the
 * transfer hook — a write failure never affects the transfer itself.
 */

const DB_NAME    = 'letshare'
const DB_VERSION = 1
const STORE      = 'transfers'

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db    = e.target.result
      const store = db.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('mode',      'mode',      { unique: false })
      store.createIndex('role',      'role',      { unique: false })
      store.createIndex('timestamp', 'timestamp', { unique: false })
    }

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror    = ()  => reject(req.error)
  })
}

/** Save a transfer record. Fire-and-forget safe. */
export async function saveTransfer(record) {
  try {
    const db  = await openDB()
    const tx  = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ ...record, id: record.id || crypto.randomUUID() })
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
  } catch (e) {
    console.warn('[transferDB] save failed:', e)
  }
}

/** Get all records, newest first. */
export async function getAllTransfers() {
  try {
    const db    = await openDB()
    const tx    = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    return new Promise((res, rej) => {
      const req = store.getAll()
      req.onsuccess = () => res([...req.result].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
      ))
      req.onerror = rej
    })
  } catch { return [] }
}

/** Get records filtered by mode and/or role. */
export async function getTransfers({ mode, role } = {}) {
  const all = await getAllTransfers()
  return all.filter((r) =>
    (mode ? r.mode === mode : true) &&
    (role ? r.role === role : true)
  )
}

/** Delete a single record by id. */
export async function deleteTransfer(id) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
  } catch (e) {
    console.warn('[transferDB] delete failed:', e)
  }
}

/** Wipe all records. */
export async function clearTransfers() {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
  } catch (e) {
    console.warn('[transferDB] clear failed:', e)
  }
}





// /**
//  * transferDB.js — IndexedDB store for transfer records
//  *
//  * Provides a simple async API over IndexedDB to persist transfer records
//  * across browser sessions. All reads/writes are async and non-blocking.
//  *
//  * Schema
//  * ──────
//  * Database:  'letshare'
//  * Version:   1
//  * Object store: 'transfers'
//  *   keyPath: 'id'  (auto UUID)
//  *   indexes: mode, role, timestamp
//  *
//  * All operations return Promises and are safe to fire-and-forget from the
//  * transfer hook — a write failure never affects the transfer itself.
//  */

// const DB_NAME    = 'letshare'
// const DB_VERSION = 1
// const STORE      = 'transfers'

// let _db = null

// function openDB() {
//   if (_db) return Promise.resolve(_db)

//   return new Promise((resolve, reject) => {
//     const req = indexedDB.open(DB_NAME, DB_VERSION)

//     req.onupgradeneeded = (e) => {
//       const db    = e.target.result
//       const store = db.createObjectStore(STORE, { keyPath: 'id' })
//       store.createIndex('mode',      'mode',      { unique: false })
//       store.createIndex('role',      'role',      { unique: false })
//       store.createIndex('timestamp', 'timestamp', { unique: false })
//     }

//     req.onsuccess  = (e) => { _db = e.target.result; resolve(_db) }
//     req.onerror    = ()  => reject(req.error)
//   })
// }

// /** Save a transfer record. Fire-and-forget safe. */
// export async function saveTransfer(record) {
//   try {
//     const db  = await openDB()
//     const tx  = db.transaction(STORE, 'readwrite')
//     tx.objectStore(STORE).put({ ...record, id: record.id || crypto.randomUUID() })
//     return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
//   } catch (e) {
//     console.warn('[transferDB] save failed:', e)
//   }
// }

// /** Get all records, newest first. */
// export async function getAllTransfers() {
//   try {
//     const db    = await openDB()
//     const tx    = db.transaction(STORE, 'readonly')
//     const store = tx.objectStore(STORE)
//     return new Promise((res, rej) => {
//       const req = store.getAll()
//       req.onsuccess = () => res([...req.result].sort((a, b) =>
//         new Date(b.timestamp) - new Date(a.timestamp)
//       ))
//       req.onerror = rej
//     })
//   } catch { return [] }
// }

// /** Get records filtered by mode and/or role. */
// export async function getTransfers({ mode, role } = {}) {
//   const all = await getAllTransfers()
//   return all.filter((r) =>
//     (mode ? r.mode === mode : true) &&
//     (role ? r.role === role : true)
//   )
// }

// /** Delete a single record by id. */
// export async function deleteTransfer(id) {
//   try {
//     const db = await openDB()
//     const tx = db.transaction(STORE, 'readwrite')
//     tx.objectStore(STORE).delete(id)
//     return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
//   } catch (e) {
//     console.warn('[transferDB] delete failed:', e)
//   }
// }

// /** Wipe all records. */
// export async function clearTransfers() {
//   try {
//     const db = await openDB()
//     const tx = db.transaction(STORE, 'readwrite')
//     tx.objectStore(STORE).clear()
//     return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
//   } catch (e) {
//     console.warn('[transferDB] clear failed:', e)
//   }
// }