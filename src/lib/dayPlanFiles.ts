import { putChatBlob, getChatBlob, deleteChatBlob } from './chatMediaDb'
import { formatBytes } from './chatFiles'

/** План на день: любой файл, до 500 МБ (IndexedDB) */
export const MAX_DAY_PLAN_BYTES = 500 * 1024 * 1024

export async function storeDayPlanFile(file: File): Promise<{
  id: string
  name: string
  mime: string
  size: number
}> {
  if (file.size > MAX_DAY_PLAN_BYTES) {
    throw new Error(
      `Файл больше ${formatBytes(MAX_DAY_PLAN_BYTES)}. Выберите файл до этого лимита.`,
    )
  }
  if (file.size <= 0) {
    throw new Error('Пустой файл')
  }
  const id = crypto.randomUUID()
  const mime = file.type || 'application/octet-stream'
  await putChatBlob(id, file.slice(0, file.size, mime))
  return {
    id,
    name: file.name || 'plan-file',
    mime,
    size: file.size,
  }
}

export async function replaceDayPlanFile(
  previousId: string | null,
  file: File,
): Promise<{
  id: string
  name: string
  mime: string
  size: number
}> {
  const stored = await storeDayPlanFile(file)
  if (previousId && previousId !== stored.id) {
    try {
      await deleteChatBlob(previousId)
    } catch {
      /* ignore stale blob */
    }
  }
  return stored
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Скачать или поделиться через системный шаринг (мессенджер / почта / соцсеть). */
export async function downloadOrShareBlob(
  blob: Blob,
  filename: string,
  title: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, {
    type: blob.type || 'application/octet-stream',
  })
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean
  }
  try {
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({
        files: [file],
        title,
        text: title,
      })
      return 'shared'
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'shared'
    }
  }
  triggerDownload(blob, filename)
  return 'downloaded'
}

export async function loadDayPlanBlob(
  planFileId: string | null,
): Promise<Blob | null> {
  if (!planFileId) return null
  return getChatBlob(planFileId)
}

export async function downloadDayPlanFile(meta: {
  planFileId: string | null
  planFileName: string
  planMime: string
}): Promise<boolean> {
  if (!meta.planFileId) return false
  const blob = await getChatBlob(meta.planFileId)
  if (!blob) return false
  const typed = new Blob([blob], {
    type: meta.planMime || blob.type || 'application/octet-stream',
  })
  triggerDownload(typed, meta.planFileName || 'plan-na-den')
  return true
}

export async function shareDayPlanFile(meta: {
  planFileId: string | null
  planFileName: string
  planMime: string
  title?: string
}): Promise<'shared' | 'downloaded' | 'missing'> {
  if (!meta.planFileId) return 'missing'
  const blob = await getChatBlob(meta.planFileId)
  if (!blob) return 'missing'
  const typed = new Blob([blob], {
    type: meta.planMime || blob.type || 'application/octet-stream',
  })
  return downloadOrShareBlob(
    typed,
    meta.planFileName || 'plan-na-den',
    meta.title || meta.planFileName || 'План на день',
  )
}

/** Открыть файл во вкладке браузера (просмотр для СИ и автора). */
export async function openDayPlanFile(meta: {
  planFileId: string | null
  planFileName: string
  planMime: string
}): Promise<boolean> {
  if (!meta.planFileId) return false
  const blob = await getChatBlob(meta.planFileId)
  if (!blob) return false
  const typed = new Blob([blob], {
    type: meta.planMime || blob.type || 'application/octet-stream',
  })
  const url = URL.createObjectURL(typed)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    // popup blocked — fallback download
    triggerDownload(typed, meta.planFileName || 'plan-na-den')
    URL.revokeObjectURL(url)
    return true
  }
  // revoke later so the tab can load
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
