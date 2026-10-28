import { KeyRound } from 'lucide-react'
import type { Employee, UserAccount } from '../types'
import { ROLE_LABELS } from '../types'

interface Props {
  employee: Employee
  account: UserAccount | null
}

export function StaffAccountPanel({ employee, account }: Props) {
  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Моя учётка
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          Логин и роль. Ежедневный отчёт отправляйте во вкладке «Контроль
          работы».
        </p>
      </div>

      <div className="roster-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="font-semibold text-[var(--text)]">{employee.name}</div>
          <div className="font-[family-name:var(--mono)] text-[11px] uppercase tracking-wide text-[var(--accent)]">
            {ROLE_LABELS[employee.role]}
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]">
            <KeyRound size={12} />
            логин: {account?.login ?? '—'}
            {account?.mustChangePassword ? ' · нужно сменить пароль' : ''}
          </div>
        </section>
      </div>
    </div>
  )
}
