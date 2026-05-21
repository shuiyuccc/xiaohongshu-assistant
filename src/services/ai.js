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
const CREATIVE_GENERATION_OPTIONS = {
  temperature: 1.05,
  top_p: 0.95,
  presence_penalty: 0.55,
  frequency_penalty: 0.45,
}

const STYLE_IMITATION_OPTIONS = {
  temperature: 0.72,
  top_p: 0.9,
  presence_penalty: 0.1,
  frequency_penalty: 0.05,
}

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
  return `你是一名小红书文案风格分析师。请基于下面这位博主的所有标题和正文，提取可用于后续仿写的「风格素材库」。

⚠️ 重要原则：
1. 只提取素材中真实出现的内容，禁止编造
2. 如果某个类别的词汇在素材里没有出现，写"未出现"，不要用通用词汇填充
3. 每个词都必须能在素材里找到出处，不要凭空想象

【博主素材】
${referenceSamples}

---

## 一、标题分析

### 1.1 标题高频词（只从标题中提取，出现2次以上）

- **情绪词**：（如"绝了""封神""心动"等情绪表达）
  - 格式要求：每个词必须标注"词(出现X次，笔记ID1、ID2...)"
  - 示例：幸福(出现5次，笔记1、3、7)

- **场景词**：（如"晨袍""接亲""光影"等场景描述）
  - 格式：词(出现X次，笔记ID1...)

- **钩子词**：（如"被问爆""救命""后悔没早点"等吸引点击的词）
  - 格式：词(出现X次，笔记ID1...)

- **动作词**：（如"抓拍""定格""记录"等描述动作的词）
  - 格式：词(出现X次，笔记ID1...)

⚠️ 注意：
1. 只输出素材里真实出现2次以上的词，没有就写"未出现"
2. 示例词只有在素材中真实出现过的才能输出
3. **每个词必须标注笔记ID和出现次数，这是强制要求**

### 1.2 标题句式模板（从真实标题中提取结构）
格式：原文标题 → 结构分析

请从素材中提取3-5个真实标题，并分析其句式结构。

### 1.3 标题语气特征
- **标点习惯**：爱用感叹号/问号/句号/未出现
- **emoji使用**：常用类型、放置位置（开头/中间/结尾/未使用）
- **语气词**：（列出真实出现的语气词，如无则写"未出现"）
- **人称使用**：（列出真实使用的人称，如无则写"未出现"）

---

## 二、正文分析

### 2.1 正文高频词（只从正文中提取，出现2次以上）

- **描述词**：（如"温柔""浪漫""自然""高级"等描述词）
  - 格式：词(出现X次，笔记ID1...)

- **动作词**：（如"抓拍""定格""记录"等描述动作的词）
  - 格式：词(出现X次，笔记ID1...)

⚠️ 注意：
1. 只输出素材里真实出现2次以上的词，没有就写"未出现"
2. 示例词只有在素材中真实出现过的才能输出
3. **每个词必须标注笔记ID和出现次数，这是强制要求**

### 2.2 正文句式特点
- 句子长短偏好：（短句为主/长句为主/混合）
- 常用连接词：（如有关联词则列出，如无则写"未使用"）
- 段落结构特点：（如：先描述场景再讲感受）

### 2.3 正文语气特征
- **标点习惯**：逗号使用频率、断句特点
- **语气词**：列出真实出现的语气词，如无则写"未出现"
- **人称使用**：列出真实使用的人称，如无则写"未出现"

---

## 三、可直接仿写的写作规则

请把上面的分析进一步整理成后续生成可执行的规则，禁止只写"温柔、浪漫、治愈"这类泛化总结。

### 3.1 标题槽位词库
请把标题高频词整理成可填入标题骨架的槽位词库，不要只是罗列词。
- 情绪表达槽：如"好喜欢""太爱了""谁懂啊"这类放在标题开头或情绪位置的表达
- 审美形容槽：如"超有生命力""很松弛""复古感"这类修饰主体/风格的表达
- 场景空间槽：如老洋房、窗边、草坪、花园、街景、酒店等
- 主体关系槽：如孕妈妈、家人、狗狗、猫咪、新人、宝宝、妈妈等
- 动作行为槽：如带着、牵着、记录、拍、奔赴、拥抱等
- 时间光线槽：如傍晚、午后、春天、黄昏、阳光、光影等
- 拍摄品类槽：如孕照、写真、婚纱照、旅行照、亲子照等
- 语气连接槽：如这套/这组/一起/啦/呀/～/｜/· 等

每类槽位都要标注素材ID和出现次数。没有真实出现就写"未出现"。

### 3.2 标题骨架库
列出6-10条真实标题骨架，必须覆盖不同原素材，不要只选最像的几条。格式必须包含：
- 原标题：素材ID + 原文标题
- 原标题骨架：只能从"原文标题"拆出来，用 [槽位类型] 标出可替换位置，保留固定连接词、语序、语气词和标点
- 固定结构词：必须逐字保留的结构词/连接词/语气词/符号，例如"谁家的""都这么""呀～""带着我们的""一起来拍""啦"
- 可替换槽位：每个槽位允许填入哪些类型的词
- 槽位长度：每个槽位应使用短词/短语填充，不要用完整句子填充；短词槽只能替换为短词，短语槽只能替换为短语
- 槽位填充建议：优先使用标题槽位词库、同义近义词，或当前图片里的具体元素
- 禁止替换：说明哪些槽位不能跨类型替换，例如时间不能替换成动作，地点不能替换成情绪

骨架拆解质量要求：
- 骨架必须能通过把槽位填回原标题内容来还原原标题；不能根据新生成标题反推出一个新骨架。
- 输出"标题骨架"时必须拆参考素材标题，不准拆生成后的标题。
- 固定结构词必须是在原文标题中真实出现、且新标题需要原样保留的词；不要把可替换内容词写成固定结构词。
- 可替换槽位必须保持词性和功能一致：短词换短词，短语换短语，不能用一句完整动作描写替换一个评价词或场景词。
- "喜欢/好喜欢/太爱"这类是情绪或偏好表达，不要拆成动作。
- "干净又耐看/超有爱/超有生命力"这类是审美形容槽，不要拆成主体。
- "照片/写真/孕照/人生照片/孕期记录"是内容品类或拍摄品类槽，不要拆成动作。
- "在苏州/get/人生照片"应拆成"在 + [地点] + get + [结果/品类]"，其中 get 是固定动作标记，不代表整句都是动作结构。
- "超有爱的老洋房孕期记录"应拆成"[审美形容] + 的 + [场景空间] + [拍摄品类]"，不是只抽象成"温柔风格 + 场景"。
- "谁家的场地纯色窗帘都这么出片呀～"应拆成"谁家的 + [场景/道具] + 都这么 + [效果评价] + 呀～"，不能拆成生成标题里的"场景元素 + 画面效果 + 动作"。

### 3.3 标题替换规则
- 标题仿写必须先选原标题，再拆骨架，再填槽，不能只拿原句做语义灵感
- 可以完全替换槽位词，可以部分保留原词，也可以做同义词/近义词转化
- 必须保持原标题的语序、句法关系、固定连接词和语气节奏
- 固定结构词必须逐字出现在最终新标题里；如果缺失任何固定结构词，该标题不合格，必须重写。
- 槽位映射必须是同级替换：短词换短词、短语换短语，禁止用完整句子替换一个短词/短语槽位。
- 禁止骨架漂移：如果原骨架是"带着我们的 + [对象] + 一起来拍 + [品类] + 啦"，新标题也必须保留这个句法关系
- 禁止跨类型替换：时间槽只能填时间/光线，动作槽只能填动作，场景槽只能填场景，品类槽只能填拍摄品类
- 复用限制：在保留原标题句式结构的前提下，最终新标题最多只能复用1个原标题里的内容词；结构词和符号（如"的""在""get""啦""～""｜"）不计入这个数量。
- 如果复用了1个原标题内容词，其他内容槽位必须用图片解析关键词、同义近义词或新的高频槽位词替换。
- 如果新标题复用2个及以上原标题内容词，该标题视为和原标题重复，必须重写。
- 锚点一致性：如果写作参考来源里声称保留了"超有爱""老洋房""孕期记录"等锚点，最终标题必须出现这些词或清晰近义词；如果标题没有出现，就不能说保留了该锚点，只能说替换了该槽位。
- 固定锚点优先保留结构词和语气词；内容词是否保留要以最终标题可见为准，不能在 reason 里虚构保留。

### 3.4 正文仿写规则
- 列出3-6条正文开头方式，必须引用素材ID和原文短句
- 总结换行节奏：每行大约多少字、常见几行进入标签、是否有短句留白
- 总结常见表达顺序：先写画面/人物/情绪/拍摄感受/标签中的哪一种
- 总结标签习惯：常见标签、标签数量、是否固定带品牌/城市/主题标签

### 3.5 反向约束
- 列出3-5条生成时不要写的内容，例如该博主很少使用的语气、过度AI腔、过度营销词

### 3.6 仿写参考句
- 基于真实素材提取5条"参考来源"，只引用原文中短句或标题骨架，不要创作新句子
- 格式：素材ID：可参考点 -> 适合用于什么类型的新内容`
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

function buildReferenceContext(library, referenceSource, bloggerStyleProfile, maxSamples = 100) {
  const samples = (library || []).slice(0, maxSamples).map((item, index) => buildReferenceSample(item, index)).join('\n\n')
  if (referenceSource === 'influencer') {
    return `【参考博主风格素材库】
${bloggerStyleProfile || '暂无风格素材库文件，请参考下方原始样本提取风格特征。'}

【引用要求】
- 下方原始样本的编号就是写作参考来源编号，所有样本都是标题结构候选库。
- 4组内容必须使用4条不同的原始样本标题作为标题骨架来源。
- 可以选择风格素材库中已经拆过的标题骨架，也可以从未被风格总结抽到的原始样本标题中现场拆骨架。
- 选择标题来源时，优先匹配当前图片的场景、主体、情绪、动作、时间光线和拍摄品类。
- 生成每组内容时，必须先选原始标题，再拆骨架，再按槽位填词。
- 最终生成标题必须是参考原标题骨架的实例化结果，不能先自由生成标题再事后解释。
- 标题高频词只能作为槽位词库使用：情绪词填情绪槽，场景词填场景槽，动作词填动作槽，时间词填时间槽，品类词填品类槽。
- 可以完全替换槽位词、部分保留原词或使用同义近义词，但必须保持原句骨架结构稳定。
- 部分保留原词时，最终新标题最多只能复用1个原标题内容词；结构词和符号不计入数量。
- 固定结构词必须逐字出现在最终新标题里；槽位映射必须短词/短语替换短词/短语，禁止句子替换短语。
- 禁止跨类型替换：时间不能替换成动作，地点不能替换成情绪词，拍摄品类不能替换成普通形容词。
- 不要只写"参考了温柔风格"这类泛化描述。

${samples ? `【原始样本参考】
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

  const hasKeywords = keywords && keywords.trim().length > 0
  
  // 根据是否有关键词，构建不同的权重说明
  const prioritySection = hasKeywords
    ? `【生成优先级 - 有关键词模式】

1. 关键词（最高优先级 - 必须满足）
   - 标题必须自然包含关键词："${keywords}"
   - 关键词是用户明确要求的，不可违背
   - 如果关键词与图片描述冲突，以关键词为准

2. 图片描述 & 博主风格（同等重要 - 灵活平衡）
   - 标题要贴合图片内容
   - 同时参考博主的句式、词汇、语气
   - 两者冲突时，以关键词为最终判断标准`
    : `【生成优先级 - 无关键词模式】

1. 博主风格（主要参考 - 60%权重）
   - 优先使用博主的高频词汇库中的词
   - 优先套用博主的句式模板
   - 优先模仿博主的语气特征
   - 让标题听起来像这位博主会写的

2. 图片描述（次要参考 - 40%权重）
   - 标题要基本符合图片内容
   - 在不违背博主风格的前提下，融入图片元素
   - 如果图片描述和博主风格冲突，优先博主风格`

  const keywordInstruction = hasKeywords
    ? `用户关键词：${keywords}。必须自然融入标题和正文，不要生硬堆砌。`
    : '用户没有填写关键词，不要假设关键词。'
  
  const referenceContext = buildReferenceContext(library, referenceSource, bloggerStyleProfile)
  const profileContext = profiles.map(summarizeImageProfile).join('\n\n')

  const prompt = `你是小红书摄影内容专家。现在已经完成图片分析和封面选择，你只需要基于入选的4张封面图片描述生成4组标题和文案。

重要限制：
- 标题优先贴近参考博主的真实长度；一般控制在20字左右，如果参考博主常用更长标题，最多不超过32个字符。
- 每组标题和正文必须对应 imageId/imageIndex 的图片描述。
- 返回顺序必须与"入选封面"顺序一致。
- 禁止复制参考素材原句。
- 生成理由字段不是爆款分析，而是"写作参考来源"：必须说明参考了哪些博主素材/风格规则。
- 4组必须使用4条不同的原始样本标题作为标题骨架来源，不能重复使用同一条素材标题。

${prioritySection}

主题：${theme || '婚礼跟拍'}
${keywordInstruction}

${referenceContext}

【入选封面图片描述】
${profileContext}

---

## 一、写标题的规则

### 1.1 标题结构来源选择
- 每一组必须先从【原始样本参考】中选择1条具体标题作为标题骨架来源。
- 4组必须选择4条不同的素材标题，不能重复。
- 优先选择与当前 imageIndex 图片相近的原素材标题：场景相近、主体相近、情绪相近、动作相近、时间光线相近或拍摄品类相近。
- 如果风格素材库已经拆过某条标题骨架，可以使用；如果没有拆过，也必须从原始样本标题中现场拆出骨架。
- 不要只使用风格总结里少数几个模板，原始样本标题也必须作为结构候选。

### 1.2 骨架填槽方法
- 先拆"参考素材原标题"的骨架，再生成标题。reason 里的标题骨架必须来自参考原标题，不是生成标题的骨架。
- 原标题骨架必须能还原原标题：把槽位填回参考原标题里的词后，应该能重新得到原参考标题。
- 禁止根据已经生成的新标题反推骨架；如果骨架无法还原参考原标题，这组结果不合格，需要重写。
- 生成标题必须沿用参考原标题骨架。骨架必须保持原句语序、句法关系、固定连接词、语气词和标点。
- 最终 title 必须是"原标题骨架 + 新槽位词"的实例化结果；不允许先自由写标题，再把它解释成参考了某个原标题。
- 固定结构词必须逐字出现在最终 title 里。比如参考"谁家的 + [场景/道具] + 都这么 + [效果评价] + 呀～"，最终 title 必须包含"谁家的""都这么""呀～"。
- 只替换骨架中的槽位内容。槽位内容可以完全替换、部分保留原词，或使用同义词/近义词。
- 槽位替换必须是短词/短语对短词/短语的同级替换，不能用一个完整句子替换短词槽或短语槽。
- 当选择"部分保留原词"时，最终 title 最多只能复用1个原标题内容词；结构词和符号（如"的""在""get""啦""～""｜"）不计入。
- 如果已经保留了1个原标题内容词，其他内容槽位必须替换为图片解析关键词、同义近义词或新的高频槽位词。
- 如果 title 复用了2个及以上原标题内容词，这组标题不合格，必须重写。
- 标题高频词只能作为槽位词库使用：情绪词填情绪槽，审美词填审美槽，场景词填场景槽，主体词填主体槽，动作词填动作槽，时间/光线词填时间光线槽，品类词填拍摄品类槽。
- 禁止跨类型替换：时间不能替换成动作，地点不能替换成情绪词，拍摄品类不能替换成普通形容词。
- 禁止骨架漂移：新标题必须还能看出原参考标题的结构，而不是只表达相似语义。
- 如果 reason 声称保留了某个锚点词，最终 title 必须出现这个词或清晰近义词；否则 reason 必须写"将该槽位替换为..."，不能写"保留"。
- 内容词和结构词要分开：可以保留"的/在/get/啦/｜/～"这类结构锚点，也可以替换"老洋房/苏州/人生照片"这类内容槽位，但必须如实说明。
- 生成完每组后先自检：reason 的骨架能否还原参考原标题？title 中是否能看出参考标题骨架？reason 里说保留的词是否真的出现在 title 里？

### 1.3 可接受与不可接受示例
原句："带着我们的家人狗狗一起来拍孕照啦"
骨架："带着我们的 + [亲密对象] + 一起来拍 + [拍摄品类] + 啦"
可接受："牵着猫咪一起去拍旅行照啦"
不可接受："猫咪陪伴下的温柔旅行记录"

原句："好喜欢这套超有生命力的红色衣服写真"
骨架："[情绪表达] + 这套/这组 + [审美形容] + 的 + [颜色/主体] + [拍摄品类]"
可接受："太爱这组超有故事感的蓝色花园写真"
不可接受："蓝色花园里有故事感的一组照片"

原句："喜欢干净又耐看的照片～在苏州get人生照片"
正确骨架："[偏好表达] + [审美形容] + 的 + [内容品类] + ～ + 在 + [地点] + get + [结果/品类]"
可接受："好喜欢松弛又耐看的孕照～在窗边get温柔大片"
不可接受："米白长裙配山景，前侧光下的孕照太温柔了～"

原句："超有爱的老洋房孕期记录"
正确骨架："[审美形容] + 的 + [场景空间] + [拍摄品类]"
可接受："超有爱的窗边山景合体照"（只复用"超有爱"这1个原标题内容词）
可接受："很有爱的米白长裙孕期记录"（只复用"孕期记录"这1个原标题内容词）
不可接受："超有爱的窗边山景孕期记录"（同时复用"超有爱"和"孕期记录"两个内容词，太接近原标题）
不可接受："剪影里的孕爱｜在哥特窗前定格两人的心跳"

原句："谁家的场地纯色窗帘都这么出片呀～"
正确骨架："谁家的 + [场景/道具] + 都这么 + [效果评价] + 呀～"
可接受："谁家的白纱窗影都这么温柔呀～"
可接受："谁家的窗边光影都这么有爱呀～"
不可接受："纱帘下剪影里的两人，把爱托在肚子上～"
不可接受："谁家的窗边光影都这么她抚发轻按腹的温柔瞬间呀～"
不可接受原因：用完整动作句替换了"出片"这个短评价槽。
不可接受原因：这是生成标题的新骨架，不是参考原标题的骨架。

### 1.4 标题反面示例 - 避免AI腔

**过于正式/像说明书：**
❌ "这是一组精美的婚礼摄影作品，展现了新人的幸福时刻"
❌ "通过专业的拍摄手法，记录了婚礼当天的精彩瞬间"

**堆砌形容词/过度夸张：**
❌ "超美超仙超浪漫的婚礼现场，真的太好看太惊艳太绝了"
❌ "绝绝子！美到窒息！封神了！yyds！"

**空洞无物/万能句式：**
❌ "这样的婚礼谁不爱呢，真的太美了"
❌ "这就是爱情最美好的样子"

**机械套用/毫无变化：**
❌ 直接复制原标题而不做任何变化
❌ 把关键词替换，其他一模一样

**AI味浓厚的表达：**
❌ "让我们一起走进这场视觉盛宴"
❌ "不得不说，这场婚礼真的太令人印象深刻了"
❌ "值得一提的是，新娘的妆容非常精致"

**过度文艺/矫情：**
❌ "时光荏苒，岁月如梭，唯有爱永恒"
❌ "在时光的长河里，我们都是匆匆的过客"

✅ **通用质检示例（只用于避免AI腔，不要当作博主风格来源）：**
- 具体有画面感："阳光穿过晨袍的那一刻，连空气都变甜了"
- 口语化自然："谁懂啊！抓拍的这一瞬间，比摆拍还好看"
- 有情绪但不夸张："first look时他回头的那一眼，我按了20次快门"
- 有细节有故事："伴娘团躲在门后偷看，比新娘还紧张"

---

## 二、写正文的规则

### 2.1 正文生成原则
- 参考【正文高频词】（描述词、动作词）
- 参考【正文句式特点】（句子长短、连接词、段落结构）
- 参考【正文语气特征】（标点、语气词、人称）
- 以上三项可以组合使用，也可以选择单个使用，不强制要求全部使用
- 基于图片描述和标题展开，有细节、有氛围、有情绪

### 2.2 正文写作要点
- 从图片细节出发，描述画面中的元素
- 融入情绪，让读者感受到现场氛围
- 可以适当加入拍摄者的视角或感受
- 段落不要太长，保持可读性

### 2.3 正文反面示例 - 避免AI腔

**过于正式/像说明书：**
❌ "本组照片采用了自然光线，营造出温馨浪漫的氛围"
❌ "通过专业的构图技巧，展现了新人的优雅姿态"

**空洞无物/万能句式：**
❌ "记录美好瞬间，定格幸福时光"
❌ "用镜头记录你们的爱情故事"
❌ "每一帧都充满了爱与美好"

**堆砌形容词：**
❌ "超级无敌巨好看的婚礼现场，美到让人窒息"

**AI味浓厚的表达：**
❌ "从专业的角度来看，这组照片构图精美、光线到位"
❌ "值得一提的是，整个拍摄过程非常顺利"

✅ **通用质检示例（只用于避免AI腔，不要当作博主风格来源）：**
- 有细节："阳光从窗户斜射进来，刚好打在她的侧脸上，那一刻她正在整理头纱，没注意到我在拍"
- 有情绪："first look的时候，他转过身，愣了两秒，然后眼眶就红了。我在旁边连按快门，手也在抖"
- 有氛围："晚宴的灯光很暖，他们跳第一支舞的时候，周围的人都安静了，只有音乐和他们的笑声"

---

## 三、自检清单

生成每组标题和正文后，检查：
- 标题能准确描述图片内容吗？像博主会写的吗？
- 正文有细节、有情绪、有氛围吗？还是泛泛而谈？
- 读起来自然顺口吗？有没有过于AI的感觉？
- 标题和正文风格一致吗？

## 四、写作参考来源输出要求

每组的 reason 字段必须分成两个部分，JSON 字符串内换行请使用 \\n：
【标题来源】
1. 参考素材标题：素材X《原标题》
2. 选择原因：分析该参考素材标题与当前图片的场景、主体、情绪、动作或拍摄品类的关联程度
3. 原标题骨架：写出参考素材原标题的框架句式结构，必须能填回原词还原原标题，不能写生成标题的骨架
4. 槽位替换：必须用"原槽位短词/短语 -> 新槽位短词/短语"列出映射，并说明固定结构词是否逐字保留；禁止句子级替换

【正文来源】
1. 正文参考：引用1个原始样本编号或正文规则
2. 借用方式：说明借用了什么开头方式、换行节奏、标签习惯或表达顺序

reason 禁止写成泛泛的"结合博主风格和图片内容"，必须出现"素材X"、"原标题"、"原标题骨架"、"槽位替换"、"正文节奏"这类可核查信息。

只返回 JSON 数组，必须正好4个元素：
[
  {
    "imageId": "对应图片imageId",
    "imageIndex": 1,
    "title": "标题",
    "content": "正文",
    "coverReason": "为什么这张封面适合这组标题文案",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与图片Y在场景/主体/情绪上相近\\n3. 原标题骨架：「固定词 + [槽位] + 固定词」\\n4. 槽位替换：固定结构词已逐字保留；[原槽位短语] -> [新槽位短语]\\n【正文来源】\\n1. 正文参考：素材Z/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  }
]`

  const response = await chat([{ role: 'user', content: prompt }], STYLE_IMITATION_OPTIONS)
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
  const hasKeywords = keywords && keywords.trim().length > 0
  
  // 根据是否有关键词，构建不同的权重说明
  const prioritySection = hasKeywords
    ? `【生成优先级 - 有关键词模式】
1. 关键词（最高优先级）：标题必须自然包含"${keywords}"
2. 图片描述 & 博主风格（同等重要）：灵活平衡两者`
    : `【生成优先级 - 无关键词模式】
1. 博主风格（60%权重）：优先使用博主的高频词和句式模板
2. 图片描述（40%权重）：在不违背风格的前提下融入图片元素`

  const titleRules = `## 一、刷新标题的做法

### 1.1 标题生成原则
- 参考【标题高频词】（情绪词、场景词、钩子词、动作词）
- 参考【标题句式模板】（用真实标题的结构）
- 参考【标题语气特征】（标点、emoji、语气词、人称）
- 以上三项可以组合使用，也可以选择单个使用，不强制要求全部使用

### 1.2 标题组合创新方法
- 句式模板 + 高频词汇：用博主的句式，填入博主的高频词
- 多个模板混合：用模板A的前半句 + 模板B的后半句
- 语气特征 + 图片描述：用博主的语气描述图片内容

### 1.3 标题反面示例 - 避免AI腔

**过于正式/像说明书：**
❌ "这是一组精美的婚礼摄影作品，展现了新人的幸福时刻"
❌ "通过专业的拍摄手法，记录了婚礼当天的精彩瞬间"

**堆砌形容词/过度夸张：**
❌ "超美超仙超浪漫的婚礼现场，真的太好看太惊艳太绝了"
❌ "绝绝子！美到窒息！封神了！yyds！"

**空洞无物/万能句式：**
❌ "这样的婚礼谁不爱呢，真的太美了"
❌ "这就是爱情最美好的样子"

**机械套用/毫无变化：**
❌ 直接复制原标题而不做任何变化
❌ 把关键词替换，其他一模一样

**AI味浓厚的表达：**
❌ "让我们一起走进这场视觉盛宴"
❌ "不得不说，这场婚礼真的太令人印象深刻了"
❌ "值得一提的是，新娘的妆容非常精致"

**过度文艺/矫情：**
❌ "时光荏苒，岁月如梭，唯有爱永恒"
❌ "在时光的长河里，我们都是匆匆的过客"

### 1.4 标题正面示例

✅ 具体有画面感："阳光穿过晨袍的那一刻，连空气都变甜了"
✅ 口语化自然："谁懂啊！抓拍的这一瞬间，比摆拍还好看"
✅ 有情绪但不夸张："first look时他回头的那一眼，我按了20次快门"
✅ 有细节有故事："伴娘团躲在门后偷看，比新娘还紧张"

### 1.5 刷新标题的自检清单

生成标题后，检查：
- 这个标题能准确描述图片内容吗？
- 这个标题像博主会写的吗？
- 读起来自然顺口吗？
- 有没有过于AI的感觉？
- 标题字数加emoji符号，不超过20个字符？`

  const contentRules = `## 二、刷新正文的做法

### 2.1 正文生成原则
- 参考【正文高频词】（描述词、动作词）
- 参考【正文句式特点】（句子长短、连接词、段落结构）
- 参考【正文语气特征】（标点、语气词、人称）
- 以上三项可以组合使用，也可以选择单个使用，不强制要求全部使用
- 基于图片描述和标题展开，有细节、有氛围、有情绪

### 2.2 正文写作要点
- 从图片细节出发，描述画面中的元素
- 融入情绪，让读者感受到现场氛围
- 可以适当加入拍摄者的视角或感受
- 段落不要太长，保持可读性

### 2.3 正文反面示例 - 避免AI腔

**过于正式/像说明书：**
❌ "本组照片采用了自然光线，营造出温馨浪漫的氛围"
❌ "通过专业的构图技巧，展现了新人的优雅姿态"

**空洞无物/万能句式：**
❌ "记录美好瞬间，定格幸福时光"
❌ "用镜头记录你们的爱情故事"
❌ "每一帧都充满了爱与美好"

**堆砌形容词：**
❌ "超级无敌巨好看的婚礼现场，美到让人窒息"

**AI味浓厚的表达：**
❌ "从专业的角度来看，这组照片构图精美、光线到位"
❌ "值得一提的是，整个拍摄过程非常顺利"

### 2.4 正文正面示例

✅ 有细节："阳光从窗户斜射进来，刚好打在她的侧脸上，那一刻她正在整理头纱，没注意到我在拍"
✅ 有情绪："first look的时候，他转过身，愣了两秒，然后眼眶就红了。我在旁边连按快门，手也在抖"
✅ 有氛围："晚宴的灯光很暖，他们跳第一支舞的时候，周围的人都安静了，只有音乐和他们的笑声"

### 2.5 刷新正文的自检清单

生成正文后，检查：
- 正文有细节、有情绪、有氛围吗？还是泛泛而谈？
- 读起来自然顺口吗？有没有过于AI的感觉？
- 正文和标题风格一致吗？
- 段落不要太长，保持可读性？`

  const prompt = `你是小红书摄影内容编辑。请只为当前这一条生成一个全新的${isTitle ? '标题' : '文案'}，不要生成其他帖子，不要改变封面图。

${prioritySection}

【当前封面图片描述】
${summarizeImageProfile(imageProfile)}

主题：${theme || '婚礼跟拍'}
用户关键词：${keywords || '无'}

【参考博主风格素材库】
${bloggerStyleProfile || '暂无'}

【仿写规则 - 如何使用风格素材库】

${isTitle ? titleRules : contentRules}

${isTitle ? '' : `
---

【当前标题】（正文需承接此标题的风格和情绪）
${item?.title || '（无标题参考）'}
`}

要求：
1. ${hasKeywords ? `标题必须自然包含关键词"${keywords}"` : '优先使用博主的高频词汇和句式模板'}
2. 参考博主的语气、标点、emoji使用习惯
3. ${isTitle ? '标题字数加emoji符号，不能超过20个字符' : '段落不要太长，保持可读性'}
4. 不要参考或复述当前已有内容，要全新创作
5. ${isTitle ? '只返回一个全新的标题' : '只返回一段全新的正文文案'}

只返回 JSON 对象：
${isTitle ? '{"title": "新标题"}' : '{"content": "新文案"}'}`

  const response = await chat([{ role: 'user', content: prompt }], STYLE_IMITATION_OPTIONS)
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
      messages,
      ...CREATIVE_GENERATION_OPTIONS
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
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与当前图片在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  },
  {
    "title": "标题2（模仿参考博主句式，不能照抄）",
    "content": "正文2（模仿参考博主表达结构，融合关键词）",
    "coverIndex": ${coverExamples[1]},
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与当前图片在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  },
  {
    "title": "标题3（模仿参考博主句式，不能照抄）",
    "content": "正文3（模仿参考博主表达结构，融合关键词）",
    "coverIndex": ${coverExamples[2]},
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与当前图片在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  },
  {
    "title": "标题4（模仿参考博主句式，不能照抄）",
    "content": "正文4（模仿参考博主表达结构，融合关键词）",
    "coverIndex": ${coverExamples[3]},
    "coverReason": "为什么选这张图片作为封面（从构图/光线/表情等角度分析）",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与当前图片在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  }
]` : `[
  {
    "title": "标题1（模仿参考博主句式，不能照抄）",
    "content": "正文1（模仿参考博主表达结构，融合关键词）",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与关键词在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  },
  {
    "title": "标题2（模仿参考博主句式，不能照抄）",
    "content": "正文2（模仿参考博主表达结构，融合关键词）",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与关键词在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  },
  {
    "title": "标题3（模仿参考博主句式，不能照抄）",
    "content": "正文3（模仿参考博主表达结构，融合关键词）",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与关键词在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
  },
  {
    "title": "标题4（模仿参考博主句式，不能照抄）",
    "content": "正文4（模仿参考博主表达结构，融合关键词）",
    "reason": "【标题来源】\\n1. 参考素材标题：素材X《原标题》\\n2. 选择原因：该素材与关键词在场景/主体/情绪上相近\\n3. 原标题骨架：「...」\\n4. 槽位替换：保留...，将...替换为...\\n【正文来源】\\n1. 正文参考：素材Y/正文规则\\n2. 借用方式：借用开头方式、正文节奏或标签习惯。"
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
2. 每组标题必须先从原始参考素材中选择1条具体标题作为骨架来源，4组必须使用4条不同的原素材标题
3. 优先选择与当前图片/关键词在场景、主体、情绪、动作、时间光线或拍摄品类上相近的原素材标题
4. 必须先分析参考素材原标题的框架句式结构，再在这个原标题骨架上进行槽位填充和替换
5. reason 里写出的骨架必须是参考素材原标题的骨架，不能是生成后标题的骨架；该骨架填回原标题词汇后必须能还原原标题
6. 生成标题时必须保持原标题骨架结构稳定，只替换槽位内容；槽位可以完全替换、部分保留原词，或做同义近义转化
7. 最终 title 必须是"原标题骨架 + 新槽位词"的实例化结果；不允许先自由写标题，再把它解释成参考了某个原标题
8. 固定结构词必须逐字出现在最终 title 里；例如参考"谁家的 + [场景/道具] + 都这么 + [效果评价] + 呀～"，title 必须包含"谁家的""都这么""呀～"
9. 槽位替换必须是短词/短语对短词/短语的同级替换，不能用完整句子替换短词槽或短语槽
10. 当选择"部分保留原词"时，最终 title 最多只能复用1个原标题内容词；结构词和符号（如"的""在""get""啦""～""｜"）不计入
11. 如果已经保留了1个原标题内容词，其他内容槽位必须替换为图片解析关键词、同义近义词或新的高频槽位词
12. 如果 title 复用了2个及以上原标题内容词，这组标题不合格，必须重写
13. 标题高频词只能作为槽位词库使用：情绪词填情绪槽，场景词填场景槽，动作词填动作槽，时间词填时间槽，品类词填品类槽
14. 禁止跨类型替换：时间不能替换成动作，地点不能替换成情绪词，拍摄品类不能替换成普通形容词
15. 如果 reason 声称保留了某个锚点词，最终 title 必须出现这个词或清晰近义词；否则 reason 必须写"替换了该槽位"，不能写"保留"
16. "喜欢/好喜欢/太爱"是情绪或偏好表达，不是动作；"干净又耐看/超有爱"是审美形容，不是主体；"照片/人生照片/孕期记录"是内容或拍摄品类，不是动作
17. "喜欢干净又耐看的照片～在苏州get人生照片"这类标题应拆成"[偏好表达] + [审美形容] + 的 + [内容品类] + ～ + 在 + [地点] + get + [结果/品类]"
18. 标题要像参考博主会写的新标题，但不能和任何原标题一模一样
19. 正文要像参考博主会写的新正文，但不能连续照搬原文完整句子
20. ${keywordInstruction}
21. 4组之间必须从不同原素材标题的骨架里变体，但不要机械套模板

${keywordInstruction}

【重要】必须返回4组内容，不要只返回1组！

【写作参考来源要求】
- 每组 reason 字段显示给用户看，含义是"写作参考来源"，不是爆款分析。
- reason 必须分成两部分：【标题来源】和【正文来源】，JSON 字符串内换行使用 \\n。
- 【标题来源】下必须有4点：1. 参考素材标题；2. 选择原因；3. 原标题骨架；4. 槽位替换。
- 【正文来源】下必须说明正文参考了哪个素材编号/正文节奏/标签习惯，以及具体借用方式。
- 槽位替换必须写成"原槽位短词/短语 -> 新槽位短词/短语"，不得用完整句子替换短语槽。
- 必须说明固定结构词是否逐字出现在 title 中。
- 如果有图片，必须说明如何把参考写法改写到该 coverIndex 的画面元素上。
- reason 里说保留的锚点必须真的出现在 title 里；如果没出现，只能说替换了该槽位。
- 如果 reason 的骨架无法还原参考原标题，或只是总结了生成标题的结构，该组结果不合格，必须重写。
- reason 里写"保留"的原标题内容词最多只能有1个；如果保留2个及以上原标题内容词，该组结果不合格，必须重写。
- 禁止只写"参考博主风格生成"、"综合评估"这类泛泛理由。

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
      messages,
      ...STYLE_IMITATION_OPTIONS
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
