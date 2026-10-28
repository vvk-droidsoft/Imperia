import { Bell, Trash2 } from 'lucide-react'
import type { ActivityEvent } from '../types'
import { formatTime } from '../lib/storage'

interface Props {
  events: ActivityEvent[]
  onClear: () => void
}

export function ActivityFeed({ events, onClear }: Props) {
  return (
    <section className="dept-glass flex h-full min-h-0 flex-col border">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <div className="flex items-center gap-2 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-wider">
          <Bell size={14} className="text-[var(--accent)]" />
          Радиообмен
        </div>
        {events.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 px-2 py-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--danger)]"
          >
            <Trash2 size={12} />
            Очистить
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
            Тишина на канале. Нажмите «Пришёл» или «Ушёл» — сюда и на телефон
            придёт сигнал.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="border border-[var(--border)] bg-black/50 px-3 py-2"
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span
                    className={`font-[family-name:var(--mono)] text-[10px] font-semibold uppercase tracking-wide ${
                      event.type === 'check_in'
                        ? 'text-[var(--present)]'
                        : event.type === 'check_out'
                          ? 'text-[var(--absent)]'
                          : event.type === 'daily_report' ||
                              event.type === 'broadcast'
                            ? 'text-[var(--accent)]'
                            : event.type === 'overtime_request'
                              ? 'text-[var(--overtime)]'
                              : 'text-[var(--trip)]'
                    }`}
                  >
                    {event.type === 'check_in'
                      ? 'Приход'
                      : event.type === 'check_out'
                        ? 'Уход'
                        : event.type === 'daily_report'
                          ? 'Отчёт'
                          : event.type === 'broadcast'
                            ? 'Рассылка'
                            : event.type === 'overtime_request'
                              ? 'Заявление'
                              : 'Место'}
                  </span>
                  <time className="font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]">
                    {formatTime(event.at)}
                  </time>
                </div>
                <p className="text-sm font-semibold leading-snug text-[var(--text)]">
                  {event.message}
                </p>
                <p className="mt-0.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {event.departmentName}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
