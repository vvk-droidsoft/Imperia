import { Lock, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'

interface Props {
  busy: boolean
  error: string | null
  onLogin: (login: string, password: string) => Promise<boolean>
}

export function LoginForm({ busy, error, onLogin }: Props) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await onLogin(login, password)
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mx-auto w-full max-w-md border border-[var(--border-strong)] bg-black/65 p-4 shadow-[0_0_40px_rgba(255,60,20,0.15)] backdrop-blur-md sm:p-5"
    >
      <div className="mb-3 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.28em] text-[var(--accent)]">
        Вход в контур
      </div>
      <label className="mb-3 block">
        <span className="mb-1 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          <UserRound size={12} /> Логин
        </span>
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          className="w-full border border-[var(--border)] bg-black/70 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="логин"
          required
        />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          <Lock size={12} /> Пароль
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full border border-[var(--border)] bg-black/70 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="пароль"
          required
        />
      </label>
      {error ? (
        <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-2.5 font-[family-name:var(--mono)] text-xs font-semibold uppercase tracking-[0.2em] text-black hover:bg-[var(--accent-hot)] hover:border-[var(--accent-hot)] hover:text-white disabled:opacity-50"
      >
        {busy ? 'Проверка…' : 'Войти'}
      </button>
    </form>
  )
}
