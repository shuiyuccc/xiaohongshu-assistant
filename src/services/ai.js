// AI 服务封装
// 支持 DeepSeek V4（主力）和 通义千问 VL 2.0（备选）

// 文案角度定义
export const CONTENT_ANGLES = [
  { id: 'user', name: '用户视角', desc: '孕妇/新人第一人称' },
  { id: 'photographer', name: '摄影师视角', desc: '发现美的过程' },
  { id: 'story', name: '故事叙事', desc: '拍摄当天的小故事' },
  { id: 'behind', name: '幕后花絮', desc: '过程中的趣味/困难' },
  { id: 'tutorial', name: '干货教程', desc: '技巧、pose心得' },
  { id: 'memory', name: '情感回忆', desc: '照片留住时光的意义' },
  { id: 'qa', name: 'Q&A 问答', desc: '问题引入，正文回答' },
  { id: 'contrast', name: '对比反差', desc: '前后对比，吊胃口' },
]

// 切换模型
export function setModel(model) {
  localStorage.setItem('ai_model', model)
}

function getApiKey() {
  return localStorage.getItem('ai_api_key') || ''
}

function getBaseUrl() {
  return localStorage.getItem('ai_base_url') || 'https://api.deepseek.com'
}

function getModel() {
  return localStorage.getItem('ai_model') || 'deepseek-chat'
}

function truncateText(text, maxLength) {
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

const MAX_IMAGES_FOR_AI = 50
const IMAGE_ANALYSIS_BATCH_SIZE = 6

function toImageDataUrl(img) {
  if (!img) return ''
  if (img.url?.startsWith('data:') || img.url?.startsWith('http')) return img.url
  if (img.base64) return `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`
  return img.url || ''
}

function buildReferenceSample(item, index) {
  const originalTitle = item.originalTitle || item.title || ''
  const originalContent = item.originalContent || item.content || ''
  const parts = [`【素材${index + 1}】`]

  if (originalTitle) {
    parts.push(`标题：${originalTitle}`)
  }
  if (originalContent) {
    parts.push(`正文：${originalContent}`)
  }
  if (item.viralReason) {
    parts.push(`爆款原因：${truncateText(item.viralReason, 220)}`)
  }

  return parts.join('\n')
}

function buildInfluencerStylePrompt(referenceSamples) {
  return `你是一名小红书文案风格分析师。请基于下面这位博主的所有标题和正文，提炼一个可用于后续仿写的「风格总结」。

请深度分析，不要泛泛而谈。重点观察：
1. 标题撰写特征：常见句式、标题长度、标点习惯、情绪强度、钩子方式、是否爱用反差/疑问/感叹/场景化词汇。
2. 正文撰写特征：开头方式、段落长度、换行节奏、叙事顺序、口语化程度、常见语气词、emoji 使用、是否爱用清单/故事/感谢/感受。
3. 内容结构特征：通常先写什么、再写什么、如何收束、如何植入摄影师身份或备婚干货。
4. 标签特征：标签数量、标签类型、地域词、业务词、场景词的组合方式。
5. 仿写注意事项：哪些地方可以模仿，哪些原句/标题倾向必须避免照搬。

输出一份结构化风格总结，控制在 900 字以内。只输出风格总结，不要创作新文案。

【博主素材】
${referenceSamples}`
}

function extractJsonArray(text) {
  if (!text) throw new Error('AI 没有返回内容')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced ? fenced[1] : text
  const jsonMatch = source.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('AI 返回中没有 JSON 数组')
  return JSON.parse(repairJsonStringLiterals(jsonMatch[0]))
}

function extractJsonObject(text) {
  if (!text) throw new Error('AI 没有返回内容')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced ? fenced[1] : text
  const jsonMatch = source.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 返回中没有 JSON 对象')
  return JSON.parse(repairJsonStringLiterals(jsonMatch[0]))
}

function repairJsonStringLiterals(source) {
  let result = ''
  let inString = false
  let escaped = false

  for (const char of source) {
    if (escaped) {
      result += char
      escaped = false
      continue
    }

    if (char === '\\') {
      result += char
      escaped = true
      continue
    }

    if (char === '"') {
      result += char
      inString = !inString
      continue
    }

    if (inString && char === '\n') {
      result += '\\n'
      continue
    }

    if (inString && char === '\r') {
      continue
    }

    result += char
  }

  return result
}

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function buildFallbackImageProfile(img, imageIndex, rawText = '') {
  const imageId = String(img.id || `image-${imageIndex}`)
  return {
    id: imageId,
    imageId,
    imageIndex,
    name: img.name || `image_${imageIndex}`,
    description: rawText || '图片描述解析失败，请人工查看原图。主体、场景、光线、构图和情绪需要后续补充。',
    subject: '',
    scene: '',
    light: '',
    composition: '',
    emotion: '',
    people: '',
    highlights: '',
    color: '',
    aesthetics: '',
    details: '',
    risks: '',
  }
}

function normalizeImageProfile(raw, img, imageIndex) {
  const imageId = String(img.id || raw?.imageId || `image-${imageIndex}`)
  const descriptionParts = [
    raw?.description,
    raw?.subject && `主体：${raw.subject}`,
    raw?.scene && `场景：${raw.scene}`,
    raw?.light && `光线：${raw.light}`,
    raw?.composition && `构图：${raw.composition}`,
    raw?.color && `色彩：${raw.color}`,
    raw?.emotion && `情绪：${raw.emotion}`,
    raw?.people && `人物状态：${raw.people}`,
    raw?.highlights && `画面亮点：${raw.highlights}`,
    raw?.aesthetics && `摄影美学：${raw.aesthetics}`,
    raw?.details && `画面细节：${raw.details}`,
    raw?.risks && `风险点：${raw.risks}`,
  ].filter(Boolean)

  return {
    id: imageId,
    imageId,
    imageIndex,
    name: img.name || raw?.fileName || `image_${imageIndex}`,
    description: descriptionParts.join('\n') || raw?.summary || '',
    subject: raw?.subject || '',
    scene: raw?.scene || '',
    light: raw?.light || '',
    composition: raw?.composition || '',
    color: raw?.color || '',
    emotion: raw?.emotion || '',
    people: raw?.people || '',
    highlights: raw?.highlights || '',
    aesthetics: raw?.aesthetics || '',
    details: raw?.details || '',
    risks: raw?.risks || '',
  }
}

function summarizeImageProfile(profile) {
  return `【图片${profile.imageIndex}】
imageId：${profile.imageId}
文件名：${profile.name || ''}
主体：${profile.subject || ''}
场景：${profile.scene || ''}
光线：${profile.light || ''}
构图：${profile.composition || ''}
色彩：${profile.color || ''}
情绪：${profile.emotion || ''}
人物状态：${profile.people || ''}
画面亮点：${profile.highlights || ''}
摄影美学：${profile.aesthetics || ''}
画面细节：${profile.details || ''}
风险点：${profile.risks || ''}
综合描述：${profile.description || ''}`
}

function buildReferenceContext(library, referenceSource, bloggerStyleProfile, maxSamples = 12) {
  const samples = (library || []).slice(0, maxSamples).map((item, index) => buildReferenceSample(item, index)).join('\n\n')
  if (referenceSource === 'influencer') {
    return `【参考博主写作风格】
${bloggerStyleProfile || '暂无单独风格文件，请参考下方样本的标题句式、正文节奏和语气。'}

${samples ? `【少量原始样本】
${samples}` : ''}`
  }
  if (referenceSource === 'viral') {
    return samples ? `【爆款参考样本】\n${samples}` : ''
  }
  return samples ? `【参考素材】\n${samples}` : ''
}

// 通用请求
async function chat(messages, options = {}) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('请先配置 API Key')

  const baseUrl = getBaseUrl()

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getModel(),
      messages,
      ...options
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 请求失败: ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

export async function analyzeUploadedImages(images, theme, options = {}) {
  if (!images || images.length === 0) return []

  const limitedImages = images.slice(0, MAX_IMAGES_FOR_AI)
  const profiles = []
  const onPrompt = options.onPrompt

  for (const batch of chunkArray(limitedImages, IMAGE_ANALYSIS_BATCH_SIZE)) {
    const batchStart = limitedImages.indexOf(batch[0])
    const imageContents = batch.map(img => ({
      type: 'image_url',
      image_url: { url: toImageDataUrl(img) }
    }))
    const imageList = batch.map((img, idx) => {
      const imageIndex = batchStart + idx + 1
      return `${idx + 1}. imageId=${String(img.id || `image-${imageIndex}`)}，全局编号=${imageIndex}，文件名=${img.name || ''}`
    }).join('\n')

    const prompt = `你是专业摄影图片分析师。请逐张分析本批图片，只做客观、详尽的画面描述和摄影美学分析。

主题：${theme || '未识别'}

本步骤的唯一目标：为后续“小红书封面筛选”提供客观图片档案。
严格禁止：
- 不要参考任何博主信息。
- 不要参考用户关键词。
- 不要判断哪张更适合做封面。
- 不要打分，不要输出任何分数或评分字段。
- 不要生成标题建议、文案方向、选题方向。

本批图片顺序如下，请严格按顺序输出同样数量的 JSON 元素：
${imageList}

每张图必须细致描述以下内容：
1. 主体：画面中最重要的人/物/动作。
2. 场景：室内/户外/窗边/仪式/街景等空间信息。
3. 光线：光源方向、明暗、光比、质感、氛围。
4. 构图：主体位置、景别、留白、前后景、画面层次。
5. 色彩：主色调、冷暖、对比、饱和度、整体色彩感受。
6. 情绪氛围：画面自然传递的情绪，不要写营销钩子。
7. 人物状态：表情、姿态、互动、是否自然。
8. 摄影美学：光影、空间、线条、虚实、质感、叙事感。
9. 画面细节：值得注意的物件、动作、环境元素。
10. 客观风险点：模糊、曝光、主体不清、画面杂乱等客观问题。
11. 综合描述：不少于150字，完整描述画面内容和审美特征。

只返回 JSON 数组，不要解释。格式：
[
  {
    "imageId": "复制上面给出的imageId",
    "imageIndex": 1,
    "fileName": "文件名",
    "description": "不少于120字的综合描述",
    "subject": "",
    "scene": "",
    "light": "",
    "composition": "",
    "color": "",
    "emotion": "",
    "people": "",
    "highlights": "",
    "aesthetics": "",
    "details": "",
    "risks": ""
  }
]`

    const promptMeta = {
      step: 'image_analysis',
      title: `图片描述分析 - 第 ${Math.floor(batchStart / IMAGE_ANALYSIS_BATCH_SIZE) + 1} 批`,
      batchIndex: Math.floor(batchStart / IMAGE_ANALYSIS_BATCH_SIZE) + 1,
      imageIndexes: batch.map((_, idx) => batchStart + idx + 1),
      prompt,
      createdAt: new Date().toISOString()
    }

    try {
      const response = await chat([
        {
          role: 'user',
          content: [
            ...imageContents,
            { type: 'text', text: prompt }
          ]
        }
      ])
      onPrompt && onPrompt({ ...promptMeta, response })
      const parsed = extractJsonArray(response)
      batch.forEach((img, idx) => {
        const imageIndex = batchStart + idx + 1
        profiles.push(normalizeImageProfile(parsed[idx] || {}, img, imageIndex))
      })
    } catch (err) {
      console.error('图片分析失败:', err)
      onPrompt && onPrompt({ ...promptMeta, error: err.message })
      batch.forEach((img, idx) => {
        const imageIndex = batchStart + idx + 1
        profiles.push(buildFallbackImageProfile(img, imageIndex, err.message))
      })
    }
  }

  return profiles
}

export async function selectCoverImages(imageProfiles, bloggerCoverStyleProfile = '', options = {}) {
  const profiles = Array.isArray(imageProfiles) ? imageProfiles : []
  if (profiles.length <= 4) {
    return profiles
      .slice()
      .map((profile, index) => ({
        ...profile,
        selectedRank: index + 1,
        selectedReason: bloggerCoverStyleProfile
          ? '候选图片数量不超过4张，直接入选；后续文案将围绕该图生成。'
          : '候选图片数量不超过4张，且缺少博主封面策略，按上传顺序直接入选。',
      }))
  }

  const profileText = profiles.map(summarizeImageProfile).join('\n\n')
  const prompt = `你是小红书封面主编。请基于下面每张图片的详细档案，从中选出4张最适合作为封面的图片。

选择原则：
1. 必须参考当前博主的 cover_style_profile，判断哪些图片更符合该博主过往封面审美和选择习惯。
2. 同时结合小红书封面通用标准：第一眼吸引力、缩略图可读性、主体辨识度、构图完整度、光线质感、情绪张力、画面差异化。
3. 只做封面筛选，不要创作标题、文案、标题方向或内容角度。
4. 不要输出分数，只输出入选图片和选择理由。

${bloggerCoverStyleProfile ? `【必须参考的博主 cover_style_profile】\n${bloggerCoverStyleProfile}\n` : '【必须记录】当前缺少博主 cover_style_profile，只能基于图片审美、摄影质量与小红书封面通用标准筛选。\n'}

【图片档案】
${profileText}

只返回 JSON 数组，必须正好4个元素：
注意：JSON 字符串内部如需换行，必须使用 \\n 转义，不要在字符串中直接换行。
[
  {
    "imageId": "",
    "imageIndex": 1,
    "selectedReason": "入选原因，说明分数、视觉差异和博主策略依据"
  }
]`

  try {
    const response = await chat([{ role: 'user', content: prompt }])
    options.onPrompt && options.onPrompt({
      step: 'cover_selection',
      title: '封面选择',
      prompt,
      response,
      createdAt: new Date().toISOString()
    })
    const choices = extractJsonArray(response)
    const usedIds = new Set()
    const selected = []

    for (const choice of choices) {
      const profile = profiles.find(item =>
        String(item.imageId) === String(choice.imageId)
        || Number(item.imageIndex) === Number(choice.imageIndex)
      )
      if (profile && !usedIds.has(profile.imageId)) {
        usedIds.add(profile.imageId)
        selected.push({
          ...profile,
          selectedRank: selected.length + 1,
          selectedReason: choice.selectedReason || '',
        })
      }
      if (selected.length >= 4) break
    }

    const fallback = profiles.slice()
    for (const profile of fallback) {
      if (selected.length >= 4) break
      if (!usedIds.has(profile.imageId)) {
        usedIds.add(profile.imageId)
        selected.push({
          ...profile,
          selectedRank: selected.length + 1,
          selectedReason: 'AI 选择结果不足4张，按上传顺序补足入选。',
        })
      }
    }

    return selected
  } catch (err) {
    console.error('封面选择失败:', err)
    options.onPrompt && options.onPrompt({
      step: 'cover_selection',
      title: '封面选择',
      prompt,
      error: err.message,
      createdAt: new Date().toISOString()
    })
    return profiles
      .slice()
      .slice(0, 4)
      .map((profile, index) => ({
        ...profile,
        selectedRank: index + 1,
        selectedReason: '封面选择解析失败，按上传顺序兜底入选。',
      }))
  }
}

export async function generateContentFromSelectedProfiles(selectedProfiles, keywords, theme, library, referenceSource = 'all', bloggerStyleProfile = null, options = {}) {
  const profiles = (selectedProfiles || []).slice(0, 4)
  if (profiles.length === 0) throw new Error('缺少已选封面图片描述')

  const keywordInstruction = keywords
    ? `用户关键词：${keywords}。必须自然融入标题和正文，不要生硬堆砌。`
    : '用户没有填写关键词，不要假设关键词。'
  const referenceContext = buildReferenceContext(library, referenceSource, bloggerStyleProfile)
  const profileContext = profiles.map(summarizeImageProfile).join('\n\n')

  const prompt = `你是小红书摄影内容专家。现在已经完成图片分析和封面选择，你只需要基于入选的4张封面图片描述生成4组标题和文案。

重要限制：
- 不要重新选择封面。
- 不要输出未入选图片。
- 每组标题和正文必须严格围绕对应 imageId/imageIndex 的图片描述来写。
- 返回顺序必须与下面“入选封面”顺序一致。
- 禁止复制参考素材原句。

主题：${theme || '婚礼跟拍'}
${keywordInstruction}

${referenceContext}

【入选封面图片描述】
${profileContext}

只返回 JSON 数组，必须正好4个元素：
[
  {
    "imageId": "对应图片imageId",
    "imageIndex": 1,
    "title": "标题",
    "content": "正文",
    "coverReason": "为什么这张封面适合这组标题文案",
    "reason": "模仿参考博主哪些写法，以及原创变化"
  }
]`

  const response = await chat([{ role: 'user', content: prompt }])
  options.onPrompt && options.onPrompt({
    step: 'content_generation',
    title: '标题文案生成',
    prompt,
    response,
    createdAt: new Date().toISOString()
  })
  return response
}

export async function refreshSingleGeneratedItem({ mode, item, imageProfile, keywords, theme, bloggerStyleProfile = '' }) {
  if (!item) throw new Error('缺少要刷新的内容')
  if (!imageProfile) throw new Error('缺少当前封面图片描述')

  const isTitle = mode === 'title'
  const prompt = `你是小红书摄影内容编辑。请只为当前这一条生成一个全新的${isTitle ? '标题' : '文案'}，不要生成其他帖子，不要改变封面图。

【当前封面图片描述】
${summarizeImageProfile(imageProfile)}

主题：${theme || '婚礼跟拍'}
用户关键词：${keywords || '无'}

【参考博主写作风格】
${bloggerStyleProfile || '暂无'}

要求：
1. 必须围绕当前这张封面图片描述来写。
2. 必须参考博主的标题句式、正文节奏和语气。
3. 必须自然融合关键词；没有关键词就不要硬写。
4. 不要返回4组，不要换封面。
5. 不要参考或复述当前已有标题、正文，也不要延续旧内容的表达方式。
6. ${isTitle ? '只返回一个全新的标题。' : '只返回一段全新的正文文案。'}

只返回 JSON 对象：
注意：JSON 字符串内部如需换行，必须使用 \\n 转义，不要在字符串中直接换行。
${isTitle ? '{"title": "新标题"}' : '{"content": "新文案"}'}`

  const response = await chat([{ role: 'user', content: prompt }])
  return {
    ...extractJsonObject(response),
    prompt,
    response,
    promptMeta: {
      step: isTitle ? 'refresh_title' : 'refresh_content',
      title: isTitle ? `刷新标题 - 图片${imageProfile.imageIndex}` : `刷新文案 - 图片${imageProfile.imageIndex}`,
      imageId: imageProfile.imageId,
      imageIndex: imageProfile.imageIndex,
      createdAt: new Date().toISOString()
    }
  }
}

// 分析图片（返回图片描述）
export async function analyzeImage(imageBase64, imageUrl = '') {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('请先配置 API Key')

  const baseUrl = getBaseUrl()

  // 构建图片内容
  let imageContent
  if (imageBase64) {
    imageContent = {
      type: 'image_url',
      image_url: {
        url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
      }
    }
  } else if (imageUrl) {
    imageContent = {
      type: 'image_url',
      image_url: { url: imageUrl }
    }
  } else {
    throw new Error('缺少图片')
  }

  const messages = [
    {
      role: 'user',
      content: [
        imageContent,
        {
          type: 'text',
          text: '请分析这张图片：1. 图片内容是什么 2. 适合什么主题（婚礼/孕照） 3. 作为封面图有什么特点，为什么吸引人'
        }
      ]
    }
  ]

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getModel(),
      messages
    })
  })

  if (!response.ok) throw new Error('图片分析失败')
  const data = await response.json()
  return data.choices[0].message.content
}

// 识别主题（婚礼/孕照）
export async function detectTheme(images) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('请先配置 API Key')

  const baseUrl = getBaseUrl()

  const imageContents = images.map(img => ({
    type: 'image_url',
    image_url: {
      url: toImageDataUrl(img)
    }
  }))

  const messages = [
    {
      role: 'user',
      content: [
        ...imageContents,
        {
          type: 'text',
          text: '请分析这些图片，判断属于哪个主题：婚礼跟拍（订婚/领证/婚礼）还是孕照跟拍？只需要回答"婚礼跟拍"或"孕照跟拍"，不要其他内容。'
        }
      ]
    }
  ]

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getModel(),
      messages
    })
  })

  if (!response.ok) throw new Error('主题识别失败')
  const data = await response.json()
  const result = data.choices[0].message.content.trim()

  if (result.includes('孕')) return '孕照跟拍'
  if (result.includes('婚礼')) return '婚礼跟拍'
  return '婚礼跟拍' // 默认
}

// 分析博主风格（用于生成风格文件）
export async function analyzeInfluencerStyle(library) {
  if (!library || library.length === 0) {
    throw new Error('没有素材可供分析')
  }
  
  const referenceSamples = library.map((item, index) => buildReferenceSample(item, index)).join('\n\n')
  
  const styleProfile = await chat([
    {
      role: 'user',
      content: buildInfluencerStylePrompt(referenceSamples)
    }
  ])
  
  return styleProfile
}

// 生成文案
export async function generateContent(images, keywords, library, theme, referenceSource = 'all', bloggerStyleProfile = null, bloggerCoverStyleProfile = null, options = {}) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('请先配置 API Key')

  const baseUrl = getBaseUrl()
  const hasImages = images.length > 0
  const { refreshTitle, refreshContent, refreshIndex } = options

  // 图片内容构建（最多发送50张给AI，对应上传上限）
  const imagesToSend = images.slice(0, MAX_IMAGES_FOR_AI)
  const imageContents = imagesToSend.map((img, idx) => ({
    type: 'image_url',
    image_url: {
      url: toImageDataUrl(img)
    }
  }))

  // 素材库风格构建
  let libraryContext = ''
  let referenceHint = ''
  
  if (library && library.length > 0) {
    const referenceSamples = library.map((item, index) => buildReferenceSample(item, index)).join('\n\n')
    
    // 根据参考来源类型添加不同的提示
    if (referenceSource === 'influencer') {
      // 如果传入了风格总结（从文件读取），直接使用；否则实时生成
      let styleProfile = bloggerStyleProfile
      
      if (!styleProfile) {
        try {
          styleProfile = await chat([
            {
              role: 'user',
              content: buildInfluencerStylePrompt(referenceSamples)
            }
          ])
        } catch (err) {
          console.error('风格分析失败:', err)
          styleProfile = '（风格分析失败，将基于原始素材直接生成）'
        }
      }

      referenceHint = `【参考博主全量素材】
下面先给出已基于全量素材提炼出的博主风格总结，然后给出该博主 Excel 中所有可用素材。你不是泛泛参考，而是要基于风格总结和原始素材模仿这位博主的写法。

【该博主风格总结】
${styleProfile}

【仿写要求】
- 模仿标题的句式、长度、标点、情绪强度、口语感和小红书钩子方式
- 模仿正文的段落节奏、换行习惯、表达顺序、语气词、emoji 和话题标签习惯
- 如果用户填写了关键词，必须融合关键词重新创作；如果未填写，不要假设关键词
- 禁止直接复制任何原标题
- 禁止连续照搬原正文中的完整句子
- 新内容要像同一位博主新写的一篇，而不是对素材做摘要

`
    } else if (referenceSource === 'viral') {
      referenceHint = '【重要】以下素材来自热门爆款帖子，请学习其爆款逻辑、钩子技巧和传播要素：\n'
    } else {
      referenceHint = '【参考素材库风格】\n'
    }
    
    libraryContext = `${referenceHint}${referenceSamples}`
  }

  const keywordInstruction = keywords
    ? `用户关键词：${keywords}。需要自然融入标题和正文，不要生硬堆砌。`
    : '用户没有填写关键词。本次生成不要假设关键词，也不要为了凑关键词硬写无关内容。'

  const imageInstruction = hasImages ? `用户上传了${images.length}张${theme}主题的照片，需要你从中智能选择4张作为小红书封面，并基于每张被选中的封面内容生成4组完全不同风格的标题和文案。

【照片说明】
- 共上传${images.length}张照片，编号为1到${images.length}
- 已为你提供${imagesToSend.length}张照片供分析
- 你需要从这些照片中选择4张作为封面，编号范围是1-${imagesToSend.length}

【封面选择要求】
1. 从${imagesToSend.length}张图片中选择4张作为封面
2. 优先判断画面内容是否吸引人、是否有停留感、是否能引起点击和讨论、是否具备成为爆款封面的潜力
3. 重点观察主体辨识度、人物表情/动作、情绪张力、构图、光线、色彩、场景信息量和小红书首页缩略图下的可读性
4. 4张封面要有差异化：不同构图、不同场景、不同情绪，不要选太相似的图
5. 封面编号必须是1-${imagesToSend.length}之间的数字

【生成优先级】
1. 首先参考你选中的那张封面图片内容：标题和正文要能解释、放大或承接这张图的画面情绪与内容
2. 其次参考关键词：${keywordInstruction}
3. 最后参考博主人设风格、过往标题和文案素材：学习句式、语气、结构和标签习惯，但不能照抄`
    : `当前是纯文字测试模式，用户没有上传照片。请根据关键词和参考博主的标题、正文，生成4组完全不同风格的小红书标题和正文。

【纯文字测试要求】
1. 不要分析图片，不要选择封面
2. 不要输出 coverIndex 和 coverReason
3. ${keywordInstruction}
4. 重点模仿参考博主的标题句式、正文结构、语气和标签习惯`

  const coverExamples = [2, 5, 1, 3].map((index, fallback) => Math.min(index, imagesToSend.length || fallback + 1))
  const outputShape = hasImages ? `[
  {
    "title": "标题1（模仿参考博主句式，不能照抄）",
    "content": "正文1（模仿参考博主表达结构，融合关键词）",
    "coverIndex": ${coverExamples[0]},
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题2（模仿参考博主句式，不能照抄）",
    "content": "正文2（模仿参考博主表达结构，融合关键词）",
    "coverIndex": ${coverExamples[1]},
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题3（模仿参考博主句式，不能照抄）",
    "content": "正文3（模仿参考博主表达结构，融合关键词）",
    "coverIndex": ${coverExamples[2]},
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题4（模仿参考博主句式，不能照抄）",
    "content": "正文4（模仿参考博主表达结构，融合关键词）",
    "coverIndex": ${coverExamples[3]},
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  }
]` : `[
  {
    "title": "标题1（模仿参考博主句式，不能照抄）",
    "content": "正文1（模仿参考博主表达结构，融合关键词）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题2（模仿参考博主句式，不能照抄）",
    "content": "正文2（模仿参考博主表达结构，融合关键词）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题3（模仿参考博主句式，不能照抄）",
    "content": "正文3（模仿参考博主表达结构，融合关键词）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题4（模仿参考博主句式，不能照抄）",
    "content": "正文4（模仿参考博主表达结构，融合关键词）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  }
]`

  const refreshInstruction = (refreshTitle || refreshContent)
    ? `\n【刷新要求】正在刷新第 ${(refreshIndex || 0) + 1} 组，请生成4组全新内容（与"${refreshTitle || refreshContent?.substring(0, 20)}..."不同），但只需返回包含4个元素的完整JSON数组（复用原有解析逻辑）：`
    : ''

  const prompt = `你是小红书摄影内容专家。${imageInstruction}

主题：${theme}

${libraryContext}
${refreshInstruction}

【内容生成要求】${refreshInstruction ? '必须生成4组全新内容，第1组要与原来的有显著差异（标题不同、句式不同、角度不同）：' : '必须生成4组完全不同的内容！4组之间要有明显差异：'}
1. 如果有封面图，标题和正文必须先围绕该组 coverIndex 对应图片的画面内容、情绪、场景和爆款潜力来写
2. 标题要像参考博主会写的新标题，但不能和任何原标题一模一样
3. 正文要像参考博主会写的新正文，但不能连续照搬原文完整句子
4. ${keywordInstruction}
5. 4组之间可以从不同素材的句式里变体，但不要机械套模板

${keywordInstruction}

【重要】必须返回4组内容，不要只返回1组！

【输出格式】只返回一个JSON数组，必须包含4个元素，每个元素的title和content都要独特，不能有任何相似：
${outputShape}

【严格要求】
- 必须返回包含4个元素的JSON数组
- 不要添加任何解释文字，只返回JSON
- 确保JSON格式正确，可以被JSON.parse解析`

  const messages = [
    {
      role: 'user',
      content: hasImages
        ? [
            ...imageContents,
            { type: 'text', text: prompt }
          ]
        : prompt
    }
  ]

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getModel(),
      messages
    })
  })

  if (!response.ok) {
    const err = await response.text().catch(() => '')
    throw new Error(err ? `生成失败: ${err}` : '生成失败')
  }
  const data = await response.json()
  return data.choices[0].message.content
}

// 爬取博主内容分析（接收真实帖子数组）
export async function analyzeInfluencer(posts) {
  const postsText = posts.map((p, i) =>
    `【帖子${i + 1}】\n标题：${p.title}\n正文：${p.content}`
  ).join('\n\n')

  const messages = [
    {
      role: 'user',
      content: `以下是从小红书博主主页爬取的 ${posts.length} 篇帖子原文，请分析这位博主的内容风格：

${postsText}

对每篇帖子分析：
1. 封面图分析（根据标题推测封面风格）
2. 标题分析（风格特征、钩子技巧）
3. 文案分析（结构、语气、关键词）

返回一个 JSON 格式的数据，包含一个 posts 数组，每个元素包含：
- originalTitle: 原标题
- originalContent: 原文案
- coverAnalysis: 封面图分析
- titleAnalysis: 标题分析
- contentAnalysis: 文案分析
- titleStyle: 标题风格特征总结
- contentStyle: 文案风格特征总结`
    }
  ]

  return chat(messages)
}

// 爆款分析（接收真实爬取的帖子数组）
export async function analyzeViral(posts) {
  const postsText = posts.map((p, i) =>
    `【帖子${i + 1}】\n标题：${p.title}\n正文：${p.content}`
  ).join('\n\n')

  const messages = [
    {
      role: 'user',
      content: `以下是从小红书搜索结果爬取的 ${posts.length} 篇帖子原文，请分析这些爆款帖子的规律：

${postsText}

对每篇帖子分析：
1. 标题分析（为什么有热度、风格特征、钩子技巧）
2. 文案分析（结构、语气、关键词）
3. 爆款原因（为什么能爆）

返回一个 JSON 格式的数据，包含一个 posts 数组，每个元素包含：
- originalTitle: 原标题
- originalContent: 原文案
- titleAnalysis: 标题分析
- contentAnalysis: 文案分析
- titleStyle: 标题风格特征总结
- contentStyle: 文案风格特征总结
- viralReason: 为什么爆`
    }
  ]

  return chat(messages)
}
