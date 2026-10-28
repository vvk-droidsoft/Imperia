import { FilePenLine, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OvertimeRequest } from '../types'
import type { ActorContext } from '../lib/rules'
import { isDeptHead } from '../lib/rules'
import { roleTitleRu, shortInitials } from '../lib/names'

interface Props {
  actor: ActorContext | null
  departmentId: string
  departmentName: string
  requests: OvertimeRequest[]
  onSubmit: (input: { date: string; timeFrom: string; timeTo: string }) => void
  onDecide: (id: string, status: 'approved' | 'rejected') => void
  /** Блок внутри графика нагрузки — без растягивания на весь экран */
  embedded?: boolean
}

function todayInput(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function formatRuDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}.${m}.${y}`
}

export function OvertimeMemoPanel({
  actor,
  departmentId,
  departmentName,
  requests,
  onSubmit,
  onDecide,
  embedded = false,
}: Props) {
  const head = isDeptHead(actor, departmentId)
  const canWrite =
    !!actor &&
    actor.departmentId === departmentId &&
    (actor.employee.role === 'instructor' ||
      actor.employee.role === 'assistant')

  const [date, setDate] = useState(todayInput())
  const [timeFrom, setTimeFrom] = useState('09:00')
  const [timeTo, setTimeTo] = useState('11:00')

  const previewName = actor?.employee.name ?? '—'
  const previewInitials = actor ? shortInitials(actor.employee.name) : '—'
  const previewRole = actor ? roleTitleRu(actor.employee.role) : '—'

  const mine = useMemo(
    () =>
      requests.filter((r) =>
        head ? true : r.employeeId === actor?.employee.id,
      ),
    [requests, head, actor],
  )

  return (
    <div
      className={
        embedded
          ? 'flex flex-col gap-3'
          : 'flex h-full min-h-0 flex-col gap-3 overflow-hidden'
      }
    >
      <div className="dept-glass border px-3 py-2">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Заявления по переработкам
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          Отлучение в счёт переработок (ТК РФ ст. 152). Согласовывает старший
          инструктор отдела.
        </p>
      </div>
      {canWrite ? (
        <div className="shrink-0 overflow-y-auto border border-[var(--border)] bg-[#f4f1e8] p-4 text-[#1a1a1a] shadow-inner">
          <div className="mb-4 text-right text-sm leading-snug">
            <div>Руководителю учебного центра</div>
            <div className="text-xs text-[#555]">
              (наименование должности руководителя)
            </div>
            <div className="mt-1">
              Автономная некоммерческая организация «Федеральный центр
              беспилотных авиационных систем»
            </div>
            <div className="text-xs text-[#555]">(наименование организации)</div>
            <div className="mt-1 font-semibold">Бойко А.Р.</div>
            <div className="mt-3">от</div>
            <div className="font-semibold">{previewName}</div>
            <div className="text-xs text-[#555]">(ФИО работника полностью)</div>
            <div className="mt-2">{departmentName}</div>
            <div className="text-xs text-[#555]">(подразделение)</div>
            <div className="mt-2">{previewRole}</div>
            <div className="text-xs text-[#555]">(должность)</div>
          </div>

          <h3 className="m-0 mb-3 text-center text-base font-bold uppercase tracking-wide">
            Служебная записка
          </h3>

          <p className="m-0 mb-4 text-sm leading-relaxed">
            Прошу Вас, разрешить отлучиться с рабочего места{' '}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mx-1 border border-[#999] bg-white px-1 py-0.5 text-sm"
            />{' '}
            г. С{' '}
            <input
              type="time"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className="mx-1 border border-[#999] bg-white px-1 py-0.5 text-sm"
            />{' '}
            до{' '}
            <input
              type="time"
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
              className="mx-1 border border-[#999] bg-white px-1 py-0.5 text-sm"
            />{' '}
            в счет переработок на основании ТК РФ ст. 152.
          </p>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Дата заявления"
                className="border border-[#999] bg-white px-1.5 py-0.5 text-sm text-[#1a1a1a]"
              />
              <span>г.</span>
            </label>
            <span>______________ / {previewInitials}</span>
          </div>

          <button
            type="button"
            onClick={() => onSubmit({ date, timeFrom, timeTo })}
            className="mt-4 inline-flex items-center gap-2 border border-[#333] bg-[#222] px-3 py-2 font-[family-name:var(--mono)] text-[11px] uppercase tracking-wider text-[#f4f1e8]"
          >
            <FilePenLine size={14} />
            Отправить старшему инструктору
          </button>
        </div>
      ) : null}

      <div
        className={
          embedded
            ? 'dept-glass overflow-hidden border'
            : 'dept-glass min-h-0 flex-1 overflow-hidden border'
        }
      >
        <div className="border-b border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide text-[var(--accent)]">
          {head ? 'Входящие заявления отдела' : 'Мои заявления'}
          {head
            ? ' · одобрить или отклонить'
            : ' · ждёт согласования старшего'}
        </div>
        <div
          className={
            embedded ? 'max-h-[320px] overflow-y-auto p-2' : 'max-h-full overflow-y-auto p-2'
          }
        >
          {mine.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
              Заявлений пока нет
            </p>
          ) : (
            <ul className="space-y-2">
              {mine.map((r) => (
                <li
                  key={r.id}
                  className="border border-[var(--border)] bg-black/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-[var(--text)]">
                      {r.employeeInitials}
                    </div>
                    <span
                      className={`font-[family-name:var(--mono)] text-[10px] uppercase ${
                        r.status === 'approved'
                          ? 'text-[var(--present)]'
                          : r.status === 'rejected'
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--overtime)]'
                      }`}
                    >
                      {r.status === 'approved'
                        ? 'одобрено'
                        : r.status === 'rejected'
                          ? 'отклонено'
                          : 'на рассмотрении'}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">
                    {formatRuDate(r.date)} · с {r.timeFrom} до {r.timeTo} ·{' '}
                    {r.roleTitle}
                  </p>
                  {head && r.status === 'pending' ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onDecide(r.id, 'approved')}
                        className="inline-flex items-center gap-1 border border-[var(--present)]/50 px-2 py-1 text-xs text-[var(--present)]"
                      >
                        <Check size={12} /> Отпустить
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecide(r.id, 'rejected')}
                        className="inline-flex items-center gap-1 border border-[var(--danger)]/50 px-2 py-1 text-xs text-[var(--danger)]"
                      >
                        <X size={12} /> Отклонить
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
