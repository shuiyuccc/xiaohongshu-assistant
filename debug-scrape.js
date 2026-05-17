// 调试脚本 - 用于测试小红书页面结构
import { chromium } from 'playwright-core'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const COOKIES_PATH = './server/cookies.json'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadCookies() {
  const p = path.join(__dirname, 'server/cookies.json')
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch {
      return null
    }
  }
  return null
}

async function debug() {
  const cookies = loadCookies()
  if (!cookies) {
    console.log('未找到 cookies.json，请先登录')
    return
  }

  const url = process.argv[2] || 'https://www.xiaohongshu.com/user/profile/xxx'
  console.log('测试 URL:', url)

  const browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  })
  await context.addCookies(cookies)

  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

  // 等待内容加载
  await page.waitForTimeout(3000)

  // 打印页面标题
  console.log('页面标题:', await page.title())

  // 尝试多种选择器来找帖子链接
  console.log('\n=== 查找帖子链接 ===')

  const selectorsToTry = [
    // 帖子卡片
    'a[href*="/explore/"]',
    '.note-item a',
    '[class*="note"] a',
    '[class*="card"] a',
    '[class*="content"] a',
    // 用户帖子
    'a[href*="xihongshu.com/explore"]',
    // 专区链接
    'section a',
    '.user-post a',
    // 所有包含 explore 的链接
    'a[href*="explore"]'
  ]

  for (const sel of selectorsToTry) {
    try {
      const count = await page.locator(sel).count()
      if (count > 0) {
        const firstHref = await page.locator(sel).first().getAttribute('href')
        console.log(`${sel}: ${count} 个, 例: ${firstHref}`)
      }
    } catch {
      console.log(`${sel}: 错误`)
    }
  }

  // 打印页面中所有链接（过滤掉非小红书的）
  console.log('\n=== 页面所有链接 ===')
  const links = await page.evaluate(() => {
    const els = document.querySelectorAll('a[href]')
    const seen = new Set()
    const result = []
    els.forEach(el => {
      const href = el.getAttribute('href')
      if (href && !seen.has(href) && (href.includes('xiaohongshu') || href.startsWith('/'))) {
        seen.add(href)
        const text = el.innerText?.trim().slice(0, 50) || ''
        result.push({ href, text })
      }
    })
    return result.slice(0, 30)
  })
  console.log(JSON.stringify(links, null, 2))

  // 打印 body 的部分 HTML 用于调试
  console.log('\n=== HTML 结构样例 ===')
  const htmlSample = await page.evaluate(() => {
    const body = document.body
    return body?.innerHTML?.slice(0, 3000) || 'no body'
  })
  console.log(htmlSample)

  await browser.close()
}

debug().catch(console.error)