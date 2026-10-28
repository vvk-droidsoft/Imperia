import { Download, Eye, FileText, Send, Share2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type {
  ActivityEvent,
  DailyWorkReport,
  DayPlanReview,
  Department,
  Employee,
} from '../types'
import {
  DAY_PLAN_REVIEW_LABELS,
  DAY_STATUS_LABELS,
  LOCATION_LABELS,
  ROLE_LABELS,
} from '../types'
import type { ActorContext } from '../lib/rules'
import { isDeptHead } from '../lib/rules'
import { formatBytes } from '../lib/chatFiles'
import {
  downloadDayPlanFile,
  openDayPlanFile,
  replaceDayPlanFile,
  shareDayPlanFile,
} from '../lib/dayPlanFiles'
import { formatTime, getMonthSchedule, todayKey } from '../lib/storage'
import type { DailyWorkPatch } from '../hooks/useAppState'

interface Props {
  department: Department
  reports: DailyWorkReport[]
  events: ActivityEvent[]
  actor: ActorContext | null
  onUpdate: (employeeId: string, patch: DailyWorkPatch) => void
  onSubmitToSenior?: () => void
}

function isSameDay(iso: string | null, dateKey: string): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return false
  return todayKey(d) === dateKey
}

function formatClock(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function todayStatus(emp: Employee, dateKey: string) {
  const [y, m] = dateKey.split('-').map(Number)
  const year = y
  const month = m - 1
  const dayIndex = Number(dateKey.slice(-2)) - 1
  const sched = getMonthSchedule(emp, year, month)
  const cell = sched.days[dayIndex]
  return cell?.status ?? 'work'
}

function hasContent(r: DailyWorkReport | undefined): boolean {
  if (!r) return false
  return !!(
    r.workDone.trim() ||
    r.programTopics.trim() ||
    r.improveSuggestions.trim() ||
    r.planFileId
  )
}

function hasPlanFile(r: DailyWorkReport | undefined): boolean {
  return !!(r?.planFileId && r.planFileName)
}

export function DailyControlPanel({
  department,
  reports,
  events,
  actor,
  onUpdate,
  onSubmitToSenior,
}: Props) {
  const date = todayKey()
  const head = isDeptHead(actor, department.id)
  const subjects = department.employees.filter(
    (e) => e.role !== 'senior_instructor',
  )
  const byEmp = new Map(reports.map((r) => [r.employeeId, r]))
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const [hint, setHint] = useState<string | null>(null)
  const [busyEmpId, setBusyEmpId] = useState<string | null>(null)
  const fileInputByEmp = useRef<Record<string, HTMLInputElement | null>>({})

  const checkedIn = subjects.filter((e) => e.attendance === 'in').length
  const reported = subjects.filter((e) => hasContent(byEmp.get(e.id))).length
  const submitted = subjects.filter(
    (e) => !!byEmp.get(e.id)?.planSubmittedAt,
  ).length
  const reviewed = subjects.filter((e) => {
    const r = byEmp.get(e.id)
    return !!r?.planSubmittedAt && !!r.planReview
  }).length

  const visibleSubjects =
    head || !actor
      ? subjects
      : subjects.filter((e) => e.id === actor.employee.id)

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Контроль работы · {dateLabel}
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          {head
            ? 'Отчёты и планы на день от инструкторов и ассистентов. Можно открыть/скачать/поделиться файлом плана. Реакция: «Лучший» или «Доработай».'
            : 'Заполните тему, что сделали, предложения и прикрепите план на день. Файл можно скачать или отправить в мессенджер, затем отправьте отчёт старшему.'}
        </p>
        {head ? (
          <div className="mt-2 flex flex-wrap gap-3 font-[family-name:var(--mono)] text-[11px] uppercase tracking-wide">
            <span className="text-[var(--present)]">На месте: {checkedIn}</span>
            <span className="text-[var(--trip)]">
              Заполнено: {reported}/{subjects.length}
            </span>
            <span className="text-[var(--accent)]">
              Отправлено: {submitted}/{subjects.length}
            </span>
            <span className="text-[var(--overtime)]">
              С реакцией: {reviewed}/{subjects.length}
            </span>
            <span className="text-[var(--bas)]">
              С планом:{' '}
              {
                subjects.filter((e) => hasPlanFile(byEmp.get(e.id))).length
              }
              /{subjects.length}
            </span>
          </div>
        ) : null}
        {hint ? (
          <p className="mt-1 m-0 text-[11px] text-[var(--present)]">{hint}</p>
        ) : null}
      </div>

      <div className="roster-scroll min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        {visibleSubjects.length === 0 ? (
          <div className="px-2 py-6 text-sm text-[var(--text-muted)]">
            Нет инструкторов и ассистентов для контроля.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleSubjects.map((emp) => {
              const report = byEmp.get(emp.id)
              const isOwn =
                !!actor &&
                actor.departmentId === department.id &&
                actor.employee.id === emp.id
              const canEditSelfReport = isOwn
              const daySt = todayStatus(emp, date)
              const todayEvents = events
                .filter(
                  (ev) =>
                    ev.employeeId === emp.id && isSameDay(ev.at, date),
                )
                .slice(0, 4)
              const sent = !!report?.planSubmittedAt
              const reaction = report?.planReview ?? ''

              return (
                <article
                  key={emp.id}
                  className="border border-[var(--border)] bg-black/40 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text)]">
                        {emp.name}
                        {isOwn ? (
                          <span className="ml-2 font-[family-name:var(--mono)] text-[10px] font-normal uppercase tracking-wide text-[var(--present)]">
                            ваш отчёт
                          </span>
                        ) : null}
                      </div>
                      <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide text-[var(--accent)]">
                        {ROLE_LABELS[emp.role]}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide">
                      <span
                        className={
                          emp.attendance === 'in'
                            ? 'text-[var(--present)]'
                            : 'text-[var(--absent)]'
                        }
                      >
                        {emp.attendance === 'in' ? 'На месте' : 'Не на месте'}
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {LOCATION_LABELS[emp.location]}
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {DAY_STATUS_LABELS[daySt]}
                      </span>
                      {sent ? (
                        <span className="text-[var(--present)]">Отправлен</span>
                      ) : (
                        <span className="text-[var(--accent-hot)]">Черновик</span>
                      )}
                      {reaction ? (
                        <span
                          className={
                            reaction === 'best'
                              ? 'text-[var(--present)]'
                              : 'text-[var(--accent-hot)]'
                          }
                        >
                          {DAY_PLAN_REVIEW_LABELS[reaction]}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]">
                    Приход:{' '}
                    <span className="text-[var(--text)]">
                      {isSameDay(emp.lastCheckIn, date)
                        ? formatClock(emp.lastCheckIn)
                        : '—'}
                    </span>
                    {' · '}
                    Уход:{' '}
                    <span className="text-[var(--text)]">
                      {isSameDay(emp.lastCheckOut, date)
                        ? formatClock(emp.lastCheckOut)
                        : '—'}
                    </span>
                    {report?.planSubmittedAt
                      ? ` · отчёт ${formatTime(report.planSubmittedAt)}`
                      : report?.updatedAt
                        ? ` · правки ${formatTime(report.updatedAt)}`
                        : ''}
                  </div>

                  <label className="mt-2 block">
                    <span className="mb-1 block font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
                      Тема слушателям
                    </span>
                    <textarea
                      disabled={!canEditSelfReport}
                      value={report?.programTopics ?? ''}
                      rows={2}
                      placeholder="Какую тему рассказали слушателям…"
                      onChange={(e) =>
                        onUpdate(emp.id, { programTopics: e.target.value })
                      }
                      className="w-full resize-y border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-55"
                    />
                  </label>

                  <label className="mt-2 block">
                    <span className="mb-1 block font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
                      Что сделал для группы / отдела
                    </span>
                    <textarea
                      disabled={!canEditSelfReport}
                      value={report?.workDone ?? ''}
                      rows={2}
                      placeholder="Чем занимались сегодня в целом…"
                      onChange={(e) =>
                        onUpdate(emp.id, { workDone: e.target.value })
                      }
                      className="w-full resize-y border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-55"
                    />
                  </label>

                  <label className="mt-2 block">
                    <span className="mb-1 block font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
                      Предложения улучшить работу
                    </span>
                    <textarea
                      disabled={!canEditSelfReport}
                      value={report?.improveSuggestions ?? ''}
                      rows={2}
                      placeholder="Что улучшить в работе группы или отдела…"
                      onChange={(e) =>
                        onUpdate(emp.id, {
                          improveSuggestions: e.target.value,
                        })
                      }
                      className="w-full resize-y border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-55"
                    />
                  </label>

                  <div className="mt-3 border border-[var(--trip)]/30 bg-black/35 px-2.5 py-2">
                    <div className="mb-1 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--trip)]">
                      <FileText size={12} />
                      План на день
                    </div>
                    {hasPlanFile(report) ? (
                      <p className="m-0 mb-2 text-[12px] text-[var(--text)]">
                        {report!.planFileName}{' '}
                        <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                          ({formatBytes(report!.planSize)}
                          {report!.planUploadedAt
                            ? ` · ${formatTime(report!.planUploadedAt)}`
                            : ''}
                          )
                        </span>
                      </p>
                    ) : (
                      <p className="m-0 mb-2 text-xs text-[var(--text-muted)]">
                        {canEditSelfReport
                          ? 'Прикрепите файл плана (Word, Excel, PDF или любой другой).'
                          : 'План на день ещё не загружен.'}
                      </p>
                    )}
                    <input
                      ref={(el) => {
                        fileInputByEmp.current[emp.id] = el
                      }}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file || !canEditSelfReport) return
                        void (async () => {
                          setBusyEmpId(emp.id)
                          setHint(null)
                          try {
                            const stored = await replaceDayPlanFile(
                              report?.planFileId ?? null,
                              file,
                            )
                            onUpdate(emp.id, {
                              planFileId: stored.id,
                              planFileName: stored.name,
                              planMime: stored.mime,
                              planSize: stored.size,
                              planUploadedAt: new Date().toISOString(),
                            })
                            setHint('План на день сохранён')
                          } catch (err) {
                            setHint(
                              err instanceof Error
                                ? err.message
                                : 'Не удалось загрузить файл',
                            )
                          } finally {
                            setBusyEmpId(null)
                          }
                        })()
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      {canEditSelfReport ? (
                        <button
                          type="button"
                          disabled={busyEmpId === emp.id}
                          onClick={() =>
                            fileInputByEmp.current[emp.id]?.click()
                          }
                          className="inline-flex items-center gap-1.5 border border-[var(--trip)]/50 bg-[var(--trip)]/10 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--trip)] hover:bg-[var(--trip)]/20 disabled:opacity-50"
                        >
                          <Upload size={12} />
                          {busyEmpId === emp.id
                            ? 'Загрузка…'
                            : hasPlanFile(report)
                              ? 'Заменить файл'
                              : 'Загрузить план'}
                        </button>
                      ) : null}
                      {hasPlanFile(report) ? (
                        <>
                          <button
                            type="button"
                            disabled={busyEmpId === emp.id}
                            onClick={() => {
                              void (async () => {
                                setBusyEmpId(emp.id)
                                const ok = await openDayPlanFile(report!)
                                setHint(
                                  ok
                                    ? 'Файл открыт для просмотра'
                                    : 'Файл плана не найден',
                                )
                                setBusyEmpId(null)
                              })()
                            }}
                            className="inline-flex items-center gap-1.5 border border-[var(--accent)]/40 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] disabled:opacity-50"
                          >
                            <Eye size={12} />
                            Смотреть
                          </button>
                          <button
                            type="button"
                            disabled={busyEmpId === emp.id}
                            onClick={() => {
                              void (async () => {
                                setBusyEmpId(emp.id)
                                const ok = await downloadDayPlanFile(report!)
                                setHint(
                                  ok
                                    ? 'План скачан'
                                    : 'Файл плана не найден',
                                )
                                setBusyEmpId(null)
                              })()
                            }}
                            className="inline-flex items-center gap-1.5 border border-[var(--border)] px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-50"
                          >
                            <Download size={12} />
                            Скачать
                          </button>
                          <button
                            type="button"
                            disabled={busyEmpId === emp.id}
                            onClick={() => {
                              void (async () => {
                                setBusyEmpId(emp.id)
                                const result = await shareDayPlanFile({
                                  ...report!,
                                  title: `План на день · ${emp.name}`,
                                })
                                setHint(
                                  result === 'missing'
                                    ? 'Файл плана не найден'
                                    : result === 'shared'
                                      ? 'Открыт системный шаринг'
                                      : 'План скачан на устройство',
                                )
                                setBusyEmpId(null)
                              })()
                            }}
                            className="inline-flex items-center gap-1.5 border border-[var(--present)]/40 bg-[var(--present)]/10 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)] disabled:opacity-50"
                          >
                            <Share2 size={12} />
                            Поделиться
                          </button>
                          {canEditSelfReport ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!confirm('Удалить файл плана на день?'))
                                  return
                                onUpdate(emp.id, {
                                  planFileId: null,
                                  planFileName: '',
                                  planMime: '',
                                  planSize: 0,
                                  planUploadedAt: null,
                                })
                                setHint('План удалён из отчёта')
                              }}
                              className="border border-[var(--accent-hot)]/35 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)]"
                            >
                              Удалить файл
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {canEditSelfReport && onSubmitToSenior ? (
                    <button
                      type="button"
                      onClick={() => {
                        setHint(null)
                        onSubmitToSenior()
                      }}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-[var(--present)]/50 bg-[var(--present)]/10 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/20"
                    >
                      <Send size={12} />
                      Отправить отчёт старшему инструктору
                    </button>
                  ) : null}

                  {head ? (
                    <div className="mt-3 border border-[var(--accent)]/30 bg-black/35 px-2.5 py-2">
                      <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
                        Реакция старшего
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          Object.keys(DAY_PLAN_REVIEW_LABELS) as DayPlanReview[]
                        ).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              onUpdate(emp.id, {
                                planReview: key,
                                controlStatus:
                                  key === 'best' ? 'ok' : 'attention',
                              })
                            }
                            className={`border px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider ${
                              reaction === key
                                ? key === 'best'
                                  ? 'border-[var(--present)] bg-[var(--present)]/20 text-[var(--present)]'
                                  : 'border-[var(--accent-hot)] bg-[var(--accent-hot)]/20 text-[var(--accent-hot)]'
                                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                            }`}
                          >
                            {DAY_PLAN_REVIEW_LABELS[key]}
                          </button>
                        ))}
                        {reaction ? (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdate(emp.id, {
                                planReview: '',
                                controlStatus: 'pending',
                              })
                            }
                            className="border border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                          >
                            Сбросить
                          </button>
                        ) : null}
                      </div>
                      <label className="mt-2 block">
                        <span className="mb-1 block font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                          Комментарий старшего
                        </span>
                        <input
                          type="text"
                          value={report?.seniorNote ?? ''}
                          placeholder="Краткий комментарий к отчёту…"
                          onChange={(e) =>
                            onUpdate(emp.id, { seniorNote: e.target.value })
                          }
                          className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                        />
                      </label>
                    </div>
                  ) : reaction ? (
                    <p
                      className={`mt-2 m-0 font-[family-name:var(--mono)] text-[11px] uppercase tracking-wide ${
                        reaction === 'best'
                          ? 'text-[var(--present)]'
                          : 'text-[var(--accent-hot)]'
                      }`}
                    >
                      Реакция старшего: {DAY_PLAN_REVIEW_LABELS[reaction]}
                      {report?.seniorNote ? ` · ${report.seniorNote}` : ''}
                    </p>
                  ) : null}

                  {todayEvents.length > 0 ? (
                    <ul className="mt-2 space-y-0.5 border-t border-[var(--border)]/50 pt-2">
                      {todayEvents.map((ev) => (
                        <li
                          key={ev.id}
                          className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]"
                        >
                          {formatTime(ev.at)} · {ev.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
