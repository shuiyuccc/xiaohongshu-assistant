# 小红书内容助手 (Xiaohongshu Assistant)

一款面向摄影师/内容创作者的智能小红书内容生成工具，支持素材库管理、AI文案生成、小红书爬虫数据采集等功能。

---

## 一、项目概述

### 1.1 核心功能
- **AI内容生成**: 上传照片 + 关键词，AI自动生成4组不同风格的标题和文案
- **素材库管理**: 爬取小红书博主/爆款内容，AI分析风格并存储为素材
- **历史记录**: 保存用户的生成历史，方便回顾
- **小红书登录**: 支持扫码登录小红书，获取Cookie进行数据采集

### 1.2 目标用户
- 婚礼跟拍摄影师
- 孕照跟拍摄影师
- 小红书内容创作者

---

## 二、技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Frontend)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   React 18  │  │ TailwindCSS │  │       Vite 5           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP (REST API)
┌───────────────────────────▼─────────────────────────────────────┐
│                        后端 (Backend)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Express 4  │  │   SQLite    │  │    Playwright Core     │  │
│  │   (API)     │  │  (sql.js)   │  │   (小红书爬虫)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      外部服务 (External)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              DeepSeek API / 其他 OpenAI 兼容 API         │   │
│  │              (AI 内容生成、图片分析)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 小红书 (xiaohongshu.com)                │   │
│  │              (数据采集、扫码登录)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈详情

#### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | UI框架 |
| React DOM | 18.2.0 | DOM渲染 |
| Vite | 5.1.4 | 构建工具 |
| TailwindCSS | 3.4.1 | CSS框架 |
| PostCSS | 8.4.35 | CSS处理 |
| Autoprefixer | 10.4.18 | 浏览器兼容 |

#### 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| Express | 4.18.2 | Web服务器 |
| CORS | 2.8.5 | 跨域处理 |
| sql.js | 1.10.3 | SQLite数据库 |
| Playwright Core | 1.44.0 | 浏览器自动化 |

#### AI服务
- **主力**: DeepSeek API (支持 OpenAI 兼容格式)
- **备选**: 通义千问 VL 2.0
- **模型**: `deepseek-chat` (默认)

---

## 三、项目结构

```
xiaohongshu-assistant/
├── src/                          # 前端源码
│   ├── components/               # React组件
│   │   ├── ImageUploader.jsx     # 图片上传组件
│   │   ├── Login.jsx             # 登录组件
│   │   └── OutputCard.jsx        # 结果展示卡片
│   ├── pages/                    # 页面组件
│   │   ├── Generator.jsx         # 内容生成页
│   │   └── Library.jsx           # 素材库页
│   ├── services/                 # 服务层
│   │   ├── ai.js                 # AI服务封装
│   │   └── api.js                # API请求封装
│   ├── utils/                    # 工具函数
│   │   ├── db.js                 # IndexedDB封装
│   │   └── storage.js            # LocalStorage封装
│   ├── App.jsx                   # 主应用组件
│   ├── main.jsx                  # 入口文件
│   └── index.css                 # 全局样式
├── server/                       # 后端服务
│   ├── server.js                 # Express服务器
│   ├── package.json              # 后端依赖
│   ├── data.db                   # SQLite数据库文件
│   └── cookies.json              # 小红书Cookie存储
├── index.html                    # HTML模板
├── vite.config.js                # Vite配置
├── tailwind.config.js            # Tailwind配置
├── postcss.config.js             # PostCSS配置
└── package.json                  # 前端依赖
```

---

## 四、数据库设计

### 4.1 数据表结构

#### users (用户表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键，用户唯一ID |
| name | TEXT | 用户名 |
| created_at | TEXT | 创建时间 |

#### library (素材库表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| user_id | TEXT | 用户ID |
| type | TEXT | 类型 (influencer/viral) |
| source | TEXT | 来源链接 |
| original_cover | TEXT | 原始封面图 |
| original_title | TEXT | 原标题 |
| original_content | TEXT | 原文案 |
| cover_analysis | TEXT | 封面分析 |
| title_analysis | TEXT | 标题分析 |
| content_analysis | TEXT | 文案分析 |
| title_style | TEXT | 标题风格 |
| content_style | TEXT | 文案风格 |
| created_at | TEXT | 创建时间 |

#### history (历史记录表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| user_id | TEXT | 用户ID |
| images | TEXT | 图片URL数组 (JSON) |
| keywords | TEXT | 关键词 |
| theme | TEXT | 主题 |
| results | TEXT | 生成结果 (JSON) |
| created_at | TEXT | 创建时间 |

---

## 五、API接口文档

### 5.1 用户相关

#### 获取或创建用户
```http
POST /api/users/:name
```
- **参数**: `name` - 用户名
- **返回**: `{ id, name }`

#### 获取用户数据
```http
GET /api/users/:name/data
```
- **返回**: `{ library: [], history: [] }`

### 5.2 素材库相关

#### 添加素材
```http
POST /api/library
```
- **Body**: `{ userId, item }`
- **item字段**: type, source, originalTitle, originalContent, coverAnalysis, titleAnalysis, contentAnalysis, titleStyle, contentStyle

#### 删除素材
```http
DELETE /api/library/:id
```

### 5.3 历史记录相关

#### 添加历史记录
```http
POST /api/history
```
- **Body**: `{ userId, item }`
- **item字段**: images, keywords, theme, results

### 5.4 小红书爬虫相关

#### 检查登录状态
```http
GET /api/xhs/session
```
- **返回**: `{ loggedIn: boolean }`

#### 启动二维码登录
```http
POST /api/xhs/qr-login/start
```
- **返回**: `{ qrImage: base64字符串 }`

#### 获取登录状态
```http
GET /api/xhs/qr-login/status
```
- **返回**: `{ status: 'waiting'|'confirmed'|'expired', qrImage?, nickname? }`

#### 爬取博主帖子
```http
POST /api/xhs/scrape
```
- **Body**: `{ url: 博主主页链接, count: 数量 }`
- **返回**: `{ posts: [{ title, content }] }`

#### 搜索爆款帖子
```http
POST /api/xhs/search
```
- **Body**: `{ keyword: 关键词, count: 数量 }`
- **返回**: `{ posts: [{ title, content }] }`

---

## 六、AI服务接口

### 6.1 配置方式
AI配置存储在 `localStorage`:
- `ai_api_key` - API密钥
- `ai_base_url` - API基础URL (默认: `https://api.deepseek.com`)
- `ai_model` - 模型名称 (默认: `deepseek-chat`)

### 6.2 核心函数

#### analyzeImage(imageBase64, imageUrl)
分析单张图片内容、主题、封面特点。

#### detectTheme(images)
识别图片主题："婚礼跟拍" 或 "孕照跟拍"。

#### generateContent(images, keywords, library, theme)
生成4组不同风格的标题和文案。
- **参数**:
  - `images`: 图片数组 (包含 base64 或 url)
  - `keywords`: 用户输入的关键词
  - `library`: 素材库数据，用于风格参考
  - `theme`: 主题 (婚礼跟拍/孕照跟拍)
- **返回**: AI生成的JSON格式内容

#### analyzeInfluencer(posts)
分析博主内容风格。

#### analyzeViral(posts)
分析爆款帖子规律。

### 6.3 文案角度定义
```javascript
CONTENT_ANGLES = [
  { id: 'user', name: '用户视角', desc: '孕妇/新人第一人称' },
  { id: 'photographer', name: '摄影师视角', desc: '发现美的过程' },
  { id: 'story', name: '故事叙事', desc: '拍摄当天的小故事' },
  { id: 'behind', name: '幕后花絮', desc: '过程中的趣味/困难' },
  { id: 'tutorial', name: '干货教程', desc: '技巧、pose心得' },
  { id: 'memory', name: '情感回忆', desc: '照片留住时光的意义' },
  { id: 'qa', name: 'Q&A问答', desc: '问题引入，正文回答' },
  { id: 'contrast', name: '对比反差', desc: '前后对比，吊胃口' }
]
```

---

## 七、组件说明

### 7.1 ImageUploader (图片上传)
- **Props**: `images`, `onImagesChange`
- **功能**: 支持点击上传、拖拽上传，最多9张图片
- **输出**: `{ id, url, name, base64 }`

### 7.2 OutputCard (结果展示)
- **Props**: `item`, `index`, `images`
- **功能**: 展示生成的标题、文案、封面图、推荐理由
- **交互**: 一键复制内容

### 7.3 Login (登录)
- **Props**: `onLogin`
- **功能**: 简单的用户名登录，首次使用自动创建账号

### 7.4 Generator (内容生成页)
- **功能**: 图片上传 → AI生成 → 结果展示 → 保存历史
- **流程**:
  1. 用户上传至少4张图片
  2. 输入关键词
  3. AI识别主题
  4. AI生成4组内容
  5. 保存到历史记录

### 7.5 Library (素材库页)
- **功能**: 小红书登录、爬取博主/爆款、AI分析、素材管理
- **Tab**: 
  - 博主分析: 输入博主链接，爬取并分析风格
  - 爆款分析: 输入关键词，搜索并分析爆款

---

## 八、启动方式

### 8.1 开发环境

```bash
# 1. 安装前端依赖
npm install

# 2. 安装后端依赖
cd server
npm install
cd ..

# 3. 启动后端服务 (终端1)
cd server
npm run dev

# 4. 启动前端开发服务器 (终端2)
npm run dev
```

### 8.2 生产环境

```bash
# 构建前端
npm run build

# 启动后端
cd server
npm start
```

### 8.3 环境要求
- Node.js >= 18
- Chrome 浏览器 (用于 Playwright 爬虫)
- Windows 系统 (Chrome路径硬编码在 `server/server.js`)

---

## 九、配置文件

### 9.1 vite.config.js
```javascript
export default defineConfig({
  plugins: [react()],
  base: './'  // 相对路径，支持本地文件打开
})
```

### 9.2 tailwind.config.js
```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: []
}
```

---

## 十、开发注意事项

### 10.1 小红书爬虫
- 需要先在 **素材库页** 扫码登录小红书
- Cookie 保存在 `server/cookies.json`
- 爬虫使用 Playwright Core 无头浏览器
- Chrome 路径硬编码: `C:\Program Files\Google\Chrome\Application\chrome.exe`

### 10.2 AI配置
- 首次使用需要在设置中配置 API Key
- 支持 DeepSeek、OpenAI 等兼容 OpenAI 格式的 API
- 默认模型: `deepseek-chat`

### 10.3 数据存储
- 后端使用 SQLite (sql.js)，数据持久化到 `server/data.db`
- 前端使用 LocalStorage 存储 AI 配置

### 10.4 图片处理
- 图片上传后转为 base64 用于 AI 分析
- 历史记录中只存储图片 URL，不存 base64

---

## 十一、扩展开发指南

### 11.1 添加新的文案角度
编辑 `src/services/ai.js` 中的 `CONTENT_ANGLES` 数组。

### 11.2 修改 AI Prompt
编辑 `src/services/ai.js` 中对应函数的 prompt 字符串。

### 11.3 添加新的爬虫功能
在 `server/server.js` 中添加新的路由，使用 Playwright 实现。

### 11.4 修改数据库结构
在 `server/server.js` 的 `initDB()` 函数中添加新的表或字段。

---

## 十二、常见问题

1. **二维码登录失败**: 检查 Chrome 路径是否正确
2. **AI生成失败**: 检查 API Key 和 Base URL 配置
3. **爬虫被限制**: 小红书可能有反爬机制，建议控制爬取频率

---

## 十三、技术债务与优化方向

1. **Chrome路径**: 当前硬编码为 Windows 路径，需要支持跨平台
2. **错误处理**: 部分 API 错误处理可以更加完善
3. **数据验证**: 前后端数据校验可以加强
4. **性能优化**: 图片 base64 传输可以优化为上传 CDN
5. **安全性**: API Key 存储在 localStorage，生产环境需要更安全的方式
