export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function generateId() {
  return Math.random().toString(36).substring(2, 15)
}

export function getFilePath(file) {
  return file.webkitRelativePath || file.name
}

export function getRootFolderName(files) {
  if (!files.length) return null
  const first = files[0]?.webkitRelativePath
  if (!first) return null
  return first.split('/')[0]
}

export function formatSpeed(bps) {
  if (!bps || bps < 0) return '0 B/s'
  if (bps < 1024)          return `${bps} B/s`
  if (bps < 1024 * 1024)   return `${(bps / 1024).toFixed(1)} KB/s`
  if (bps < 1024 ** 3)     return `${(bps / 1024 / 1024).toFixed(2)} MB/s`
  return `${(bps / 1024 ** 3).toFixed(2)} GB/s`
}

export function formatDuration(sec) {
  if (!sec || sec < 0) return '0s'
  const s = Math.round(sec)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}