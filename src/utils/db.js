// IndexedDB 封装
const DB_NAME = 'xiaohongshu_assistant'
const DB_VERSION = 1
const STORE_NAME = 'user_data'

let dbInstance = null

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'username' })
      }
    }
  })
}

// 获取用户数据
export async function getUserData(username) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(username)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.data || { library: [], history: [] })
      } else {
        resolve({ library: [], history: [] })
      }
    }
  })
}

// 保存用户数据
export async function saveUserData(username, data) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put({ username, data })

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// 添加到素材库
export async function addToLibrary(username, item) {
  const userData = await getUserData(username)
  userData.library = userData.library || []
  userData.library.push({
    ...item,
    id: Date.now().toString(),
    createdAt: new Date().toISOString()
  })
  await saveUserData(username, userData)
}

// 从素材库删除
export async function removeFromLibrary(username, itemId) {
  const userData = await getUserData(username)
  userData.library = (userData.library || []).filter(item => item.id !== itemId)
  await saveUserData(username, userData)
}

// 添加到历史记录
export async function addToHistory(username, item) {
  const userData = await getUserData(username)
  userData.history = userData.history || []

  // 只存 URL，不存 base64
  const historyItem = {
    ...item,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    images: item.images ? item.images.map(i => ({ url: typeof i === 'string' ? i : i.url })) : []
  }

  userData.history.push(historyItem)

  // 限制历史记录最多存 50 条
  if (userData.history.length > 50) {
    userData.history = userData.history.slice(-50)
  }

  await saveUserData(username, userData)
}

// 获取所有用户名列表
export async function getAllUsernames() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAllKeys()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || [])
  })
}

// 清除用户数据
export async function clearUserData(username) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(username)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// 清除所有数据
export async function clearAll() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}