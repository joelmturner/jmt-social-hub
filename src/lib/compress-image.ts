/**
 * Client-side image compression using Canvas. Reduces file size before upload.
 */

const DEFAULT_MAX_SIZE = 1920
const DEFAULT_QUALITY = 0.85

export interface CompressImageOptions {
  /** max width or height in pixels; image is scaled down if larger */
  maxSize?: number
  /** JPEG quality 0-1 (only for JPEG output) */
  quality?: number
}

/**
 * Compress an image file by resizing (if needed) and re-encoding as JPEG.
 * Returns a new File; non-image files are returned unchanged.
 */
export function compressImageFile(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE
  const quality = options.quality ?? DEFAULT_QUALITY

  if (!file.type.startsWith('image/')) {
    return Promise.resolve(file)
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      let w = width
      let h = height
      if (width > maxSize || height > maxSize) {
        if (width >= height) {
          w = maxSize
          h = Math.round((height * maxSize) / width)
        } else {
          h = maxSize
          w = Math.round((width * maxSize) / height)
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          const name = file.name.replace(/\.[a-z0-9]+$/i, '.jpg') || 'image.jpg'
          resolve(new File([blob], name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}
