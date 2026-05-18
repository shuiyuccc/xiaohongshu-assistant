import { useState, useEffect } from 'react'
import Login from './components/Login'
import Generator from './pages/Generator'
import Library from './pages/Library'
import { getOrCreateUser, getUserData } from './services/api'

function SettingsModal({ open, onClose }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_api_key') || '')
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('ai_base_url') || 'https://api.deepseek.com')
  const [model, setModel] = useState(() => localStorage.getItem('ai_model') || 'deepseek-chat')

  const handleSave = () => {
    localStorage.setItem('ai_api_key', apiKey)
    localStorage.setItem('ai_base_url', baseUrl)
    localStorage.setItem('ai_model', model)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-800">API 设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入 API Key"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">模型</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-chat"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-medium rounded-xl hover:from-pink-600 hover:to-rose-600 transition-all"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [userId, setUserId] = useState(null)
  const [activeTab, setActiveTab] = useState('generate')
  const [showSettings, setShowSettings] = useState(false)
  const [userData, setUserData] = useState(null)

  const handleLogin = async (username) => {
    try {
      const userData = await getOrCreateUser(username)
      setUser(username)
      setUserId(userData.id)
      loadUserData(userData.id)
    } catch (err) {
      console.error('登录失败:', err)
      alert('连接服务器失败，请确保服务器已启动')
    }
  }

  const loadUserData = async (uid) => {
    try {
      const data = await getUserData(uid)
      setUserData(data)
    } catch (err) {
      console.error('获取数据失败:', err)
    }
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  const library = userData?.library || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="font-bold text-gray-800">小红书助手</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <div className="text-sm text-gray-500">{user}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('generate')}
              className={`py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'generate'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              生成内容
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === 'library'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              素材库 ({library.length})
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4">
        <div className={activeTab === 'generate' ? 'block' : 'hidden'}>
          <Generator userId={userId} username={user} library={library} onDataChange={() => loadUserData(userId)} />
        </div>
        <div className={activeTab === 'library' ? 'block' : 'hidden'}>
          <Library userId={userId} username={user} library={library} onDataChange={() => loadUserData(userId)} />
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}