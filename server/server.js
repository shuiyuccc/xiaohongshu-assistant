import express from 'express'
import cors from 'cors'
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
const PACHONG_DIR = path.join(ROOT_DIR, 'pachong')
const PACHONG_BRIDGE = path.join(PACHONG_DIR, 'scrape_bridge.py')
const EXCEL_READER = path.join(PACHONG_DIR, 'excel_reader.py')
const XHS_OUTPUT_DIR = path.join(PACHONG_DIR, 'xiaohongshu_notes')
const PYTHON_BIN = process.env.PYTHON_BIN || process.env.PYTHON || 'python'
const STYLE_PROFILE_JSON = 'style_profile.json'
const STYLE_PROFILE_MD = 'style_profile.md'
const COOKIES_PATH = path.join(__dirname, 'cookies.json')

app.use(cors())
app.use(express.json())

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
          bloggerName: parsed.bloggerName || '',
          sourceName: parsed.sourceName || parsed.bloggerName || sourceName,
          skippedCount: parsed.skippedCount || 0
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
- 仿写时优先保留"具体场景 + 情绪/结果"的标题结构，避免直接复用原始标题中的完整表达。

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

  const prompt = `你是一名小红书文案风格分析师。请基于下面这位博主的所有标题和正文，提炼一个可用于后续仿写的「风格总结」。

请深度分析，不要泛泛而谈。重点观察：
1. 标题撰写特征：常见句式、标题长度、标点习惯、情绪强度、钩子方式、是否爱用反差/疑问/感叹/场景化词汇。
2. 正文撰写特征：开头方式、段落长度、换行节奏、叙事顺序、口语化程度、常见语气词、emoji 使用、是否爱用清单/故事/感谢/感受。

${samples}

输出一份结构化风格总结，控制在 900 字以内。只输出风格总结，不要创作新文案。`

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

// 检查登录态
app.get('/api/xhs/session', (req, res) => {
  const cookies = loadCookies()
  if (!cookies || cookies.length === 0) return res.json({ loggedIn: false })

  // 检查关键 cookie 是否存在且未过期
  const now = Date.now() / 1000
  const sessionCookie = cookies.find(c =>
    c.name === 'web_session' || c.name === 'session'
  )

  if (sessionCookie && sessionCookie.expires > now) {
    return res.json({ loggedIn: true })
  }

  res.json({ loggedIn: false })
})

// 启动二维码登录流程
app.post('/api/xhs/qr-login/start', async (req, res) => {
  try {
    // 如果已有浏览器实例，先关闭
    if (qrBrowser) {
      await qrBrowser.close().catch(() => {})
      qrBrowser = null
      qrPage = null
    }

    qrBrowser = await chromium.launch({
      headless: false,
      executablePath: CHROME_PATH
    })

    qrPage = await qrBrowser.newPage()

    // 注入二维码检测脚本
    await qrPage.addInitScript(() => {
      window._qrDetected = false
      const observer = new MutationObserver(() => {
        const qrCanvas = document.querySelector('canvas')
        const qrImage = document.querySelector('img[src*="qr"]')
        if (qrCanvas || qrImage) {
          window._qrDetected = true
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })

    // 访问小红书首页触发登录弹窗
    await qrPage.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle' })

    // 等待二维码出现（最多10秒）
    await qrPage.waitForFunction(() => window._qrDetected, { timeout: 10000 })

    res.json({ success: true, message: '请在新打开的浏览器窗口中扫描二维码登录' })
  } catch (err) {
    if (qrBrowser) {
      await qrBrowser.close().catch(() => {})
      qrBrowser = null
      qrPage = null
    }
    res.status(500).json({ error: err.message })
  }
})

// 轮询检查登录状态
app.get('/api/xhs/qr-login/status', async (req, res) => {
  if (!qrBrowser || !qrPage) {
    return res.json({ status: 'idle' })
  }

  try {
    // 检查当前 URL 是否已跳转到用户主页
    const url = qrPage.url()

    if (url.includes('/user/profile/') || url.includes('/discovery')) {
      // 已登录，获取 cookies
      const cookies = await qrPage.context().cookies()
      saveCookies(cookies)

      // 关闭浏览器
      await qrBrowser.close()
      qrBrowser = null
      qrPage = null

      return res.json({ status: 'success' })
    }

    // 检查是否还在登录页面
    const hasLoginElement = await qrPage.evaluate(() => {
      return !!document.querySelector('.login-container') ||
             !!document.querySelector('canvas') ||
             !!document.querySelector('img[src*="qr"]')
    })

    if (!hasLoginElement) {
      // 可能已登录但页面结构不同，尝试获取 cookies
      const cookies = await qrPage.context().cookies()
      const hasSession = cookies.some(c =>
        c.name === 'web_session' || c.name === 'session'
      )

      if (hasSession) {
        saveCookies(cookies)
        await qrBrowser.close()
        qrBrowser = null
        qrPage = null
        return res.json({ status: 'success' })
      }
    }

    res.json({ status: 'waiting' })
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message })
  }
})

// 获取已存在的笔记ID列表（用于增量爬取）
app.get('/api/xhs/existing-notes', (req, res) => {
  const { source } = req.query

  if (!source) {
    return res.json({ noteIds: [] })
  }

  try {
    // 从博主文件夹中读取所有Excel文件，提取已有的note_id
    const safeName = safePathName(source)
    const bloggerDir = path.join(XHS_OUTPUT_DIR, safeName)

    if (!fs.existsSync(bloggerDir)) {
      return res.json({ noteIds: [] })
    }

    // 读取文件夹中的所有Excel文件
    const files = fs.readdirSync(bloggerDir)
    const excelFiles = files.filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))

    // 这里简化处理，返回空数组让前端处理
    // 实际实现需要在Python端读取Excel提取note_id
    res.json({ noteIds: [] })
  } catch (err) {
    console.error('获取已存在笔记ID失败:', err)
    res.json({ noteIds: [] })
  }
})

// 爬取博主帖子：使用 pachong 目录里的 Python 爬虫逻辑
app.post('/api/xhs/scrape', async (req, res) => {
  const { url, count = 10, existingNoteIds = [] } = req.body

  if (!url) return res.status(400).json({ error: '缺少 url 参数' })

  try {
    const result = await runPythonXhsScraper({ url, count, sourceName: url, existingNoteIds })

    // 爬取完成后，如果有博主名且有新帖子，自动生成/更新风格文件
    if (result.bloggerName && result.posts && result.posts.length > 0) {
      console.log(`[风格文件] 检测到博主: ${result.bloggerName}，准备生成风格文件...`)

      // 异步生成风格文件（不阻塞响应）
      generateAndSaveBloggerStyle(result.bloggerName, result.posts, result.outputDir).then(styleProfile => {
        if (styleProfile) {
          console.log(`[风格文件] 已保存: ${styleProfile.jsonPath}`)
        }
      }).catch(err => {
        console.error('[风格文件] 生成失败:', err)
      })
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
