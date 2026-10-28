import { Download, FileUp, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Employee, KnowledgeCut, MeetingFormat } from '../types'
import {
  KNOWLEDGE_SCORE_OPTIONS,
  MEETING_FORMAT_LABELS,
  ROLE_LABELS,
} from '../types'
import type { ActorContext } from '../lib/rules'
import { isDeptHead } from '../lib/rules'
import type { KnowledgeCutPatch } from '../hooks/useAppState'
import { getChatBlob } from '../lib/chatMediaDb'
import { formatBytes } from '../lib/chatFiles'
import { MAX_DAY_PLAN_BYTES, storeDayPlanFile } from '../lib/dayPlanFiles'

interface Props {
  departmentId: string
  employees: Employee[]
  cuts: KnowledgeCut[]
  actor: ActorContext | null
  monthLabel: string
  onUpdate: (employeeId: string, patch: KnowledgeCutPatch) => void
}

function scoreLabel(value: number | null): string {
  return value == null ? '—' : String(value)
}

function average(
  theory: number | null,
  practice: number | null,
  methodology: number | null,
): string {
  const vals = [theory, practice, methodology].filter(
    (v): v is number => v != null,
  )
  if (!vals.length) return '—'
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return avg.toFixed(1)
}

async function downloadReport(cut: KnowledgeCut): Promise<void> {
  if (!cut.reportFileId) return
  const stored = await getChatBlob(cut.reportFileId)
  if (!stored) throw new Error('Файл не найден в хранилище')
  const mime = cut.reportMime || stored.type || 'application/octet-stream'
  const blob =
    stored.type === mime ? stored : new Blob([stored], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = cut.reportFileName || 'otchet-srez-znaniy'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function KnowledgeCutPanel({
  departmentId,
  employees,
  cuts,
  actor,
  monthLabel,
  onUpdate,
}: Props) {
  const canEditAll = isDeptHead(actor, departmentId)
  const selfId = actor?.employee.id ?? ''
  const subjects = employees.filter((e) => e.role !== 'senior_instructor')
  const seniors = employees.filter((e) => e.role === 'senior_instructor')

  const byEmp = new Map(cuts.map((c) => [c.employeeId, c]))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const canEditRow = (employeeId: string) =>
    canEditAll || employeeId === selfId

  const uploadFor = (employeeId: string, file: File) => {
    void (async () => {
      setBusyId(employeeId)
      setHint(null)
      try {
        const stored = await storeDayPlanFile(file)
        onUpdate(employeeId, {
          reportFileId: stored.id,
          reportFileName: stored.name,
          reportMime: stored.mime,
          reportSize: stored.size,
          reportUploadedAt: new Date().toISOString(),
        })
        setHint('Отчётный файл сохранён')
      } catch (err) {
        setHint(err instanceof Error ? err.message : 'Ошибка загрузки')
      } finally {
        setBusyId(null)
      }
    })()
  }

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Срез знаний · {monthLabel}
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          Старший инструктор раз в месяц проводит беседу с каждым инструктором
          (и ассистентом): задание и оценки по теории, практике и методике.
          К каждой строке можно прикрепить отчётный файл (до{' '}
          {formatBytes(MAX_DAY_PLAN_BYTES)}). Строка зелёная — срез проведён,
          красная — ещё не проводился.
        </p>
        {!canEditAll ? (
          <p className="mt-1 m-0 text-[11px] text-[var(--accent-hot)]">
            Оценки правит старший инструктор. Отчётный файл к своей строке
            можете загрузить вы.
          </p>
        ) : null}
        {seniors.length ? (
          <p className="mt-1 m-0 text-[11px] text-[var(--text-muted)]">
            Проводит: {seniors.map((s) => s.name).join(', ')}
          </p>
        ) : null}
        {hint ? (
          <p className="mt-1 mb-0 text-[11px] text-[var(--accent)]">{hint}</p>
        ) : null}
      </div>

      <div className="roster-scroll min-h-0 flex-1 overflow-auto">
        {subjects.length === 0 ? (
          <div className="px-3 py-6 text-sm text-[var(--text-muted)]">
            В отделе пока нет инструкторов и ассистентов для среза. Добавьте
            состав в графике нагрузки.
          </div>
        ) : (
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-black/90">
                <th className="sticky left-0 z-20 min-w-[170px] bg-black/95 px-2 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Сотрудник
                </th>
                <th className="min-w-[128px] px-2 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  План
                </th>
                <th className="min-w-[128px] px-2 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Проведено
                </th>
                <th className="min-w-[110px] px-2 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Формат
                </th>
                <th className="min-w-[180px] px-2 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Задание
                </th>
                <th className="min-w-[168px] px-2 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Отчётный файл
                </th>
                <th className="min-w-[72px] px-1 py-2 text-center font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Теория
                </th>
                <th className="min-w-[72px] px-1 py-2 text-center font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Практика
                </th>
                <th className="min-w-[72px] px-1 py-2 text-center font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider">
                  Методика
                </th>
                <th className="min-w-[56px] px-1 py-2 text-center font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
                  Ср.
                </th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((emp) => {
                const cut = byEmp.get(emp.id)
                const theory = cut?.theory ?? null
                const practice = cut?.practice ?? null
                const methodology = cut?.methodology ?? null
                const scoresDisabled = !canEditAll
                const rowEditable = canEditRow(emp.id)
                const conducted = Boolean(cut?.conductedDate?.trim())
                const rowBg = conducted
                  ? 'bg-[var(--present)]/15'
                  : 'bg-[var(--absent)]/18'
                const nameTone = conducted
                  ? 'text-[var(--present)]'
                  : 'text-[var(--absent)]'
                const roleTone = conducted
                  ? 'text-[var(--present)]/80'
                  : 'text-[var(--absent)]/85'
                const rowBorder = conducted
                  ? 'border-[var(--present)]/35'
                  : 'border-[var(--absent)]/40'
                const hasReport = Boolean(cut?.reportFileId)
                const busy = busyId === emp.id

                return (
                  <tr
                    key={emp.id}
                    className={`border-b ${rowBorder} ${rowBg}`}
                  >
                    <td
                      className={`sticky left-0 z-10 px-2 py-1.5 ${rowBg} backdrop-blur-[2px]`}
                    >
                      <div
                        className={`font-semibold leading-tight ${nameTone}`}
                      >
                        {emp.name}
                      </div>
                      <div
                        className={`font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide ${roleTone}`}
                      >
                        {ROLE_LABELS[emp.role]}
                        {' · '}
                        {conducted ? 'проведён' : 'не проведён'}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        disabled={scoresDisabled}
                        value={cut?.plannedDate ?? ''}
                        onChange={(e) =>
                          onUpdate(emp.id, { plannedDate: e.target.value })
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-1.5 py-1 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        disabled={scoresDisabled}
                        value={cut?.conductedDate ?? ''}
                        onChange={(e) =>
                          onUpdate(emp.id, { conductedDate: e.target.value })
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-1.5 py-1 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        disabled={scoresDisabled}
                        value={cut?.format ?? ''}
                        onChange={(e) =>
                          onUpdate(emp.id, {
                            format: e.target.value as MeetingFormat | '',
                          })
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-1.5 py-1 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      >
                        <option value="">—</option>
                        {(
                          Object.keys(MEETING_FORMAT_LABELS) as MeetingFormat[]
                        ).map((key) => (
                          <option key={key} value={key}>
                            {MEETING_FORMAT_LABELS[key]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        disabled={scoresDisabled}
                        value={cut?.assignment ?? ''}
                        placeholder="Задание после беседы"
                        onChange={(e) =>
                          onUpdate(emp.id, { assignment: e.target.value })
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-1.5 py-1 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        ref={(el) => {
                          fileRefs.current[emp.id] = el
                        }}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) uploadFor(emp.id, file)
                        }}
                      />
                      {hasReport && cut ? (
                        <button
                          type="button"
                          title="Скачать отчётный файл"
                          onClick={() => {
                            void downloadReport(cut)
                              .then(() => setHint('Отчёт скачивается…'))
                              .catch(() =>
                                setHint('Не удалось скачать отчётный файл'),
                              )
                          }}
                          className="mb-1 block w-full truncate text-left text-[11px] text-[var(--accent)] underline-offset-2 hover:underline"
                        >
                          <FileUp size={11} className="mr-1 inline" />
                          {cut.reportFileName}
                          {cut.reportSize ? (
                            <span className="ml-1 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)] no-underline">
                              ({formatBytes(cut.reportSize)})
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <div className="mb-1 text-[10px] text-[var(--text-muted)]">
                          нет файла
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1">
                        {rowEditable ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => fileRefs.current[emp.id]?.click()}
                            className="inline-flex items-center gap-1 border border-[var(--accent)]/45 px-1.5 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/15 disabled:opacity-50"
                          >
                            <Upload size={11} />
                            {busy
                              ? '…'
                              : hasReport
                                ? 'Заменить'
                                : 'Загрузить'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={!hasReport || !cut || busy}
                          onClick={() => {
                            if (!cut?.reportFileId) return
                            void downloadReport(cut)
                              .then(() => setHint('Отчёт скачивается…'))
                              .catch(() =>
                                setHint('Не удалось скачать отчётный файл'),
                              )
                          }}
                          className="inline-flex items-center gap-1 border border-[var(--present)]/55 bg-[var(--present)]/15 px-1.5 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Download size={11} />
                          Скачать отчёт
                        </button>
                        {rowEditable && hasReport ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm('Удалить отчётный файл?')) return
                              onUpdate(emp.id, {
                                reportFileId: null,
                                reportFileName: '',
                                reportMime: '',
                                reportSize: 0,
                                reportUploadedAt: null,
                              })
                            }}
                            className="inline-flex items-center gap-1 border border-[var(--accent-hot)]/40 px-1.5 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--accent-hot)]"
                            aria-label="Удалить отчёт"
                          >
                            <Trash2 size={11} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <ScoreSelect
                        disabled={scoresDisabled}
                        value={theory}
                        onChange={(v) => onUpdate(emp.id, { theory: v })}
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <ScoreSelect
                        disabled={scoresDisabled}
                        value={practice}
                        onChange={(v) => onUpdate(emp.id, { practice: v })}
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <ScoreSelect
                        disabled={scoresDisabled}
                        value={methodology}
                        onChange={(v) => onUpdate(emp.id, { methodology: v })}
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center font-[family-name:var(--mono)] text-xs text-[var(--accent)]">
                      {average(theory, practice, methodology)}
                      <span className="sr-only">
                        {scoreLabel(theory)}/{scoreLabel(practice)}/
                        {scoreLabel(methodology)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ScoreSelect({
  value,
  disabled,
  onChange,
}: {
  value: number | null
  disabled: boolean
  onChange: (value: number | null) => void
}) {
  return (
    <select
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? null : Number(raw))
      }}
      className="w-full border border-[var(--border)] bg-black/55 px-0.5 py-1 text-center text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
      aria-label="Оценка"
    >
      <option value="">—</option>
      {KNOWLEDGE_SCORE_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}
