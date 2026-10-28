import type { ChatAttachment, ChatAttachmentKind } from '../types'
import { putChatBlob } from './chatMediaDb'

/**
 * Файлы чата хранятся в IndexedDB (не в localStorage),
 * поэтому можно класть объёмные вложения.
 */
export const MAX_CHAT_FILE_BYTES = 500 * 1024 * 1024 // 500 МБ

export function kindFromMime(mime: string, name: string): ChatAttachmentKind {
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  const lower = name.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(lower)) return 'image'
  if (/\.(mp4|webm|mov|mkv|avi)$/i.test(lower)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|webm|aac)$/i.test(lower)) return 'audio'
  return 'file'
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_CHAT_FILE_BYTES) {
    throw new Error(
      `Файл больше ${formatBytes(MAX_CHAT_FILE_BYTES)}. Выберите файл до этого лимита.`,
    )
  }
  const id = crypto.randomUUID()
  const blob = file.slice(0, file.size, file.type || 'application/octet-stream')
  await putChatBlob(id, blob)
  return {
    id,
    kind: kindFromMime(file.type || '', file.name),
    name: file.name || 'файл',
    mime: file.type || 'application/octet-stream',
    size: file.size,
  }
}

export async function blobToAttachment(
  blob: Blob,
  name: string,
): Promise<ChatAttachment> {
  const file = new File([blob], name, { type: blob.type || 'audio/webm' })
  return fileToAttachment(file)
}
