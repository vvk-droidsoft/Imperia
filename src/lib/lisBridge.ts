import { DEFAULT_STAFF_PASSWORD, MALYUGO_EMPLOYEE_ID } from './auth'
import { readSessionPassword } from './sessionSecret'
import type { Employee, Role, UserAccount } from '../types'

export type LisRole = 'senior' | 'instructor' | 'assistant'

export function toLisRole(role: Role): LisRole {
  if (role === 'senior_instructor') return 'senior'
  if (role === 'assistant') return 'assistant'
  return 'instructor'
}

export type LisRosterMember = {
  login: string
  password: string
  role: LisRole
  displayName: string
  /** Подсказка логина ЛИС (например мдн для Малюго). */
  lisLoginHint?: string
}

export function buildLisRoster(params: {
  employees: Employee[]
  accounts: UserAccount[]
  currentEmployeeId: string | null
  sessionPassword: string
}): LisRosterMember[] {
  const { employees, accounts, currentEmployeeId, sessionPassword } = params
  const out: LisRosterMember[] = []

  for (const emp of employees) {
    if (
      emp.role !== 'senior_instructor' &&
      emp.role !== 'instructor' &&
      emp.role !== 'assistant'
    ) {
      continue
    }
    const acc = accounts.find((a) => a.employeeId === emp.id)
    if (!acc) continue

    const isSelf = emp.id === currentEmployeeId
    const isMalyugo = emp.id === MALYUGO_EMPLOYEE_ID
    let password = DEFAULT_STAFF_PASSWORD
    if (isSelf && sessionPassword) password = sessionPassword
    else if (isMalyugo && sessionPassword && isSelf) password = sessionPassword

    out.push({
      login: acc.login,
      password,
      role: toLisRole(emp.role),
      displayName: emp.name,
      lisLoginHint: isMalyugo ? 'мдн' : undefined,
    })
  }
  return out
}

export function resolveGeneratorPassword(
  account: UserAccount | null,
  employee: Employee | null,
): { password: string; visible: string; note: string } {
  const session = readSessionPassword()
  if (session) {
    return {
      password: session,
      visible: session,
      note: 'Пароль генератора = пароль входа в Империю БАС',
    }
  }
  if (employee?.id === MALYUGO_EMPLOYEE_ID) {
    return {
      password: '',
      visible: '—',
      note: 'Войдите заново в Империю БАС, чтобы передать пароль в генератор',
    }
  }
  return {
    password: DEFAULT_STAFF_PASSWORD,
    visible: DEFAULT_STAFF_PASSWORD,
    note: `Стартовый пароль отдела: ${DEFAULT_STAFF_PASSWORD} (как в Империи БАС)`,
  }
}
