import type { TmcEquipmentRequest } from '../types'
import { TMC_REQUEST_KIND_LABELS } from '../types'

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80)
}

function shortFio(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const [last, ...rest] = parts
  return `${rest.map((p) => `${p[0]?.toUpperCase() ?? ''}.`).join('')} ${last}`.trim()
}

function initialsFio(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const [last, a, b] = parts
  return `${last} ${a?.[0] ? `${a[0]}.` : ''}${b?.[0] ? `${b[0]}.` : ''}`.trim()
}

function formatDocDate(raw: string): string {
  const s = raw.trim()
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${d}.${m}.${y}`
  }
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Сохранение или шаринг файла через системный диалог (мессенджеры / соцсети). */
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
    // AbortError — пользователь закрыл шаринг; не дублируем скачивание
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'shared'
    }
  }
  downloadBlob(filename, blob)
  return 'downloaded'
}

function buildReceiptAoA(req: TmcEquipmentRequest): unknown[][] {
  const date = formatDocDate(req.docDate)
  const addressee =
    req.addressee.trim() ||
    'Руководителю управления организационной работой'
  const group = req.groupNo.trim() || '—'
  const stream = req.streamNo.trim() || '—'
  const cabinet = req.cabinet.trim() || '—'
  const instructor = shortFio(req.employeeName) || req.employeeName
  const fullInitials = initialsFio(req.employeeName) || req.employeeName

  const header = [
    `Заявка на получение ТМЦ\nв целях организации учебного процесса группы № ${group} поток:${stream} кабинет: ${cabinet}\nпрошу выдать следующее:`,
  ]

  const aoa: unknown[][] = [
    ['Дата', date, '', addressee, ''],
    [header[0], '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    [
      '№',
      'Наименование\nТМЦ',
      'Кол-во шт.',
      'Ответственный инструктор',
      'Комментарий',
    ],
    ['', '', '', '', ''],
  ]

  req.lines.forEach((line, idx) => {
    aoa.push([
      String(idx + 1),
      line.name,
      line.quantity.replace(/шт\.?/i, '').trim() || '1',
      instructor.startsWith('И ') ? instructor : `И  ${instructor}`,
      line.reason ||
        `группа${group} каб ${cabinet}`.replace(/\s+/g, ' ').trim(),
    ])
  })

  aoa.push(['', '', '', '', ''])
  aoa.push(['', 'Инструктор', '', '______________________________', fullInitials])
  aoa.push(['', '', '', '(подпись)', '(расшифровка)'])
  aoa.push(['', '', '', '', ''])
  aoa.push(['', '', '', '', date])
  aoa.push(['', '', '', '', ''])
  aoa.push(['', 'Согласовано:', '', '', ''])
  aoa.push([
    '',
    '',
    '',
    '______________________________',
    '___________________________',
  ])
  aoa.push(['', 'Руководитель управления  ', '', '(подпись)', '(расшифровка)'])
  aoa.push(['', '', '', '', ''])
  aoa.push(['', 'М.П', '', '', date])

  return aoa
}

function buildRepairAoA(req: TmcEquipmentRequest): unknown[][] {
  const date = formatDocDate(req.docDate)
  // шаблон часто 10/1/26 — оставляем ДД.ММ.ГГГГ читаемее
  const cabinet = req.cabinet.trim() || '—'
  const stream = req.streamNo.trim() || '—'
  const group = req.groupNo.trim() || '—'
  const role = req.roleTitle.trim() || 'инструктор'
  const fio = initialsFio(req.employeeName) || req.employeeName

  const aoa: unknown[][] = [
    [
      'АКТ О ПЕРЕДАЧЕ ТОВАРНО-МАТЕРИАЛЬНЫХ ЦЕННОСТЕЙ НА РЕМОНТНЫЙ УЧАСТОК.',
      '',
      '',
      '',
      '',
    ],
    ['', '', '', '', ''],
    [
      'ДАТА:',
      date,
      '№ кабинета ',
      cabinet,
      `№ потока     ${stream}           № Группы  ${group}`,
    ],
    ['', '', '', '', ''],
    ['Я,', role, '', fio, 'передаю на ремонтный участок;'],
    ['', '(должность)', 'Фамилия И.О.', '', ''],
    ['', '', '', '', ''],
    ['Наименование', '', 'Инвентарный номер', '', 'Комментарии'],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
  ]

  // Группируем: имя показывается у первой строки группы
  let lastName = ''
  for (const line of req.lines) {
    const showName = line.name !== lastName ? line.name : ''
    lastName = line.name
    aoa.push([
      showName,
      '',
      line.warehouseNumber || 'НЕТ',
      '',
      line.reason || req.note || '',
    ])
  }

  // запас пустых строк как в образце
  for (let i = 0; i < 5; i++) aoa.push(['', '', '', '', ''])

  aoa.push([' Сдал', role || 'Инструктор', '', '', fio])
  aoa.push(['', '(должность)', '', 'подпись', 'Фамилия И.О.'])
  aoa.push(['', '', '', '', ''])
  aoa.push([' Принял', '  ', '', '', ''])
  aoa.push(['', '(должность)', '', 'подпись', 'Фамилия И.О.'])

  return aoa
}

function applyReceiptMerges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheet: any,
  lineCount: number,
): void {
  sheet['!merges'] = [
    { s: { c: 3, r: 0 }, e: { c: 4, r: 0 } },
    { s: { c: 0, r: 1 }, e: { c: 4, r: 8 } },
    { s: { c: 0, r: 9 }, e: { c: 0, r: 10 } },
    { s: { c: 1, r: 9 }, e: { c: 1, r: 10 } },
    { s: { c: 2, r: 9 }, e: { c: 2, r: 10 } },
    { s: { c: 3, r: 9 }, e: { c: 3, r: 10 } },
    { s: { c: 4, r: 9 }, e: { c: 4, r: 10 } },
  ]
  sheet['!cols'] = [
    { wch: 6 },
    { wch: 36 },
    { wch: 12 },
    { wch: 28 },
    { wch: 22 },
  ]
  void lineCount
}

function applyRepairMerges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheet: any,
  lineCount: number,
): void {
  const merges: { s: { c: number; r: number }; e: { c: number; r: number } }[] =
    [
      { s: { c: 0, r: 0 }, e: { c: 4, r: 0 } },
      { s: { c: 2, r: 5 }, e: { c: 3, r: 5 } },
      { s: { c: 0, r: 7 }, e: { c: 1, r: 9 } },
      { s: { c: 2, r: 7 }, e: { c: 3, r: 9 } },
      { s: { c: 4, r: 7 }, e: { c: 4, r: 9 } },
    ]
  for (let i = 0; i < lineCount; i++) {
    const r = 10 + i
    merges.push({ s: { c: 0, r }, e: { c: 1, r } })
    merges.push({ s: { c: 2, r }, e: { c: 3, r } })
  }
  sheet['!merges'] = merges
  sheet['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
  ]
}

export function actFileName(req: TmcEquipmentRequest): string {
  const date = formatDocDate(req.docDate).replace(/\./g, '-')
  if (req.kind === 'receipt') {
    const no = req.requestNo.trim() || 'бн'
    const gr = req.groupNo.trim() || 'гр'
    const stream = req.streamNo.trim() || 'п'
    const who = safeName(initialsFio(req.employeeName) || 'заявка')
    return `Заявка_оборуд_№${no}_П${stream}_гр${gr}_${who}.xlsx`
  }
  const stream = req.streamNo.trim() || 'п'
  const gr = req.groupNo.trim() || 'гр'
  return `Акт_передачи_на_ремонт_поток_${stream}_группа_${gr}_${date}.xlsx`
}

export async function buildTmcActWorkbook(
  req: TmcEquipmentRequest,
): Promise<{ blob: Blob; filename: string; title: string }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const aoa =
    req.kind === 'receipt' ? buildReceiptAoA(req) : buildRepairAoA(req)
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  if (req.kind === 'receipt') applyReceiptMerges(sheet, req.lines.length)
  else applyRepairMerges(sheet, req.lines.length)
  XLSX.utils.book_append_sheet(wb, sheet, 'Лист1')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const filename = actFileName(req)
  const title = `${TMC_REQUEST_KIND_LABELS[req.kind]} · ${req.employeeName}`
  return { blob, filename, title }
}

export async function downloadTmcAct(
  req: TmcEquipmentRequest,
): Promise<'shared' | 'downloaded'> {
  const { blob, filename } = await buildTmcActWorkbook(req)
  downloadBlob(filename, blob)
  return 'downloaded'
}

export async function shareTmcAct(
  req: TmcEquipmentRequest,
): Promise<'shared' | 'downloaded'> {
  const { blob, filename, title } = await buildTmcActWorkbook(req)
  return downloadOrShareBlob(blob, filename, title)
}
