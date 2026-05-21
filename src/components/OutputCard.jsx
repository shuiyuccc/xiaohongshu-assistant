import { useEffect, useRef, useState } from 'react'

export default function OutputCard({ item, index, images, onRefreshTitle, onRefreshContent, onUpdateItem, onDeleteItem }) {
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

  // 获取封面图片
  const coverImage = images?.find(img => String(img.id) === String(item.imageId))
    || (images && item.coverIndex && item.coverIndex <= images.length ? images[item.coverIndex - 1] : null)

  const parseReferenceReason = (reason) => {
    const text = String(reason || '').trim()
    if (!text) return { titleSource: '', contentSource: '' }

    const titlePattern = /(?:【\s*标题来源\s*】|标题来源[：:])/
    const contentPattern = /(?:【\s*正文来源\s*】|正文来源[：:])/
    const titleMatch = text.match(titlePattern)
    const contentMatch = text.match(contentPattern)

    if (!titleMatch && !contentMatch) {
      return { titleSource: text, contentSource: '' }
    }

    const titleStart = titleMatch ? titleMatch.index + titleMatch[0].length : 0
    const contentStart = contentMatch ? contentMatch.index + contentMatch[0].length : text.length
    const titleSource = titleMatch
      ? text.slice(titleStart, contentMatch ? contentMatch.index : text.length).trim()
      : ''
    const contentSource = contentMatch
      ? text.slice(contentStart).trim()
      : ''

    return { titleSource, contentSource }
  }

  const referenceReason = parseReferenceReason(item.reason)

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
                className="min-w-0 flex-1 rounded-md border border-pink-200 bg-pink-50/50 px-2 py-1 text-[16px] font-bold leading-[1.38] text-gray-700 outline-none focus:border-pink-300 focus:bg-white"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                aria-label="编辑标题"
                title="编辑标题"
                className="min-w-0 flex-1 text-left"
              >
                <h3 className="text-[16px] font-bold leading-[1.38] text-gray-700 line-clamp-2 hover:text-pink-500 transition-colors">
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

              {/* 写作参考来源 */}
              {item.reason && (
                <div className="bg-rose-50 rounded-md p-3">
                  <p className="text-xs text-rose-600 font-medium mb-1">写作参考来源：</p>
                  {referenceReason.titleSource && (
                    <div className="mb-2">
                      <p className="text-xs font-bold text-rose-600 mb-1">标题来源：</p>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{referenceReason.titleSource}</p>
                    </div>
                  )}
                  {referenceReason.contentSource && (
                    <div>
                      <p className="text-xs font-bold text-rose-600 mb-1">正文来源：</p>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{referenceReason.contentSource}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">刚刚</span>
            <button
              type="button"
              onClick={() => onDeleteItem && onDeleteItem(index)}
              aria-label="删除这组内容"
              title="删除这组内容"
              className="h-6 w-6 rounded-full text-gray-300 transition-colors flex items-center justify-center hover:bg-gray-100 hover:text-gray-500"
            >
              <svg className="h-[15px] w-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 6h11" />
                <path d="M8 6V4.8c0-.55.45-1 1-1h2c.55 0 1 .45 1 1V6" />
                <path d="M6.3 6l.6 9.1c.04.62.56 1.1 1.18 1.1h3.84c.62 0 1.14-.48 1.18-1.1L13.7 6" />
                <path d="M8.8 9v4.1" />
                <path d="M11.2 9v4.1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
