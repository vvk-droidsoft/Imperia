import type { Location } from '../types'

export type TentCadet = {
  id: string
  /** Индивидуальный номер курсанта */
  number: string
  /** Позывной */
  callsign: string
}

export type TentRoster = {
  /** id инструкторов и ассистентов на палатке */
  staffIds: string[]
  cadets: TentCadet[]
}

export type TentRosterStore = Record<string, TentRoster>

const STORAGE_KEY = 'fc-imperiya-tent-roster-v1'

export function tentRosterKey(
  departmentId: string,
  location: Location,
  tent: number,
): string {
  return `${departmentId}:${location}:${tent}`
}

function emptyRoster(): TentRoster {
  return { staffIds: [], cadets: [] }
}

export function loadTentRosterStore(): TentRosterStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as TentRosterStore
    if (!parsed || typeof parsed !== 'object') return {}
    const out: TentRosterStore = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue
      const staffIds = Array.isArray(value.staffIds)
        ? value.staffIds.filter((id): id is string => typeof id === 'string')
        : []
      const cadets = Array.isArray(value.cadets)
        ? value.cadets
            .map((c) => {
              if (!c || typeof c !== 'object') return null
              const row = c as TentCadet
              if (typeof row.id !== 'string') return null
              return {
                id: row.id,
                number: typeof row.number === 'string' ? row.number : '',
                callsign: typeof row.callsign === 'string' ? row.callsign : '',
              }
            })
            .filter((c): c is TentCadet => !!c)
        : []
      out[key] = { staffIds, cadets }
    }
    return out
  } catch {
    return {}
  }
}

export function saveTentRosterStore(store: TentRosterStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* quota */
  }
}

export function getTentRoster(
  store: TentRosterStore,
  departmentId: string,
  location: Location,
  tent: number,
): TentRoster {
  return store[tentRosterKey(departmentId, location, tent)] ?? emptyRoster()
}

export function setTentRoster(
  store: TentRosterStore,
  departmentId: string,
  location: Location,
  tent: number,
  roster: TentRoster,
): TentRosterStore {
  const key = tentRosterKey(departmentId, location, tent)
  const next = { ...store }
  if (roster.staffIds.length === 0 && roster.cadets.length === 0) {
    delete next[key]
  } else {
    next[key] = {
      staffIds: [...roster.staffIds],
      cadets: roster.cadets.map((c) => ({ ...c })),
    }
  }
  saveTentRosterStore(next)
  return next
}

export function newCadetId(): string {
  return `cadet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
