import type { DayCell, DayStatus, Employee, Role } from '../types'

/** Рабочий день: 09:00–19:00 (10 ч), ненормированный график */
export const WORK_DAY_START_HOUR = 9
export const WORK_DAY_END_HOUR = 19
export const WORK_DAY_HOURS = WORK_DAY_END_HOUR - WORK_DAY_START_HOUR
export const WORK_DAY_LABEL = '09:00–19:00'

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export const DAYS_OFF_QUOTA: Record<Role, number> = {
  senior_instructor: 8,
  instructor: 10,
  assistant: 10,
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

export function previousMonthKey(year: number, month: number): {
  year: number
  month: number
  key: string
} {
  const d = new Date(year, month - 1, 1)
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    key: monthKey(d.getFullYear(), d.getMonth()),
  }
}

export function isSaturday(year: number, month: number, dayIndex: number): boolean {
  return new Date(year, month, dayIndex + 1).getDay() === 6
}

export function isPastDay(year: number, month: number, dayIndex: number): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cell = new Date(year, month, dayIndex + 1)
  cell.setHours(0, 0, 0, 0)
  return cell < today
}

export function isPastMonth(year: number, month: number): boolean {
  const now = new Date()
  const cur = now.getFullYear() * 12 + now.getMonth()
  const target = year * 12 + month
  return target < cur
}

export function isSenior(role: Role): boolean {
  return role === 'senior_instructor'
}

export function countDaysOff(days: DayCell[], dayCount: number): number {
  return days.slice(0, dayCount).filter((d) => d.status === 'off').length
}

export function sumDayOvertime(days: DayCell[], dayCount: number): number {
  return days
    .slice(0, dayCount)
    .reduce((sum, d) => sum + (Number(d.overtimeHours) || 0), 0)
}

export function roundHours(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Автоучёт переработок относительно смены 09:00–19:00:
 * время до 09:00 и после 19:00 считается переработкой.
 */
export function overtimeFromShift(
  checkInIso: string | null,
  checkOutIso: string | null,
): number {
  if (!checkInIso || !checkOutIso) return 0
  const start = new Date(checkInIso)
  const end = new Date(checkOutIso)
  const startMs = start.getTime()
  const endMs = end.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0
  }

  const windowStart = new Date(start)
  windowStart.setHours(WORK_DAY_START_HOUR, 0, 0, 0)
  const windowEnd = new Date(start)
  windowEnd.setHours(WORK_DAY_END_HOUR, 0, 0, 0)

  // Если уход на следующие сутки — окно «после 19:00» идёт до фактического ухода
  let overtimeMs = 0
  const winStartMs = windowStart.getTime()
  const winEndMs = windowEnd.getTime()

  if (startMs < winStartMs) {
    overtimeMs += Math.min(endMs, winStartMs) - startMs
  }
  if (endMs > winEndMs) {
    overtimeMs += endMs - Math.max(startMs, winEndMs)
  }

  return roundHours(Math.max(0, overtimeMs / 3_600_000))
}

export type ActorContext = {
  employee: Employee
  departmentId: string
  isAdmin: boolean
}

export function isAdmin(actor: ActorContext | null): boolean {
  return !!actor?.isAdmin
}

/** Старший инструктор — руководитель своего отдела; админ — любого */
export function isDeptHead(
  actor: ActorContext | null,
  departmentId: string,
): boolean {
  if (!actor) return false
  if (actor.isAdmin) return true
  if (!isSenior(actor.employee.role)) return false
  return actor.departmentId === departmentId
}

/** Сегодня суббота — день простановки выходных инструкторами/ассистентами */
export function isPlanningSaturday(now = new Date()): boolean {
  return now.getDay() === 6
}

export function canEditCell(
  actor: ActorContext | null,
  target: Employee,
  targetDepartmentId: string,
  year: number,
  month: number,
  dayIndex: number,
  now = new Date(),
): { ok: boolean; reason?: string } {
  if (!actor) {
    return { ok: false, reason: 'Войдите в учётную запись' }
  }
  if (isDeptHead(actor, targetDepartmentId)) {
    return { ok: true }
  }
  if (actor.departmentId !== targetDepartmentId) {
    return { ok: false, reason: 'Чужой отдел закрыт' }
  }
  if (actor.employee.id !== target.id) {
    return { ok: false, reason: 'Можно править только свою строку' }
  }
  if (isPastDay(year, month, dayIndex) || isPastMonth(year, month)) {
    return {
      ok: false,
      reason: 'Прошлые дни закрыты. Только старший инструктор отдела',
    }
  }
  if (!isPlanningSaturday(now)) {
    return {
      ok: false,
      reason:
        'Выходные проставляются по субботам. В другие дни правки закрыты (кроме старшего инструктора)',
    }
  }
  return { ok: true }
}

export function canSetDayStatus(
  actor: ActorContext | null,
  target: Employee,
  targetDepartmentId: string,
  year: number,
  month: number,
  dayIndex: number,
  status: DayStatus,
  days: DayCell[],
): { ok: boolean; reason?: string } {
  const base = canEditCell(
    actor,
    target,
    targetDepartmentId,
    year,
    month,
    dayIndex,
  )
  if (!base.ok) return base

  if (actor && !isDeptHead(actor, targetDepartmentId)) {
    if (status !== 'off' && status !== 'work') {
      return {
        ok: false,
        reason: 'Можно ставить только выходной или рабочий; остальное — старшему',
      }
    }
  }

  if (status === 'off') {
    const dayCount = daysInMonth(year, month)
    const current = days[dayIndex]?.status
    const used = countDaysOff(days, dayCount) - (current === 'off' ? 1 : 0)
    const quota = DAYS_OFF_QUOTA[target.role]
    if (used >= quota) {
      return {
        ok: false,
        reason: `Лимит выходных: ${quota} в месяц`,
      }
    }
  }

  return { ok: true }
}

export function canManageStaff(
  actor: ActorContext | null,
  departmentId: string,
): boolean {
  return isDeptHead(actor, departmentId)
}

export function canEditEmployeeMeta(
  actor: ActorContext | null,
  target: Employee,
  targetDepartmentId: string,
): boolean {
  if (!actor) return false
  if (isDeptHead(actor, targetDepartmentId)) return true
  return (
    actor.departmentId === targetDepartmentId &&
    actor.employee.id === target.id
  )
}

export function canManualOvertime(
  actor: ActorContext | null,
  departmentId: string,
): boolean {
  return isDeptHead(actor, departmentId)
}

export function canCheckAttendance(
  actor: ActorContext | null,
  target: Employee,
  targetDepartmentId: string,
): boolean {
  if (!actor) return false
  if (isDeptHead(actor, targetDepartmentId)) return true
  return (
    actor.departmentId === targetDepartmentId &&
    actor.employee.id === target.id
  )
}

export function canOpenDepartment(
  actor: ActorContext | null,
  departmentId: string,
): boolean {
  if (!actor) return false
  if (actor.isAdmin) return true
  return actor.departmentId === departmentId
}

/** Чат видят только сотрудники этого отдела (не чужие отделы) */
export function canUseDeptChat(
  actor: ActorContext | null,
  departmentId: string,
): boolean {
  if (!actor) return false
  return actor.departmentId === departmentId
}
