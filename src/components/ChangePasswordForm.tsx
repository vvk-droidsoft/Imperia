import { Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'

interface Props {
  login: string
  busy?: boolean
  onSubmit: (password: string) => Promise<boolean>
  onLogout: () => void
}

export function ChangePasswordForm({
  login,
  busy,
  onSubmit,
  onLogout,
}: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    if (password.trim().length < 4) {
      setError('Минимум 4 символа')
      return
    }
    setError(null)
    const ok = await onSubmit(password)
    if (!ok) setError('Не удалось сохранить пароль')
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mx-auto w-full max-w-md border border-[var(--border-strong)] bg-black/65 p-4 sm:p-5"
    >
      <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.28em] text-[var(--accent)]">
        Смена стартового пароля
      </div>
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Логин <b className="text-[var(--text)]">{login}</b>. Пароль можно сменить
        один раз. Дальше — только через старшего инструктора.
      </p>
      <label className="mb-3 block">
        <span className="mb-1 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          <Lock size={12} /> Новый пароль
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-[var(--border)] bg-black/70 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          required
        />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 font-[family-name:var(--mono)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          Повтор
        </span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-[var(--border)] bg-black/70 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          required
        />
      </label>
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mb-2 w-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-2.5 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-[0.2em] text-black"
      >
        Сохранить пароль
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="w-full border border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
      >
        Выйти
      </button>
    </form>
  )
}
