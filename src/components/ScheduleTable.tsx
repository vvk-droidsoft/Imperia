import { LogIn, LogOut, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { DayStatus, Department, Location, Role } from '../types'
import {
  DAY_STATUS_LABELS,
  LOCATION_LABELS,
  ROLE_LABELS,
} from '../types'
import { daysInMonth, formatTime, getMonthSchedule, totalOvertime } from '../lib/storage'
import {
  canCheckAttendance,
  canEditCell,
  canEditEmployeeMeta,
  canManageStaff,
  canManualOvertime,
  DAYS_OFF_QUOTA,
  countDaysOff,
  isPlanningSaturday,
  isSaturday,
  WORK_DAY_HOURS,
  WORK_DAY_LABEL,
  type ActorContext,
} from '../lib/rules'

interface Props {
  department: Department
  month: number
  year: number
  actor: ActorContext | null
  onRenameEmployee: (employeeId: string, name: string) => void
  onRemoveEmployee: (employeeId: string) => void
  onAddEmployee: (name: string) => void
  onSetDayStatus: (employeeId: string, dayIndex: number, status: DayStatus) => void
  onSetOvertime: (employeeId: string, dayIndex: number, hours: number) => void
  onSetRole: (employeeId: string, role: Role) => void
  onSetLocation: (employeeId: string, location: Location) => void
  onCheckIn: (employeeId: string) => void
  onCheckOut: (employeeId: string) => void
}

const STATUS_COLORS: Record<DayStatus, string> = {
  work: 'bg-[var(--work)]/25 text-[var(--work)] border-[var(--work)]/40',
  off: 'bg-[var(--off)]/20 text-[var(--text-muted)] border-[var(--off)]/30',
  trip: 'bg-[var(--trip)]/20 text-[var(--trip)] border-[var(--trip)]/40',
  sick: 'bg-[var(--sick)]/20 text-[var(--sick)] border-[var(--sick)]/40',
}

const LOCATION_COLORS: Record<Location, string> = {
  lik: 'border-[var(--lik)]/50 text-[var(--lik)]',
  bas: 'border-[var(--bas)]/50 text-[var(--bas)]',
  trip: 'border-[var(--trip)]/50 text-[var(--trip)]',
  sick: 'border-[var(--sick)]/50 text-[var(--sick)]',
  alabino: 'border-[var(--polygon)]/50 text-[var(--polygon)]',
  golovenki: 'border-[var(--polygon)]/50 text-[var(--polygon)]',
  volosovo: 'border-[var(--polygon)]/50 text-[var(--polygon)]',
  drakino: 'border-[var(--polygon)]/50 text-[var(--polygon)]',
}

export function ScheduleTable({
  department,
  month,
  year,
  actor,
  onRenameEmployee,
  onRemoveEmployee,
  onAddEmployee,
  onSetDayStatus,
  onSetOvertime,
  onSetRole,
  onSetLocation,
  onCheckIn,
  onCheckOut,
}: Props) {
  const dayCount = daysInMonth(year, month)
  const [newName, setNewName] = useState('')
  const [editingEmp, setEditingEmp] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const senior = canManageStaff(actor, department.id)
  const manualOt = canManualOvertime(actor, department.id)

  const submitNew = () => {
    if (!newName.trim()) return
    onAddEmployee(newName)
    setNewName('')
  }

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        Состав: {department.employees.length} чел. · без лимита численности ·
        смена {WORK_DAY_LABEL} ({WORK_DAY_HOURS} ч) · переработки авто (до 9 и
        после 19) · выходные в месяц: ст.инстр.{' '}
        {DAYS_OFF_QUOTA.senior_instructor}, инстр./ассист.{' '}
        {DAYS_OFF_QUOTA.instructor}
        {isPlanningSaturday()
          ? ' · сегодня суббота — можно править выходные'
          : ''}
        {' · '}
        <span className="text-[var(--accent)]">колесо мыши — прокрутка списка</span>
      </div>

      {senior ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--accent)]/40 bg-black/90 px-3 py-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNew()}
            placeholder="ФИО нового сотрудника"
            className="min-w-[200px] flex-1 border border-[var(--border)] bg-black/60 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={submitNew}
            className="inline-flex items-center gap-1.5 border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-wider text-black hover:bg-[var(--accent-hot)] hover:border-[var(--accent-hot)] hover:text-white"
          >
            <Plus size={16} />
            Добавить в отдел
          </button>
        </div>
      ) : null}

      <div className="roster-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-[var(--border)] bg-black/95">
              <th className="sticky left-0 z-30 min-w-[160px] bg-black/95 px-3 py-2.5 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-wider">
                ФИО
              </th>
              <th className="min-w-[170px] px-2 py-2.5 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-wider">
                Должность
              </th>
              <th className="min-w-[150px] px-2 py-2.5 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-wider">
                Место
              </th>
              <th className="min-w-[200px] px-2 py-2.5 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-wider">
                Приход / уход
              </th>
              {Array.from({ length: dayCount }, (_, i) => {
                const sat = isSaturday(year, month, i)
                return (
                  <th
                    key={i}
                    className={`min-w-[72px] px-1 py-2.5 text-center font-[family-name:var(--mono)] text-xs font-semibold ${
                      sat ? 'text-[var(--accent-hot)]' : 'text-[var(--accent)]'
                    }`}
                    title={sat ? 'Суббота — день постановки выходных' : undefined}
                  >
                    {i + 1}
                    {sat ? (
                      <span className="mt-0.5 block text-[9px] opacity-80">сб</span>
                    ) : null}
                  </th>
                )
              })}
              <th className="sticky right-0 z-30 min-w-[110px] bg-black/95 px-2 py-2.5 text-center font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-wider text-[var(--overtime)]">
                Перераб.
              </th>
              <th className="min-w-[44px] bg-black/95 px-1 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {department.employees.length === 0 ? (
              <tr>
                <td
                  colSpan={dayCount + 6}
                  className="px-4 py-10 text-center text-[var(--text-muted)]"
                >
                  В отделе пока никого нет. Добавьте сотрудника ниже.
                </td>
              </tr>
            ) : (
              department.employees.map((emp, rowIdx) => {
                const schedule = getMonthSchedule(emp, year, month)
                const monthOt = totalOvertime(schedule.days, dayCount)
                const totalOt = Math.round((schedule.carriedIn + monthOt) * 10) / 10
                const offUsed = countDaysOff(schedule.days, dayCount)
                const offQuota = DAYS_OFF_QUOTA[emp.role]
                const metaOk = canEditEmployeeMeta(actor, emp, department.id)
                const attendOk = canCheckAttendance(actor, emp, department.id)

                return (
                  <tr
                    key={emp.id}
                    className={`border-b border-[var(--border)]/70 ${
                      rowIdx % 2 === 0
                        ? 'bg-[var(--bg-row)]'
                        : 'bg-[var(--bg-row-alt)]'
                    }`}
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-2">
                      {editingEmp === emp.id ? (
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => {
                            onRenameEmployee(emp.id, draftName)
                            setEditingEmp(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onRenameEmployee(emp.id, draftName)
                              setEditingEmp(null)
                            }
                          }}
                          className="w-full rounded border border-[var(--border-strong)] bg-[var(--bg)] px-2 py-1 text-sm outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          title={
                            metaOk
                              ? 'Нажмите, чтобы изменить ФИО'
                              : 'Нет прав на изменение ФИО'
                          }
                          disabled={!metaOk}
                          onClick={() => {
                            setEditingEmp(emp.id)
                            setDraftName(emp.name)
                          }}
                          className="w-full truncate text-left font-medium hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {emp.name}
                        </button>
                      )}
                      <div
                        className={`mt-1 text-[10px] font-semibold uppercase ${
                          emp.attendance === 'in'
                            ? 'text-[var(--present)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {emp.attendance === 'in' ? 'На месте' : 'Не на работе'}
                      </div>
                      <div className="mt-0.5 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                        вых {offUsed}/{offQuota}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={emp.role}
                        disabled={!senior}
                        onChange={(e) =>
                          onSetRole(emp.id, e.target.value as Role)
                        }
                        className="w-full border border-[var(--accent)]/40 bg-black/60 px-1.5 py-1.5 text-xs text-[var(--accent)] outline-none disabled:opacity-50"
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((key) => (
                          <option key={key} value={key}>
                            {ROLE_LABELS[key]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={emp.location}
                        disabled={!metaOk}
                        onChange={(e) =>
                          onSetLocation(emp.id, e.target.value as Location)
                        }
                        className={`w-full rounded border bg-[var(--bg)] px-1.5 py-1.5 text-xs outline-none disabled:opacity-50 ${LOCATION_COLORS[emp.location]}`}
                      >
                        {(Object.keys(LOCATION_LABELS) as Location[]).map(
                          (key) => (
                            <option key={key} value={key}>
                              {LOCATION_LABELS[key]}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => onCheckIn(emp.id)}
                          disabled={!attendOk || emp.attendance === 'in'}
                          className="inline-flex items-center gap-1 rounded bg-[var(--work)] px-2 py-1.5 text-xs font-semibold text-[#142010] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <LogIn size={12} />
                          Пришёл
                        </button>
                        <button
                          type="button"
                          onClick={() => onCheckOut(emp.id)}
                          disabled={!attendOk || emp.attendance === 'out'}
                          className="inline-flex items-center gap-1 rounded bg-[var(--sick)]/80 px-2 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <LogOut size={12} />
                          Ушёл
                        </button>
                      </div>
                      <div className="mt-1 space-y-0.5 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                        <div>↓ {formatTime(emp.lastCheckIn)}</div>
                        <div>↑ {formatTime(emp.lastCheckOut)}</div>
                      </div>
                    </td>
                    {Array.from({ length: dayCount }, (_, dayIndex) => {
                      const cell = schedule.days[dayIndex] ?? {
                        status: 'work' as const,
                        overtimeHours: 0,
                      }
                      const edit = canEditCell(
                        actor,
                        emp,
                        department.id,
                        year,
                        month,
                        dayIndex,
                      )
                      const sat = isSaturday(year, month, dayIndex)
                      return (
                        <td
                          key={dayIndex}
                          className={`px-0.5 py-1.5 align-top ${
                            sat ? 'bg-[var(--accent-hot)]/5' : ''
                          }`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <select
                              value={cell.status}
                              disabled={!edit.ok}
                              onChange={(e) =>
                                onSetDayStatus(
                                  emp.id,
                                  dayIndex,
                                  e.target.value as DayStatus,
                                )
                              }
                              className={`w-full rounded border px-0.5 py-1 text-[10px] outline-none disabled:cursor-not-allowed disabled:opacity-45 ${STATUS_COLORS[cell.status]}`}
                              title={
                                edit.ok
                                  ? DAY_STATUS_LABELS[cell.status]
                                  : edit.reason
                              }
                            >
                              {(Object.keys(DAY_STATUS_LABELS) as DayStatus[]).map(
                                (key) => (
                                  <option key={key} value={key}>
                                    {DAY_STATUS_LABELS[key]}
                                  </option>
                                ),
                              )}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              value={cell.overtimeHours || ''}
                              placeholder="ч"
                              disabled={
                                !manualOt ||
                                !edit.ok ||
                                cell.status !== 'work'
                              }
                              onChange={(e) =>
                                onSetOvertime(
                                  emp.id,
                                  dayIndex,
                                  Number(e.target.value),
                                )
                              }
                              className="w-full rounded border border-[var(--overtime)]/30 bg-[var(--bg)] px-0.5 py-0.5 text-center font-[family-name:var(--mono)] text-[10px] text-[var(--overtime)] outline-none disabled:opacity-30"
                              title={
                                manualOt
                                  ? 'Ручная переработка (старший инструктор)'
                                  : 'Автоучёт при уходе с работы'
                              }
                            />
                          </div>
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-10 bg-inherit px-2 py-2 text-center">
                      <span className="inline-block min-w-[2.5rem] rounded border border-[var(--overtime)]/40 bg-[var(--overtime)]/15 px-2 py-1 font-[family-name:var(--mono)] text-sm font-semibold text-[var(--overtime)]">
                        {totalOt}
                      </span>
                      <div className="mt-0.5 space-y-0.5 font-[family-name:var(--mono)] text-[9px] text-[var(--text-muted)]">
                        <div>мес {monthOt}</div>
                        <div>перенос {schedule.carriedIn}</div>
                      </div>
                    </td>
                    <td className="px-1 py-2">
                      {senior ? (
                        <button
                          type="button"
                          title="Удалить сотрудника"
                          onClick={() => onRemoveEmployee(emp.id)}
                          className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--danger)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {senior ? (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]">
          Руководитель отдела: добавляйте и удаляйте людей без ограничения по
          числу. Прокрутка колесом — по списку вниз/вверх, в стороны — по дням.
        </div>
      ) : (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]">
          Режим инструктора/ассистента: свои выходные по субботам (лимит в
          месяц), прошлые дни закрыты; приход/уход — свои. Полный доступ — у
          старшего инструктора (руководитель отдела).
        </div>
      )}
    </div>
  )
}
