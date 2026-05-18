import { useState, useEffect, useRef } from 'react'
import {
  getXhsSession,
  startQrLogin,
  getQrLoginStatus,
  scrapeInfluencer as scrapeInfluencerAPI,
  getExcelBloggers,
  getBloggerStyle
} from '../services/api'

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

// 博主卡片组件
function BloggerCard({ blogger, onDownloadExcel, onDownloadStyle }) {
  const [styleData, setStyleData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadStyle() {
      try {
        const data = await getBloggerStyle(blogger.name)
        setStyleData(data)
      } catch (err) {
        console.error('加载风格文件失败:', err)
      }
    }
    loadStyle()
  }, [blogger.name])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">{blogger.name}</h3>
          <p className="text-sm text-gray-500 mt-1">
            共 {blogger.postCount} 条笔记 · 更新于 {new Date(blogger.lastUpdated).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs rounded-full">
            Excel
          </span>
          {styleData?.exists && (
            <span className="px-3 py-1 bg-green-50 text-green-600 text-xs rounded-full">
              风格文件
            </span>
          )}
        </div>
      </div>

      {/* 文件列表 */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">notes_index.xlsx</p>
              <p className="text-xs text-gray-500">Excel 数据表格</p>
            </div>
          </div>
          <button
            onClick={() => onDownloadExcel(blogger.name)}
            className="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 transition-colors"
          >
            下载
          </button>
        </div>

        {styleData?.exists && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">style_profile.md</p>
                <p className="text-xs text-gray-500">写作风格文件</p>
              </div>
            </div>
            <button
              onClick={() => onDownloadStyle(blogger.name, 'md')}
              className="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors"
            >
              下载
            </button>
          </div>
        )}
      </div>

      {/* 风格预览 */}
      {styleData?.exists && styleData.style && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">写作风格</p>
          <p className="text-sm text-gray-600 line-clamp-3">{styleData.style}</p>
        </div>
      )}
    </div>
  )
}

export default function Library({ userId }) {
  const [activeTab, setActiveTab] = useState('scrape') // 'scrape' | 'list'
  const [url, setUrl] = useState('')
  const [count, setCount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [nickname, setNickname] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [bloggers, setBloggers] = useState([])
  const [loadingBloggers, setLoadingBloggers] = useState(false)

  // 加载博主列表
  useEffect(() => {
    loadBloggers()
  }, [])

  useEffect(() => {
    getXhsSession().then(data => setLoggedIn(data.loggedIn)).catch(() => {})
  }, [])

  async function loadBloggers() {
    setLoadingBloggers(true)
    try {
      const data = await getExcelBloggers()
      if (data.bloggers) {
        setBloggers(data.bloggers)
      }
    } catch (err) {
      console.error('加载博主列表失败:', err)
    } finally {
      setLoadingBloggers(false)
    }
  }

  const handleQrSuccess = (nick) => {
    setLoggedIn(true)
    setNickname(nick)
    setShowQr(false)
  }

  const doScrape = async () => {
    if (!url.trim()) { setError('请输入博主链接'); return }

    setError('')
    setLoading(true)
    setStatus('正在爬取博主数据...')

    try {
      const result = await scrapeInfluencerAPI(url, count, [])

      if (!result.posts || result.posts.length === 0) {
        throw new Error('未能爬取到帖子，请检查链接是否正确')
      }

      setStatus(`爬取完成！共 ${result.posts.length} 条笔记，已生成 Excel 和风格文件`)

      // 重新加载博主列表
      await loadBloggers()

      // 切换到列表页查看新爬取的博主
      setActiveTab('list')
    } catch (err) {
      setError(err.message)
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  // 下载 Excel 文件
  const downloadExcel = async (bloggerName) => {
    try {
      const response = await fetch(`http://localhost:3001/api/xhs/download/excel?name=${encodeURIComponent(bloggerName)}`)
      if (!response.ok) throw new Error('下载失败')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${bloggerName}_notes_index.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('下载失败: ' + err.message)
    }
  }

  // 下载风格文件
  const downloadStyle = async (bloggerName, format) => {
    try {
      const response = await fetch(`http://localhost:3001/api/xhs/download/style?name=${encodeURIComponent(bloggerName)}&format=${format}`)
      if (!response.ok) throw new Error('下载失败')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${bloggerName}_style_profile.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('下载失败: ' + err.message)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {showQr && <QrModal onSuccess={handleQrSuccess} onClose={() => setShowQr(false)} />}

      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">素材爬取</h2>
            <p className="text-gray-500">爬取小红书博主内容，生成 Excel 数据表和写作风格文件</p>
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

      {/* Tab 切换 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setActiveTab('scrape'); setStatus(''); setError('') }}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'scrape' ? 'bg-pink-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          爬取博主
        </button>
        <button
          onClick={() => { setActiveTab('list'); setStatus(''); setError('') }}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'list' ? 'bg-pink-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          已爬取列表 ({bloggers.length})
        </button>
      </div>

      {/* 爬取博主页面 */}
      {activeTab === 'scrape' && (
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              爬取帖子数量
            </label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              min={1}
              max={50}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
            />
            <p className="text-gray-400 text-xs mt-2">
              建议首次爬取 10-20 条，后续会自动跳过已存在的笔记
            </p>
          </div>
          {error && <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
          {status && <div className="mb-4 p-4 bg-green-50 text-green-600 rounded-xl text-sm">{status}</div>}
          <button
            onClick={doScrape}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium rounded-xl hover:from-pink-600 hover:to-rose-600 transition-all shadow-lg shadow-pink-200 disabled:opacity-50"
          >
            {loading ? '爬取中...' : '开始爬取'}
          </button>
        </div>
      )}

      {/* 已爬取列表页面 */}
      {activeTab === 'list' && (
        <div>
          {loadingBloggers ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">加载中...</p>
            </div>
          ) : bloggers.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">暂无爬取记录</h3>
              <p className="text-gray-500 mb-4">还没有爬取过任何博主，快去爬取第一个博主吧！</p>
              <button
                onClick={() => setActiveTab('scrape')}
                className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
              >
                去爬取
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {bloggers.map((blogger) => (
                <BloggerCard
                  key={blogger.name}
                  blogger={blogger}
                  onDownloadExcel={downloadExcel}
                  onDownloadStyle={downloadStyle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
