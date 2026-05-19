import express from 'express'
import cors from 'cors'
import initSqlJs from 'sql.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { spawn } from 'child_process'
import { chromium } from 'playwright-core'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

// AI 配置（用于生成风格文件）
const AI_API_KEY = process.env.AI_API_KEY || 'sk-74e76ce284da4367b6554a9eb4f10f97'
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const AI_MODEL = process.env.AI_MODEL || 'qwen-vl-plus'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const app = express()
const PORT = process.env.PORT || 3001
const DB_PATH = path.join(__dirname, 'data.db')
const PACHONG_DIR = path.join(ROOT_DIR, 'pachong')
const PACHONG_BRIDGE = path.join(PACHONG_DIR, 'scrape_bridge.py')
const EXCEL_READER = path.join(PACHONG_DIR, 'excel_reader.py')
const XHS_OUTPUT_DIR = path.join(PACHONG_DIR, 'xiaohongshu_notes')
const GENERATION_ASSETS_DIR = path.join(__dirname, 'generation_assets')
const PYTHON_BIN = process.env.PYTHON_BIN || process.env.PYTHON || 'python'
const STYLE_PROFILE_JSON = 'style_profile.json'
const STYLE_PROFILE_MD = 'style_profile.md'
const COVER_STYLE_PROFILE_JSON = 'cover_style_profile.json'
const COVER_STYLE_PROFILE_MD = 'cover_style_profile.md'

app.use(cors())
app.use(express.json({ limit: '80mb' }))
app.use('/generation_assets', express.static(GENERATION_ASSETS_DIR))

let db = null

function migrateTableColumns(tableName, columns) {
  const info = db.exec(`PRAGMA table_info(${tableName})`)
  const existingColumns = new Set(
    info.length > 0 ? info[0].values.map(row => row[1]) : []
  )
  let changed = false

  for (const [columnName, columnType] of Object.entries(columns)) {
    if (!existingColumns.has(columnName)) {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
      changed = true
    }
  }

  return changed
}

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

  const libraryMigrated = migrateTableColumns('library', {
    source: 'TEXT',
    theme: 'TEXT',
    note_id: 'TEXT',
    original_cover: 'TEXT',
    original_title: 'TEXT',
    original_content: 'TEXT',
    publish_date: 'TEXT',
    likes: 'INTEGER DEFAULT 0',
    collects: 'INTEGER DEFAULT 0',
    comments: 'INTEGER DEFAULT 0',
    cover_analysis: 'TEXT',
    title_analysis: 'TEXT',
    content_analysis: 'TEXT',
    title_style: 'TEXT',
    content_style: 'TEXT',
    viral_reason: 'TEXT'
  })
  if (libraryMigrated) saveDB()

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      images TEXT,
      keywords TEXT,
      theme TEXT,
      results TEXT,
      session_id TEXT,
      summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  const historyMigrated = migrateTableColumns('history', {
    session_id: 'TEXT',
    summary: 'TEXT'
  })
  if (historyMigrated) saveDB()

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
  const libraryResult = db.exec(`
    SELECT id, user_id, type, source, theme, note_id, original_cover, original_title, original_content,
           publish_date, likes, collects, comments, cover_analysis, title_analysis, content_analysis,
           title_style, content_style, viral_reason, created_at
    FROM library
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [userId])
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
  const historyResult = db.exec(`
    SELECT id, images, keywords, theme, results, created_at, session_id, summary
    FROM history
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [userId])
  const history = historyResult.length > 0
    ? historyResult[0].values.map(row => ({
        id: row[0],
        images: row[1] ? JSON.parse(row[1]) : [],
        keywords: row[2],
        theme: row[3],
        results: row[4] ? JSON.parse(row[4]) : [],
        createdAt: row[5],
        sessionId: row[6] || '',
        summary: row[7] || ''
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
    INSERT INTO history (id, user_id, images, keywords, theme, results, session_id, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    JSON.stringify(item.images || []),
    item.keywords || '',
    item.theme || '',
    JSON.stringify(item.results || []),
    item.sessionId || '',
    item.summary || ''
  ])

  saveDB()
  res.json({ id, ...item })
})

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function safeFileName(name) {
  const cleaned = String(name || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return cleaned || 'image'
}

function getImageExtensionFromMime(mimeType) {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'jpg'
}

function parseImagePayload(image) {
  const url = image?.url || ''
  const base64 = image?.base64 || ''
  const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1],
      buffer: Buffer.from(dataUrlMatch[2], 'base64')
    }
  }
  if (base64) {
    const mimeType = image?.mimeType || 'image/jpeg'
    const cleanBase64 = base64.includes(',') ? base64.split(',').pop() : base64
    return {
      mimeType,
      buffer: Buffer.from(cleanBase64, 'base64')
    }
  }
  return null
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function formatImageProfileMarkdown(profile) {
  return `# 图片 ${profile.imageIndex || ''}

- 图片ID：${profile.imageId || ''}
- 文件名：${profile.name || ''}
- 本地图片：${profile.imagePath || ''}

## 综合描述
${profile.description || ''}

## 结构化分析
- 主体：${profile.subject || ''}
- 场景：${profile.scene || ''}
- 光线：${profile.light || ''}
- 构图：${profile.composition || ''}
- 色彩：${profile.color || ''}
- 情绪：${profile.emotion || ''}
- 人物状态：${profile.people || ''}
- 画面亮点：${profile.highlights || ''}
- 摄影美学：${profile.aesthetics || ''}
- 画面细节：${profile.details || ''}
- 风险点：${profile.risks || ''}
`
}

function formatSelectedCoversMarkdown(items) {
  const lines = ['# 入选封面', '']
  items.forEach((item, index) => {
    lines.push(`## ${index + 1}. 图片 ${item.imageIndex || ''}`)
    lines.push('')
    lines.push(`- 图片ID：${item.imageId || ''}`)
    lines.push(`- 入选理由：${item.selectedReason || ''}`)
    lines.push('')
  })
  return lines.join('\n')
}

function formatResultsMarkdown(items) {
  const lines = ['# 生成结果', '']
  items.forEach((item, index) => {
    lines.push(`## ${index + 1}. 图片 ${item.imageIndex || ''}`)
    lines.push('')
    lines.push(`- 图片ID：${item.imageId || ''}`)
    lines.push(`- 图片描述文件：${item.imageProfilePath || ''}`)
    lines.push('')
    lines.push(`### 标题`)
    lines.push(item.title || '')
    lines.push('')
    lines.push(`### 正文`)
    lines.push(item.content || '')
    lines.push('')
    if (item.coverReason) {
      lines.push(`### 选封面理由`)
      lines.push(item.coverReason)
      lines.push('')
    }
    if (item.reason) {
      lines.push(`### 生成理由`)
      lines.push(item.reason)
      lines.push('')
    }
  })
  return lines.join('\n')
}

function safePromptBaseName(promptItem, index) {
  const step = safePathName(promptItem.step || 'prompt')
  const imagePart = promptItem.imageIndex ? `_image_${padNumber(promptItem.imageIndex)}` : ''
  return `${padNumber(index + 1)}_${step}${imagePart}`
}

function formatPromptMarkdown(promptItem) {
  return `# ${promptItem.title || promptItem.step || 'Prompt'}

- 步骤：${promptItem.step || ''}
- 创建时间：${promptItem.createdAt || ''}
- 图片ID：${promptItem.imageId || ''}
- 图片编号：${promptItem.imageIndex || ''}
- 批次：${promptItem.batchIndex || ''}
- 相关图片：${Array.isArray(promptItem.imageIndexes) ? promptItem.imageIndexes.join(', ') : ''}

## Prompt
\`\`\`text
${promptItem.prompt || ''}
\`\`\`

${promptItem.response ? `## AI Response
\`\`\`text
${promptItem.response}
\`\`\`
` : ''}
${promptItem.error ? `## Error
\`\`\`text
${promptItem.error}
\`\`\`
` : ''}`
}

function writePromptFiles(promptsDir, promptItem, index) {
  fs.mkdirSync(promptsDir, { recursive: true })
  const baseName = safePromptBaseName(promptItem, index)
  fs.writeFileSync(path.join(promptsDir, `${baseName}.md`), formatPromptMarkdown(promptItem), 'utf-8')
  fs.writeFileSync(path.join(promptsDir, `${baseName}.txt`), promptItem.prompt || '', 'utf-8')
}

function findGenerationSessionDir(sessionId) {
  const safeSessionId = safePathName(sessionId)
  if (!fs.existsSync(GENERATION_ASSETS_DIR)) return null
  for (const userDir of fs.readdirSync(GENERATION_ASSETS_DIR)) {
    const candidate = path.join(GENERATION_ASSETS_DIR, userDir, safeSessionId)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }
  }
  return null
}

// 保存一次生成过程的图片、图片描述、选中封面和结果文件
app.post('/api/generation-sessions', (req, res) => {
  try {
    const {
      userId = 'anonymous',
      images = [],
      imageProfiles = [],
      selectedCovers = [],
      results = [],
      prompts = [],
      manifest = {}
    } = req.body || {}

    const now = new Date()
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_')
    const sessionId = `session_${stamp}_${Date.now().toString(36)}`
    const userDirName = safePathName(userId)
    const sessionDir = path.join(GENERATION_ASSETS_DIR, userDirName, sessionId)
    const imagesDir = path.join(sessionDir, 'images')
    const profilesDir = path.join(sessionDir, 'image_profiles')
    const promptsDir = path.join(sessionDir, 'prompts')

    fs.mkdirSync(imagesDir, { recursive: true })
    fs.mkdirSync(profilesDir, { recursive: true })
    fs.mkdirSync(promptsDir, { recursive: true })

    const savedImages = images.map((image, index) => {
      const imageIndex = image.imageIndex || index + 1
      const parsed = parseImagePayload(image)
      const ext = parsed ? getImageExtensionFromMime(parsed.mimeType) : 'jpg'
      const originalBaseName = safeFileName(path.parse(image.name || `image_${imageIndex}`).name)
      const filename = `${padNumber(imageIndex)}_${originalBaseName}.${ext}`
      const filePath = path.join(imagesDir, filename)
      if (parsed) {
        fs.writeFileSync(filePath, parsed.buffer)
      }
      return {
        imageId: String(image.id || image.imageId || `image-${imageIndex}`),
        imageIndex,
        name: image.name || filename,
        filename,
        relativePath: path.relative(sessionDir, filePath).replace(/\\/g, '/'),
        url: `/generation_assets/${encodeURIComponent(userDirName)}/${encodeURIComponent(sessionId)}/images/${encodeURIComponent(filename)}`
      }
    })

    const imagePathById = new Map(savedImages.map(image => [String(image.imageId), image.relativePath]))
    const profileFiles = imageProfiles.map((profile, index) => {
      const imageIndex = profile.imageIndex || index + 1
      const filename = `${padNumber(imageIndex)}.json`
      const filePath = path.join(profilesDir, filename)
      const payload = {
        ...profile,
        imageId: String(profile.imageId || `image-${imageIndex}`),
        imageIndex,
        imagePath: imagePathById.get(String(profile.imageId)) || ''
      }
      writeJsonFile(filePath, payload)
      fs.writeFileSync(path.join(profilesDir, `${padNumber(imageIndex)}.md`), formatImageProfileMarkdown(payload), 'utf-8')
      return {
        imageId: payload.imageId,
        imageIndex,
        relativePath: path.relative(sessionDir, filePath).replace(/\\/g, '/')
      }
    })

    const profilePathById = new Map(profileFiles.map(profile => [String(profile.imageId), profile.relativePath]))
    const normalizedSelected = selectedCovers.map(item => ({
      ...item,
      imageProfilePath: profilePathById.get(String(item.imageId)) || ''
    }))
    const normalizedResults = results.map(item => ({
      ...item,
      imageProfilePath: profilePathById.get(String(item.imageId)) || ''
    }))

    const manifestPayload = {
      sessionId,
      userId,
      createdAt: now.toISOString(),
      imageCount: images.length,
      selectedCount: selectedCovers.length,
      resultCount: results.length,
      ...manifest
    }

    writeJsonFile(path.join(sessionDir, 'manifest.json'), manifestPayload)
    writeJsonFile(path.join(sessionDir, 'selected_covers.json'), normalizedSelected)
    fs.writeFileSync(path.join(sessionDir, 'selected_covers.md'), formatSelectedCoversMarkdown(normalizedSelected), 'utf-8')
    writeJsonFile(path.join(sessionDir, 'results.json'), normalizedResults)
    fs.writeFileSync(path.join(sessionDir, 'results.md'), formatResultsMarkdown(normalizedResults), 'utf-8')
    prompts.forEach((promptItem, index) => writePromptFiles(promptsDir, promptItem, index))

    res.json({
      sessionId,
      sessionDir,
      manifest: manifestPayload,
      images: savedImages,
      imageProfiles: profileFiles
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/generation-sessions/:id', (req, res) => {
  try {
    const sessionDir = findGenerationSessionDir(req.params.id)
    if (!sessionDir) return res.status(404).json({ error: '生成素材包不存在' })

    const readJson = (name, fallback) => {
      const filePath = path.join(sessionDir, name)
      return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : fallback
    }

    const profilesDir = path.join(sessionDir, 'image_profiles')
    const promptsDir = path.join(sessionDir, 'prompts')
    const imageProfiles = fs.existsSync(profilesDir)
      ? fs.readdirSync(profilesDir)
          .filter(name => name.endsWith('.json'))
          .sort()
          .map(name => JSON.parse(fs.readFileSync(path.join(profilesDir, name), 'utf-8')))
      : []

    res.json({
      sessionId: req.params.id,
      sessionDir,
      manifest: readJson('manifest.json', {}),
      imageProfiles,
      selectedCovers: readJson('selected_covers.json', []),
      results: readJson('results.json', []),
      prompts: fs.existsSync(promptsDir)
        ? fs.readdirSync(promptsDir).filter(name => name.endsWith('.md')).sort()
        : []
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/generation-sessions/:id/prompts', (req, res) => {
  try {
    const sessionDir = findGenerationSessionDir(req.params.id)
    if (!sessionDir) return res.status(404).json({ error: '生成素材包不存在' })

    const promptsDir = path.join(sessionDir, 'prompts')
    fs.mkdirSync(promptsDir, { recursive: true })
    const existingCount = fs.readdirSync(promptsDir).filter(name => name.endsWith('.md')).length
    const promptItems = Array.isArray(req.body?.prompts)
      ? req.body.prompts
      : [req.body?.prompt].filter(Boolean)

    promptItems.forEach((promptItem, index) => {
      writePromptFiles(promptsDir, promptItem, existingCount + index)
    })

    res.json({ success: true, savedCount: promptItems.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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

function runPythonXhsScraper({ url, count, sourceName = '', existingNoteIds = [], downloadMedia = false }) {
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

    if (downloadMedia) {
      args.push('--download-media')
    } else {
      args.push('--no-download-media')
    }

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
          bloggerName: parsed.bloggerName || '',
          sourceName: parsed.sourceName || parsed.bloggerName || sourceName,
          skippedCount: parsed.skippedCount || 0,
          knownExistingCount: parsed.knownExistingCount || 0,
          notesDir: parsed.notesDir || ''
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

    args.push('--limit', readAll ? 'all' : String(limit))

    const result = await runPythonJson(EXCEL_READER, args)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function safePathName(name) {
  return String(name || 'unknown').replace(/[<>:"/\\|?*]/g, '_').trim() || 'unknown'
}

function getBloggerDir(bloggerName, outputDir = '') {
  return outputDir ? path.resolve(outputDir) : path.join(XHS_OUTPUT_DIR, safePathName(bloggerName))
}

// 获取博主风格文件路径
function getStyleFilePath(bloggerName, outputDir = '') {
  const bloggerDir = getBloggerDir(bloggerName, outputDir)
  return path.join(bloggerDir, STYLE_PROFILE_JSON)
}

function getCoverStyleFilePath(bloggerName, outputDir = '') {
  const bloggerDir = getBloggerDir(bloggerName, outputDir)
  return path.join(bloggerDir, COVER_STYLE_PROFILE_JSON)
}

function getImageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

function imageFileToDataUrl(filePath) {
  const data = fs.readFileSync(filePath).toString('base64')
  return `data:${getImageMimeType(filePath)};base64,${data}`
}

function getNoteFolders(bloggerDir) {
  const notesDir = path.join(bloggerDir, 'notes')
  if (!fs.existsSync(notesDir)) return []

  return fs.readdirSync(notesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(notesDir, entry.name))
    .filter(noteDir => fs.existsSync(path.join(noteDir, 'note.json')))
}

function readNotePayload(noteDir) {
  return JSON.parse(fs.readFileSync(path.join(noteDir, 'note.json'), 'utf-8'))
}

function getDownloadedImagePaths(noteDir, notePayload) {
  return (notePayload.downloadedImages || [])
    .map(relativePath => path.join(noteDir, relativePath))
    .filter(filePath => fs.existsSync(filePath))
}

async function readAllExcelPosts(bloggerName) {
  const result = await runPythonJson(EXCEL_READER, [
    '--mode',
    'read',
    '--output-dir',
    XHS_OUTPUT_DIR,
    '--name',
    bloggerName,
    '--limit',
    'all'
  ])

  return Array.isArray(result.posts) ? result.posts : []
}

async function readAllKnownExcelNoteIds() {
  const noteIds = new Set()
  const listResult = await runPythonJson(EXCEL_READER, [
    '--mode',
    'list',
    '--output-dir',
    XHS_OUTPUT_DIR
  ])

  const bloggers = Array.isArray(listResult.bloggers) ? listResult.bloggers : []
  for (const blogger of bloggers) {
    const posts = await readAllExcelPosts(blogger.name).catch(() => [])
    for (const post of posts) {
      if (post.noteId) noteIds.add(post.noteId)
    }
  }

  return [...noteIds]
}

function uniquePosts(posts) {
  const seen = new Set()
  return (posts || []).filter(post => {
    const title = (post.title || post.originalTitle || '').trim()
    const content = (post.content || post.originalContent || '').trim()
    const key = `${title}\n${content}`
    if ((!title && !content) || seen.has(key)) return false
    seen.add(key)
    return true
  }).map(post => ({
    title: post.title || post.originalTitle || '',
    content: post.content || post.originalContent || ''
  }))
}

function average(numbers) {
  if (!numbers.length) return 0
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
}

function buildLocalStyleSummary(bloggerName, posts) {
  const usablePosts = uniquePosts(posts)
  const titles = usablePosts.map(post => post.title).filter(Boolean)
  const contents = usablePosts.map(post => post.content).filter(Boolean)
  const titleLengths = titles.map(title => title.length)
  const contentLengths = contents.map(content => content.length)
  const questionCount = titles.filter(title => /[?？]/.test(title)).length
  const exclaimCount = titles.filter(title => /[!！]/.test(title)).length
  const emojiCount = contents.filter(content => /\p{Extended_Pictographic}/u.test(content)).length
  const hashtagCount = contents.reduce((count, content) => count + (content.match(/#[^\s#]+/g) || []).length, 0)
  const shortLineCount = contents.reduce((count, content) => {
    return count + content.split(/\r?\n/).filter(line => line.trim() && line.trim().length <= 28).length
  }, 0)
  const openingSamples = contents
    .map(content => content.split(/\r?\n/).find(line => line.trim()) || '')
    .filter(Boolean)
    .slice(0, 5)

  return `【博主】${bloggerName}
【素材范围】共参考 ${usablePosts.length} 篇标题和正文。

1. 标题撰写特征
- 标题平均长度约 ${average(titleLengths)} 字，常用短句直接抛出场景、结果或情绪点。
- 疑问标题占 ${titles.length ? Math.round((questionCount / titles.length) * 100) : 0}%，感叹标题占 ${titles.length ? Math.round((exclaimCount / titles.length) * 100) : 0}%，适合用反问、惊喜感或明确判断做开头钩子。
- 仿写时优先保留“具体场景 + 情绪/结果”的标题结构，避免直接复用原始标题中的完整表达。

2. 正文撰写特征
- 正文平均长度约 ${average(contentLengths)} 字，整体更适合口语化表达，重点围绕真实感受、拍摄/体验细节和结果反馈展开。
- 短行累计约 ${shortLineCount} 行，说明换行节奏较强，仿写时可以用短段落推进，不要写成大段说明文。
- emoji 出现于 ${contents.length ? Math.round((emojiCount / contents.length) * 100) : 0}% 的正文，话题标签累计约 ${hashtagCount} 个；生成内容时可适量使用，但以自然贴合语气为准。

3. 常见开头方式
${openingSamples.length ? openingSamples.map(line => `- ${line}`).join('\n') : '- 以场景、结果、感受或直接判断切入。'}

4. 后续仿写注意事项
- 学习句式、语气、段落节奏和选题切入方式，不要照搬原标题或正文连续完整句。
- 新内容要像该博主基于新素材新写的一篇，而不是对历史素材做摘要。`
}

function saveBloggerStyleProfile({ bloggerName, posts, style, source, outputDir = '' }) {
  const cleanPosts = uniquePosts(posts)
  const safeName = safePathName(bloggerName)
  const bloggerDir = getBloggerDir(safeName, outputDir)
  fs.mkdirSync(bloggerDir, { recursive: true })

  const styleData = {
    bloggerName,
    style,
    postCount: cleanPosts.length,
    source,
    updatedAt: new Date().toISOString()
  }

  const jsonPath = path.join(bloggerDir, STYLE_PROFILE_JSON)
  fs.writeFileSync(jsonPath, JSON.stringify(styleData, null, 2), 'utf-8')

  const markdown = `# ${bloggerName} 写作风格总结

- 更新时间：${styleData.updatedAt}
- 参考素材数：${styleData.postCount}
- 生成方式：${source === 'ai' ? 'AI 分析' : source === 'manual' ? '手动保存' : '本地兜底分析'}

${style}
`
  const mdPath = path.join(bloggerDir, STYLE_PROFILE_MD)
  fs.writeFileSync(mdPath, markdown, 'utf-8')

  return { ...styleData, jsonPath, mdPath }
}

async function generateAndSaveBloggerStyle(bloggerName, posts, outputDir = '') {
  const cleanPosts = uniquePosts(posts)
  if (!bloggerName || cleanPosts.length === 0) return null

  let source = 'ai'
  let style = await generateBloggerStyle(bloggerName, cleanPosts)

  if (!style) {
    source = 'local-fallback'
    style = buildLocalStyleSummary(bloggerName, cleanPosts)
  }

  return saveBloggerStyleProfile({ bloggerName, posts: cleanPosts, style, source, outputDir })
}

async function analyzeNoteCover(noteDir) {
  const analysisJsonPath = path.join(noteDir, 'cover_analysis.json')
  const analysisMdPath = path.join(noteDir, 'cover_analysis.md')

  if (fs.existsSync(analysisJsonPath)) {
    return JSON.parse(fs.readFileSync(analysisJsonPath, 'utf-8'))
  }

  const note = readNotePayload(noteDir)
  const imagePaths = getDownloadedImagePaths(noteDir, note).slice(0, 5)
  if (imagePaths.length === 0) return null

  let source = 'ai'
  let analysis = ''

  try {
    const imageContents = imagePaths.map(filePath => ({
      type: 'image_url',
      image_url: { url: imageFileToDataUrl(filePath) }
    }))

    const prompt = `你是一名小红书封面图分析师。下面是一篇小红书笔记的图片组，图片1是原笔记使用的封面图，请对比图片1和后续图片，分析为什么博主会把图片1作为封面。

笔记标题：${note.title || ''}
笔记正文：${note.content || ''}

请输出结构化分析：
1. 封面图核心优势：主体、人物表情/动作、情绪张力、场景、构图、光线、色彩、缩略图辨识度。
2. 为什么不是其他图片：逐张说明图片2、图片3等在封面吸引力上的弱点。
3. 可复用封面规律：后续从用户上传图片里选封面时，应优先选择什么特征。
4. 适合搭配的标题方向：给出2-3个方向，不要创作完整文案。

只分析封面选择，不要改写正文。`

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              ...imageContents,
              { type: 'text', text: prompt }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`AI API 错误: ${response.status}`)
    }

    const data = await response.json()
    analysis = data.choices[0].message.content
  } catch (err) {
    source = 'local-fallback'
    analysis = `1. 封面图核心优势
- 该笔记默认将第1张作为封面。后续选图时优先学习第1张相对其他图片在主体清晰、构图完整、光线氛围和缩略图辨识度上的优势。

2. 为什么不是其他图片
- 其他图片需要重点比较主体是否更弱、画面是否更杂、情绪是否不够直接、是否不适合承载标题。

3. 可复用封面规律
- 优先选择主体明确、情绪直接、画面干净、有光线记忆点、能在小红书信息流缩略图中一眼看懂的图片。`
    console.error('[封面分析] 单篇分析失败，使用兜底:', err)
  }

  const payload = {
    noteId: note.noteId || path.basename(noteDir),
    title: note.title || '',
    imageCount: imagePaths.length,
    coverImage: note.coverImage || '',
    analysis,
    source,
    updatedAt: new Date().toISOString()
  }

  fs.writeFileSync(analysisJsonPath, JSON.stringify(payload, null, 2), 'utf-8')
  fs.writeFileSync(
    analysisMdPath,
    `# 封面选择分析

- 笔记：${payload.title}
- 图片数：${payload.imageCount}
- 生成方式：${source === 'ai' ? 'AI 分析' : '本地兜底分析'}
- 更新时间：${payload.updatedAt}

${analysis}
`,
    'utf-8'
  )

  return payload
}

async function generateBloggerCoverStyle(bloggerName, outputDir = '') {
  const bloggerDir = getBloggerDir(bloggerName, outputDir)
  const noteFolders = getNoteFolders(bloggerDir)
  if (noteFolders.length === 0) return null

  const analyses = []
  for (const noteDir of noteFolders) {
    const analysis = await analyzeNoteCover(noteDir)
    if (analysis) analyses.push(analysis)
  }

  if (analyses.length === 0) return null

  const analysisText = analyses.map((item, index) => {
    return `【笔记${index + 1}】${item.title}
${item.analysis}`
  }).join('\n\n')

  let source = 'ai'
  let style = ''

  try {
    const prompt = `你是一名小红书封面策略分析师。请基于下面这位博主多篇笔记的封面选择分析，总结出可用于后续从用户上传图片中选择封面的「封面风格规律」。

请重点总结：
1. 这个博主倾向选择什么样的图片做封面：人物、场景、情绪、构图、光线、色彩、主体距离。
2. 这些封面为什么更容易让人点进去。
3. 后续用户上传多张图片时，应该按什么优先级选封面。
4. 哪类图片应该避免选为封面。

${analysisText}

输出控制在 900 字以内，只输出封面风格总结。`

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      throw new Error(`AI API 错误: ${response.status}`)
    }

    const data = await response.json()
    style = data.choices[0].message.content
  } catch (err) {
    source = 'local-fallback'
    style = `【封面风格规律】
- 优先选择主体清晰、人物或关键场景一眼可辨认的图片。
- 优先选择有情绪张力、光线记忆点、画面干净、适合小红书缩略图阅读的图片。
- 如果多张图片都好看，优先选更能承接标题钩子、更有故事感或更有点击好奇心的一张。
- 避免选择主体太小、画面太杂、光线过暗且没有情绪点、裁切后信息不完整的图片。`
    console.error('[封面分析] 博主封面风格汇总失败，使用兜底:', err)
  }

  const payload = {
    bloggerName,
    style,
    noteCount: analyses.length,
    source,
    updatedAt: new Date().toISOString()
  }

  const jsonPath = path.join(bloggerDir, COVER_STYLE_PROFILE_JSON)
  const mdPath = path.join(bloggerDir, COVER_STYLE_PROFILE_MD)
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8')
  fs.writeFileSync(
    mdPath,
    `# ${bloggerName} 封面风格总结

- 更新时间：${payload.updatedAt}
- 参考笔记数：${payload.noteCount}
- 生成方式：${source === 'ai' ? 'AI 分析' : '本地兜底分析'}

${style}
`,
    'utf-8'
  )

  return { ...payload, jsonPath, mdPath }
}

// 读取博主风格文件
app.get('/api/xhs/bloggers/:name/style', (req, res) => {
  const { name } = req.params
  const styleFilePath = getStyleFilePath(name)

  try {
    if (fs.existsSync(styleFilePath)) {
      const content = fs.readFileSync(styleFilePath, 'utf-8')
      const styleData = JSON.parse(content)
      res.json({
        exists: true,
        style: styleData.style,
        updatedAt: styleData.updatedAt
      })
    } else {
      res.json({ exists: false, style: null })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 保存/更新博主风格文件
app.post('/api/xhs/bloggers/:name/style', (req, res) => {
  const { name } = req.params
  const { style } = req.body

  if (!style) {
    return res.status(400).json({ error: '缺少 style 参数' })
  }

  try {
    const styleData = saveBloggerStyleProfile({
      bloggerName: name,
      posts: [],
      style,
      source: 'manual'
    })
    res.json({ success: true, updatedAt: styleData.updatedAt })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 基于已保存的博主 Excel 重新生成风格文件
app.post('/api/xhs/bloggers/:name/style/generate', async (req, res) => {
  const { name } = req.params

  try {
    const posts = await readAllExcelPosts(name)
    if (posts.length === 0) {
      return res.status(400).json({ error: '该博主没有可用于分析的标题和正文' })
    }

    const styleProfile = await generateAndSaveBloggerStyle(name, posts)
    res.json({
      success: true,
      styleProfile: {
        jsonPath: styleProfile.jsonPath,
        mdPath: styleProfile.mdPath,
        postCount: styleProfile.postCount,
        style: styleProfile.style,
        source: styleProfile.source,
        updatedAt: styleProfile.updatedAt
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 读取博主封面风格文件
app.get('/api/xhs/bloggers/:name/cover-style', (req, res) => {
  const { name } = req.params
  const coverStyleFilePath = getCoverStyleFilePath(name)

  try {
    if (fs.existsSync(coverStyleFilePath)) {
      const content = fs.readFileSync(coverStyleFilePath, 'utf-8')
      const coverStyleData = JSON.parse(content)
      res.json({
        exists: true,
        style: coverStyleData.style,
        noteCount: coverStyleData.noteCount,
        updatedAt: coverStyleData.updatedAt
      })
    } else {
      res.json({ exists: false, style: null })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 调用 AI 生成博主风格总结
async function generateBloggerStyle(bloggerName, posts) {
  if (!AI_API_KEY || posts.length === 0) {
    return null
  }

  // 构建素材文本
  const samples = posts.slice(0, 30).map((post, index) => {
    return `【素材${index + 1}】
标题：${post.title || ''}
正文：${post.content || ''}`
  }).join('\n\n')

  const prompt = `你是一名小红书文案风格分析师。请基于下面这位博主的所有标题和正文，提取可用于后续仿写的「风格素材库」。

请深度分析，提取具体可复用的元素，不要泛泛而谈。

## 一、高频词汇库
从所有标题和正文中提取：

1. **情绪词**（出现2次以上的情绪表达，如：绝了、封神、心动、治愈、太美了、谁懂啊）
   - 列出至少5个高频情绪词

2. **场景词**（常用的场景/元素描述，如：晨袍、接亲、光影、氛围感、first look）
   - 列出至少5个高频场景词

3. **钩子词**（用来吸引点击的关键词，如：被问爆、救命、真的、后悔没早点）
   - 列出至少3个高频钩子词

4. **动作词**（描述拍摄/记录的动词，如：抓拍、定格、记录、捕捉）
   - 列出至少3个高频动作词

## 二、句式模板库
提取3-5个博主最爱用的句式结构，用{X}/{Y}/{Z}表示可变部分：

示例格式：
- 模板1："{情绪词}！{场景}的{元素}真的{形容词}"
- 模板2："谁懂啊！{动作}的{场景}，{人群}都{反应}了"
- 模板3："被{人群}问爆的{场景}，{形容词}到{情绪词}"

请根据实际素材提取真实的句式模板。

## 三、语气特征

1. **标点习惯**：
   - 爱用感叹号还是问号
   - 省略号的使用频率
   - 逗号/断句习惯

2. **emoji使用**：
   - 常用的emoji类型
   - emoji通常放在什么位置（标题开头/结尾/中间）

3. **口语化特征**：
   - 常用的语气词（啊啊啊、真的、就是、那种）
   - 人称使用习惯（我/你/我们）
   - 句子长短偏好

## 四、仿写规则

1. **灵活使用**：至少使用【句式模板库】或【高频词汇库】或【语气特征】中的一项，根据图片内容自由组合，不强制全部使用

2. **原创表达**：参考博主的语气和句式，但禁止直接复制原标题的完整短语，确保内容原创且贴合图片

【博主素材】
${samples}`

  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      throw new Error(`AI API 错误: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  } catch (err) {
    console.error('生成风格文件失败:', err)
    return null
  }
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

// 获取已存在的 note_id 列表（用于增量爬取）
app.get('/api/xhs/existing-notes', async (req, res) => {
  const { userId, source } = req.query
  if (!userId || !source) {
    return res.status(400).json({ error: '缺少 userId 或 source 参数' })
  }

  try {
    const noteIds = new Set()

    const exactResult = db.exec(
      'SELECT note_id FROM library WHERE user_id = ? AND source = ? AND note_id IS NOT NULL AND note_id != ""',
      [userId, source]
    )
    const exactNoteIds = exactResult.length > 0 ? exactResult[0].values.map(row => row[0]) : []
    exactNoteIds.forEach(id => noteIds.add(id))

    // source 可能是用户输入的主页 URL，而素材库里保存的是爬虫识别出的博主名。
    // note_id 是全站唯一的，所以这里合并该用户所有已爬博主 note_id，保证二次爬取会跳过旧笔记。
    const allLibraryResult = db.exec(
      'SELECT note_id FROM library WHERE user_id = ? AND type = ? AND note_id IS NOT NULL AND note_id != ""',
      [userId, 'influencer']
    )
    const allLibraryNoteIds = allLibraryResult.length > 0 ? allLibraryResult[0].values.map(row => row[0]) : []
    allLibraryNoteIds.forEach(id => noteIds.add(id))

    const excelNoteIds = await readAllKnownExcelNoteIds().catch(err => {
      console.error('[增量爬取] 读取 Excel note_id 失败:', err)
      return []
    })
    excelNoteIds.forEach(id => noteIds.add(id))

    res.json({ noteIds: [...noteIds] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 爬取博主帖子：使用 pachong 目录里的 Python 爬虫逻辑
app.post('/api/xhs/scrape', async (req, res) => {
  const { url, count = 10, existingNoteIds = [] } = req.body

  if (!url) return res.status(400).json({ error: '缺少 url 参数' })

  try {
    const result = await runPythonXhsScraper({ url, count, existingNoteIds, downloadMedia: true })
    
    // 爬取完成后，基于该博主文件夹里的全部标题和正文同步生成/更新风格文件。
    if (result.bloggerName) {
      console.log(`[风格文件] 检测到博主: ${result.bloggerName}，准备生成风格文件...`)

      try {
        let stylePosts = result.posts || []
        const excelPosts = await readAllExcelPosts(result.bloggerName).catch(err => {
          console.error('[风格文件] 读取 Excel 素材失败，将使用本次爬取结果:', err)
          return []
        })

        if (excelPosts.length > 0) {
          stylePosts = excelPosts
        }

        const styleProfile = await generateAndSaveBloggerStyle(result.bloggerName, stylePosts, result.outputDir)
        if (styleProfile) {
          result.styleProfile = {
            jsonPath: styleProfile.jsonPath,
            mdPath: styleProfile.mdPath,
            postCount: styleProfile.postCount,
            source: styleProfile.source,
            updatedAt: styleProfile.updatedAt
          }
          console.log(`[风格文件] 已保存: ${styleProfile.jsonPath}`)
        }

        const coverStyleProfile = await generateBloggerCoverStyle(result.bloggerName, result.outputDir)
        if (coverStyleProfile) {
          result.coverStyleProfile = {
            jsonPath: coverStyleProfile.jsonPath,
            mdPath: coverStyleProfile.mdPath,
            noteCount: coverStyleProfile.noteCount,
            source: coverStyleProfile.source,
            updatedAt: coverStyleProfile.updatedAt
          }
          console.log(`[封面风格文件] 已保存: ${coverStyleProfile.jsonPath}`)
        }
      } catch (err) {
        console.error('[风格文件] 生成失败:', err)
        result.styleProfileError = err.message
      }
    }
    
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


// 下载博主 Excel 文件
app.get('/api/xhs/download/excel', (req, res) => {
  const { name } = req.query
  if (!name) return res.status(400).json({ error: '缺少 name 参数' })

  const bloggerDir = getBloggerDir(name)

  // 查找博主目录下的 xlsx 文件（可能有日期时间戳）
  const files = fs.readdirSync(bloggerDir).filter(f => f.endsWith('.xlsx'))
  if (files.length === 0) {
    return res.status(404).json({ error: '文件不存在' })
  }

  // 取最新的 xlsx 文件
  const excelFile = files.sort().at(-1)
  const excelPath = path.join(bloggerDir, excelFile)

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(excelFile)}"`)
  fs.createReadStream(excelPath).pipe(res)
})

// 下载博主风格文件
app.get('/api/xhs/download/style', (req, res) => {
  const { name, format = 'md' } = req.query
  if (!name) return res.status(400).json({ error: '缺少 name 参数' })

  const bloggerDir = getBloggerDir(name)
  const fileName = format === 'json' ? 'style_profile.json' : 'style_profile.md'
  const filePath = path.join(bloggerDir, fileName)

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const contentType = format === 'json' ? 'application/json' : 'text/markdown'
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}_style_profile.${format}"`)
  fs.createReadStream(filePath).pipe(res)
})

// 启动服务器
async function start() {
  await initDB()
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

start().catch(console.error)
