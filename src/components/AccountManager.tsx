import { KeyRound, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { Employee, UserAccount } from '../types'
import { ROLE_LABELS } from '../types'
import { DEFAULT_STAFF_PASSWORD } from '../lib/auth'

interface Props {
  employees: Employee[]
  accounts: UserAccount[]
  onReset: (employeeId: string, newLogin?: string) => void
}

export function AccountManager({ employees, accounts, onReset }: Props) {
  const [draftLogins, setDraftLogins] = useState<Record<string, string>>({})

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wide text-[var(--accent)]">
        Учётки отдела · восстановление логина/пароля
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          Стартовый пароль после сброса:{' '}
          <b className="text-[var(--text)]">{DEFAULT_STAFF_PASSWORD}</b>.
          Сотрудник обязан сменить его один раз.
        </p>
        <ul className="space-y-3">
          {employees.map((emp) => {
            const acc = accounts.find((a) => a.employeeId === emp.id)
            const draft = draftLogins[emp.id] ?? acc?.login ?? ''
            return (
              <li
                key={emp.id}
                className="border border-[var(--border)] bg-black/40 px-3 py-3"
              >
                <div className="font-semibold text-[var(--text)]">{emp.name}</div>
                <div className="font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]">
                  {ROLE_LABELS[emp.role]}
                  {acc?.mustChangePassword ? ' · нужно сменить пароль' : ''}
                  {acc?.passwordChangedOnce ? ' · пароль уже меняли' : ''}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) =>
                      setDraftLogins((m) => ({ ...m, [emp.id]: e.target.value }))
                    }
                    className="min-w-[140px] flex-1 border border-[var(--border)] bg-black/60 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                    placeholder="логин"
                  />
                  <button
                    type="button"
                    onClick={() => onReset(emp.id, draft)}
                    className="inline-flex items-center gap-1.5 border border-[var(--accent)] bg-[var(--accent)]/20 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black"
                  >
                    <RefreshCw size={12} />
                    Сбросить пароль
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                  <KeyRound size={10} />
                  текущий логин: {acc?.login ?? 'нет учётки'}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
