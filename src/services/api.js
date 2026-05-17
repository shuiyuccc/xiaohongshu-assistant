// API 服务 - 连接后端 SQLite 数据库

const API_BASE = 'http://localhost:3001/api'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.statusText}`)
  }

  return response.json()
}

// 获取或创建用户
export async function getOrCreateUser(username) {
  return request(`/users/${encodeURIComponent(username)}`, { method: 'POST' })
}

// 获取用户数据
export async function getUserData(username) {
  return request(`/users/${encodeURIComponent(username)}/data`)
}

// 添加素材到素材库
export async function addToLibrary(userId, item) {
  return request('/library', {
    method: 'POST',
    body: JSON.stringify({ userId, item })
  })
}

// 删除素材
export async function removeFromLibrary(id) {
  return request(`/library/${id}`, { method: 'DELETE' })
}

// 添加历史记录
export async function addToHistory(userId, item) {
  return request('/history', {
    method: 'POST',
    body: JSON.stringify({ userId, item })
  })
}

// ─── 小红书爬虫 ───────────────────────────────────────────────

export async function getXhsSession() {
  return request('/xhs/session')
}

export async function startQrLogin() {
  return request('/xhs/qr-login/start', { method: 'POST' })
}

export async function getQrLoginStatus() {
  return request('/xhs/qr-login/status')
}

export async function scrapeInfluencer(url, count) {
  return request('/xhs/scrape', {
    method: 'POST',
    body: JSON.stringify({ url, count })
  })
}

export async function searchViral(keyword, count) {
  return request('/xhs/search', {
    method: 'POST',
    body: JSON.stringify({ keyword, count })
  })
}