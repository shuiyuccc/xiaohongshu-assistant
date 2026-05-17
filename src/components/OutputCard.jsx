import { useState } from 'react'

export default function OutputCard({ item, index, images }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = `【标题】${item.title}\n\n【文案】${item.content}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 获取封面图片
  const coverImage = images && item.coverIndex ? images[item.coverIndex - 1] : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
            index === 0 ? 'bg-rose-500 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            {index + 1}
          </span>
          <span className="text-sm text-gray-500">#{item.angle}</span>
          {index === 0 && <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded text-xs font-medium">最具爆款潜力</span>}
        </div>
        <button
          onClick={handleCopy}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            copied
              ? 'bg-green-100 text-green-600'
              : 'bg-pink-50 text-pink-600 hover:bg-pink-100'
          }`}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* 封面图 - 竖图比例 */}
        {coverImage && (
          <div className="rounded-xl overflow-hidden">
            <img
              src={coverImage.url}
              alt={`封面图 ${item.coverIndex}`}
              className="w-full object-cover"
              style={{ aspectRatio: '3/4' }}
            />
            <div className="bg-rose-100 text-rose-600 text-xs text-center py-1">第{item.coverIndex}张</div>
          </div>
        )}

        {/* 角度标签 */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">{item.angle}</span>
        </div>

        {/* 标题 */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{item.title}</h3>
        </div>

        {/* 文案 */}
        <div>
          <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{item.content}</p>
        </div>

        {/* 选择封面的理由 */}
        {item.coverReason && (
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-500 font-medium mb-1">📷 选择这张图作为封面的理由：</p>
            <p className="text-sm text-gray-600">{item.coverReason}</p>
          </div>
        )}

        {/* 标题和爆款理由 */}
        <div className="bg-rose-50 rounded-xl p-4">
          <p className="text-sm text-rose-600 font-medium mb-1">🔥 标题与爆款分析：</p>
          <p className="text-sm text-gray-600">{item.reason}</p>
        </div>
      </div>
    </div>
  )
}