import { useState } from 'react'

export default function ImageUploader({ images, onImagesChange }) {
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (files) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    const promises = imageFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          resolve({
            id: Date.now() + Math.random(),
            url: e.target.result,
            name: file.name,
            base64: e.target.result.split(',')[1]
          })
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(promises).then(newImages => {
      onImagesChange([...images, ...newImages].slice(0, 9))
    })
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleRemove = (id) => {
    onImagesChange(images.filter(img => img.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* 图片预览区 */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {images.map((img, index) => (
            <div key={img.id} className="relative group">
              <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                  图 {index + 1}
                </div>
                <button
                  onClick={() => handleRemove(img.id)}
                  className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 上传区域 */}
      {images.length < 9 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragOver ? 'border-pink-400 bg-pink-50' : 'border-gray-300 hover:border-pink-300 hover:bg-gray-50'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="image-upload"
          />
          <label htmlFor="image-upload" className="cursor-pointer">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">点击或拖拽上传图片</p>
            <p className="text-gray-400 text-sm mt-1">支持 JPG、PNG，最多 {9 - images.length} 张</p>
          </label>
        </div>
      )}
    </div>
  )
}