import type { TmcItemCondition } from '../types'
import { TMC_ITEM_CONDITION_LABELS, TMC_ITEM_CONDITIONS } from '../types'

/** Распознанная позиция из файла (ещё не в БД). */
export type ParsedTmcRow = {
  name: string
  warehouseNumber: string
  quantity: string
  condition: TmcItemCondition
  brand: string
  model: string
  serial: string
  note: string
}

export type TmcImportResult = {
  fileName: string
  rows: ParsedTmcRow[]
  warnings: string[]
}

const CONDITION_ALIASES: Record<string, TmcItemCondition> = {
  исправно: 'ok',
  исправен: 'ok',
  ок: 'ok',
  ok: 'ok',
  good: 'ok',
  неисправно: 'faulty',
  неисправен: 'faulty',
  faulty: 'faulty',
  'в ремонте': 'repair',
  ремонт: 'repair',
  repair: 'repair',
  утеряно: 'lost',
  утерян: 'lost',
  потеряно: 'lost',
  lost: 'lost',
}

function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.«»"']/g, '')
    .trim()
}

function parseCondition(raw: unknown): TmcItemCondition {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!s) return 'ok'
  if (CONDITION_ALIASES[s]) return CONDITION_ALIASES[s]
  for (const c of TMC_ITEM_CONDITIONS) {
    if (TMC_ITEM_CONDITION_LABELS[c].toLowerCase() === s) return c
  }
  return 'ok'
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

type ColMap = {
  name?: number
  warehouse?: number
  qty?: number
  condition?: number
  brand?: number
  model?: number
  serial?: number
  note?: number
}

function mapHeaders(headers: string[]): ColMap {
  const map: ColMap = {}
  headers.forEach((h, idx) => {
    const n = normHeader(h)
    if (!n) return
    if (
      /наименован|название|издели|номенклатур|наимен|item|name|продукц|оборудован/.test(
        n,
      )
    ) {
      map.name ??= idx
    } else if (/инв|склад|warehouse|inventory|учётн/.test(n)) {
      map.warehouse ??= idx
    } else if (/кол|quantity|qty|кол-во|количество/.test(n)) {
      map.qty ??= idx
    } else if (/состоян|condition|статус.*издел/.test(n)) {
      map.condition ??= idx
    } else if (/бренд|производит|brand|марка/.test(n)) {
      map.brand ??= idx
    } else if (/модель|model/.test(n)) {
      map.model ??= idx
    } else if (/серий|serial|s\/n|sn\b/.test(n)) {
      map.serial ??= idx
    } else if (/примеч|коммент|note|основан/.test(n)) {
      map.note ??= idx
    }
  })
  return map
}

function rowFromCells(cells: unknown[], map: ColMap): ParsedTmcRow | null {
  const name = map.name != null ? cellStr(cells[map.name]) : ''
  if (!name || /^№+$/i.test(name) || /наименован/i.test(name)) return null
  if (/^сотрудник$/i.test(name) || /^отметка$/i.test(name)) return null

  // Без явной колонки имени — первая непустая текстовая ячейка
  let resolvedName = name
  if (!resolvedName && map.name == null) {
    for (const c of cells) {
      const s = cellStr(c)
      if (s && !/^\d+([.,]\d+)?$/.test(s)) {
        resolvedName = s
        break
      }
    }
  }
  if (!resolvedName) return null

  return {
    name: resolvedName,
    warehouseNumber: map.warehouse != null ? cellStr(cells[map.warehouse]) : '',
    quantity: map.qty != null ? cellStr(cells[map.qty]) || '1' : '1',
    condition: parseCondition(map.condition != null ? cells[map.condition] : ''),
    brand: map.brand != null ? cellStr(cells[map.brand]) : '',
    model: map.model != null ? cellStr(cells[map.model]) : '',
    serial: map.serial != null ? cellStr(cells[map.serial]) : '',
    note: map.note != null ? cellStr(cells[map.note]) : '',
  }
}

function parseMatrix(matrix: unknown[][], fileName: string): TmcImportResult {
  const warnings: string[] = []
  const rows: ParsedTmcRow[] = []
  if (!matrix.length) {
    return { fileName, rows, warnings: ['Файл пуст'] }
  }

  // Ищем строку заголовков в первых 15 строках
  let headerIdx = -1
  let colMap: ColMap = {}
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const headers = (matrix[i] ?? []).map((c) => cellStr(c))
    const mapped = mapHeaders(headers)
    if (mapped.name != null) {
      headerIdx = i
      colMap = mapped
      break
    }
  }

  if (headerIdx < 0) {
    warnings.push(
      'Не найден заголовок «Наименование» — разобраны строки как «название · кол-во».',
    )
    for (const line of matrix) {
      const cells = line ?? []
      const texts = cells.map(cellStr).filter(Boolean)
      if (texts.length === 0) continue
      if (/тмц|выгрузка|оборудование/i.test(texts[0])) continue
      const qty =
        texts.find((t) => /^\d+([.,]\d+)?$/.test(t)) ??
        (texts.length > 1 ? texts[texts.length - 1] : '1')
      const name = texts.find((t) => t !== qty) ?? texts[0]
      if (!name || /наименован|сотрудник/i.test(name)) continue
      rows.push({
        name,
        warehouseNumber: '',
        quantity: /^\d/.test(qty) ? qty : '1',
        condition: 'ok',
        brand: '',
        model: '',
        serial: '',
        note: '',
      })
    }
    return { fileName, rows, warnings }
  }

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const parsed = rowFromCells(matrix[i] ?? [], colMap)
    if (parsed) rows.push(parsed)
  }
  if (!rows.length) warnings.push('Строки данных не найдены')
  return { fileName, rows, warnings }
}

async function parseExcel(file: File): Promise<TmcImportResult> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName =
    wb.SheetNames.find((n) => /оборуд|тмц|item|лист1/i.test(n)) ??
    wb.SheetNames[0]
  if (!sheetName) return { fileName: file.name, rows: [], warnings: ['Нет листов'] }
  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]
  return parseMatrix(matrix, file.name)
}

function parseDelimitedText(text: string, fileName: string): TmcImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const sep = lines.some((l) => l.includes('\t'))
    ? '\t'
    : lines.some((l) => l.includes(';'))
      ? ';'
      : ','
  const matrix = lines.map((l) => l.split(sep).map((c) => c.trim()))
  return parseMatrix(matrix, fileName)
}

/** Строки вида: Наименование | Инв | Кол-во | Состояние */
function parseLooseText(text: string, fileName: string): TmcImportResult {
  const warnings: string[] = []
  const rows: ParsedTmcRow[] = []
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  for (const line of lines) {
    if (/^(тмц|выгрузка|оборудование|наименован|№\b)/i.test(line)) continue
    // "Название — 2 шт" / "Название; инв 123; 2; Исправно"
    const parts = line.split(/\s*[|;—–]\s*|\s{2,}/).map((p) => p.trim())
    if (parts.length >= 2) {
      const name = parts[0]
      if (!name || name.length < 2) continue
      let warehouseNumber = ''
      let quantity = '1'
      let condition: TmcItemCondition = 'ok'
      for (const p of parts.slice(1)) {
        if (/инв/i.test(p) || /^[A-ZА-Я0-9-]{4,}$/i.test(p)) {
          warehouseNumber = p.replace(/^инв\.?\s*/i, '')
        } else if (/^\d+([.,]\d+)?(\s*шт\.?)?$/i.test(p)) {
          quantity = p.replace(/[^\d.,]/g, '') || '1'
        } else if (CONDITION_ALIASES[p.toLowerCase()]) {
          condition = CONDITION_ALIASES[p.toLowerCase()]
        }
      }
      rows.push({
        name,
        warehouseNumber,
        quantity,
        condition,
        brand: '',
        model: '',
        serial: '',
        note: '',
      })
      continue
    }
    // "2x Аккумулятор" / "Аккумулятор x2"
    const m1 = line.match(/^(\d+)\s*[xх×]\s+(.+)$/i)
    const m2 = line.match(/^(.+?)\s*[xх×]\s*(\d+)$/i)
    if (m1) {
      rows.push({
        name: m1[2].trim(),
        warehouseNumber: '',
        quantity: m1[1],
        condition: 'ok',
        brand: '',
        model: '',
        serial: '',
        note: '',
      })
    } else if (m2) {
      rows.push({
        name: m2[1].trim(),
        warehouseNumber: '',
        quantity: m2[2],
        condition: 'ok',
        brand: '',
        model: '',
        serial: '',
        note: '',
      })
    }
  }
  if (!rows.length) {
    warnings.push(
      'Не удалось разобрать текст. Ожидаются строки с наименованием и количеством или таблица с заголовками.',
    )
  }
  return { fileName, rows, warnings }
}

async function parseDocx(file: File): Promise<TmcImportResult> {
  const mammoth = await import('mammoth')
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  const text = result.value || ''
  // Сначала пробуем как CSV-подобные строки
  if (text.includes('\t') || /наименован/i.test(text)) {
    const asCsv = parseDelimitedText(text, file.name)
    if (asCsv.rows.length) return asCsv
  }
  return parseLooseText(text, file.name)
}

async function parsePdf(file: File): Promise<TmcImportResult> {
  const pdfjs = await import('pdfjs-dist')
  // Vite: worker из пакета
  try {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  } catch {
    /* fallback без worker — sync extract может работать на малых PDF */
  }
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const chunks: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? String(it.str) : ''))
      .join(' ')
    chunks.push(line)
  }
  const text = chunks.join('\n')
  if (/наименован/i.test(text) && (text.includes('\t') || text.includes(';'))) {
    const asCsv = parseDelimitedText(text, file.name)
    if (asCsv.rows.length) return asCsv
  }
  return parseLooseText(text, file.name)
}

export function isSupportedTmcImportFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return /\.(xlsx|xls|csv|tsv|txt|docx|pdf)$/i.test(n)
}

export async function parseTmcImportFile(file: File): Promise<TmcImportResult> {
  const n = file.name.toLowerCase()
  if (/\.(xlsx|xls)$/i.test(n)) return parseExcel(file)
  if (/\.(csv|tsv|txt)$/i.test(n)) {
    const text = await file.text()
    return /\.(csv|tsv)$/i.test(n)
      ? parseDelimitedText(text, file.name)
      : parseLooseText(text, file.name)
  }
  if (/\.docx$/i.test(n)) return parseDocx(file)
  if (/\.pdf$/i.test(n)) return parsePdf(file)
  return {
    fileName: file.name,
    rows: [],
    warnings: [
      'Формат не поддерживается. Загрузите Excel, Word (.docx), PDF, CSV или TXT.',
    ],
  }
}
