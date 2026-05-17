import { useState } from 'react'
import ImageUploader from '../components/ImageUploader'
import OutputCard from '../components/OutputCard'
import { generateContent, detectTheme } from '../services/ai'
import { addToHistory } from '../services/api'

export default function Generator({ userId, username, library, onDataChange }) {
  const [images, setImages] = useState([])
  const [keywords, setKeywords] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [detectedTheme, setDetectedTheme] = useState('')

  const handleGenerate = async () => {
    if (images.length < 4) {
      setError('请至少上传 4 张图片')
      return
    }
    if (!keywords.trim()) {
      setError('请输入关键词')
      return
    }

    setError('')
    setLoading(true)

    try {
      // 先识别主题
      let theme = '婚礼跟拍'
      try {
        theme = await detectTheme(images)
        setDetectedTheme(theme)
      } catch (e) {
        console.log('主题识别失败，使用默认')
      }

      // 生成内容
      const response = await generateContent(images, keywords, library, theme)
      const parsedResults = parseAIResponse(response)
      setResults(parsedResults)

      // 保存到服务器
      try {
        await addToHistory(userId, {
          images: images.map(i => i.url),
          keywords,
          theme,
          results: parsedResults
        })
        onDataChange && onDataChange()
      } catch (e) {
        console.error('保存历史失败:', e)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const parseAIResponse = (text) => {
    // 尝试解析 JSON 格式
    try {
      // 尝试匹配 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length >= 4) {
          return parsed.slice(0, 4).map((item, i) => ({
            title: item.title || `标题 ${i + 1}`,
            content: item.content || '',
            coverIndex: item.coverIndex || (i + 1),
            angle: item.angle || '用户视角',
            coverReason: item.coverReason || '',
            reason: item.reason || '综合评估',
            index: i
          }))
        }
      }
    } catch (e) {
      // JSON 解析失败
    }

    // 文本解析：尝试按组分割提取4组
    const results = []

    // 方法1：尝试按 "组" 分割
    const groupPatterns = [
      /(?:第[一二三四]组|组合?\s*[1-4]|方案\s*[1-4])[\s\S]*?(?=(?:第[一二三四]组|组合?\s*[1-4]|方案\s*[1-4])|$)/g,
    ]

    for (const pattern of groupPatterns) {
      const matches = text.match(pattern)
      if (matches && matches.length >= 4) {
        for (let i = 0; i < 4; i++) {
          const parsed = parseSection(matches[i], i)
          if (parsed) results.push(parsed)
        }
        if (results.length >= 4) break
      }
    }

    // 方法2：尝试提取标题-内容对
    if (results.length < 4) {
      const titleMatches = text.match(/标题[：:]\s*["']?([^"'\n]+)["']?/gi) || []
      const contentMatches = text.match(/文案[：:]\s*([\s\S]+?)(?=标题|文案|组合|方案|$)/gi) || []

      for (let i = 0; i < Math.min(4, titleMatches.length); i++) {
        const title = titleMatches[i]?.replace(/标题[：:]\s*["']?/, '').replace(/["']$/, '').trim()
        const content = contentMatches[i]?.replace(/文案[：:]\s*/, '').trim() || ''

        if (title && content) {
          results.push({
            title,
            content,
            coverIndex: i + 1,
            angle: getAngleFromText(text, i),
            coverReason: '',
            reason: getReasonFromText(text, i),
            index: i
          })
        }
      }
    }

    // 如果还是不够4组，按段落分割
    if (results.length < 4) {
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20)
      for (let i = 0; i < Math.min(4, paragraphs.length); i++) {
        const para = paragraphs[i]
        const lines = para.split('\n')
        const titleLine = lines.find(l => l.length < 50 && l.length > 5) || ''

        results.push({
          title: titleLine.substring(0, 50) || `方案 ${i + 1}`,
          content: para.substring(0, 300),
          coverIndex: i + 1,
          angle: getAngleFromText(text, i),
          coverReason: '',
          reason: getReasonFromText(text, i),
          index: i
        })
      }
    }

    // 去重：如果有重复的标题或内容，做差异化
    const uniqueResults = []
    const usedTitles = new Set()
    const usedContents = new Set()

    for (const r of results) {
      // 标题去重
      let title = r.title
      let content = r.content
      let counter = 1
      while (usedTitles.has(title) && counter < 10) {
        title = `${r.title} (${counter})`
        counter++
      }
      usedTitles.add(title)

      // 内容去重（取前面一部分比较）
      const contentPrefix = content.substring(0, 50)
      if (usedContents.has(contentPrefix)) {
        content = content + ` [差异化版本${counter}]`
      }
      usedContents.add(content.substring(0, 50))

      uniqueResults.push({
        ...r,
        title,
        content,
        index: uniqueResults.length
      })
    }

    return uniqueResults.slice(0, 4)
  }

  const getAngleFromText = (text, index) => {
    const angles = ['用户视角', '摄影师视角', '故事叙事', '幕后花絮', '干货教程', '情感回忆', 'Q&A问答', '对比反差']
    // 从文本中查找角度
    for (const angle of angles) {
      if (text.includes(angle)) return angle
    }
    return angles[index % angles.length]
  }

  const getReasonFromText = (text, index) => {
    const reasonMatch = text.match(/理由[：:]\s*([^\n]+)/i)
    if (reasonMatch) return reasonMatch[1].trim()
    return '综合评估流量潜力'
  }

  const parseSection = (section, index) => {
    // 提取标题
    let title = ''
    const titleMatch = section.match(/标题[：:]\s*(.+)/i) || section.match(/^#\s*(.+)/m)
    if (titleMatch) title = titleMatch[1].trim()

    // 提取文案
    let content = ''
    const contentMatch = section.match(/文案[：:]\s*([\s\S]+)/i)
    if (contentMatch) content = contentMatch[1].trim()

    // 提取角度
    let angle = '用户视角'
    const angleMatch = section.match(/角度[：:]\s*([^\n]+)/i)
    if (angleMatch) angle = angleMatch[1].trim()

    // 提取理由
    let reason = '综合评估'
    const reasonMatch = section.match(/理由[：:]\s*([^\n]+)/i) || section.match(/原因[：:]\s*([^\n]+)/i)
    if (reasonMatch) reason = reasonMatch[1].trim()

    // 如果都没找到，整个section作为内容
    if (!title && !content) {
      title = `标题 ${index + 1}`
      content = section.substring(0, 200)
    }

    return {
      title: title || `标题 ${index + 1}`,
      content: content || section.substring(0, 200),
      angle: angle,
      reason: reason,
      index: index
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">生成内容</h2>
        <p className="text-gray-500">上传图片，输入关键词，生成4组标题文案</p>
      </div>

      {/* 设置面板 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        {detectedTheme && (
          <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm">
            🎯 AI 识别主题：{detectedTheme}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">1. 上传图片（4-9张）</label>
          <ImageUploader images={images} onImagesChange={setImages} />
          <p className="text-gray-400 text-sm mt-2">提示：上传4张以上，AI会从中选择4张作为不同组合的封面</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">2. 输入关键词</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="例如：温馨、高级感、母婴感、孕照"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
          />
          <p className="text-gray-400 text-sm mt-2">多个关键词用逗号分隔</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium rounded-xl hover:from-pink-600 hover:to-rose-600 transition-all shadow-lg shadow-pink-200 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              生成中...
            </span>
          ) : '生成内容'}
        </button>
      </div>

      {/* 结果展示 */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-800">生成结果</h3>
          {results.map((item, index) => (
            <OutputCard key={index} item={item} index={index} images={images} />
          ))}
        </div>
      )}

      {/* 快捷操作 */}
      <div className="mt-8 flex gap-3">
        <a
          href="https://creator.xiaohongshu.com/publish/publish"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all text-center"
        >
          跳转小红书发布
        </a>
        <button
          onClick={() => setResults([])}
          className="px-6 py-3 bg-gray-100 text-gray-600 font-medium rounded-xl hover:bg-gray-200 transition-all"
        >
          清除结果
        </button>
      </div>
    </div>
  )
}