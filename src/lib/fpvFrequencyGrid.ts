import type { Location } from '../types'

/** Сетки: Foxeer/Blitz 5.8 + цифровая 1.3–1.4 ГГц. */
export const FPV_GRID_SOURCE = 'Foxeer 5.8 + Blitz 5.8 + цифра 1.4 ГГц'

/**
 * Целевой разнос, МГц. На 10 палатках × (Foxeer+Blitz) = 20 частот
 * с пинами X5/X8/L6/R5/R7/H8 максимум достижимого разноса — 37 МГц
 * (строго 40 МГц на все 20 невозможно).
 */
export const FPV_MIN_GAP_MHZ = 40

/** Фактически достижимый разнос при 10×Foxeer + 10×Blitz и пинах. */
export const FPV_ACHIEVABLE_GAP_MHZ = 37

export type FpvVtxSource = 'foxeer' | 'blitz' | 'digital'

export type FpvChannel = {
  id: string
  rangeKey: '58' | '14'
  rangeLabel: string
  band: string
  channel: number
  freqMHz: number
  label: string
  vtx: FpvVtxSource
}

export type TentFrequencyMap = Record<number, FpvChannel[]>

type BandTable = Record<string, number[]>

/** Foxeer Reaper Extreme 5.8 / 80CH. */
export const FOXEER_5_8_BANDS: BandTable = {
  A: [5865, 5845, 5825, 5805, 5785, 5765, 5745, 5725],
  B: [5733, 5752, 5771, 5790, 5809, 5828, 5847, 5866],
  E: [5705, 5685, 5665, 5645, 5885, 5905, 5925, 5945],
  F: [5740, 5760, 5780, 5800, 5820, 5840, 5860, 5880],
  R: [5658, 5695, 5732, 5769, 5806, 5843, 5880, 5917],
  H: [5653, 5693, 5733, 5773, 5813, 5853, 5893, 5933],
  L: [5333, 5373, 5413, 5453, 5493, 5533, 5573, 5613],
  U: [5325, 5348, 5366, 5384, 5402, 5420, 5438, 5456],
  O: [5474, 5492, 5510, 5528, 5546, 5564, 5582, 5600],
  X: [4990, 5020, 5050, 5080, 5110, 5140, 5170, 5200],
}

/** iFlight Blitz Whoop 5.8. */
export const BLITZ_5_8_BANDS: BandTable = {
  A: [5865, 5845, 5825, 5805, 5785, 5765, 5745, 5725],
  B: [5733, 5752, 5771, 5790, 5809, 5828, 5847, 5866],
  E: [5705, 5685, 5665, 5645, 5885, 5905, 5925, 5945],
  F: [5740, 5760, 5780, 5800, 5820, 5840, 5860, 5880],
  R: [5658, 5695, 5732, 5769, 5806, 5843, 5880, 5917],
  L: [5362, 5399, 5436, 5473, 5510, 5547, 5584, 5621],
}

/** Обязательные Foxeer на палатках 1–6. */
export const TENT_PINNED_CHANNELS: ReadonlyArray<{
  tent: number
  band: string
  channel: number
}> = [
  { tent: 1, band: 'X', channel: 5 },
  { tent: 2, band: 'X', channel: 8 },
  { tent: 3, band: 'L', channel: 6 },
  { tent: 4, band: 'R', channel: 5 },
  { tent: 5, band: 'R', channel: 7 },
  { tent: 6, band: 'H', channel: 8 },
]

/**
 * Оптимальный набор частот: 10 Foxeer + 10 Blitz, мин. разнос 37 МГц,
 * включая обязательные пины. Найден бэктрекингом.
 */
const OPTIMAL_FOXEER_EXTRA_MHZ = [4990, 5050, 5325, 5474] as const
const OPTIMAL_BLITZ_MHZ = [
  5362, 5399, 5436, 5584, 5621, 5658, 5695, 5732, 5769, 5843,
] as const

/** Цифровая видеолиния: 1360…1440 МГц, шаг 10 МГц (палатка N → 1360+(N−1)·10). */
export const DIGITAL_FREQ_START_MHZ = 1360
export const DIGITAL_FREQ_END_MHZ = 1440
export const DIGITAL_FREQ_STEP_MHZ = 10

const LAYOUT_STORAGE_KEY = 'fc-imperiya-fpv-layout-v3'

export function vtxDisplayName(vtx: FpvVtxSource): string {
  if (vtx === 'foxeer') return 'Foxeer 5.8'
  if (vtx === 'blitz') return 'Blitz 5.8'
  return 'Цифра 1.4 ГГц'
}

/** Фиксированная цифровая частота палатки: 1360, 1370, … (шаг 10 МГц). */
export function digitalFrequencyForTent(tent: number): FpvChannel {
  const channel = Math.max(1, tent)
  const freqMHz = DIGITAL_FREQ_START_MHZ + (channel - 1) * DIGITAL_FREQ_STEP_MHZ
  return {
    id: `digital-D${channel}`,
    rangeKey: '14',
    rangeLabel: 'Цифра 1.4 ГГц',
    band: 'D',
    channel,
    freqMHz,
    label: `D${channel}`,
    vtx: 'digital',
  }
}

function flattenVtx(vtx: FpvVtxSource, bands: BandTable): FpvChannel[] {
  const rangeLabel = vtxDisplayName(vtx)
  const out: FpvChannel[] = []
  for (const [band, freqs] of Object.entries(bands)) {
    freqs.forEach((freqMHz, idx) => {
      const channel = idx + 1
      out.push({
        id: `${vtx}-${band}${channel}`,
        rangeKey: '58',
        rangeLabel,
        band,
        channel,
        freqMHz,
        label: `${band}${channel}`,
        vtx,
      })
    })
  }
  return out
}

export function foxeerChannels(): FpvChannel[] {
  return flattenVtx('foxeer', FOXEER_5_8_BANDS)
}

export function blitzChannels(): FpvChannel[] {
  return flattenVtx('blitz', BLITZ_5_8_BANDS)
}

export function allVtxChannels(): FpvChannel[] {
  return [...foxeerChannels(), ...blitzChannels()].sort(
    (a, b) => a.freqMHz - b.freqMHz || a.vtx.localeCompare(b.vtx),
  )
}

function findFoxeerChannel(
  band: string,
  channel: number,
): FpvChannel | undefined {
  return foxeerChannels().find((ch) => ch.band === band && ch.channel === channel)
}

function findChannelAtFreq(
  vtx: FpvVtxSource,
  freqMHz: number,
): FpvChannel | undefined {
  const pool = vtx === 'foxeer' ? foxeerChannels() : blitzChannels()
  const matches = pool.filter((ch) => ch.freqMHz === freqMHz)
  if (matches.length === 0) return undefined
  if (vtx === 'blitz') {
    return matches.find((m) => m.band === 'L') ?? matches[0]
  }
  // для Foxeer предпочитаем X/L/U/O на mid-low
  return (
    matches.find((m) => m.band === 'X') ??
    matches.find((m) => m.band === 'U') ??
    matches.find((m) => m.band === 'O') ??
    matches.find((m) => m.band === 'L') ??
    matches[0]
  )
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  const rnd = mulberry32(seed || 1)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function packMinGap(freqs: number[]): number {
  const s = [...freqs].sort((a, b) => a - b)
  let min = Infinity
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1]
    if (d < min) min = d
  }
  return min === Infinity ? 0 : min
}

/**
 * Каждая палатка: одновременно Foxeer + Blitz.
 * Пины Foxeer X5/X8/L6/R5/R7/H8 на 1–6.
 * Частоты из оптимального набора (разнос 37 МГц); seed только
 * переставляет, какая палатка какой канал из набора получает.
 */
export function assignFrequenciesToTents(
  _location: Location,
  tentCount: number = 10,
  _minGapMHz: number = FPV_MIN_GAP_MHZ,
  seed: number = 1,
): TentFrequencyMap {
  const out: TentFrequencyMap = {}
  for (let tent = 1; tent <= tentCount; tent++) out[tent] = []

  const foxeerByTent = new Map<number, FpvChannel>()
  const blitzByTent = new Map<number, FpvChannel>()

  for (const pin of TENT_PINNED_CHANNELS) {
    if (pin.tent < 1 || pin.tent > tentCount) continue
    const ch = findFoxeerChannel(pin.band, pin.channel)
    if (!ch) continue
    foxeerByTent.set(pin.tent, ch)
  }

  const foxExtra = shuffle([...OPTIMAL_FOXEER_EXTRA_MHZ], seed + 11)
  let fi = 0
  for (let tent = 1; tent <= tentCount; tent++) {
    if (foxeerByTent.has(tent)) continue
    const freq = foxExtra[fi++]
    if (freq == null) continue
    const ch = findChannelAtFreq('foxeer', freq)
    if (ch) foxeerByTent.set(tent, ch)
  }

  const blitzFreqs = shuffle([...OPTIMAL_BLITZ_MHZ], seed + 29)
  const tentOrder = shuffle(
    Array.from({ length: tentCount }, (_, i) => i + 1),
    seed + 41,
  )
  let bi = 0
  for (const tent of tentOrder) {
    if (tent > tentCount) continue
    const freq = blitzFreqs[bi++]
    if (freq == null) continue
    const ch = findChannelAtFreq('blitz', freq)
    if (ch) blitzByTent.set(tent, ch)
  }

  for (let tent = 1; tent <= tentCount; tent++) {
    const list: FpvChannel[] = []
    const fox = foxeerByTent.get(tent)
    const bli = blitzByTent.get(tent)
    if (fox) list.push(fox)
    if (bli) list.push(bli)
    // Цифра фиксирована по номеру палатки, generate её не трогает.
    list.push(digitalFrequencyForTent(tent))
    // Сначала цифра (1.4), потом 5.8 — удобнее читать в UI.
    out[tent] = list.sort((a, b) => {
      if (a.vtx === 'digital' && b.vtx !== 'digital') return -1
      if (b.vtx === 'digital' && a.vtx !== 'digital') return 1
      return a.freqMHz - b.freqMHz
    })
  }
  return out
}

/** Мин. разнос только среди аналоговых 5.8 (цифра в другом диапазоне). */
export function globalMinGap(map: TentFrequencyMap): number {
  return packMinGap(
    Object.values(map)
      .flat()
      .filter((c) => c.vtx !== 'digital')
      .map((c) => c.freqMHz),
  )
}

export function countGlobalConflicts(
  map: TentFrequencyMap,
  minGapMHz: number = FPV_MIN_GAP_MHZ,
): number {
  const freqs = Object.values(map)
    .flat()
    .filter((c) => c.vtx !== 'digital')
    .map((c) => c.freqMHz)
  let n = 0
  for (let i = 0; i < freqs.length; i++) {
    for (let j = i + 1; j < freqs.length; j++) {
      if (Math.abs(freqs[i] - freqs[j]) < minGapMHz) n++
    }
  }
  return n
}

export function minChannelsPerTent(map: TentFrequencyMap): number {
  const lens = Object.values(map).map((list) => list.length)
  return lens.length ? Math.min(...lens) : 0
}

export function tentsWithBothVtx(map: TentFrequencyMap): number {
  return Object.values(map).filter(
    (list) =>
      list.some((c) => c.vtx === 'foxeer') && list.some((c) => c.vtx === 'blitz'),
  ).length
}

export function generateFrequencyLayout(
  location: Location,
  tentCount: number = 10,
  minGapMHz: number = FPV_MIN_GAP_MHZ,
  _attempts: number = 24,
): {
  seed: number
  map: TentFrequencyMap
  minPerTent: number
  bothVtx: number
  total: number
  minGapActual: number
  conflictsUnderTarget: number
} {
  const seed = (Date.now() % 1_000_000_007) >>> 0
  const map = assignFrequenciesToTents(location, tentCount, minGapMHz, seed)
  return {
    seed,
    map,
    minPerTent: minChannelsPerTent(map),
    bothVtx: tentsWithBothVtx(map),
    total: Object.values(map).flat().length,
    minGapActual: globalMinGap(map),
    conflictsUnderTarget: countGlobalConflicts(map, minGapMHz),
  }
}

type StoredLayouts = Record<string, { seed: number; updatedAt: string }>

function layoutKey(departmentId: string, location: Location): string {
  return `${departmentId}:${location}`
}

export function loadLayoutSeed(
  departmentId: string,
  location: Location,
): number | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredLayouts
    const row = parsed[layoutKey(departmentId, location)]
    return row && typeof row.seed === 'number' ? row.seed : null
  } catch {
    return null
  }
}

export function saveLayoutSeed(
  departmentId: string,
  location: Location,
  seed: number,
): void {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    const parsed = (raw ? JSON.parse(raw) : {}) as StoredLayouts
    parsed[layoutKey(departmentId, location)] = {
      seed,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    /* quota */
  }
}

export function frequenciesForTent(
  location: Location,
  tent: number,
  seed: number = 1,
): FpvChannel[] {
  return assignFrequenciesToTents(location, 10, FPV_MIN_GAP_MHZ, seed)[tent] ?? []
}

export function buildFpvPool(minGapMHz: number = FPV_MIN_GAP_MHZ): FpvChannel[] {
  const map = assignFrequenciesToTents('alabino', 10, minGapMHz, 1)
  return Object.values(map)
    .flat()
    .sort((a, b) => a.freqMHz - b.freqMHz)
}

export const FPV_RANGES = {
  foxeer: { label: 'Foxeer 5.8', bands: FOXEER_5_8_BANDS },
  blitz: { label: 'Blitz 5.8', bands: BLITZ_5_8_BANDS },
}
