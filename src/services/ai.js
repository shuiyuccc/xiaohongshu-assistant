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
        url: `data:image/jpeg;base64,${imageBase64}`
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
      url: img.base64 ? `data:image/jpeg;base64,${img.base64}` : img.url
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
export async function generateContent(images, keywords, library, theme, referenceSource = 'all', bloggerStyleProfile = null) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('请先配置 API Key')

  const baseUrl = getBaseUrl()
  const hasImages = images.length > 0

  // 图片内容构建（最多发送20张给AI，避免超出token限制）
  const imagesToSend = images.slice(0, 20)
  const imageContents = imagesToSend.map((img, idx) => ({
    type: 'image_url',
    image_url: {
      url: img.base64 ? `data:image/jpeg;base64,${img.base64}` : img.url
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
- 必须融合用户关键词重新创作
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

  const imageInstruction = hasImages ? `用户上传了${images.length}张${theme}主题的照片，需要你从中智能选择4张作为封面，并生成4组完全不同风格的标题和文案。

【照片说明】
- 共上传${images.length}张照片，编号为1到${images.length}
- 已为你提供前${imagesToSend.length}张照片供分析
- 你需要从这${images.length}张中选择4张作为封面，编号范围是1-${images.length}

【封面选择要求】
1. 从${images.length}张图片中选择4张作为封面
2. 4张封面要有差异化：不同构图、不同场景、不同情绪
3. 封面要能吸引用户点击，有视觉冲击力
4. 封面编号必须是1-${images.length}之间的数字`
    : `当前是纯文字测试模式，用户没有上传照片。请只根据用户关键词和参考博主的标题、正文，生成4组完全不同风格的小红书标题和正文。

【纯文字测试要求】
1. 不要分析图片，不要选择封面
2. 不要输出 coverIndex 和 coverReason
3. 重点模仿参考博主的标题句式、正文结构、语气和标签习惯`

  const outputShape = hasImages ? `[
  {
    "title": "标题1（模仿参考博主句式，不能照抄）",
    "content": "正文1（模仿参考博主表达结构，融合关键词）",
    "coverIndex": 2,
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题2（模仿参考博主句式，不能照抄）",
    "content": "正文2（模仿参考博主表达结构，融合关键词）",
    "coverIndex": 5,
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题3（模仿参考博主句式，不能照抄）",
    "content": "正文3（模仿参考博主表达结构，融合关键词）",
    "coverIndex": 1,
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "模仿了参考博主哪些句式/结构，同时做了哪些原创变化"
  },
  {
    "title": "标题4（模仿参考博主句式，不能照抄）",
    "content": "正文4（模仿参考博主表达结构，融合关键词）",
    "coverIndex": 3,
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

  const prompt = `你是小红书摄影内容专家。${imageInstruction}

主题：${theme}

${libraryContext}

【内容生成要求】
每组内容必须完全不同！4组之间要有明显差异：
1. 标题要像参考博主会写的新标题，但不能和任何原标题一模一样
2. 正文要像参考博主会写的新正文，但不能连续照搬原文完整句子
3. 标题和正文都必须自然融合用户关键词，不要生硬堆砌
4. 4组之间可以从不同素材的句式里变体，但不要机械套模板

用户关键词：${keywords}

【输出格式】只返回一个JSON数组，每个元素的title和content都要独特，不能有任何相似：
${outputShape}`

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
