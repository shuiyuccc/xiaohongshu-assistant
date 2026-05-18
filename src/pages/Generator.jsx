import { useEffect, useState, useMemo, useCallback } from 'react'
import OutputCard from '../components/OutputCard'
import ImageUploader from '../components/ImageUploader'
import {
  analyzeUploadedImages,
  selectCoverImages,
  generateContent,
  generateContentFromSelectedProfiles,
  refreshSingleGeneratedItem,
  detectTheme,
  analyzeInfluencerStyle
} from '../services/ai'
import {
  addToHistory,
  appendGenerationSessionPrompts,
  createGenerationSession,
  getExcelBloggerPosts,
  getExcelBloggers,
  getBloggerStyle,
  getBloggerCoverStyle,
  saveBloggerStyle,
  generateBloggerStyleFile
} from '../services/api'

export default function Generator({ userId, username, library, onDataChange }) {
  const [images, setImages] = useState([])
  const [keywords, setKeywords] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [detectedTheme, setDetectedTheme] = useState('')
  const [lastFilteredLibrary, setLastFilteredLibrary] = useState([])
  const [lastBloggerStyle, setLastBloggerStyle] = useState(null)
  const [lastImageProfiles, setLastImageProfiles] = useState([])
  const [lastSessionId, setLastSessionId] = useState('')
  
  // 参考来源选择
  const [referenceSource, setReferenceSource] = useState('influencer') // 'influencer' | 'viral'
  const [selectedInfluencer, setSelectedInfluencer] = useState('')
  const [excelBloggers, setExcelBloggers] = useState([])
  const [excelLoading, setExcelLoading] = useState(false)
  
  // 热门帖子筛选条件
  const [viralTimeRange, setViralTimeRange] = useState('6months') // '1month' | '3months' | '6months' | '1year' | 'all'
  const [viralTheme, setViralTheme] = useState('') // '婚礼跟拍' | '孕照跟拍' | '领证跟拍'

  // 从素材库中提取博主列表（按 source 分组，只包含 type='influencer'）
  const influencers = useMemo(() => {
    const groups = {}
    library.filter(item => item.type === 'influencer').forEach(item => {
      const source = item.source || '未分类'
      if (!groups[source]) {
        groups[source] = []
      }
      groups[source].push(item)
    })
    return groups
  }, [library])

  const influencerList = useMemo(() => {
    return Object.keys(influencers)
  }, [influencers])

  useEffect(() => {
    let cancelled = false

    async function loadExcelBloggers() {
      setExcelLoading(true)
      try {
        const data = await getExcelBloggers()
        if (!cancelled) {
          setExcelBloggers(Array.isArray(data.bloggers) ? data.bloggers : [])
        }
      } catch (err) {
        console.error('读取爬虫 Excel 博主失败:', err)
      } finally {
        if (!cancelled) setExcelLoading(false)
      }
    }

    loadExcelBloggers()
    return () => {
      cancelled = true
    }
  }, [])

  const influencerOptions = useMemo(() => {
    const options = excelBloggers.map(blogger => ({
      id: `excel:${blogger.name}`,
      name: blogger.name,
      count: blogger.postCount || 0,
      type: 'excel',
      sampleTitles: blogger.sampleTitles || []
    }))

    const excelNames = new Set(excelBloggers.map(blogger => blogger.name))
    influencerList
      .filter(name => !excelNames.has(name))
      .forEach(name => {
        options.push({
          id: `library:${name}`,
          name,
          count: influencers[name]?.length || 0,
          type: 'library'
        })
      })

    return options
  }, [excelBloggers, influencerList, influencers])

  const selectedInfluencerOption = useMemo(() => {
    return influencerOptions.find(option => option.id === selectedInfluencer)
  }, [influencerOptions, selectedInfluencer])

  useEffect(() => {
    if (influencerOptions.length > 0 && !selectedInfluencerOption) {
      setSelectedInfluencer(influencerOptions[0].id)
    }
  }, [influencerOptions, selectedInfluencerOption])
  
  // 主题选项
  const themeOptions = [
    { value: '婚礼跟拍', label: '婚礼跟拍', icon: '💒' },
    { value: '孕照跟拍', label: '孕照跟拍', icon: '🤰' },
    { value: '领证跟拍', label: '领证跟拍', icon: '💍' }
  ]
  
  // 时间范围选项
  const timeRangeOptions = [
    { value: '1month', label: '近1个月' },
    { value: '6months', label: '近半年' },
    { value: '1year', label: '近1年' },
    { value: 'all', label: '全部' }
  ]
  
  // 根据筛选条件过滤热门帖子
  const filterViralPosts = (posts, timeRange, theme) => {
    let filtered = posts.filter(item => item.type === 'viral')
    
    // 按主题筛选
    if (theme) {
      filtered = filtered.filter(item => item.theme === theme)
    }
    
    // 按时间范围筛选
    if (timeRange !== 'all' && filtered.length > 0) {
      const now = new Date()
      const getStartDate = () => {
        const date = new Date(now)
        switch (timeRange) {
          case '1month': date.setMonth(date.getMonth() - 1); break
          case '6months': date.setMonth(date.getMonth() - 6); break
          case '1year': date.setFullYear(date.getFullYear() - 1); break
          default: return null
        }
        return date
      }
      
      const startDate = getStartDate()
      if (startDate) {
        filtered = filtered.filter(item => {
          if (!item.publishDate) return true
          return new Date(item.publishDate) >= startDate
        })
      }
    }
    
    // 按点赞数排序
    return filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0))
  }

  const extractJsonArray = (text) => {
    const fenced = text?.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const source = fenced ? fenced[1] : text
    const jsonMatch = source?.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return Array.isArray(parsed) ? parsed : []
    } catch (err) {
      console.error('解析生成结果失败:', err)
      return []
    }
  }

  const normalizeGeneratedResultsFromProfiles = (responseText, selectedProfiles) => {
    const parsed = extractJsonArray(responseText)
    return selectedProfiles.slice(0, 4).map((profile, index) => {
      const matched = parsed.find(item =>
        String(item.imageId || '') === String(profile.imageId)
        || Number(item.imageIndex) === Number(profile.imageIndex)
      ) || parsed[index] || {}

      return {
        id: `${profile.imageId || profile.imageIndex}-${Date.now()}-${index}`,
        imageId: profile.imageId,
        imageIndex: profile.imageIndex,
        imageProfile: profile,
        coverIndex: profile.imageIndex,
        title: matched.title || `标题 ${index + 1}`,
        content: matched.content || '',
        coverReason: matched.coverReason || profile.selectedReason || '',
        reason: matched.reason || '基于当前封面描述和参考博主风格生成',
        index
      }
    })
  }

  const getProfileForItem = (item) => {
    return item?.imageProfile
      || lastImageProfiles.find(profile => String(profile.imageId) === String(item?.imageId))
      || lastImageProfiles.find(profile => Number(profile.imageIndex) === Number(item?.imageIndex || item?.coverIndex))
      || null
  }

  const handleUpdateResult = useCallback((index, patch) => {
    setResults(prev => prev.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    ))
  }, [])

  const handleGenerate = async () => {
    if (images.length > 0 && images.length < 4) {
      setError('请至少上传 4 张候选图片，AI 才能从中挑选 4 张封面')
      return
    }

    setError('')
    setLoading(true)
    setLoadingStatus('')

    try {
      // 纯文字测试模式下没有图片时跳过主题识别
      let theme = '婚礼跟拍'
      if (images.length > 0) {
        try {
          theme = await detectTheme(images)
          setDetectedTheme(theme)
        } catch (e) {
          console.log('主题识别失败，使用默认')
        }
      }

      // 根据选择的参考来源筛选素材库
      let filteredLibrary = []
      let bloggerStyleProfile = null
      let bloggerCoverStyleProfile = null
      let referenceName = ''
      
      if (referenceSource === 'influencer' && selectedInfluencer) {
        const [sourceType, ...nameParts] = selectedInfluencer.split(':')
        const influencerName = nameParts.join(':')
        referenceName = influencerName

        if (sourceType === 'excel') {
          const data = await getExcelBloggerPosts(influencerName, 'all')
          filteredLibrary = (data.posts || []).map(post => ({
            type: 'influencer',
            source: influencerName,
            originalTitle: post.title,
            originalContent: post.content
          }))
          
          // 检查是否有风格文件
          setLoadingStatus('正在检查博主风格文件...')
          const styleData = await getBloggerStyle(influencerName)
          
          if (styleData.exists && styleData.style) {
            bloggerStyleProfile = styleData.style
            setLoadingStatus('已找到博主风格文件，正在生成...')
          } else {
            // 生成风格文件
            setLoadingStatus('首次分析该博主，正在生成风格文件...')
            try {
              const generatedStyle = await generateBloggerStyleFile(influencerName)
              bloggerStyleProfile = generatedStyle.styleProfile?.style || ''
              setLoadingStatus('风格文件已保存，正在生成内容...')
            } catch (e) {
              console.error('服务端生成风格文件失败，尝试前端兜底分析:', e)
              try {
                bloggerStyleProfile = await analyzeInfluencerStyle(filteredLibrary)
                await saveBloggerStyle(influencerName, bloggerStyleProfile)
                setLoadingStatus('风格文件已保存，正在生成内容...')
              } catch (fallbackErr) {
                console.error('生成风格文件失败:', fallbackErr)
                setLoadingStatus('风格分析失败，直接生成内容...')
              }
            }
          }

          try {
            const coverStyleData = await getBloggerCoverStyle(influencerName)
            if (coverStyleData.exists && coverStyleData.style) {
              bloggerCoverStyleProfile = coverStyleData.style
            }
          } catch (e) {
            console.error('读取博主封面风格文件失败:', e)
          }
        } else {
          filteredLibrary = library.filter(item => item.source === influencerName && item.type === 'influencer')
        }
      } else if (referenceSource === 'viral') {
        // 热门帖子：根据时间范围和主题筛选
        filteredLibrary = filterViralPosts(library, viralTimeRange, viralTheme)
        referenceName = '热门帖子'
      }

      let parsedResults = []
      let imageProfiles = []
      let selectedProfiles = []
      let sessionId = ''
      const promptLogs = []
      const recordPrompt = (promptItem) => {
        promptLogs.push(promptItem)
      }

      if (images.length > 0) {
        setLoadingStatus(`AI 正在逐张分析 ${images.length} 张图片...`)
        imageProfiles = await analyzeUploadedImages(images, theme, { onPrompt: recordPrompt })

        setLoadingStatus('AI 正在根据图片描述选择4张封面...')
        selectedProfiles = await selectCoverImages(imageProfiles, bloggerCoverStyleProfile, { onPrompt: recordPrompt })
        if (selectedProfiles.length < 4) {
          throw new Error('可用封面不足4张，请检查上传图片')
        }

        setLoadingStatus('AI 正在根据4张封面描述生成标题和文案...')
        const response = await generateContentFromSelectedProfiles(
          selectedProfiles,
          keywords.trim(),
          theme,
          filteredLibrary,
          referenceSource,
          bloggerStyleProfile,
          { onPrompt: recordPrompt }
        )
        parsedResults = normalizeGeneratedResultsFromProfiles(response, selectedProfiles)

        try {
          const session = await createGenerationSession(userId, {
            images: images.map((img, index) => ({
              ...img,
              imageId: String(img.id),
              imageIndex: index + 1
            })),
            imageProfiles,
            selectedCovers: selectedProfiles,
            results: parsedResults,
            prompts: promptLogs,
            manifest: {
              keywords: keywords.trim(),
              theme,
              referenceSource,
              referenceName,
              imageCount: images.length
            }
          })
          sessionId = session.sessionId || ''
          setLastSessionId(sessionId)
        } catch (e) {
          console.error('保存生成素材包失败:', e)
        }
      } else {
        setLoadingStatus('AI 正在生成文案...')
        const response = await generateContent(images, keywords.trim(), filteredLibrary, theme, referenceSource, bloggerStyleProfile, bloggerCoverStyleProfile)
        parsedResults = parseAIResponse(response)
      }

      setResults(parsedResults)

      // 保存本次素材和风格，供刷新使用
      setLastFilteredLibrary(filteredLibrary)
      setLastBloggerStyle(bloggerStyleProfile)
      setLastImageProfiles(imageProfiles)
      if (!images.length) setLastSessionId('')

      // 保存到服务器
      try {
        await addToHistory(userId, {
          images: images.length > 0 ? [] : images.map(i => i.url),
          keywords,
          theme,
          results: images.length > 0 ? [] : parsedResults,
          sessionId,
          summary: images.length > 0
            ? `分析${images.length}张图片，选出4张封面并生成4组内容`
            : '纯文字生成4组内容'
        })
        onDataChange && onDataChange()
      } catch (e) {
        console.error('保存历史失败:', e)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingStatus('')
    }
  }

  // 刷新单个标题
  const handleRefreshTitle = useCallback(async (item, index) => {
    setLoading(true)
    setLoadingStatus(`正在刷新第 ${index + 1} 组标题...`)
    try {
      const imageProfile = getProfileForItem(item)
      const refreshed = await refreshSingleGeneratedItem({
        mode: 'title',
        item,
        imageProfile,
        keywords,
        theme: detectedTheme || '婚礼跟拍',
        bloggerStyleProfile: lastBloggerStyle || ''
      })
      const newTitle = refreshed?.title || ''
      if (lastSessionId && refreshed?.prompt) {
        appendGenerationSessionPrompts(lastSessionId, [{
          ...(refreshed.promptMeta || {}),
          prompt: refreshed.prompt,
          response: refreshed.response,
          oldTitle: item.title,
          oldContent: item.content
        }]).catch(err => console.error('保存刷新标题提示词失败:', err))
      }
      if (newTitle) {
        setResults(prev => prev.map(result =>
          result.id === item.id ? { ...result, title: newTitle } : result
        ))
      }
      setLoadingStatus('')
      return newTitle || null
    } catch (err) {
      console.error('刷新标题失败:', err)
      setLoadingStatus('')
      return null
    } finally {
      setLoading(false)
    }
  }, [keywords, detectedTheme, lastBloggerStyle, lastImageProfiles, lastSessionId])

  // 刷新单个文案
  const handleRefreshContent = useCallback(async (item, index) => {
    setLoading(true)
    setLoadingStatus(`正在刷新第 ${index + 1} 组文案...`)
    try {
      const imageProfile = getProfileForItem(item)
      const refreshed = await refreshSingleGeneratedItem({
        mode: 'content',
        item,
        imageProfile,
        keywords,
        theme: detectedTheme || '婚礼跟拍',
        bloggerStyleProfile: lastBloggerStyle || ''
      })
      const newContent = refreshed?.content || ''
      if (lastSessionId && refreshed?.prompt) {
        appendGenerationSessionPrompts(lastSessionId, [{
          ...(refreshed.promptMeta || {}),
          prompt: refreshed.prompt,
          response: refreshed.response,
          oldTitle: item.title,
          oldContent: item.content
        }]).catch(err => console.error('保存刷新文案提示词失败:', err))
      }
      if (newContent) {
        setResults(prev => prev.map(result =>
          result.id === item.id ? { ...result, content: newContent } : result
        ))
      }
      setLoadingStatus('')
      return newContent || null
    } catch (err) {
      console.error('刷新文案失败:', err)
      setLoadingStatus('')
      return null
    } finally {
      setLoading(false)
    }
  }, [keywords, detectedTheme, lastBloggerStyle, lastImageProfiles, lastSessionId])

  const parseAIResponse = (text) => {
    const normalizeCoverIndex = (value, fallback) => {
      if (images.length === 0) return undefined
      const parsed = Number.parseInt(value, 10)
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= images.length) {
        return parsed
      }
      return Math.min(fallback, images.length)
    }

    console.log('[解析AI响应] 原始文本长度:', text.length)
    console.log('[解析AI响应] 前200字符:', text.substring(0, 200))

    // 尝试解析 JSON 格式
    try {
      // 尝试匹配 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        console.log('[解析AI响应] 找到JSON数组匹配')
        const parsed = JSON.parse(jsonMatch[0])
        console.log('[解析AI响应] JSON解析成功，数组长度:', parsed.length)
        if (Array.isArray(parsed)) {
          // 如果数组长度不足4，复制最后一组直到有4组
          while (parsed.length < 4) {
            const lastItem = parsed[parsed.length - 1] || { title: '标题', content: '内容' }
            parsed.push({ ...lastItem, title: lastItem.title + ` (版本${parsed.length + 1})` })
          }
          return parsed.slice(0, 4).map((item, i) => ({
            title: item.title || `标题 ${i + 1}`,
            content: item.content || '',
            coverIndex: normalizeCoverIndex(item.coverIndex, i + 1),
            angle: item.angle || '模仿风格',
            coverReason: item.coverReason || '',
            reason: item.reason || '综合评估',
            index: i
          }))
        }
      }
    } catch (e) {
      console.error('[解析AI响应] JSON解析失败:', e.message)
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
            coverIndex: normalizeCoverIndex(i + 1, i + 1),
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
          coverIndex: normalizeCoverIndex(i + 1, i + 1),
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
    let angle = '模仿风格'
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
        <p className="text-gray-500">输入关键词，选择参考博主，生成4组标题文案</p>
      </div>

      {/* 设置面板 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        {detectedTheme && (
          <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm">
            🎯 AI 识别主题：{detectedTheme}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">1. 输入关键词</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="例如：温馨、高级感、母婴感、孕照"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
          />
          <p className="text-gray-400 text-sm mt-2">多个关键词用逗号分隔；可不填，不填时 AI 不会考虑关键词</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">2. 上传候选封面图片</label>
          <p className="text-gray-400 text-sm mb-3">最多上传 50 张，AI 会按内容吸引力、点击欲望和爆款潜力挑选 4 张封面</p>
          <ImageUploader images={images} onImagesChange={setImages} />
        </div>

        {/* 参考来源选择 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">3. 选择文案参考来源</label>
          
          {/* 参考来源类型选择 */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => setReferenceSource('influencer')}
              disabled={influencerOptions.length === 0}
              className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                referenceSource === 'influencer'
                  ? 'border-pink-500 bg-pink-50 text-pink-700'
                  : 'border-gray-200 hover:border-pink-300 text-gray-600'
              } ${influencerOptions.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="text-lg mb-1">👤</div>
              <div>参考博主</div>
              <div className="text-xs opacity-70 mt-1">
                {excelLoading ? '读取中...' : `(${influencerOptions.length}位)`}
              </div>
            </button>
            
            <button
              onClick={() => setReferenceSource('viral')}
              disabled={library.length === 0}
              className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                referenceSource === 'viral'
                  ? 'border-pink-500 bg-pink-50 text-pink-700'
                  : 'border-gray-200 hover:border-pink-300 text-gray-600'
              } ${library.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="text-lg mb-1">🔥</div>
              <div>热门帖子</div>
              <div className="text-xs opacity-70 mt-1">爆款文案</div>
            </button>
          </div>

          {/* 选择具体博主 */}
          {referenceSource === 'influencer' && influencerOptions.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择要参考的博主</label>
              <select
                value={selectedInfluencer}
                onChange={(e) => setSelectedInfluencer(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all bg-white"
              >
                <option value="">请选择博主...</option>
                {influencerOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.count} 条{option.type === 'excel' ? 'Excel笔记' : '素材'})
                  </option>
                ))}
              </select>
              
              {selectedInfluencerOption?.type === 'excel' && (
                <div className="mt-3 text-sm text-gray-600">
                  <p className="font-medium text-gray-700 mb-1">将参考该博主 Excel 中的标题和正文：</p>
                  <div className="space-y-1">
                    {selectedInfluencerOption.sampleTitles.slice(0, 3).map((title, idx) => (
                      <div key={idx} className="text-xs text-gray-500 bg-white p-2 rounded-lg">
                        {title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedInfluencerOption?.type === 'library' && influencers[selectedInfluencerOption.name] && (
                <div className="mt-3 text-sm text-gray-600">
                  <p className="font-medium text-gray-700 mb-1">该博主风格特征：</p>
                  <div className="space-y-1">
                    {influencers[selectedInfluencerOption.name].slice(0, 2).map((item, idx) => (
                      <div key={idx} className="text-xs text-gray-500 bg-white p-2 rounded-lg">
                        {item.titleStyle && <span className="block">标题：{item.titleStyle.substring(0, 50)}...</span>}
                        {item.contentStyle && <span className="block">文案：{item.contentStyle.substring(0, 50)}...</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 热门帖子筛选面板 */}
          {referenceSource === 'viral' && library.length > 0 && (
            <div className="mt-4 p-4 bg-orange-50 rounded-xl">
              <p className="font-medium text-orange-800 mb-3">🔥 热门帖子筛选</p>
              
              {/* 主题选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择主题类型</label>
                <div className="grid grid-cols-3 gap-2">
                  {themeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setViralTheme(viralTheme === option.value ? '' : option.value)}
                      className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                        viralTheme === option.value
                          ? 'border-orange-500 bg-orange-100 text-orange-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-orange-300'
                      }`}
                    >
                      <span className="mr-1">{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 时间范围选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择时间范围</label>
                <div className="flex flex-wrap gap-2">
                  {timeRangeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setViralTimeRange(option.value)}
                      className={`py-2 px-4 rounded-lg border text-sm transition-all ${
                        viralTimeRange === option.value
                          ? 'border-orange-500 bg-orange-100 text-orange-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-orange-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 筛选结果预览 */}
              {(() => {
                const filtered = filterViralPosts(library, viralTimeRange, viralTheme)
                return (
                  <div className="text-sm text-orange-700 bg-white/50 p-3 rounded-lg">
                    <p className="font-medium">筛选结果</p>
                    <p className="text-orange-600 mt-1">
                      找到 {filtered.length} 条热门帖子
                      {viralTheme && ` · 主题：${viralTheme}`}
                      {viralTimeRange !== 'all' && ` · 时间：${timeRangeOptions.find(t => t.value === viralTimeRange)?.label}`}
                    </p>
                    {filtered.length > 0 && (
                      <p className="text-xs text-orange-500 mt-1">
                        已按点赞数排序，将参考前 {Math.min(5, filtered.length)} 条
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* 空状态提示 */}
          {library.length === 0 && excelBloggers.length === 0 && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
              <p>💡 提示：请先前往「素材库」添加素材，即可使用参考来源功能</p>
              <p className="mt-1 text-xs">也可以先运行爬虫，系统会自动读取 pachong 文件夹下的博主 Excel</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">
            {error}
          </div>
        )}

        {loadingStatus && (
          <div className="mb-6 p-4 bg-pink-50 text-pink-600 rounded-xl text-sm">
            {loadingStatus}
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

      {/* 结果展示 - 2x2 网格布局 */}
      {results.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-gray-800 mb-4">生成结果（4组文案）</h3>
          <div className="grid grid-cols-2 gap-4">
            {results.map((item, index) => (
              <OutputCard
                key={index}
                item={item}
                index={index}
                images={images}
                onRefreshTitle={handleRefreshTitle}
                onRefreshContent={handleRefreshContent}
                onUpdateItem={handleUpdateResult}
              />
            ))}
          </div>
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
