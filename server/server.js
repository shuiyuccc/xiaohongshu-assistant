import express from 'express'
import cors from 'cors'
import initSqlJs from 'sql.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { spawn } from 'child_process'
import { chromium } from 'playwright-core'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const app = express()
const PORT = process.env.PORT || 3001
const DB_PATH = path.join(__dirname, 'data.db')
const PACHONG_DIR = path.join(ROOT_DIR, 'pachong')
const PACHONG_BRIDGE = path.join(PACHONG_DIR, 'scrape_bridge.py')
const EXCEL_READER = path.join(PACHONG_DIR, 'excel_reader.py')
const XHS_OUTPUT_DIR = path.join(PACHONG_DIR, 'xiaohongshu_notes')
const PYTHON_BIN = process.env.PYTHON_BIN || process.env.PYTHON || 'python'

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
      theme TEXT,
      note_id TEXT,
      original_cover TEXT,
      original_title TEXT,
      original_content TEXT,
      publish_date TEXT,
      likes INTEGER DEFAULT 0,
      collects INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      cover_analysis TEXT,
      title_analysis TEXT,
      content_analysis TEXT,
      title_style TEXT,
      content_style TEXT,
      viral_reason TEXT,
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
        userId: row[1],
        type: row[2],
        source: row[3],
        theme: row[4],
        noteId: row[5],
        originalCover: row[6],
        originalTitle: row[7],
        originalContent: row[8],
        publishDate: row[9],
        likes: row[10],
        collects: row[11],
        comments: row[12],
        coverAnalysis: row[13],
        titleAnalysis: row[14],
        contentAnalysis: row[15],
        titleStyle: row[16],
        contentStyle: row[17],
        viralReason: row[18],
        createdAt: row[19]
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
    INSERT INTO library (id, user_id, type, source, theme, note_id, original_cover, original_title, original_content, publish_date, likes, collects, comments, cover_analysis, title_analysis, content_analysis, title_style, content_style, viral_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    item.type || 'influencer',
    item.source || '',
    item.theme || '',
    item.noteId || '',
    item.originalCover || '',
    item.originalTitle || '',
    item.originalContent || '',
    item.publishDate || '',
    item.likes || 0,
    item.collects || 0,
    item.comments || 0,
    item.coverAnalysis || '',
    item.titleAnalysis || '',
    item.contentAnalysis || '',
    item.titleStyle || '',
    item.contentStyle || '',
    item.viralReason || ''
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

function normalizeCount(value, fallback = 10) {
  const count = Number.parseInt(value, 10)
  if (!Number.isFinite(count) || count <= 0) return fallback
  return Math.min(count, 50)
}

function getErrorMessage(stdout, stderr) {
  try {
    const parsed = JSON.parse(stdout)
    if (parsed?.error) return parsed.error
  } catch {}

  const lines = stderr
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  return lines.at(-1) || '爬虫执行失败'
}

function runPythonJson(scriptPath, args, timeoutMs = 60 * 1000) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`未找到 Python 脚本: ${scriptPath}`))
      return
    }

    const child = spawn(PYTHON_BIN, ['-X', 'utf8', scriptPath, ...args], {
      cwd: PACHONG_DIR,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8'
      }
    })

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Python 脚本执行超时'))
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', err => {
      clearTimeout(timeout)
      reject(new Error(`无法启动 Python: ${err.message}`))
    })

    child.on('close', code => {
      clearTimeout(timeout)

      if (code !== 0) {
        reject(new Error(getErrorMessage(stdout, stderr)))
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        if (parsed.error) {
          reject(new Error(parsed.error))
          return
        }
        resolve(parsed)
      } catch (err) {
        reject(new Error(`Python 结果解析失败: ${err.message}`))
      }
    })
  })
}

function runPythonXhsScraper({ url, count, sourceName = '', existingNoteIds = [] }) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PACHONG_BRIDGE)) {
      reject(new Error(`未找到 Python 爬虫桥接脚本: ${PACHONG_BRIDGE}`))
      return
    }

    fs.mkdirSync(XHS_OUTPUT_DIR, { recursive: true })

    const args = [
      '-X',
      'utf8',
      PACHONG_BRIDGE,
      '--url',
      url,
      '--count',
      String(normalizeCount(count)),
      '--source-name',
      sourceName,
      '--output-dir',
      XHS_OUTPUT_DIR,
      '--login-wait',
      '180'
    ]

    // 如果有已存在的 note_id，通过环境变量传递
    const env = {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8'
    }
    if (existingNoteIds.length > 0) {
      env.EXISTING_NOTE_IDS = existingNoteIds.join(',')
    }

    const child = spawn(PYTHON_BIN, args, {
      cwd: PACHONG_DIR,
      env
    })

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('爬虫执行超时，请减少爬取数量后重试'))
    }, 15 * 60 * 1000)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', err => {
      clearTimeout(timeout)
      reject(new Error(`无法启动 Python 爬虫: ${err.message}`))
    })

    child.on('close', code => {
      clearTimeout(timeout)

      if (code !== 0) {
        reject(new Error(getErrorMessage(stdout, stderr)))
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        if (parsed.error) {
          reject(new Error(parsed.error))
          return
        }

        resolve({
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
          outputDir: parsed.outputDir || '',
          sourceName: parsed.sourceName || sourceName
        })
      } catch (err) {
        reject(new Error(`爬虫结果解析失败: ${err.message}`))
      }
    })
  })
}

// 读取 pachong/xiaohongshu_notes 下的博主 Excel 列表
app.get('/api/xhs/excel-bloggers', async (req, res) => {
  try {
    const result = await runPythonJson(EXCEL_READER, [
      '--mode',
      'list',
      '--output-dir',
      XHS_OUTPUT_DIR
    ])
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 读取指定博主 Excel 中的标题和正文，供内容生成参考
app.get('/api/xhs/excel-bloggers/:name/posts', async (req, res) => {
  const { name } = req.params
  const readAll = req.query.limit === 'all'
  const limit = readAll ? null : normalizeCount(req.query.limit, 30)

  try {
    const args = [
      '--mode',
      'read',
      '--output-dir',
      XHS_OUTPUT_DIR,
      '--name',
      name
    ]

    if (!readAll) {
      args.push('--limit', String(limit))
    }

    const result = await runPythonJson(EXCEL_READER, args)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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

    qrBrowser = await chromium.launch({ headless: false, executablePath: CHROME_PATH })
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

// 获取指定博主已存在的 note_id 列表（用于增量爬取）
app.get('/api/xhs/existing-notes', (req, res) => {
  const { userId, source } = req.query
  if (!userId || !source) {
    return res.status(400).json({ error: '缺少 userId 或 source 参数' })
  }

  try {
    const result = db.exec(
      'SELECT note_id FROM library WHERE user_id = ? AND source = ? AND note_id IS NOT NULL AND note_id != ""',
      [userId, source]
    )
    const noteIds = result.length > 0 ? result[0].values.map(row => row[0]) : []
    res.json({ noteIds })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 爬取博主帖子：使用 pachong 目录里的 Python 爬虫逻辑
app.post('/api/xhs/scrape', async (req, res) => {
  const { url, count = 10, existingNoteIds = [] } = req.body

  if (!url) return res.status(400).json({ error: '缺少 url 参数' })

  try {
    const result = await runPythonXhsScraper({ url, count, sourceName: url, existingNoteIds })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────

// 按关键词搜索爆款帖子：同样交给 Python 爬虫处理搜索结果页
app.post('/api/xhs/search', async (req, res) => {
  const { keyword, count = 5 } = req.body
  if (!keyword) return res.status(400).json({ error: '缺少 keyword 参数' })

  const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=51`

  try {
    const result = await runPythonXhsScraper({ url: searchUrl, count, sourceName: keyword })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


// 启动服务器
async function start() {
  await initDB()
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

start().catch(console.error)
