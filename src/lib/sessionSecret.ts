const KEY = 'imperiya.sessionPassword'

/** Пароль текущего входа в Империю БАС (только sessionStorage). */
export function rememberSessionPassword(password: string): void {
  try {
    sessionStorage.setItem(KEY, password)
  } catch {
    /* private mode */
  }
}

export function readSessionPassword(): string {
  try {
    return sessionStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function clearSessionPassword(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
