import { ChevronRight, Pencil, Plus, Target, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import type { Department } from '../types'

interface Props {
  departments: Department[]
  /** Админ видит все отделы и управляет структурой */
  isSystemAdmin: boolean
  /** Можно ли переименовать свой отдел (старший / админ) */
  canRename: boolean
  onOpen: (id: string) => void
  onRename: (id: string, name: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

export function DepartmentLauncher({
  departments,
  isSystemAdmin,
  canRename,
  onOpen,
  onRename,
  onAdd,
  onRemove,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const commit = () => {
    if (editingId) onRename(editingId, draft)
    setEditingId(null)
  }

  const alone = !isSystemAdmin && departments.length <= 1

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <div className="mb-1 flex items-center gap-2 text-[var(--accent)]">
        <Target size={16} className="crosshair-spin" />
        <span className="font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.28em]">
          {isSystemAdmin
            ? 'Все отделы · тап для раскрытия'
            : alone
              ? 'Ваш отдел · тап для раскрытия'
              : 'Доступные вам отделы'}
        </span>
      </div>

      {departments.length === 0 ? (
        <div className="border border-[var(--border)] bg-black/50 px-4 py-3 text-sm text-[var(--text-muted)]">
          Нет доступных отделов для вашей учётки.
        </div>
      ) : null}

      {departments.map((dept, index) => {
        const onDuty = dept.employees.filter((e) => e.attendance === 'in').length
        return (
          <button
            key={dept.id}
            type="button"
            onClick={() => {
              if (editingId === dept.id) return
              onOpen(dept.id)
            }}
            className="hud-frame group relative w-full overflow-hidden border border-[var(--border-strong)] bg-black/55 text-left shadow-[0_0_40px_rgba(255,60,20,0.12)] backdrop-blur-md transition hover:border-[var(--accent)] hover:bg-black/70 hover:shadow-[0_0_50px_rgba(255,154,31,0.25)]"
          >
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[var(--accent-hot)] via-[var(--accent)] to-transparent" />
            <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-[var(--accent)]/40 bg-[var(--accent)]/10 font-[family-name:var(--mono)] text-lg font-bold text-[var(--accent)]">
                {isSystemAdmin ? String(index + 1).padStart(2, '0') : '★'}
              </div>
              <div className="min-w-0 flex-1">
                {editingId === dept.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onClick={(ev) => ev.stopPropagation()}
                    onChange={(ev) => setDraft(ev.target.value)}
                    onBlur={commit}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') commit()
                      if (ev.key === 'Escape') setEditingId(null)
                    }}
                    className="w-full border border-[var(--accent)] bg-black/80 px-2 py-1 font-[family-name:var(--display)] text-lg uppercase tracking-wide text-[var(--text)] outline-none"
                  />
                ) : (
                  <div className="truncate font-[family-name:var(--display)] text-xl uppercase tracking-wide text-[var(--text)] sm:text-2xl">
                    {dept.name}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} />
                    {dept.employees.length} л/с
                  </span>
                  <span className="text-[var(--present)]">
                    на месте: {onDuty}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canRename ? (
                  <span
                    role="button"
                    tabIndex={0}
                    title="Переименовать"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setEditingId(dept.id)
                      setDraft(dept.name)
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        ev.stopPropagation()
                        setEditingId(dept.id)
                        setDraft(dept.name)
                      }
                    }}
                    className="rounded p-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--accent)]"
                  >
                    <Pencil size={15} />
                  </span>
                ) : null}
                {isSystemAdmin && departments.length > 1 ? (
                  <span
                    role="button"
                    tabIndex={0}
                    title="Удалить отдел"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onRemove(dept.id)
                    }}
                    className="rounded p-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--danger)]"
                  >
                    <Trash2 size={15} />
                  </span>
                ) : null}
                <ChevronRight
                  size={22}
                  className="text-[var(--accent)] transition group-hover:translate-x-1"
                />
              </div>
            </div>
          </button>
        )
      })}

      {isSystemAdmin ? (
        <button
          type="button"
          onClick={onAdd}
          className="hud-frame inline-flex items-center justify-center gap-2 border border-dashed border-[var(--border)] bg-black/30 px-4 py-3 font-[family-name:var(--mono)] text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <Plus size={16} />
          Новый отдел
        </button>
      ) : null}
    </div>
  )
}
