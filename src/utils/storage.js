const STORAGE_KEY = 'xiaohongshu_assistant'

export function getUserData(username) {
  const allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  return allData[username] || {
    library: [],      // 素材库
    history: []       // 生成历史
  }
}

export function saveUserData(username, data) {
  const allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  allData[username] = data
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allData))
}

export function addToLibrary(username, item) {
  const userData = getUserData(username)
  userData.library.push({
    ...item,
    id: Date.now().toString(),
    createdAt: new Date().toISOString()
  })
  saveUserData(username, userData)
}

export function removeFromLibrary(username, itemId) {
  const userData = getUserData(username)
  userData.library = userData.library.filter(item => item.id !== itemId)
  saveUserData(username, userData)
}

export function addToHistory(username, item) {
  const userData = getUserData(username)
  // 不存储 base64，只存 URL
  const historyItem = {
    ...item,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    images: item.images ? item.images.map(i => ({ url: i.url || i })) : []
  }
  userData.history.push(historyItem)
  saveUserData(username, userData)
}

export function getAllUsernames() {
  const allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  return Object.keys(allData)
}