import express from 'express'
import cors from 'cors'
import initSqlJs from 'sql.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { chromium } from 'playwright-core'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const DB_PATH = path.join(__dirname, 'data.db')

app.use(cors())
app.use(express.json())

let db = null

// 初始化数据库
async function initDB() {
  const SQL = await initSqlJs()

  // 如果数据库文件存在，加载它
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS library (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT,
      original_cover TEXT,
      original_title TEXT,
      original_content TEXT,
      cover_analysis TEXT,
      title_analysis TEXT,
      content_analysis TEXT,
      title_style TEXT,
      content_style TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      images TEXT,
      keywords TEXT,
      theme TEXT,
      results TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  console.log('Database initialized')
}

// 保存数据库到文件
function saveDB() {
  if (db) {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(DB_PATH, buffer)
  }
}

// 获取或创建用户
app.post('/api/users/:name', (req, res) => {
  const { name } = req.params
  const result = db.exec('SELECT * FROM users WHERE name = ?', [name])

  let user = result.length > 0 && result[0].values.length > 0
    ? { id: result[0].values[0][0], name: result[0].values[0][1] }
    : null

  if (!user) {
    const id = Date.now().toString()
    db.run('INSERT INTO users (id, name) VALUES (?, ?)', [id, name])
    user = { id, name }
    saveDB()
  }

  res.json(user)
})

// 获取用户数据
app.get('/api/users/:name/data', (req, res) => {
  const { name } = req.params
  const userResult = db.exec('SELECT id FROM users WHERE name = ?', [name])

  if (userResult.length === 0 || userResult[0].values.length === 0) {
    return res.json({ library: [], history: [] })
  }

  const userId = userResult[0].values[0][0]

  // 获取素材库
  const libraryResult = db.exec('SELECT * FROM library WHERE user_id = ? ORDER BY created_at DESC', [userId])
  const library = libraryResult.length > 0
    ? libraryResult[0].values.map(row => ({
        id: row[0],
        type: row[2],
        source: row[3],
        originalTitle: row[5],
        originalContent: row[6],
        coverAnalysis: row[7],
        titleAnalysis: row[8],
        contentAnalysis: row[9],
        titleStyle: row[10],
        contentStyle: row[11],
        createdAt: row[12]
      }))
    : []

  // 获取历史
  const historyResult = db.exec('SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC', [userId])
  const history = historyResult.length > 0
    ? historyResult[0].values.map(row => ({
        id: row[0],
        images: row[2] ? JSON.parse(row[2]) : [],
        keywords: row[3],
        theme: row[4],
        results: row[5] ? JSON.parse(row[5]) : [],
        createdAt: row[6]
      }))
    : []

  res.json({ library, history })
})

// 添加素材
app.post('/api/library', (req, res) => {
  const { userId, item } = req.body
  const id = Date.now().toString()

  db.run(`
    INSERT INTO library (id, user_id, type, source, original_cover, original_title, original_content, cover_analysis, title_analysis, content_analysis, title_style, content_style)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    item.type || 'influencer',
    item.source || '',
    item.originalCover || '',
    item.originalTitle || '',
    item.originalContent || '',
    item.coverAnalysis || '',
    item.titleAnalysis || '',
    item.contentAnalysis || '',
    item.titleStyle || '',
    item.contentStyle || ''
  ])

  saveDB()
  res.json({ id, ...item })
})

// 删除素材
app.delete('/api/library/:id', (req, res) => {
  const { id } = req.params
  db.run('DELETE FROM library WHERE id = ?', [id])
  saveDB()
  res.json({ success: true })
})

// 添加历史记录
app.post('/api/history', (req, res) => {
  const { userId, item } = req.body
  const id = Date.now().toString()

  db.run(`
    INSERT INTO history (id, user_id, images, keywords, theme, results)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    JSON.stringify(item.images || []),
    item.keywords || '',
    item.theme || '',
    JSON.stringify(item.results || [])
  ])

  saveDB()
  res.json({ id, ...item })
})

// ─── 小红书爬虫 ───────────────────────────────────────────────

const COOKIES_PATH = path.join(__dirname, 'cookies.json')

// 内存中保持登录流程的浏览器实例
let qrBrowser = null
let qrPage = null

function loadCookies() {
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'))
    } catch {
      return null
    }
  }
  return null
}

function saveCookies(cookies) {
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2))
}

// 检查登录态
app.get('/api/xhs/session', (req, res) => {
  const cookies = loadCookies()
  if (!cookies || cookies.length === 0) return res.json({ loggedIn: false })

  // 检查关键 cookie 是否存在且未过期
  const now = Date.now() / 1000
  const sessionCookie = cookies.find(c =>
    (c.name === 'web_session' || c.name === 'customer-sso-sid') &&
    c.value &&
    (!c.expires || c.expires === -1 || c.expires > now)
  )
  res.json({ loggedIn: !!sessionCookie })
})

// 启动二维码登录
app.post('/api/xhs/qr-login/start', async (req, res) => {
  try {
    if (qrBrowser) {
      await qrBrowser.close().catch(() => {})
      qrBrowser = null
      qrPage = null
    }

    qrBrowser = await chromium.launch({ headless: true, executablePath: CHROME_PATH })
    const context = await qrBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    })
    qrPage = await context.newPage()

    await qrPage.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await qrPage.waitForTimeout(3000)

    // 点击登录按钮触发二维码弹窗
    const loginBtn = qrPage.locator('text=登录').first()
    if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginBtn.click()
      await qrPage.waitForTimeout(2000)
    }

    // 截图返回给前端展示
    const screenshot = await qrPage.screenshot({ type: 'png' })
    res.json({ qrImage: screenshot.toString('base64') })
  } catch (err) {
    if (qrBrowser) await qrBrowser.close().catch(() => {})
    qrBrowser = null
    qrPage = null
    res.status(500).json({ error: err.message })
  }
})

// 轮询登录状态
app.get('/api/xhs/qr-login/status', async (req, res) => {
  if (!qrPage) {
    return res.json({ status: 'expired' })
  }

  try {
    // 通过 cookie 中是否有 user_id / web_session 来判断是否登录成功
    const cookies = await qrPage.context().cookies()
    const isLoggedIn = cookies.some(c =>
      (c.name === 'web_session' || c.name === 'user_id' || c.name === 'customer-sso-sid') && c.value
    )

    if (isLoggedIn) {
      await qrPage.waitForTimeout(500)
      const allCookies = await qrPage.context().cookies()

      // 尝试获取用户昵称
      let nickname = ''
      try {
        nickname = await qrPage.evaluate(() => {
          const el = document.querySelector('[class*="nickname"], [class*="user-name"], .username')
          return el ? el.innerText.trim() : ''
        })
      } catch {}

      saveCookies(allCookies)
      await qrBrowser.close().catch(() => {})
      qrBrowser = null
      qrPage = null

      return res.json({ status: 'confirmed', nickname })
    }

    // 返回最新截图
    const screenshot = await qrPage.screenshot({ type: 'png' })
    res.json({ status: 'waiting', qrImage: screenshot.toString('base64') })
  } catch (err) {
    res.json({ status: 'waiting' })
  }
})

// 爬取博主帖子
app.post('/api/xhs/scrape', async (req, res) => {
  const { url, count = 10 } = req.body

  if (!url) return res.status(400).json({ error: '缺少 url 参数' })

  const cookies = loadCookies()
  if (!cookies) return res.status(401).json({ error: '未登录，请先扫码登录' })

  let browser = null
  try {
    browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    })
    await context.addCookies(cookies)

    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    // 提取帖子列表（博主主页的帖子卡片）
    const postLinks = await page.evaluate((maxCount) => {
      const links = []
      // 小红书博主主页帖子链接选择器
      const selectors = [
        'a[href*="/explore/"]',
        'a[href*="/search_result/"]',
        '.note-item a',
        '[class*="note"] a',
        'section a'
      ]
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel)
        for (const el of els) {
          const href = el.getAttribute('href')
          if (href && href.includes('/explore/') && !links.includes(href)) {
            links.push(href)
          }
          if (links.length >= maxCount) break
        }
        if (links.length >= maxCount) break
      }
      return links.slice(0, maxCount)
    }, count)

    const posts = []

    for (const link of postLinks) {
      try {
        const postUrl = link.startsWith('http') ? link : `https://www.xiaohongshu.com${link}`
        const postPage = await context.newPage()
        await postPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await postPage.waitForTimeout(2000)

        const postData = await postPage.evaluate(() => {
          // 标题
          const titleEl = document.querySelector('#detail-title, .title, [class*="title"]')
          const title = titleEl ? titleEl.innerText.trim() : ''

          // 正文
          const contentEl = document.querySelector('#detail-desc, .desc, [class*="desc"], [class*="content"]')
          const content = contentEl ? contentEl.innerText.trim() : ''

          return { title, content }
        })

        if (postData.title || postData.content) {
          posts.push(postData)
        }

        await postPage.close()
      } catch {
        // 单篇失败不影响整体
      }
    }

    await browser.close()
    res.json({ posts })
  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────

// 按关键词搜索爆款帖子
app.post('/api/xhs/search', async (req, res) => {
  const { keyword, count = 5 } = req.body
  if (!keyword) return res.status(400).json({ error: '缺少 keyword 参数' })

  const cookies = loadCookies()
  if (!cookies) return res.status(401).json({ error: '未登录，请先扫码登录' })

  let browser = null
  try {
    browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH })
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    })
    await context.addCookies(cookies)

    const page = await context.newPage()
    const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=51`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    // 提取搜索结果帖子链接
    const postLinks = await page.evaluate((maxCount) => {
      const links = []
      const els = document.querySelectorAll('a[href*="/explore/"]')
      for (const el of els) {
        const href = el.getAttribute('href')
        if (href && !links.includes(href)) links.push(href)
        if (links.length >= maxCount) break
      }
      return links.slice(0, maxCount)
    }, count)

    const posts = []
    for (const link of postLinks) {
      try {
        const postUrl = link.startsWith('http') ? link : `https://www.xiaohongshu.com${link}`
        const postPage = await context.newPage()
        await postPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await postPage.waitForTimeout(2000)

        const postData = await postPage.evaluate(() => {
          const titleEl = document.querySelector('#detail-title, .title, [class*="title"]')
          const contentEl = document.querySelector('#detail-desc, .desc, [class*="desc"], [class*="content"]')
          return {
            title: titleEl ? titleEl.innerText.trim() : '',
            content: contentEl ? contentEl.innerText.trim() : ''
          }
        })

        if (postData.title || postData.content) posts.push(postData)
        await postPage.close()
      } catch {
        // 单篇失败不影响整体
      }
    }

    await browser.close()
    res.json({ posts })
  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────

// 启动服务器
async function start() {
  await initDB()
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

start().catch(console.error)