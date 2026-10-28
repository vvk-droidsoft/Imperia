export type FloatRect = {
  x: number
  y: number
  w: number
  h: number
}

export type AdminLayoutMap = Record<string, FloatRect>

const STORAGE_KEY = 'fc-imperiya-admin-layout-v1'

export function loadAdminLayout(): AdminLayoutMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as AdminLayoutMap
    if (!parsed || typeof parsed !== 'object') return {}
    const out: AdminLayoutMap = {}
    for (const [id, rect] of Object.entries(parsed)) {
      if (
        rect &&
        typeof rect.x === 'number' &&
        typeof rect.y === 'number' &&
        typeof rect.w === 'number' &&
        typeof rect.h === 'number'
      ) {
        out[id] = {
          x: rect.x,
          y: rect.y,
          w: Math.max(120, rect.w),
          h: Math.max(40, rect.h),
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveAdminLayout(map: AdminLayoutMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}

export function clearAdminLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
