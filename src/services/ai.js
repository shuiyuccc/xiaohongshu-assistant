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

// 生成文案
export async function generateContent(images, keywords, library, theme, referenceSource = 'all') {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('请先配置 API Key')

  const baseUrl = getBaseUrl()

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
    const styleSummary = library.slice(0, 5).map(item => {
      let summary = `【标题风格】${item.titleStyle || '未分析'}\n【文案风格】${item.contentStyle || '未分析'}`
      if (item.viralReason) {
        summary += `\n【爆款原因】${item.viralReason}`
      }
      if (item.likes) {
        summary += `\n【点赞数】${item.likes}`
      }
      return summary
    }).join('\n\n')
    
    // 根据参考来源类型添加不同的提示
    if (referenceSource === 'influencer') {
      referenceHint = '【重要】请重点参考以下特定博主的风格特征，模仿其独特的表达方式和内容结构：\n'
    } else if (referenceSource === 'viral') {
      referenceHint = '【重要】以下素材来自热门爆款帖子，请学习其爆款逻辑、钩子技巧和传播要素：\n'
    } else {
      referenceHint = '【参考素材库风格】\n'
    }
    
    libraryContext = `${referenceHint}${styleSummary}`
  }

  const prompt = `你是小红书摄影内容专家。用户上传了${images.length}张${theme}主题的照片，需要你从中智能选择4张作为封面，并生成4组完全不同风格的标题和文案。

【照片说明】
- 共上传${images.length}张照片，编号为1到${images.length}
- 已为你提供前${imagesToSend.length}张照片供分析
- 你需要从这${images.length}张中选择4张作为封面，编号范围是1-${images.length}

主题：${theme}

${libraryContext}

【封面选择要求】
1. 从${images.length}张图片中选择4张作为封面
2. 4张封面要有差异化：不同构图、不同场景、不同情绪
3. 封面要能吸引用户点击，有视觉冲击力
4. 封面编号必须是1-${images.length}之间的数字

【内容生成要求】
每组内容必须完全不同！4组之间要有明显差异：
1. 标题：句式、长度、风格都要不同，不能相似
2. 文案：内容、语气、结构都要不同，不能相似
3. 封面：每组选不同的图片序号，不能重复

【必须严格遵守】为每组指定以下角度（4选4，不能重复）：
- 组1用：用户视角（孕妇/新人第一人称，自然亲切）
- 组2用：摄影师视角（发现美的过程，专业感）
- 组3用：故事叙事（拍摄当天的小故事，有情节）
- 组4用：幕后花絮 或 干货教程 或 情感回忆 或 Q&A问答 或 对比反差（任选一个，和前面不同）

用户关键词：${keywords}

【输出格式】只返回一个JSON数组，每个元素的title和content都要独特，不能有任何相似：
[
  {
    "title": "组1标题（用户视角，要有网感）",
    "content": "组1文案（用户视角风格，有活人感，符合${theme}）",
    "coverIndex": 2,
    "angle": "用户视角",
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "为什么这个标题能成为爆款（分析标题的吸引力、钩子、关键词）"
  },
  {
    "title": "组2标题（摄影师视角，要有网感）",
    "content": "组2文案（摄影师视角风格，专业感，符合${theme}）",
    "coverIndex": 5,
    "angle": "摄影师视角",
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "为什么这个标题能成为爆款（分析标题的吸引力、钩子、关键词）"
  },
  {
    "title": "组3标题（故事叙事，要有网感）",
    "content": "组3文案（故事叙事风格，有情节，符合${theme}）",
    "coverIndex": 1,
    "angle": "故事叙事",
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "为什么这个标题能成为爆款（分析标题的吸引力、钩子、关键词）"
  },
  {
    "title": "组4标题（XX角度，要有网感）",
    "content": "组4文案（XX角度风格，符合${theme}）",
    "coverIndex": 3,
    "angle": "幕后花絮/干货教程/情感回忆/Q&A问答/对比反差",
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "为什么这个标题能成为爆款（分析标题的吸引力、钩子、关键词）"
  }
]`

  const messages = [
    {
      role: 'user',
      content: [
        ...imageContents,
        { type: 'text', text: prompt }
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

  if (!response.ok) throw new Error('生成失败')
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