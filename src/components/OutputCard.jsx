import { useState } from 'react'

export default function OutputCard({ item, index, images }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleCopy = () => {
    const text = `${item.title}\n\n${item.content}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 获取封面图片
  const coverImage = images && item.coverIndex && item.coverIndex <= images.length 
    ? images[item.coverIndex - 1] 
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            index === 0 ? 'bg-rose-500 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            {index + 1}
          </span>
          <span className="text-xs text-gray-500">{item.angle}</span>
        </div>
        <button
          onClick={handleCopy}
          className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
            copied
              ? 'bg-green-100 text-green-600'
              : 'bg-pink-50 text-pink-600 hover:bg-pink-100'
          }`}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* 封面图 - 竖图比例 */}
        {coverImage && (
          <div className="rounded-xl overflow-hidden bg-gray-100">
            <img
              src={coverImage.url}
              alt={`封面图 ${item.coverIndex}`}
              className="w-full object-cover"
              style={{ aspectRatio: '3/4' }}
            />
          </div>
        )}

        {/* 标题 */}
        <div>
          <h3 className="text-base font-bold text-gray-800 line-clamp-2">{item.title}</h3>
        </div>

        {/* 文案 - 可展开 */}
        <div>
          <p className={`text-sm text-gray-600 leading-relaxed whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>
            {item.content}
          </p>
          {item.content && item.content.length > 60 && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-pink-500 mt-1 hover:underline"
            >
              {expanded ? '收起' : '展开全文'}
            </button>
          )}
        </div>

        {/* 展开后的详细信息 */}
        {expanded && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            {/* 选择封面的理由 */}
            {item.coverReason && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-medium mb-1">📷 选封面理由：</p>
                <p className="text-xs text-gray-600">{item.coverReason}</p>
              </div>
            )}

            {/* 爆款分析 */}
            {item.reason && (
              <div className="bg-rose-50 rounded-lg p-3">
                <p className="text-xs text-rose-600 font-medium mb-1">🔥 爆款分析：</p>
                <p className="text-xs text-gray-600">{item.reason}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
