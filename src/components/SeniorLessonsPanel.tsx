import { Download, FileText, Plus, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { SeniorLessonRecord } from '../types'
import { BAS_LESSON_TOPICS } from '../types'
import { formatBytes } from '../lib/chatFiles'
import { getChatBlob } from '../lib/chatMediaDb'
import {
  MAX_DAY_PLAN_BYTES,
  storeDayPlanFile,
} from '../lib/dayPlanFiles'
import { formatTime, todayKey } from '../lib/storage'
import type { SeniorLessonPatch } from '../hooks/useAppState'

interface Props {
  departmentId: string
  lessons: SeniorLessonRecord[]
  onUpsert: (
    departmentId: string,
    lessonId: string | null,
    patch: SeniorLessonPatch,
  ) => void
  onDelete: (departmentId: string, lessonId: string) => void
}

function groupStreamLabel(groupNumber: string, stream: string): string {
  const g = groupNumber.trim()
  const s = stream.trim()
  if (!g && !s) return '—'
  if (g && s) return `${g} группа ${s} поток`
  if (g) return `${g} группа`
  return `${s} поток`
}

function formatDateRu(dateKey: string): string {
  if (!dateKey) return 'не проведено'
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU')
}

async function downloadPlan(lesson: SeniorLessonRecord): Promise<boolean> {
  if (!lesson.planFileId) return false
  const blob = await getChatBlob(lesson.planFileId)
  if (!blob) return false
  const file = new File([blob], lesson.planFileName || 'plan-konspekt', {
    type: lesson.planMime || 'application/octet-stream',
  })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)
  return true
}

export function SeniorLessonsPanel({
  departmentId,
  lessons,
  onUpsert,
  onDelete,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const [topic, setTopic] = useState('')
  const [groupNumber, setGroupNumber] = useState('')
  const [stream, setStream] = useState('')
  const [conductedDate, setConductedDate] = useState('')
  const [note, setNote] = useState('')
  const [planMeta, setPlanMeta] = useState<{
    planFileId: string
    planFileName: string
    planMime: string
    planSize: number
    planUploadedAt: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'planned' | 'done'>('all')

  const visible = useMemo(() => {
    if (filter === 'planned') return lessons.filter((l) => !l.conductedDate)
    if (filter === 'done') return lessons.filter((l) => !!l.conductedDate)
    return lessons
  }, [lessons, filter])

  const resetForm = () => {
    setTopic('')
    setGroupNumber('')
    setStream('')
    setConductedDate('')
    setNote('')
    setPlanMeta(null)
    formRef.current?.reset()
  }

  const save = () => {
    setHint(null)
    const fd = formRef.current ? new FormData(formRef.current) : null
    const nextTopic = String(fd?.get('topic') ?? topic).trim()
    const nextGroup = String(fd?.get('groupNumber') ?? groupNumber).trim()
    const nextStream = String(fd?.get('stream') ?? stream).trim()
    const nextDate = String(fd?.get('conductedDate') ?? conductedDate).trim()
    const nextNote = String(fd?.get('note') ?? note).trim()
    if (!nextTopic) {
      setHint('Укажите тему занятия')
      return
    }
    if (!nextGroup || !nextStream) {
      setHint('Укажите номер группы и поток')
      return
    }
    setTopic(nextTopic)
    setGroupNumber(nextGroup)
    setStream(nextStream)
    setConductedDate(nextDate)
    setNote(nextNote)
    onUpsert(departmentId, null, {
      topic: nextTopic,
      groupNumber: nextGroup,
      stream: nextStream,
      conductedDate: nextDate,
      note: nextNote,
      ...(planMeta ?? {
        planFileId: null,
        planFileName: '',
        planMime: '',
        planSize: 0,
        planUploadedAt: null,
      }),
    })
    resetForm()
  }

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Проведение занятий СИ
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          Учёт тем, которые старший инструктор преподал: группа и поток
          курсантов. Перед занятием сначала загрузите план-конспект по теме.
        </p>
      </div>

      <div className="roster-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <form
          ref={formRef}
          className="border border-[var(--accent)]/40 bg-black/45 px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="mb-2 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            <FileText size={12} />
            Перед занятием · план-конспект
          </div>

          <label className="mb-2 block">
            <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
              Тема занятия
            </span>
            <input
              name="topic"
              list="bas-lesson-topics"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Например: 2.3 - Основы радиосвязи"
              className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <datalist id="bas-lesson-topics">
              {BAS_LESSON_TOPICS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Номер группы
              </span>
              <input
                name="groupNumber"
                value={groupNumber}
                onChange={(e) => setGroupNumber(e.target.value)}
                placeholder="23"
                inputMode="numeric"
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Поток курсантов
              </span>
              <input
                name="stream"
                value={stream}
                onChange={(e) => setStream(e.target.value)}
                placeholder="24"
                inputMode="numeric"
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>

          <label className="mb-2 block">
            <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
              Дата проведения (если уже провели)
            </span>
            <div className="flex flex-wrap gap-2">
              <input
                name="conductedDate"
                type="date"
                value={conductedDate}
                onChange={(e) => setConductedDate(e.target.value)}
                className="min-w-0 flex-1 border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => setConductedDate(todayKey())}
                className="border border-[var(--border)] px-2 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                Сегодня
              </button>
            </div>
          </label>

          <label className="mb-2 block">
            <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
              Заметка
            </span>
            <input
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Место, палатка, комментарий…"
              className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>

          <div className="mb-3 border border-dashed border-[var(--border)] bg-black/30 px-3 py-3">
            <div className="mb-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
              План-конспект · до {formatBytes(MAX_DAY_PLAN_BYTES)}
            </div>
            {planMeta ? (
              <p className="m-0 mb-2 text-sm text-[var(--text)]">
                {planMeta.planFileName}{' '}
                <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                  ({formatBytes(planMeta.planSize)})
                </span>
              </p>
            ) : (
              <p className="m-0 mb-2 text-xs text-[var(--text-muted)]">
                Сначала загрузите план-конспект по теме, затем проводите занятие.
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                void (async () => {
                  setBusy(true)
                  setHint(null)
                  try {
                    const stored = await storeDayPlanFile(file)
                    setPlanMeta({
                      planFileId: stored.id,
                      planFileName: stored.name,
                      planMime: stored.mime,
                      planSize: stored.size,
                      planUploadedAt: new Date().toISOString(),
                    })
                    setHint('План-конспект готов к сохранению')
                  } catch (err) {
                    setHint(
                      err instanceof Error ? err.message : 'Ошибка загрузки',
                    )
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
            >
              <Upload size={14} />
              {busy
                ? 'Загрузка…'
                : planMeta
                  ? 'Заменить файл'
                  : 'Загрузить план-конспект'}
            </button>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 border border-[var(--present)]/60 bg-[var(--present)]/15 px-3 py-2.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--present)] hover:bg-[var(--present)]/25"
          >
            <Plus size={14} />
            Сохранить в учёт
          </button>
          {hint ? (
            <p className="mt-2 mb-0 text-center text-[11px] text-[var(--accent)]">
              {hint}
            </p>
          ) : null}
        </form>

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
              Журнал · {visible.length}
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['all', 'Все'],
                  ['planned', 'С планом'],
                  ['done', 'Проведено'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`border px-2 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider ${
                    filter === key
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              Пока нет записей. Загрузите план-конспект и сохраните тему.
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.map((lesson) => (
                <li
                  key={lesson.id}
                  className="border border-[var(--border)] bg-black/50 px-3 py-2.5"
                >
                  <div className="font-semibold text-[var(--text)]">
                    {lesson.topic || 'Без темы'}
                  </div>
                  <div className="mt-1 font-[family-name:var(--mono)] text-[11px] text-[var(--accent)]">
                    {groupStreamLabel(lesson.groupNumber, lesson.stream)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    <span>дата: {formatDateRu(lesson.conductedDate)}</span>
                    <span>СИ: {lesson.instructorName}</span>
                    {lesson.planFileId ? (
                      <span className="text-[var(--present)]">
                        план-конспект есть
                      </span>
                    ) : (
                      <span className="text-[var(--accent-hot)]">
                        нет план-конспекта
                      </span>
                    )}
                  </div>
                  {lesson.note ? (
                    <p className="mt-1 mb-0 text-xs text-[var(--text-muted)]">
                      {lesson.note}
                    </p>
                  ) : null}
                  {lesson.planFileId ? (
                    <p className="mt-1 mb-0 text-[11px] text-[var(--text)]">
                      {lesson.planFileName}{' '}
                      <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                        ({formatBytes(lesson.planSize)}
                        {lesson.planUploadedAt
                          ? ` · ${formatTime(lesson.planUploadedAt)}`
                          : ''}
                        )
                      </span>
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-2">
                    {!lesson.conductedDate ? (
                      <button
                        type="button"
                        onClick={() =>
                          onUpsert(departmentId, lesson.id, {
                            conductedDate: todayKey(),
                          })
                        }
                        className="border border-[var(--present)]/50 px-2 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/15"
                      >
                        Отметить проведённым
                      </button>
                    ) : null}
                    {lesson.planFileId ? (
                      <button
                        type="button"
                        onClick={() => {
                          void downloadPlan(lesson).then((ok) => {
                            if (!ok) setHint('Файл план-конспекта не найден')
                          })
                        }}
                        className="inline-flex items-center gap-1 border border-[var(--border)] px-2 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)]"
                      >
                        <Download size={11} />
                        Скачать план
                      </button>
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-1 border border-[var(--accent)]/40 px-2 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/10">
                        <Upload size={11} />
                        Добавить план
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (!file) return
                            void (async () => {
                              try {
                                const stored = await storeDayPlanFile(file)
                                onUpsert(departmentId, lesson.id, {
                                  planFileId: stored.id,
                                  planFileName: stored.name,
                                  planMime: stored.mime,
                                  planSize: stored.size,
                                  planUploadedAt: new Date().toISOString(),
                                })
                              } catch (err) {
                                setHint(
                                  err instanceof Error
                                    ? err.message
                                    : 'Ошибка загрузки',
                                )
                              }
                            })()
                          }}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm('Удалить запись о занятии?')) return
                        onDelete(departmentId, lesson.id)
                      }}
                      className="inline-flex items-center gap-1 border border-[var(--accent-hot)]/40 px-2 py-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--accent-hot)] hover:bg-[var(--accent-hot)]/10"
                    >
                      <Trash2 size={11} />
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
