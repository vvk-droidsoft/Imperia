import { loginFromFio } from './names'
import { sha256Hex } from './sha256'

const PEPPER = 'bpla-duty'

/** Стартовый пароль для инструкторов и ассистентов */
export const DEFAULT_STAFF_PASSWORD = '1234'

export async function hashPassword(login: string, password: string): Promise<string> {
  const payload = `${login.trim()}|${password}|${PEPPER}`
  const data = new TextEncoder().encode(payload)
  return sha256Hex(data)
}

export async function verifyPassword(
  login: string,
  password: string,
  expectedHash: string,
): Promise<boolean> {
  const got = await hashPassword(login, password)
  return got === expectedHash
}

/** Стабильные id учётки Малюго Д.Н. */
export const MALYUGO_EMPLOYEE_ID = 'emp-malyugo-dn'
export const DEPT_17_ID = 'dept-17-bpla'
export const MALYUGO_LOGIN = loginFromFio('Малюго Дмитрий Николаевич')
/** SHA-256(login|password|pepper) — пароль в коде не хранится */
export const MALYUGO_PASSWORD_HASH =
  '194331504b6bbb68af8f8f8fe0b14a0ae2a1725da53697e8766b964d73270615'

export { loginFromFio }
