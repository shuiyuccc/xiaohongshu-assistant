import { useEffect, useRef, useState } from 'react'

export default function OutputCard({ item, index, images, onRefreshTitle, onRefreshContent, onUpdateItem }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(item.title || '')
  const [refreshingTitle, setRefreshingTitle] = useState(false)
  const [refreshingContent, setRefreshingContent] = useState(false)
  const titleInputRef = useRef(null)

  useEffect(() => {
    setTitleDraft(item.title || '')
  }, [item.title])

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [isEditingTitle])

  const saveTitleDraft = () => {
    const nextTitle = titleDraft.trim()
    if (nextTitle) {
      onUpdateItem && onUpdateItem(index, { title: nextTitle })
      setTitleDraft(nextTitle)
    } else {
      setTitleDraft(item.title || '')
    }
    setIsEditingTitle(false)
  }

  const cancelTitleEdit = () => {
    setTitleDraft(item.title || '')
    setIsEditingTitle(false)
  }

  const handleTitleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveTitleDraft()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelTitleEdit()
    }
  }

  const handleRefreshTitle = async () => {
    if (!onRefreshTitle || refreshingTitle) return
    setRefreshingTitle(true)
    try {
      const newTitle = await onRefreshTitle(item, index)
      if (newTitle) {
        setTitleDraft(newTitle)
      }
    } finally {
      setRefreshingTitle(false)
    }
  }

  const handleRefreshContent = async () => {
    if (!onRefreshContent || refreshingContent) return
    setRefreshingContent(true)
    try {
      const newContent = await onRefreshContent(item, index)
      if (newContent) {
        onUpdateItem && onUpdateItem(index, { content: newContent })
      }
    } finally {
      setRefreshingContent(false)
    }
  }

  const handleCopy = async () => {
    const text = `${titleDraft || item.title}\n\n${item.content}`
    
    try {
      // 尝试使用现代 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // 降级方案：使用传统的复制方法
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (!successful) {
          throw new Error('复制失败')
        }
      }
      
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
      alert('复制失败，请手动复制')
    }
  }

  // 获取封面图片
  const coverImage = images?.find(img => String(img.id) === String(item.imageId))
    || (images && item.coverIndex && item.coverIndex <= images.length ? images[item.coverIndex - 1] : null)

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
      <div className="space-y-2">
        {/* 封面图 - 竖图比例 */}
        {coverImage && (
          <div className="overflow-hidden bg-gray-100">
            <img
              src={coverImage.url}
              alt={`封面图 ${item.coverIndex}`}
              className="w-full object-cover"
              style={{ aspectRatio: '3/4' }}
            />
          </div>
        )}

        <div className="px-3 pb-3 space-y-2">
          {/* 标题 */}
          <div className="flex items-start gap-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={saveTitleDraft}
                onKeyDown={handleTitleKeyDown}
                className="min-w-0 flex-1 rounded-md border border-pink-200 bg-pink-50/50 px-2 py-1 text-[15px] font-semibold leading-snug text-gray-800 outline-none focus:border-pink-300 focus:bg-white"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                aria-label="编辑标题"
                title="编辑标题"
                className="min-w-0 flex-1 text-left"
              >
                <h3 className="text-[15px] font-semibold leading-snug text-gray-800 line-clamp-2 hover:text-pink-500 transition-colors">
                  {titleDraft || item.title}
                </h3>
              </button>
            )}
            {/* 刷新标题按钮 */}
            {onRefreshTitle && (
              <button
                type="button"
                onClick={handleRefreshTitle}
                disabled={refreshingTitle}
                aria-label="刷新标题"
                title="换一组标题"
                className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-gray-400 hover:bg-pink-100 hover:text-pink-500 transition-colors flex items-center justify-center"
              >
                {refreshingTitle ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
            )}
            {item.content && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? '收起文案' : '展开文案'}
                title={expanded ? '收起文案' : '展开文案'}
                className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex items-center justify-center"
              >
                <svg
                  className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* 展开后的文案与详细信息 */}
          {expanded && (
            <div className="space-y-2 border-t border-gray-100 pt-2">
              {/* 文案标题栏 */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">文案内容</span>
                {/* 刷新文案按钮 */}
                {onRefreshContent && (
                  <button
                    type="button"
                    onClick={handleRefreshContent}
                    disabled={refreshingContent}
                    aria-label="刷新文案"
                    title="换一组文案"
                    className="h-6 w-6 rounded-full text-gray-400 hover:bg-pink-100 hover:text-pink-500 transition-colors flex items-center justify-center"
                  >
                    {refreshingContent ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {item.content && (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </p>
              )}

              {/* 选择封面的理由 */}
              {item.coverReason && (
                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">选封面理由：</p>
                  <p className="text-xs text-gray-600">{item.coverReason}</p>
                </div>
              )}

              {/* 爆款分析 */}
              {item.reason && (
                <div className="bg-rose-50 rounded-md p-3">
                  <p className="text-xs text-rose-600 font-medium mb-1">爆款分析：</p>
                  <p className="text-xs text-gray-600">{item.reason}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">刚刚</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? '已复制' : '复制文案'}
              title={copied ? '已复制' : '复制文案'}
              className={`h-7 w-7 rounded-full transition-colors flex items-center justify-center ${
                copied
                  ? 'bg-green-50 text-green-500'
                  : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
              }`}
            >
              {copied ? (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.26a1 1 0 0 1-1.42.002L3.29 9.12a1 1 0 1 1 1.42-1.408l4.09 4.126 6.49-6.542a1 1 0 0 1 1.414-.006Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <rect x="6.5" y="5.5" width="8" height="10" rx="1.5" />
                  <path d="M4.5 12.5v-8a2 2 0 0 1 2-2h6" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
