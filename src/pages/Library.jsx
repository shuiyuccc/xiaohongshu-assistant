import { useState, useEffect, useRef } from 'react'
import { addToLibrary as addToLibraryAPI, removeFromLibrary as removeFromLibraryAPI, getXhsSession, startQrLogin, getQrLoginStatus, scrapeInfluencer as scrapeInfluencerAPI, searchViral } from '../services/api'
import { analyzeViral } from '../services/ai'

function QrModal({ onSuccess, onClose }) {
  const [qrImage, setQrImage] = useState('')
  const [statusText, setStatusText] = useState('正在加载二维码...')
  const pollRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const data = await startQrLogin()
        if (cancelled) return
        setQrImage(data.qrImage)
        setStatusText('请用小红书 App 扫码登录')
        pollRef.current = setInterval(async () => {
          try {
            const result = await getQrLoginStatus()
            if (result.status === 'confirmed') {
              clearInterval(pollRef.current)
              onSuccess(result.nickname || '')
            } else if (result.status === 'expired') {
              clearInterval(pollRef.current)
              setStatusText('二维码已过期，请重新获取')
            } else if (result.qrImage) {
              setQrImage(result.qrImage)
            }
          } catch {
            // 轮询失败静默重试
          }
        }, 2000)
      } catch (err) {
        if (!cancelled) setStatusText(`启动失败：${err.message}`)
      }
    }

    init()
    return () => {
      cancelled = true
      clearInterval(pollRef.current)
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <h3 className="text-lg font-bold text-gray-800 mb-2">扫码登录小红书</h3>
        <p className="text-sm text-gray-500 mb-6">{statusText}</p>
        {qrImage ? (
          <img
            src={`data:image/png;base64,${qrImage}`}
            alt="小红书登录二维码"
            className="w-full h-auto mx-auto rounded-xl border border-gray-100 mb-6"
          />
        ) : (
          <div className="w-64 h-64 mx-auto bg-gray-100 rounded-xl flex items-center justify-center mb-6">
            <div className="w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          取消
        </button>
      </div>
    </div>
  )
}

function PostCard({ post, index }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <span className="text-xs text-pink-500 font-medium mr-2">#{index + 1}</span>
          <span className="font-medium text-gray-800 truncate">{post.originalTitle || `帖子 ${index + 1}`}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 text-sm border-t border-gray-100">
          {(post.likes || post.collects || post.comments) && (
            <div className="pt-3 flex flex-wrap gap-2 text-xs text-gray-500">
              {post.likes && <span className="px-2 py-1 bg-gray-50 rounded-full">点赞 {post.likes}</span>}
              {post.collects && <span className="px-2 py-1 bg-gray-50 rounded-full">收藏 {post.collects}</span>}
              {post.comments && <span className="px-2 py-1 bg-gray-50 rounded-full">评论 {post.comments}</span>}
            </div>
          )}
          {post.originalContent && (
            <div className={post.likes || post.collects || post.comments ? '' : 'pt-3'}>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">原文案</p>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{post.originalContent}</p>
            </div>
          )}
          {post.titleAnalysis && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">标题分析</p>
              <p className="text-gray-700">{post.titleAnalysis}</p>
            </div>
          )}
          {post.titleStyle && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">标题风格</p>
              <p className="text-gray-700">{post.titleStyle}</p>
            </div>
          )}
          {post.contentAnalysis && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">文案分析</p>
              <p className="text-gray-700">{post.contentAnalysis}</p>
            </div>
          )}
          {post.contentStyle && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">文案风格</p>
              <p className="text-gray-700">{post.contentStyle}</p>
            </div>
          )}
          {post.coverAnalysis && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">封面分析</p>
              <p className="text-gray-700">{post.coverAnalysis}</p>
            </div>
          )}
          {post.viralReason && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">爆款原因</p>
              <p className="text-gray-700">{post.viralReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Library({ userId, username, library, onDataChange }) {
  const [activeTab, setActiveTab] = useState('influencer')
  const [url, setUrl] = useState('')
  const [count, setCount] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [nickname, setNickname] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [results, setResults] = useState([])
  const pendingAnalyzeRef = useRef(null)

  useEffect(() => {
    getXhsSession().then(data => setLoggedIn(data.loggedIn)).catch(() => {})
  }, [])

  const handleQrSuccess = (nick) => {
    setLoggedIn(true)
    setNickname(nick)
    setShowQr(false)
    if (pendingAnalyzeRef.current === 'influencer') {
      pendingAnalyzeRef.current = null
      doScrapeAndAnalyze()
    } else if (pendingAnalyzeRef.current === 'viral') {
      pendingAnalyzeRef.current = null
      doAnalyzeViral({ skipLoginCheck: true })
    }
  }

  const parseResult = (raw, fallbackPosts) => {
    const enrichWithRawPost = (post, index) => {
      const rawPost = fallbackPosts[index] || {}
      return {
        ...post,
        originalTitle: post.originalTitle || rawPost.title || '',
        originalContent: post.originalContent || rawPost.content || '',
        originalCover: post.originalCover || rawPost.cover || '',
        originalUrl: post.originalUrl || rawPost.url || '',
        likes: post.likes ?? rawPost.likes ?? 0,
        collects: post.collects ?? rawPost.collects ?? 0,
        comments: post.comments ?? rawPost.comments ?? 0
      }
    }

    try {
      const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```|(\{[\s\S]*\})/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[2]) : JSON.parse(raw)
      const posts = Array.isArray(parsed.posts) ? parsed.posts : [parsed]
      return posts.map(enrichWithRawPost)
    } catch {
      return fallbackPosts.map((p, index) => enrichWithRawPost({}, index))
    }
  }

  const doScrapeAndAnalyze = async () => {
    if (!url.trim()) { setError('请输入博主链接'); return }

    setError('')
    setResults([])
    setLoading(true)
    setStatus('正在爬取博主主页...')

    try {
      const { posts: rawPosts, sourceName } = await scrapeInfluencerAPI(url, count)
      if (!rawPosts || rawPosts.length === 0) throw new Error('未能爬取到帖子，请检查链接是否正确')

      const bloggerName = sourceName || url
      const posts = rawPosts.map(post => ({
        ...post,
        sourceName: bloggerName,
        originalTitle: post.title || '',
        originalContent: post.content || '',
        originalCover: post.cover || '',
        likes: post.likes || 0,
        collects: post.collects || 0,
        comments: post.comments || 0
      }))

      setResults(posts)
      setStatus(`爬取完成，共 ${posts.length} 篇，正在存入素材库...`)

      for (const post of posts) {
        try {
          await addToLibraryAPI(userId, {
            type: 'influencer',
            source: bloggerName,
            originalCover: post.originalCover || '',
            originalTitle: post.originalTitle || '',
            originalContent: post.originalContent || '',
            likes: post.likes || 0,
            collects: post.collects || 0,
            comments: post.comments || 0,
            coverAnalysis: post.coverAnalysis || '',
            titleAnalysis: post.titleAnalysis || '',
            contentAnalysis: post.contentAnalysis || '',
            titleStyle: post.titleStyle || '',
            contentStyle: post.contentStyle || ''
          })
        } catch (e) {
          console.error('添加素材失败:', e)
        }
      }

      setStatus(`爬取完成，${posts.length} 条标题已列出并存入素材库`)
      onDataChange && onDataChange()
    } catch (err) {
      setError(err.message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyzeInfluencer = () => {
    if (!url.trim()) { setError('请输入博主链接'); return }
    setError('')
    doScrapeAndAnalyze()
  }

  const doAnalyzeViral = async ({ skipLoginCheck = false } = {}) => {
    if (!keyword.trim()) { setError('请输入分析需求'); return }
    setError('')

    if (!skipLoginCheck && !loggedIn) { pendingAnalyzeRef.current = 'viral'; setShowQr(true); return }

    setResults([])
    setLoading(true)
    setStatus('正在搜索小红书爆款帖子...')

    try {
      const { posts: rawPosts } = await searchViral(keyword, 5)
      if (!rawPosts || rawPosts.length === 0) throw new Error('未搜索到相关帖子，请换个关键词试试')

      setStatus(`找到 ${rawPosts.length} 篇帖子，正在 AI 分析爆款规律...`)
      const aiResult = await analyzeViral(rawPosts)
      const posts = parseResult(aiResult, rawPosts)

      setResults(posts)
      setStatus(`分析完成，共 ${posts.length} 篇，正在存入素材库...`)

      for (const post of posts) {
        try {
          await addToLibraryAPI(userId, {
            type: 'viral',
            source: keyword,
            originalCover: post.originalCover || '',
            originalTitle: post.originalTitle || '',
            originalContent: post.originalContent || '',
            likes: post.likes || 0,
            collects: post.collects || 0,
            comments: post.comments || 0,
            coverAnalysis: post.coverAnalysis || '',
            titleAnalysis: post.titleAnalysis || '',
            contentAnalysis: post.contentAnalysis || '',
            titleStyle: post.titleStyle || '',
            contentStyle: post.contentStyle || ''
          })
        } catch (e) {
          console.error('添加素材失败:', e)
        }
      }

      setStatus(`分析完成，${posts.length} 条已存入素材库`)
      onDataChange && onDataChange()
    } catch (err) {
      setError(err.message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyzeViral = () => {
    doAnalyzeViral()
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {showQr && <QrModal onSuccess={handleQrSuccess} onClose={() => { setShowQr(false); pendingAnalyzeRef.current = null }} />}

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">素材库</h2>
            <p className="text-gray-500">学习博主风格，分析爆款内容</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${loggedIn ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-sm text-gray-500">
              {loggedIn ? `已登录${nickname ? `：${nickname}` : '小红书'}` : '未登录'}
            </span>
            {!loggedIn && (
              <button onClick={() => setShowQr(true)} className="text-sm text-pink-500 hover:text-pink-600 underline">
                扫码登录
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setActiveTab('influencer'); setResults([]); setStatus(''); setError('') }}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'influencer' ? 'bg-pink-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          爬取博主
        </button>
        <button
          onClick={() => { setActiveTab('viral'); setResults([]); setStatus(''); setError('') }}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'viral' ? 'bg-pink-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          爆款分析
        </button>
      </div>

      {/* 爬取博主 */}
      {activeTab === 'influencer' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">博主主页链接</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="例如：https://www.xiaohongshu.com/user/profile/xxx"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">爬取帖子数量</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              min={1}
              max={50}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
            />
          </div>
          {error && <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
          {status && <div className="mb-4 p-4 bg-blue-50 text-blue-600 rounded-xl text-sm">{status}</div>}
          <button
            onClick={handleAnalyzeInfluencer}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium rounded-xl hover:from-pink-600 hover:to-rose-600 transition-all shadow-lg shadow-pink-200 disabled:opacity-50"
          >
            {loading ? '爬取中...' : '开始爬取并列出标题'}
          </button>
        </div>
      )}

      {/* 爆款分析 */}
      {activeTab === 'viral' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">爆款分析需求</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例如：孕照拍摄，近半年点赞最高的帖子"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
            />
          </div>
          {error && <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
          {status && <div className="mb-4 p-4 bg-blue-50 text-blue-600 rounded-xl text-sm">{status}</div>}
          <button
            onClick={handleAnalyzeViral}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium rounded-xl hover:from-pink-600 hover:to-rose-600 transition-all shadow-lg shadow-pink-200 disabled:opacity-50"
          >
            {loading ? '分析中...' : loggedIn ? '开始搜索并分析' : '扫码登录后分析'}
          </button>
        </div>
      )}

      {/* 分析/爬取结果 */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            {activeTab === 'influencer' ? `爬取结果（${results.length} 篇）` : `分析结果（${results.length} 篇）`}
          </h3>
          {activeTab === 'influencer' ? (
            <div className="space-y-2">
              {results.map((post, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-xl text-sm text-gray-700">
                  {(post.sourceName || url)} - {post.originalTitle || post.title || `帖子 ${i + 1}`}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((post, i) => (
                <PostCard key={i} post={post} index={i} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 素材库历史列表 */}
      {library && library.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">已存素材（{library.length} 条）</h3>
          <div className="space-y-3">
            {library.map((item) => (
              <div key={item.id} className="flex items-start justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.type === 'influencer' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                      {item.type === 'influencer' ? '博主' : '爆款'}
                    </span>
                    <span className="text-sm text-gray-500 truncate">{item.source}</span>
                  </div>
                  <p className="text-gray-800 font-medium truncate">{item.originalTitle || item.titleStyle}</p>
                  {item.titleStyle && <p className="text-sm text-gray-500 mt-1">风格：{item.titleStyle}</p>}
                  {(item.likes || item.collects || item.comments) && (
                    <p className="text-xs text-gray-400 mt-1">
                      点赞 {item.likes || 0} · 收藏 {item.collects || 0} · 评论 {item.comments || 0}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeFromLibraryAPI(item.id).then(() => onDataChange && onDataChange())}
                  className="ml-3 p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
