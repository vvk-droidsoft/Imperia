import type {
  Employee,
  TmcBaselineItem,
  TmcBoard,
  TmcItem,
} from '../types'
import {
  ROLE_LABELS,
  TMC_BOARD_KIND_LABELS,
  TMC_BOARD_STATUS_LABELS,
  TMC_ITEM_CONDITION_LABELS,
} from '../types'
import { findMissingTmcItems } from './tmcDiff'

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
}

function itemRows(
  items: TmcItem[],
  employeeName: string,
): (string | number)[][] {
  return [...items]
    .sort((a, b) => a.orderNo - b.orderNo || a.name.localeCompare(b.name, 'ru'))
    .map((i, idx) => [
      idx + 1,
      employeeName,
      i.name,
      i.warehouseNumber,
      TMC_ITEM_CONDITION_LABELS[i.condition] ?? i.condition,
      i.quantity,
      '',
    ])
}

function missingRows(
  missing: TmcBaselineItem[],
  employeeName: string,
): (string | number)[][] {
  return missing.map((i, idx) => [
    idx + 1,
    employeeName,
    i.name,
    i.warehouseNumber,
    TMC_ITEM_CONDITION_LABELS[i.condition] ?? i.condition,
    i.quantity,
    'ПРОПАЛО',
  ])
}

function boardRows(
  boards: TmcBoard[],
  employeeName: string,
): (string | number)[][] {
  return boards.map((b, idx) => [
    idx + 1,
    employeeName,
    TMC_BOARD_KIND_LABELS[b.kind],
    TMC_BOARD_STATUS_LABELS[b.status],
    b.note,
  ])
}

const ITEM_HEADER = [
  '№',
  'Сотрудник',
  'Наименование',
  'Инв. №',
  'Состояние',
  'Кол-во',
  'Отметка',
]

const BOARD_HEADER = ['№', 'Сотрудник', 'Борт', 'Статус', 'Примечание']

export async function downloadEmployeeTmcExcel(opts: {
  departmentName: string
  employee: Employee
  items: TmcItem[]
  boards: TmcBoard[]
  baselineItems?: TmcBaselineItem[]
}): Promise<void> {
  const XLSX = await import('xlsx')
  const { departmentName, employee, items, boards, baselineItems } = opts
  const missing = findMissingTmcItems(baselineItems, items)
  const wb = XLSX.utils.book_new()

  const equipAoA = [
    [`ТМЦ · ${employee.name} · ${departmentName}`],
    [`Выгрузка: ${new Date().toLocaleString('ru-RU')}`],
    [],
    ITEM_HEADER,
    ...itemRows(items, employee.name),
  ]
  if (missing.length) {
    equipAoA.push([])
    equipAoA.push(['Пропало относительно предыдущей инвентаризации:'])
    equipAoA.push(ITEM_HEADER)
    equipAoA.push(...missingRows(missing, employee.name))
  }
  const equipSheet = XLSX.utils.aoa_to_sheet(equipAoA)
  XLSX.utils.book_append_sheet(wb, equipSheet, 'Оборудование')

  if (missing.length) {
    const missSheet = XLSX.utils.aoa_to_sheet([
      ['Пропавшие позиции'],
      ITEM_HEADER,
      ...missingRows(missing, employee.name),
    ])
    XLSX.utils.book_append_sheet(wb, missSheet, 'Пропало')
  }

  const boardSheet = XLSX.utils.aoa_to_sheet([
    BOARD_HEADER,
    ...boardRows(boards, employee.name),
  ])
  XLSX.utils.book_append_sheet(wb, boardSheet, 'Борта')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    `ТМЦ_${safeName(employee.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

export async function downloadDepartmentTmcExcel(opts: {
  departmentName: string
  employees: Employee[]
  items: TmcItem[]
  boards: TmcBoard[]
}): Promise<void> {
  const XLSX = await import('xlsx')
  const { departmentName, employees, items, boards } = opts
  const wb = XLSX.utils.book_new()

  const allRows: (string | number)[][] = [
    [`ТМЦ отдела · ${departmentName}`],
    [`Выгрузка: ${new Date().toLocaleString('ru-RU')}`],
    [],
    ITEM_HEADER,
  ]
  const allBoards: (string | number)[][] = [BOARD_HEADER]

  for (const emp of employees) {
    const empItems = items.filter((i) => i.employeeId === emp.id)
    const empBoards = boards.filter((b) => b.employeeId === emp.id)
    const label = `${emp.name} (${ROLE_LABELS[emp.role]})`
    allRows.push(...itemRows(empItems, label))
    allBoards.push(...boardRows(empBoards, label))
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(allRows),
    'Оборудование',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(allBoards),
    'Борта',
  )

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    `ТМЦ_отдел_${safeName(departmentName)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}
