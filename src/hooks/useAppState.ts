import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_STAFF_PASSWORD,
  hashPassword,
  loginFromFio,
  verifyPassword,
} from '../lib/auth'
import {
  clearSessionPassword,
  rememberSessionPassword,
} from '../lib/sessionSecret'
import { shortInitials, roleTitleRu } from '../lib/names'
import {
  createEmptyDailyWorkReport,
  createEmptyKnowledgeCut,
  createEmptySeniorLesson,
  createEmployee,
  createStaffAccount,
  ensureDailyWorkReportsForDepartment,
  ensureEmployeeMonth,
  ensureKnowledgeCutsForDepartment,
  ensureStaffAccounts,
  loadState,
  normalizeSeniorLesson,
  normalizeTmcBaseline,
  normalizeTmcBoard,
  normalizeTmcItem,
  normalizeTmcRequest,
  pruneChatMessages,
  saveState,
  todayKey,
} from '../lib/storage'
import type { ParsedTmcRow } from '../lib/tmcImport'
import { toBaselineItems } from '../lib/tmcDiff'
import { deleteChatBlob, deleteChatBlobs } from '../lib/chatMediaDb'
import { ensureNotificationPermission, pushLocalNotification } from '../lib/notify'
import {
  canCheckAttendance,
  canEditEmployeeMeta,
  canManageStaff,
  canManualOvertime,
  canOpenDepartment,
  canSetDayStatus,
  canUseDeptChat,
  DAYS_OFF_QUOTA,
  isAdmin,
  isSaturday,
  monthKey,
  overtimeFromShift,
  WORK_DAY_HOURS,
  WORK_DAY_LABEL,
  type ActorContext,
} from '../lib/rules'
import type {
  ActivityEvent,
  AppState,
  ChatAttachment,
  ChatMessage,
  DailyControlStatus,
  DailyWorkReport,
  DayPlanReview,
  DayStatus,
  Department,
  DepartmentBroadcast,
  Employee,
  KnowledgeCut,
  Location,
  OvertimeRequest,
  Role,
  SeniorLessonRecord,
  TmcBoard,
  TmcBoardKind,
  TmcBoardStatus,
  TmcEquipmentRequest,
  TmcInventoryBaseline,
  TmcItem,
  TmcRequestKind,
  TmcRequestLine,
  TmcRequestStatus,
} from '../types'
import { LOCATION_LABELS, TMC_BOARD_KINDS, TMC_BOARD_STATUSES } from '../types'

export type KnowledgeCutPatch = Partial<
  Pick<
    KnowledgeCut,
    | 'plannedDate'
    | 'conductedDate'
    | 'format'
    | 'assignment'
    | 'theory'
    | 'practice'
    | 'methodology'
    | 'reportFileId'
    | 'reportFileName'
    | 'reportMime'
    | 'reportSize'
    | 'reportUploadedAt'
  >
>

export type DailyWorkPatch = Partial<
  Pick<
    DailyWorkReport,
    | 'workDone'
    | 'programTopics'
    | 'improveSuggestions'
    | 'seniorNote'
    | 'controlStatus'
    | 'planSubmittedAt'
    | 'planReview'
    | 'planFileId'
    | 'planFileName'
    | 'planMime'
    | 'planSize'
    | 'planUploadedAt'
  >
>

export type SeniorLessonPatch = Partial<
  Pick<
    SeniorLessonRecord,
    | 'topic'
    | 'groupNumber'
    | 'stream'
    | 'conductedDate'
    | 'planFileId'
    | 'planFileName'
    | 'planMime'
    | 'planSize'
    | 'planUploadedAt'
    | 'note'
  >
>

function pushEvent(
  state: AppState,
  partial: Omit<ActivityEvent, 'id' | 'at'>,
): AppState {
  const event: ActivityEvent = {
    ...partial,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  }
  return {
    ...state,
    events: [event, ...state.events].slice(0, 100),
  }
}

function mapEmployee(
  state: AppState,
  departmentId: string,
  employeeId: string,
  updater: (e: Employee) => Employee,
): AppState {
  return {
    ...state,
    departments: state.departments.map((d) =>
      d.id === departmentId
        ? {
            ...d,
            employees: d.employees.map((e) =>
              e.id === employeeId ? updater(e) : e,
            ),
          }
        : d,
    ),
  }
}

function findActor(state: AppState): ActorContext | null {
  if (!state.currentUserId || !state.sessionAccountId) return null
  const account = state.accounts.find((a) => a.id === state.sessionAccountId)
  if (!account) return null
  const admin = !!account.isAdmin

  const preferred = state.departments.find((d) => d.id === account.departmentId)
  if (preferred) {
    const inDept = preferred.employees.find((e) => e.id === state.currentUserId)
    if (inDept) {
      return { employee: inDept, departmentId: preferred.id, isAdmin: admin }
    }
  }

  for (const d of state.departments) {
    const found = d.employees.find((e) => e.id === state.currentUserId)
    if (found) {
      return { employee: found, departmentId: d.id, isAdmin: admin }
    }
  }
  return null
}

function findEmployee(
  state: AppState,
  departmentId: string,
  employeeId: string,
): { dept: Department; emp: Employee } | null {
  const dept = state.departments.find((d) => d.id === departmentId)
  const emp = dept?.employees.find((e) => e.id === employeeId)
  if (!dept || !emp) return null
  return { dept, emp }
}

function roundAdd(a: number, b: number): number {
  return Math.round((a + b) * 10) / 10
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [toast, setToast] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    try {
      saveState(state)
    } catch {
      setToast('Не удалось сохранить данные на устройстве. Освободите память браузера.')
    }
  }, [state])

  useEffect(() => {
    void ensureNotificationPermission()
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await ensureStaffAccounts(state)
      if (!cancelled && next !== state) {
        setState(next)
      }
    })()
    return () => {
      cancelled = true
    }
    // only on mount / department employee set changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.departments
      .map((d) => d.employees.map((e) => e.id).join(','))
      .join('|'),
  ])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const actor = useMemo(() => findActor(state), [state])
  const currentUser = actor?.employee ?? null
  const currentAccount = useMemo(
    () => state.accounts.find((a) => a.id === state.sessionAccountId) ?? null,
    [state.accounts, state.sessionAccountId],
  )
  const isLoggedIn = !!state.sessionAccountId && !!currentUser
  const needsPasswordChange = !!currentAccount?.mustChangePassword

  const login = useCallback(async (loginName: string, password: string) => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      const normalized = loginName.trim()
      const account = state.accounts.find(
        (a) => a.login.toLowerCase() === normalized.toLowerCase(),
      )
      if (!account) {
        setAuthError('Неверный логин или пароль')
        return false
      }
      const ok = await verifyPassword(account.login, password, account.passwordHash)
      if (!ok) {
        setAuthError('Неверный логин или пароль')
        return false
      }

      rememberSessionPassword(password)
      setState((s) => ({
        ...s,
        sessionAccountId: account.id,
        currentUserId: account.employeeId,
        activeDepartmentId: account.departmentId,
      }))
      setToast('Вход выполнен')
      return true
    } catch (err) {
      console.error(err)
      setAuthError('Ошибка входа. Обновите страницу и попробуйте снова.')
      return false
    } finally {
      setAuthBusy(false)
    }
  }, [state.accounts])

  const logout = useCallback(() => {
    clearSessionPassword()
    try {
      localStorage.removeItem('lisAdminToken')
      localStorage.removeItem('lisAdminUser')
    } catch {
      /* ignore */
    }
    setState((s) => ({
      ...s,
      sessionAccountId: null,
      currentUserId: null,
    }))
    setToast('Вы вышли из учётки')
  }, [])

  const setActiveDepartment = useCallback((id: string) => {
    setState((s) => {
      const a = findActor(s)
      if (!canOpenDepartment(a, id)) {
        setToast('Доступен только ваш отдел')
        return s
      }
      return { ...s, activeDepartmentId: id }
    })
  }, [])

  const renameDepartment = useCallback((id: string, name: string) => {
    setState((s) => {
      if (!canManageStaff(findActor(s), id)) {
        setToast('Отдел меняет только старший инструктор этого отдела')
        return s
      }
      return {
        ...s,
        departments: s.departments.map((d) =>
          d.id === id ? { ...d, name: name.trim() || d.name } : d,
        ),
      }
    })
  }, [])

  const addDepartment = useCallback(() => {
    setState((s) => {
      const a = findActor(s)
      if (!isAdmin(a)) {
        setToast('Новые отделы создаёт только администратор')
        return s
      }
      const dept: Department = {
        id: crypto.randomUUID(),
        name: `${s.departments.length + 1} отдел`,
        employees: [],
      }
      setToast(`Создан отдел: ${dept.name}`)
      return {
        ...s,
        departments: [...s.departments, dept],
        activeDepartmentId: dept.id,
      }
    })
  }, [])

  const removeDepartment = useCallback((id: string) => {
    setState((s) => {
      const a = findActor(s)
      if (!isAdmin(a)) {
        setToast('Удалять отделы может только администратор')
        return s
      }
      if (s.departments.length <= 1) {
        setToast('Нельзя удалить единственный отдел')
        return s
      }
      const departments = s.departments.filter((d) => d.id !== id)
      setToast('Отдел удалён')
      return {
        ...s,
        departments,
        accounts: s.accounts.filter((acc) => acc.departmentId !== id),
        seniorLessons: (s.seniorLessons ?? []).filter(
          (l) => l.departmentId !== id,
        ),
        tmcItems: (s.tmcItems ?? []).filter((l) => l.departmentId !== id),
        tmcBoards: (s.tmcBoards ?? []).filter((l) => l.departmentId !== id),
        tmcRequests: (s.tmcRequests ?? []).filter((l) => l.departmentId !== id),
        tmcBaselines: (s.tmcBaselines ?? []).filter(
          (l) => l.departmentId !== id,
        ),
        activeDepartmentId:
          s.activeDepartmentId === id
            ? departments[0].id
            : s.activeDepartmentId,
      }
    })
  }, [])

  const addEmployee = useCallback((departmentId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      setToast('Введите ФИО сотрудника')
      return
    }
    void (async () => {
      let createdId = ''
      let login = loginFromFio(trimmed)
      setState((s) => {
        const a = findActor(s)
        if (!canManageStaff(a, departmentId)) {
          setToast('Добавлять состав может только старший инструктор отдела')
          return s
        }
        const created = ensureEmployeeMonth(
          createEmployee(trimmed, 'instructor'),
          s.selectedYear,
          s.selectedMonth,
        )
        createdId = created.id
        let n = 2
        while (
          s.accounts.some((x) => x.login.toLowerCase() === login.toLowerCase())
        ) {
          login = `${loginFromFio(trimmed)}${n}`
          n += 1
        }
        const nextCount =
          (s.departments.find((d) => d.id === departmentId)?.employees.length ??
            0) + 1
        queueMicrotask(() =>
          setToast(
            `Добавлен: ${trimmed} · логин ${login} · пароль ${DEFAULT_STAFF_PASSWORD} · в отделе ${nextCount}`,
          ),
        )
        const nextDepts = s.departments.map((d) =>
          d.id === departmentId
            ? { ...d, employees: [...d.employees, created] }
            : d,
        )
        const dept = nextDepts.find((d) => d.id === departmentId)
        return {
          ...s,
          departments: nextDepts,
          knowledgeCuts: ensureKnowledgeCutsForDepartment(
            s.knowledgeCuts ?? [],
            departmentId,
            dept?.employees ?? [],
            s.selectedYear,
            s.selectedMonth,
          ),
          dailyWorkReports: ensureDailyWorkReportsForDepartment(
            s.dailyWorkReports ?? [],
            departmentId,
            dept?.employees ?? [],
            todayKey(),
          ),
        }
      })
      if (!createdId) return
      const account = await createStaffAccount({
        employeeId: createdId,
        departmentId,
        fullName: trimmed,
      })
      const passwordHash = await hashPassword(login, DEFAULT_STAFF_PASSWORD)
      setState((s) => ({
        ...s,
        accounts: [
          ...s.accounts.filter((x) => x.employeeId !== createdId),
          { ...account, login, passwordHash },
        ],
      }))
    })()
  }, [])

  const removeEmployee = useCallback((departmentId: string, employeeId: string) => {
    setState((s) => {
      if (!canManageStaff(findActor(s), departmentId)) {
        setToast('Удалять состав может только старший инструктор отдела')
        return s
      }
      if (employeeId === s.currentUserId) {
        setToast('Нельзя удалить свою учётную запись из состава')
        return s
      }
      const dept = s.departments.find((d) => d.id === departmentId)
      const removed = dept?.employees.find((e) => e.id === employeeId)
      const nextCount = Math.max(0, (dept?.employees.length ?? 1) - 1)
      queueMicrotask(() =>
        setToast(
          removed
            ? `Удалён: ${removed.name} · осталось ${nextCount}`
            : 'Сотрудник удалён',
        ),
      )
      return {
        ...s,
        departments: s.departments.map((d) =>
          d.id === departmentId
            ? { ...d, employees: d.employees.filter((e) => e.id !== employeeId) }
            : d,
        ),
        accounts: s.accounts.filter((a) => a.employeeId !== employeeId),
        tmcItems: (s.tmcItems ?? []).filter((i) => i.employeeId !== employeeId),
        tmcBoards: (s.tmcBoards ?? []).filter(
          (b) => b.employeeId !== employeeId,
        ),
        tmcBaselines: (s.tmcBaselines ?? []).filter(
          (b) => b.employeeId !== employeeId,
        ),
        tmcRequests: (s.tmcRequests ?? []).filter(
          (r) => r.employeeId !== employeeId,
        ),
      }
    })
  }, [])

  const renameEmployee = useCallback(
    (departmentId: string, employeeId: string, name: string) => {
      setState((s) => {
        const found = findEmployee(s, departmentId, employeeId)
        const a = findActor(s)
        if (!found || !canEditEmployeeMeta(a, found.emp, departmentId)) {
          setToast('Нет прав на изменение ФИО')
          return s
        }
        return mapEmployee(s, departmentId, employeeId, (e) => ({
          ...e,
          name: name.trim() || e.name,
        }))
      })
    },
    [],
  )

  const setDayStatus = useCallback(
    (
      departmentId: string,
      employeeId: string,
      dayIndex: number,
      status: DayStatus,
    ) => {
      setState((s) => {
        const found = findEmployee(s, departmentId, employeeId)
        const a = findActor(s)
        if (!found) return s
        const emp = ensureEmployeeMonth(
          found.emp,
          s.selectedYear,
          s.selectedMonth,
        )
        const key = monthKey(s.selectedYear, s.selectedMonth)
        const schedule = emp.months[key]
        const check = canSetDayStatus(
          a,
          emp,
          departmentId,
          s.selectedYear,
          s.selectedMonth,
          dayIndex,
          status,
          schedule.days,
        )
        if (!check.ok) {
          setToast(check.reason ?? 'Нельзя изменить день')
          return s
        }

        return mapEmployee(s, departmentId, employeeId, (e) => {
          const ensured = ensureEmployeeMonth(
            e,
            s.selectedYear,
            s.selectedMonth,
          )
          const mk = monthKey(s.selectedYear, s.selectedMonth)
          const days = ensured.months[mk].days.map((cell, i) =>
            i === dayIndex
              ? {
                  ...cell,
                  status,
                  overtimeHours: status === 'work' ? cell.overtimeHours : 0,
                }
              : cell,
          )
          return {
            ...ensured,
            months: {
              ...ensured.months,
              [mk]: { ...ensured.months[mk], days },
            },
          }
        })
      })
    },
    [],
  )

  const setOvertime = useCallback(
    (
      departmentId: string,
      employeeId: string,
      dayIndex: number,
      hours: number,
    ) => {
      setState((s) => {
        const a = findActor(s)
        if (!canManualOvertime(a, departmentId)) {
          setToast(
            `Переработки считаются автоматически (смена ${WORK_DAY_LABEL}). Ручная правка — у старшего инструктора отдела`,
          )
          return s
        }
        const value = Math.max(0, Math.min(24, hours || 0))
        return mapEmployee(s, departmentId, employeeId, (e) => {
          const ensured = ensureEmployeeMonth(
            e,
            s.selectedYear,
            s.selectedMonth,
          )
          const mk = monthKey(s.selectedYear, s.selectedMonth)
          const days = ensured.months[mk].days.map((cell, i) =>
            i === dayIndex
              ? { ...cell, overtimeHours: value, status: 'work' as const }
              : cell,
          )
          return {
            ...ensured,
            months: {
              ...ensured.months,
              [mk]: { ...ensured.months[mk], days },
            },
          }
        })
      })
    },
    [],
  )

  const setRole = useCallback(
    (departmentId: string, employeeId: string, role: Role) => {
      setState((s) => {
        if (!canManageStaff(findActor(s), departmentId)) {
          setToast('Должность меняет только старший инструктор отдела')
          return s
        }
        return mapEmployee(s, departmentId, employeeId, (e) => ({
          ...e,
          role,
        }))
      })
    },
    [],
  )

  const setLocation = useCallback(
    (departmentId: string, employeeId: string, location: Location) => {
      setState((s) => {
        const found = findEmployee(s, departmentId, employeeId)
        const a = findActor(s)
        if (!found || !canEditEmployeeMeta(a, found.emp, departmentId)) {
          setToast('Место может менять старший отдела или сам сотрудник')
          return s
        }

        const message = `${found.emp.name}: место — ${LOCATION_LABELS[location]}`
        pushLocalNotification('Местоположение', message)

        return pushEvent(
          mapEmployee(s, departmentId, employeeId, (e) => ({
            ...e,
            location,
          })),
          {
            employeeId,
            employeeName: found.emp.name,
            departmentName: found.dept.name,
            type: 'location',
            message,
          },
        )
      })
    },
    [],
  )

  const checkIn = useCallback((departmentId: string, employeeId: string) => {
    setState((s) => {
      const found = findEmployee(s, departmentId, employeeId)
      const a = findActor(s)
      if (!found || !canCheckAttendance(a, found.emp, departmentId)) {
        setToast('Отметить приход можно в своём отделе (себе или старшему — за всех)')
        return s
      }

      const now = new Date().toISOString()
      const message = `${found.emp.name} пришёл на работу · ${LOCATION_LABELS[found.emp.location]}`
      pushLocalNotification('Приход на работу', message)

      return pushEvent(
        mapEmployee(s, departmentId, employeeId, (e) => ({
          ...e,
          attendance: 'in',
          lastCheckIn: now,
        })),
        {
          employeeId,
          employeeName: found.emp.name,
          departmentName: found.dept.name,
          type: 'check_in',
          message,
        },
      )
    })
  }, [])

  const checkOut = useCallback((departmentId: string, employeeId: string) => {
    setState((s) => {
      const found = findEmployee(s, departmentId, employeeId)
      const a = findActor(s)
      if (!found || !canCheckAttendance(a, found.emp, departmentId)) {
        setToast('Отметить уход можно в своём отделе (себе или старшему — за всех)')
        return s
      }

      const now = new Date().toISOString()
      const ot = overtimeFromShift(found.emp.lastCheckIn, now)
      const today = new Date()
      const dayIndex = today.getDate() - 1
      const year = s.selectedYear
      const month = s.selectedMonth
      const isCurrentMonthView =
        today.getFullYear() === year && today.getMonth() === month

      const message =
        ot > 0
          ? `${found.emp.name} ушёл · переработка +${ot} ч (смена ${WORK_DAY_LABEL})`
          : `${found.emp.name} ушёл с работы`
      pushLocalNotification('Уход с работы', message)

      const next = mapEmployee(s, departmentId, employeeId, (e) => {
        let updated: Employee = {
          ...e,
          attendance: 'out',
          lastCheckOut: now,
        }
        if (isCurrentMonthView && ot > 0) {
          updated = ensureEmployeeMonth(updated, year, month)
          const mk = monthKey(year, month)
          const days = updated.months[mk].days.map((cell, i) =>
            i === dayIndex
              ? {
                  ...cell,
                  status: 'work' as const,
                  overtimeHours: roundAdd(cell.overtimeHours, ot),
                }
              : cell,
          )
          updated = {
            ...updated,
            months: {
              ...updated.months,
              [mk]: { ...updated.months[mk], days },
            },
          }
        }
        return updated
      })

      return pushEvent(next, {
        employeeId,
        employeeName: found.emp.name,
        departmentName: found.dept.name,
        type: 'check_out',
        message,
      })
    })
  }, [])

  const setMonth = useCallback((month: number, year: number) => {
    setState((s) => {
      let knowledgeCuts = s.knowledgeCuts ?? []
      for (const d of s.departments) {
        knowledgeCuts = ensureKnowledgeCutsForDepartment(
          knowledgeCuts,
          d.id,
          d.employees,
          year,
          month,
        )
      }
      return {
        ...s,
        selectedMonth: month,
        selectedYear: year,
        knowledgeCuts,
        departments: s.departments.map((d) => ({
          ...d,
          employees: d.employees.map((e) =>
            ensureEmployeeMonth(e, year, month),
          ),
        })),
      }
    })
  }, [])

  const updateKnowledgeCut = useCallback(
    (departmentId: string, employeeId: string, patch: KnowledgeCutPatch) => {
      setState((s) => {
        const a = findActor(s)
        const isHead = canManageStaff(a, departmentId)
        const isSelf =
          !!a &&
          a.departmentId === departmentId &&
          a.employee.id === employeeId
        const reportOnlyKeys = new Set([
          'reportFileId',
          'reportFileName',
          'reportMime',
          'reportSize',
          'reportUploadedAt',
        ])
        const patchKeys = Object.keys(patch)
        const onlyReport =
          patchKeys.length > 0 &&
          patchKeys.every((k) => reportOnlyKeys.has(k))

        if (!isHead && !(isSelf && onlyReport)) {
          setToast(
            isSelf
              ? 'Можно менять только отчётный файл своей строки'
              : 'Срез знаний заполняет старший инструктор отдела',
          )
          return s
        }
        const period = monthKey(s.selectedYear, s.selectedMonth)
        const dept = s.departments.find((d) => d.id === departmentId)
        const emp = dept?.employees.find((e) => e.id === employeeId)
        if (!dept || !emp || emp.role === 'senior_instructor') {
          setToast('Срез знаний — для инструкторов и ассистентов отдела')
          return s
        }

        let knowledgeCuts = ensureKnowledgeCutsForDepartment(
          s.knowledgeCuts ?? [],
          departmentId,
          dept.employees,
          s.selectedYear,
          s.selectedMonth,
        )

        const idx = knowledgeCuts.findIndex(
          (c) =>
            c.departmentId === departmentId &&
            c.employeeId === employeeId &&
            c.period === period,
        )
        const base =
          idx >= 0
            ? knowledgeCuts[idx]
            : createEmptyKnowledgeCut(departmentId, employeeId, period)

        if (
          patch.reportFileId !== undefined &&
          patch.reportFileId !== base.reportFileId
        ) {
          if (base.reportFileId && base.reportFileId !== patch.reportFileId) {
            void deleteChatBlob(base.reportFileId)
          }
        }
        if (patch.reportFileId === null && base.reportFileId) {
          void deleteChatBlob(base.reportFileId)
        }

        const nextCut: KnowledgeCut = {
          ...base,
          ...patch,
          format:
            patch.format === undefined
              ? base.format
              : patch.format === 'in_person' || patch.format === 'remote'
                ? patch.format
                : '',
          theory:
            patch.theory === undefined
              ? base.theory
              : patch.theory == null
                ? null
                : Math.min(5, Math.max(1, Math.round(Number(patch.theory)))),
          practice:
            patch.practice === undefined
              ? base.practice
              : patch.practice == null
                ? null
                : Math.min(5, Math.max(1, Math.round(Number(patch.practice)))),
          methodology:
            patch.methodology === undefined
              ? base.methodology
              : patch.methodology == null
                ? null
                : Math.min(
                    5,
                    Math.max(1, Math.round(Number(patch.methodology))),
                  ),
          reportFileId:
            patch.reportFileId === undefined
              ? base.reportFileId
              : patch.reportFileId,
          reportFileName:
            patch.reportFileName === undefined
              ? base.reportFileName
              : patch.reportFileName,
          reportMime:
            patch.reportMime === undefined ? base.reportMime : patch.reportMime,
          reportSize:
            patch.reportSize === undefined
              ? base.reportSize
              : Math.max(0, Number(patch.reportSize) || 0),
          reportUploadedAt:
            patch.reportUploadedAt === undefined
              ? base.reportUploadedAt
              : patch.reportUploadedAt,
          updatedAt: new Date().toISOString(),
          assessedByName: a?.employee.name ?? null,
        }

        if (idx >= 0) {
          knowledgeCuts = knowledgeCuts.map((c, i) =>
            i === idx ? nextCut : c,
          )
        } else {
          knowledgeCuts = [...knowledgeCuts, nextCut]
        }

        return { ...s, knowledgeCuts }
      })
    },
    [],
  )

  const upsertSeniorLesson = useCallback(
    (departmentId: string, lessonId: string | null, patch: SeniorLessonPatch) => {
      setState((s) => {
        const a = findActor(s)
        if (!canManageStaff(a, departmentId)) {
          setToast('Журнал занятий ведёт старший инструктор отдела')
          return s
        }
        if (!a) return s

        const topic = (patch.topic ?? '').trim()
        const groupNumber = (patch.groupNumber ?? '').trim()
        const stream = (patch.stream ?? '').trim()
        const existing = lessonId
          ? (s.seniorLessons ?? []).find((l) => l.id === lessonId)
          : null

        if (!existing) {
          if (!topic) {
            setToast('Укажите тему занятия')
            return s
          }
          if (!groupNumber || !stream) {
            setToast('Укажите номер группы и поток курсантов')
            return s
          }
          const created = createEmptySeniorLesson(
            departmentId,
            a.employee.id,
            a.employee.name,
          )
          const next: SeniorLessonRecord = {
            ...created,
            topic,
            groupNumber,
            stream,
            conductedDate:
              typeof patch.conductedDate === 'string'
                ? patch.conductedDate
                : '',
            planFileId:
              patch.planFileId === undefined ? null : patch.planFileId,
            planFileName:
              typeof patch.planFileName === 'string' ? patch.planFileName : '',
            planMime: typeof patch.planMime === 'string' ? patch.planMime : '',
            planSize: Math.max(0, Number(patch.planSize) || 0),
            planUploadedAt: patch.planUploadedAt ?? null,
            note: typeof patch.note === 'string' ? patch.note : '',
            updatedAt: new Date().toISOString(),
          }
          const normalized = normalizeSeniorLesson(next)
          if (!normalized) return s
          setToast(
            next.conductedDate
              ? 'Занятие внесено в учёт'
              : next.planFileId
                ? 'План-конспект загружен'
                : 'Черновик занятия сохранён',
          )
          return {
            ...s,
            seniorLessons: [normalized, ...(s.seniorLessons ?? [])],
          }
        }

        if (existing.departmentId !== departmentId) {
          setToast('Чужой отдел')
          return s
        }

        const nextTopic =
          patch.topic === undefined ? existing.topic : patch.topic.trim()
        const nextGroup =
          patch.groupNumber === undefined
            ? existing.groupNumber
            : patch.groupNumber.trim()
        const nextStream =
          patch.stream === undefined ? existing.stream : patch.stream.trim()
        if (!nextTopic || !nextGroup || !nextStream) {
          setToast('Тема, группа и поток обязательны')
          return s
        }

        if (
          patch.planFileId !== undefined &&
          patch.planFileId !== existing.planFileId
        ) {
          if (
            existing.planFileId &&
            existing.planFileId !== patch.planFileId
          ) {
            void deleteChatBlob(existing.planFileId)
          }
        }
        if (patch.planFileId === null && existing.planFileId) {
          void deleteChatBlob(existing.planFileId)
        }

        const updated: SeniorLessonRecord = {
          ...existing,
          topic: nextTopic,
          groupNumber: nextGroup,
          stream: nextStream,
          conductedDate:
            patch.conductedDate === undefined
              ? existing.conductedDate
              : patch.conductedDate,
          planFileId:
            patch.planFileId === undefined
              ? existing.planFileId
              : patch.planFileId,
          planFileName:
            patch.planFileName === undefined
              ? existing.planFileName
              : patch.planFileName,
          planMime:
            patch.planMime === undefined ? existing.planMime : patch.planMime,
          planSize:
            patch.planSize === undefined
              ? existing.planSize
              : Math.max(0, Number(patch.planSize) || 0),
          planUploadedAt:
            patch.planUploadedAt === undefined
              ? existing.planUploadedAt
              : patch.planUploadedAt,
          note: patch.note === undefined ? existing.note : patch.note,
          instructorId: a.employee.id,
          instructorName: a.employee.name,
          updatedAt: new Date().toISOString(),
        }

        return {
          ...s,
          seniorLessons: (s.seniorLessons ?? []).map((l) =>
            l.id === existing.id ? updated : l,
          ),
        }
      })
    },
    [],
  )

  const deleteSeniorLesson = useCallback(
    (departmentId: string, lessonId: string) => {
      setState((s) => {
        const a = findActor(s)
        if (!canManageStaff(a, departmentId)) {
          setToast('Удалять записи может старший инструктор отдела')
          return s
        }
        const lesson = (s.seniorLessons ?? []).find((l) => l.id === lessonId)
        if (!lesson || lesson.departmentId !== departmentId) {
          setToast('Запись не найдена')
          return s
        }
        if (lesson.planFileId) void deleteChatBlob(lesson.planFileId)
        setToast('Запись о занятии удалена')
        return {
          ...s,
          seniorLessons: (s.seniorLessons ?? []).filter(
            (l) => l.id !== lessonId,
          ),
        }
      })
    },
    [],
  )

  const canEditTmcEmployee = (
    a: ActorContext | null,
    departmentId: string,
    employeeId: string,
  ): boolean => {
    if (!a) return false
    if (canManageStaff(a, departmentId)) return true
    return a.departmentId === departmentId && a.employee.id === employeeId
  }

  const upsertTmcItem = useCallback(
    (
      departmentId: string,
      employeeId: string,
      itemId: string | null,
      patch: Partial<TmcItem>,
    ) => {
      setState((s) => {
        const a = findActor(s)
        if (!canEditTmcEmployee(a, departmentId, employeeId)) {
          setToast('Можно править только своё оборудование')
          return s
        }
        const now = new Date().toISOString()
        if (!itemId) {
          const created = normalizeTmcItem({
            ...patch,
            departmentId,
            employeeId,
            createdAt: now,
            updatedAt: now,
          })
          if (!created || !created.name.trim()) {
            setToast('Укажите наименование изделия')
            return s
          }
          return { ...s, tmcItems: [created, ...(s.tmcItems ?? [])] }
        }
        const existing = (s.tmcItems ?? []).find((i) => i.id === itemId)
        if (!existing || existing.departmentId !== departmentId) {
          setToast('Позиция не найдена')
          return s
        }
        if (
          !canManageStaff(a, departmentId) &&
          existing.employeeId !== a?.employee.id
        ) {
          setToast('Чужая позиция ТМЦ закрыта')
          return s
        }
        const updated = normalizeTmcItem({
          ...existing,
          ...patch,
          id: existing.id,
          departmentId: existing.departmentId,
          employeeId: existing.employeeId,
          updatedAt: now,
        })
        if (!updated) return s
        return {
          ...s,
          tmcItems: (s.tmcItems ?? []).map((i) =>
            i.id === itemId ? updated : i,
          ),
        }
      })
    },
    [],
  )

  const deleteTmcItem = useCallback(
    (departmentId: string, itemId: string) => {
      setState((s) => {
        const a = findActor(s)
        const item = (s.tmcItems ?? []).find((i) => i.id === itemId)
        if (!item || item.departmentId !== departmentId) {
          setToast('Позиция не найдена')
          return s
        }
        if (!canEditTmcEmployee(a, departmentId, item.employeeId)) {
          setToast('Можно удалять только своё оборудование')
          return s
        }
        return {
          ...s,
          tmcItems: (s.tmcItems ?? []).filter((i) => i.id !== itemId),
        }
      })
    },
    [],
  )

  const clearEmployeeTmcItems = useCallback(
    (departmentId: string, employeeId: string) => {
      setState((s) => {
        const a = findActor(s)
        if (!canEditTmcEmployee(a, departmentId, employeeId)) {
          setToast('Недостаточно прав')
          return s
        }
        return {
          ...s,
          tmcItems: (s.tmcItems ?? []).filter(
            (i) =>
              !(i.departmentId === departmentId && i.employeeId === employeeId),
          ),
        }
      })
    },
    [],
  )

  const snapshotTmcInventory = useCallback(
    (departmentId: string, employeeId: string) => {
      setState((s) => {
        const actor = findActor(s)
        if (!canEditTmcEmployee(actor, departmentId, employeeId)) {
          setToast('Недостаточно прав')
          return s
        }
        const current = (s.tmcItems ?? []).filter(
          (i) =>
            i.departmentId === departmentId && i.employeeId === employeeId,
        )
        if (!current.length) {
          setToast('Сначала добавьте оборудование в список')
          return s
        }
        const now = new Date().toISOString()
        const baseline = normalizeTmcBaseline({
          departmentId,
          employeeId,
          takenAt: now,
          sourceFileName: 'ручная фиксация',
          items: toBaselineItems(current),
        })
        const keptBaselines = (s.tmcBaselines ?? []).filter(
          (b) =>
            !(
              b.departmentId === departmentId && b.employeeId === employeeId
            ),
        )
        setToast(
          `Инвентаризация зафиксирована · ${current.length} поз. (база для пропавшего)`,
        )
        return {
          ...s,
          tmcBaselines: baseline ? [baseline, ...keptBaselines] : keptBaselines,
        }
      })
    },
    [],
  )

  const upsertTmcBoard = useCallback(
    (
      departmentId: string,
      employeeId: string,
      boardId: string | null,
      patch: Partial<Pick<TmcBoard, 'kind' | 'status' | 'note'>>,
    ) => {
      setState((s) => {
        const a = findActor(s)
        if (!canEditTmcEmployee(a, departmentId, employeeId)) {
          setToast('Можно править только свои борты')
          return s
        }
        const now = new Date().toISOString()
        if (!boardId) {
          const kind =
            patch.kind && TMC_BOARD_KINDS.includes(patch.kind)
              ? patch.kind
              : null
          if (!kind) {
            setToast('Выберите тип борта')
            return s
          }
          const status =
            patch.status && TMC_BOARD_STATUSES.includes(patch.status)
              ? patch.status
              : 'intact'
          const created = normalizeTmcBoard({
            departmentId,
            employeeId,
            kind,
            status,
            note: patch.note ?? '',
            createdAt: now,
            updatedAt: now,
          })
          if (!created) return s
          return { ...s, tmcBoards: [created, ...(s.tmcBoards ?? [])] }
        }
        const existing = (s.tmcBoards ?? []).find((b) => b.id === boardId)
        if (!existing || existing.departmentId !== departmentId) {
          setToast('Борт не найден')
          return s
        }
        if (
          !canManageStaff(a, departmentId) &&
          existing.employeeId !== a?.employee.id
        ) {
          setToast('Чужой борт закрыт')
          return s
        }
        const updated = normalizeTmcBoard({
          ...existing,
          ...patch,
          id: existing.id,
          departmentId: existing.departmentId,
          employeeId: existing.employeeId,
          updatedAt: now,
        })
        if (!updated) return s
        return {
          ...s,
          tmcBoards: (s.tmcBoards ?? []).map((b) =>
            b.id === boardId ? updated : b,
          ),
        }
      })
    },
    [],
  )

  const deleteTmcBoard = useCallback(
    (departmentId: string, boardId: string) => {
      setState((s) => {
        const a = findActor(s)
        const board = (s.tmcBoards ?? []).find((b) => b.id === boardId)
        if (!board || board.departmentId !== departmentId) {
          setToast('Борт не найден')
          return s
        }
        if (!canEditTmcEmployee(a, departmentId, board.employeeId)) {
          setToast('Можно удалять только свои борты')
          return s
        }
        return {
          ...s,
          tmcBoards: (s.tmcBoards ?? []).filter((b) => b.id !== boardId),
        }
      })
    },
    [],
  )

  const addTmcBoardsBulk = useCallback(
    (
      departmentId: string,
      employeeId: string,
      kind: TmcBoardKind,
      count: number,
      status: TmcBoardStatus = 'intact',
    ) => {
      const n = Math.min(50, Math.max(1, Math.round(count)))
      setState((s) => {
        const a = findActor(s)
        if (!canEditTmcEmployee(a, departmentId, employeeId)) {
          setToast('Недостаточно прав')
          return s
        }
        const now = new Date().toISOString()
        const created: TmcBoard[] = []
        for (let i = 0; i < n; i++) {
          const board = normalizeTmcBoard({
            departmentId,
            employeeId,
            kind,
            status,
            note: '',
            createdAt: now,
            updatedAt: now,
          })
          if (board) created.push(board)
        }
        setToast(`Добавлено бортов: ${created.length}`)
        return { ...s, tmcBoards: [...created, ...(s.tmcBoards ?? [])] }
      })
    },
    [],
  )

  /** Массовый импорт позиций ТМЦ из разобранного файла. */
  const importTmcItems = useCallback(
    (
      departmentId: string,
      employeeId: string,
      rows: ParsedTmcRow[],
      sourceFileName: string,
    ) => {
      setState((s) => {
        const a = findActor(s)
        if (!canEditTmcEmployee(a, departmentId, employeeId)) {
          setToast('Можно импортировать только своё оборудование')
          return s
        }
        if (!rows.length) {
          setToast('В файле нет распознанных позиций')
          return s
        }
        const now = new Date().toISOString()
        const existingCount = (s.tmcItems ?? []).filter(
          (i) => i.departmentId === departmentId && i.employeeId === employeeId,
        ).length
        const created: TmcItem[] = []
        rows.forEach((row, idx) => {
          const item = normalizeTmcItem({
            departmentId,
            employeeId,
            name: row.name,
            warehouseNumber: row.warehouseNumber,
            quantity: row.quantity || '1',
            condition: row.condition,
            brand: row.brand,
            model: row.model,
            serial: row.serial,
            note: row.note
              ? row.note
              : sourceFileName
                ? `Импорт: ${sourceFileName}`
                : '',
            orderNo: existingCount + idx + 1,
            positionNo: existingCount + idx + 1,
            createdAt: now,
            updatedAt: now,
          })
          if (item && item.name.trim()) created.push(item)
        })
        if (!created.length) {
          setToast('Не удалось создать позиции из файла')
          return s
        }
        setToast(`Импортировано в ТМЦ: ${created.length}`)
        return { ...s, tmcItems: [...created, ...(s.tmcItems ?? [])] }
      })
    },
    [],
  )

  const upsertTmcRequest = useCallback(
    (
      departmentId: string,
      requestId: string | null,
      patch: {
        kind: TmcRequestKind
        title?: string
        note?: string
        docDate?: string
        requestNo?: string
        streamNo?: string
        groupNo?: string
        cabinet?: string
        roleTitle?: string
        addressee?: string
        lines: Array<Partial<TmcRequestLine>>
        status?: TmcRequestStatus
      },
    ) => {
      setState((s) => {
        const a = findActor(s)
        if (!a || a.departmentId !== departmentId) {
          setToast('Войдите в учётку отдела')
          return s
        }
        const now = new Date().toISOString()
        const lines = patch.lines
          .map((l) => ({
            id: l.id ?? crypto.randomUUID(),
            name: typeof l.name === 'string' ? l.name.trim() : '',
            warehouseNumber:
              typeof l.warehouseNumber === 'string' ? l.warehouseNumber : '',
            quantity: typeof l.quantity === 'string' ? l.quantity || '1' : '1',
            condition: l.condition ?? 'ok',
            reason: typeof l.reason === 'string' ? l.reason : '',
            sourceItemId: l.sourceItemId ?? null,
          }))
          .filter((l) => l.name)

        const meta = {
          title: patch.title ?? '',
          note: patch.note ?? '',
          docDate: patch.docDate ?? '',
          requestNo: patch.requestNo ?? '',
          streamNo: patch.streamNo ?? '',
          groupNo: patch.groupNo ?? '',
          cabinet: patch.cabinet ?? '',
          roleTitle: patch.roleTitle ?? 'инструктор',
          addressee:
            patch.addressee ??
            'Руководителю управления организационной работой',
        }

        if (!requestId) {
          const created = normalizeTmcRequest({
            departmentId,
            employeeId: a.employee.id,
            employeeName: a.employee.name,
            kind: patch.kind,
            status: patch.status ?? 'draft',
            ...meta,
            lines,
            createdAt: now,
            updatedAt: now,
            submittedAt: patch.status === 'submitted' ? now : null,
          })
          if (!created || !created.lines.length) {
            setToast('Добавьте хотя бы одну позицию в заявку')
            return s
          }
          setToast(
            created.status === 'submitted'
              ? 'Заявка отправлена на рассмотрение'
              : 'Черновик заявки сохранён',
          )
          return {
            ...s,
            tmcRequests: [created, ...(s.tmcRequests ?? [])],
          }
        }

        const existing = (s.tmcRequests ?? []).find((r) => r.id === requestId)
        if (!existing || existing.departmentId !== departmentId) {
          setToast('Заявка не найдена')
          return s
        }
        const head = canManageStaff(a, departmentId)
        if (!head && existing.employeeId !== a.employee.id) {
          setToast('Чужая заявка закрыта')
          return s
        }
        if (
          !head &&
          existing.status !== 'draft' &&
          patch.status !== 'submitted'
        ) {
          setToast('Заявку уже нельзя править')
          return s
        }
        const nextStatus = patch.status ?? existing.status
        const updated = normalizeTmcRequest({
          ...existing,
          kind: patch.kind,
          title: patch.title ?? existing.title,
          note: patch.note ?? existing.note,
          docDate: patch.docDate ?? existing.docDate,
          requestNo: patch.requestNo ?? existing.requestNo,
          streamNo: patch.streamNo ?? existing.streamNo,
          groupNo: patch.groupNo ?? existing.groupNo,
          cabinet: patch.cabinet ?? existing.cabinet,
          roleTitle: patch.roleTitle ?? existing.roleTitle,
          addressee: patch.addressee ?? existing.addressee,
          lines,
          status: nextStatus,
          updatedAt: now,
          submittedAt:
            nextStatus === 'submitted'
              ? (existing.submittedAt ?? now)
              : existing.submittedAt,
        })
        if (!updated) return s
        setToast('Заявка обновлена')
        return {
          ...s,
          tmcRequests: (s.tmcRequests ?? []).map((r) =>
            r.id === requestId ? updated : r,
          ),
        }
      })
    },
    [],
  )

  const decideTmcRequest = useCallback(
    (
      departmentId: string,
      requestId: string,
      status: 'approved' | 'rejected',
      decisionNote = '',
    ) => {
      setState((s) => {
        const a = findActor(s)
        if (!canManageStaff(a, departmentId)) {
          setToast('Решение принимает старший инструктор')
          return s
        }
        const existing = (s.tmcRequests ?? []).find((r) => r.id === requestId)
        if (
          !existing ||
          existing.departmentId !== departmentId ||
          existing.status !== 'submitted'
        ) {
          setToast('Нет заявки на рассмотрении')
          return s
        }
        const now = new Date().toISOString()
        let tmcItems = [...(s.tmcItems ?? [])]

        if (status === 'approved' && existing.kind === 'receipt') {
          existing.lines.forEach((line, idx) => {
            const item = normalizeTmcItem({
              departmentId,
              employeeId: existing.employeeId,
              name: line.name,
              warehouseNumber: line.warehouseNumber,
              quantity: line.quantity || '1',
              condition: line.condition,
              note: line.reason
                ? `Получение: ${line.reason}`
                : `По заявке ${existing.id.slice(0, 8)}`,
              orderNo: tmcItems.length + idx + 1,
              positionNo: tmcItems.length + idx + 1,
              createdAt: now,
              updatedAt: now,
            })
            if (item) tmcItems = [item, ...tmcItems]
          })
        }

        if (status === 'approved' && existing.kind === 'writeoff') {
          for (const line of existing.lines) {
            if (line.sourceItemId) {
              tmcItems = tmcItems.map((i) =>
                i.id === line.sourceItemId
                  ? {
                      ...i,
                      condition: 'lost' as const,
                      note: [
                        i.note,
                        `Списано: ${line.reason || existing.title || 'заявка'}`,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                      updatedAt: now,
                    }
                  : i,
              )
            }
          }
        }

        const updated: TmcEquipmentRequest = {
          ...existing,
          status,
          decidedAt: now,
          decidedByEmployeeId: a!.employee.id,
          decidedByName: a!.employee.name,
          decisionNote,
          updatedAt: now,
        }

        setToast(
          status === 'approved'
            ? existing.kind === 'receipt'
              ? 'Заявка одобрена, оборудование внесено в ТМЦ'
              : 'Заявка на списание одобрена'
            : 'Заявка отклонена',
        )
        return {
          ...s,
          tmcItems,
          tmcRequests: (s.tmcRequests ?? []).map((r) =>
            r.id === requestId ? updated : r,
          ),
        }
      })
    },
    [],
  )

  const deleteTmcRequest = useCallback(
    (departmentId: string, requestId: string) => {
      setState((s) => {
        const a = findActor(s)
        const existing = (s.tmcRequests ?? []).find((r) => r.id === requestId)
        if (!existing || existing.departmentId !== departmentId) {
          setToast('Заявка не найдена')
          return s
        }
        const head = canManageStaff(a, departmentId)
        if (!head && existing.employeeId !== a?.employee.id) {
          setToast('Недостаточно прав')
          return s
        }
        if (!head && existing.status !== 'draft') {
          setToast('Можно удалить только черновик')
          return s
        }
        return {
          ...s,
          tmcRequests: (s.tmcRequests ?? []).filter((r) => r.id !== requestId),
        }
      })
    },
    [],
  )

  const updateDailyWorkReport = useCallback(
    (departmentId: string, employeeId: string, patch: DailyWorkPatch) => {
      setState((s) => {
        const a = findActor(s)
        if (!a) {
          setToast('Войдите в учётку')
          return s
        }
        const dept = s.departments.find((d) => d.id === departmentId)
        const emp = dept?.employees.find((e) => e.id === employeeId)
        if (!dept || !emp || emp.role === 'senior_instructor') {
          setToast('Контроль — для инструкторов и ассистентов')
          return s
        }

        const head = canManageStaff(a, departmentId)
        const own =
          a.departmentId === departmentId && a.employee.id === employeeId
        const editingSelfReport =
          patch.workDone !== undefined ||
          patch.programTopics !== undefined ||
          patch.improveSuggestions !== undefined ||
          patch.planFileId !== undefined ||
          patch.planFileName !== undefined ||
          patch.planMime !== undefined ||
          patch.planSize !== undefined ||
          patch.planUploadedAt !== undefined
        const editingControl =
          patch.seniorNote !== undefined ||
          patch.controlStatus !== undefined ||
          patch.planReview !== undefined

        if (editingSelfReport && !own) {
          setToast('Отчёт и план на день пишет сам инструктор или ассистент')
          return s
        }
        if (editingControl && !head) {
          setToast('Реакцию на отчёт ставит старший инструктор')
          return s
        }
        if (!own && !head) {
          setToast('Нет доступа к этому отчёту')
          return s
        }

        const date = todayKey()
        let dailyWorkReports = ensureDailyWorkReportsForDepartment(
          s.dailyWorkReports ?? [],
          departmentId,
          dept.employees,
          date,
        )
        const idx = dailyWorkReports.findIndex(
          (r) =>
            r.departmentId === departmentId &&
            r.employeeId === employeeId &&
            r.date === date,
        )
        const base =
          idx >= 0
            ? dailyWorkReports[idx]
            : createEmptyDailyWorkReport(departmentId, employeeId, date)

        const nextStatus =
          patch.controlStatus === undefined
            ? base.controlStatus
            : patch.controlStatus === '' ||
                patch.controlStatus === 'pending' ||
                patch.controlStatus === 'ok' ||
                patch.controlStatus === 'attention' ||
                patch.controlStatus === 'fail'
              ? (patch.controlStatus as DailyControlStatus | '')
              : base.controlStatus

        const nextPlanReview =
          patch.planReview === undefined
            ? base.planReview
            : patch.planReview === '' ||
                patch.planReview === 'best' ||
                patch.planReview === 'revise'
              ? (patch.planReview as DayPlanReview | '')
              : base.planReview

        const contentChanged =
          (patch.workDone !== undefined &&
            patch.workDone !== base.workDone) ||
          (patch.programTopics !== undefined &&
            patch.programTopics !== base.programTopics) ||
          (patch.improveSuggestions !== undefined &&
            patch.improveSuggestions !== base.improveSuggestions) ||
          (patch.planFileId !== undefined &&
            patch.planFileId !== base.planFileId)

        const next: DailyWorkReport = {
          ...base,
          workDone:
            patch.workDone === undefined ? base.workDone : patch.workDone,
          programTopics:
            patch.programTopics === undefined
              ? base.programTopics
              : patch.programTopics,
          improveSuggestions:
            patch.improveSuggestions === undefined
              ? base.improveSuggestions
              : patch.improveSuggestions,
          planFileId:
            patch.planFileId === undefined ? base.planFileId : patch.planFileId,
          planFileName:
            patch.planFileName === undefined
              ? base.planFileName
              : patch.planFileName,
          planMime:
            patch.planMime === undefined ? base.planMime : patch.planMime,
          planSize:
            patch.planSize === undefined ? base.planSize : patch.planSize,
          planUploadedAt:
            patch.planUploadedAt === undefined
              ? base.planUploadedAt
              : patch.planUploadedAt,
          planSubmittedAt:
            patch.planSubmittedAt === undefined
              ? contentChanged
                ? null
                : base.planSubmittedAt
              : patch.planSubmittedAt,
          planReview: contentChanged && own ? '' : nextPlanReview,
          seniorNote:
            patch.seniorNote === undefined ? base.seniorNote : patch.seniorNote,
          controlStatus: nextStatus,
          updatedAt: new Date().toISOString(),
          updatedByName: a.employee.name,
        }

        if (idx >= 0) {
          dailyWorkReports = dailyWorkReports.map((r, i) =>
            i === idx ? next : r,
          )
        } else {
          dailyWorkReports = [...dailyWorkReports, next]
        }
        return { ...s, dailyWorkReports }
      })
    },
    [],
  )

  /** Инструктор/ассистент отправляет ежедневный отчёт старшему */
  const submitDailyReportToSenior = useCallback(
    (departmentId: string) => {
      setState((s) => {
        const a = findActor(s)
        if (!a || a.departmentId !== departmentId) {
          setToast('Отчёт отправляет сотрудник своего отдела')
          return s
        }
        if (
          a.employee.role !== 'instructor' &&
          a.employee.role !== 'assistant'
        ) {
          setToast('Отчёт старшему отправляют инструктор или ассистент')
          return s
        }
        const dept = s.departments.find((d) => d.id === departmentId)
        if (!dept) return s
        const date = todayKey()
        let dailyWorkReports = ensureDailyWorkReportsForDepartment(
          s.dailyWorkReports ?? [],
          departmentId,
          dept.employees,
          date,
        )
        const idx = dailyWorkReports.findIndex(
          (r) =>
            r.departmentId === departmentId &&
            r.employeeId === a.employee.id &&
            r.date === date,
        )
        const base =
          idx >= 0
            ? dailyWorkReports[idx]
            : createEmptyDailyWorkReport(departmentId, a.employee.id, date)

        if (
          !base.workDone.trim() &&
          !base.programTopics.trim() &&
          !base.improveSuggestions.trim()
        ) {
          setToast(
            'Заполните тему, что сделали или предложения по улучшению',
          )
          return s
        }

        const now = new Date().toISOString()
        const next: DailyWorkReport = {
          ...base,
          planSubmittedAt: now,
          updatedAt: now,
          updatedByName: a.employee.name,
          controlStatus: base.controlStatus || 'pending',
          planReview: '',
        }
        if (idx >= 0) {
          dailyWorkReports = dailyWorkReports.map((r, i) =>
            i === idx ? next : r,
          )
        } else {
          dailyWorkReports = [...dailyWorkReports, next]
        }

        const message = `${a.employee.name}: ежедневный отчёт отправлен старшему`
        pushLocalNotification('Отчёт старшему', message)
        setToast('Отчёт отправлен старшему инструктору')
        return pushEvent(
          { ...s, dailyWorkReports },
          {
            employeeId: a.employee.id,
            employeeName: a.employee.name,
            departmentName: dept.name,
            type: 'daily_report',
            message,
          },
        )
      })
    },
    [],
  )

  const sendDepartmentBroadcast = useCallback(
    (input: {
      departmentId: string
      kind: 'day_plan' | 'general'
      voiceScript: string
      title?: string
      body?: string
    }) => {
      setState((s) => {
        const a = findActor(s)
        if (!canManageStaff(a, input.departmentId)) {
          setToast('Рассылку по отделу делает старший инструктор')
          return s
        }
        const dept = s.departments.find((d) => d.id === input.departmentId)
        if (!dept || !a) return s
        const voice = input.voiceScript.trim()
        if (!voice) {
          setToast('Пустой текст рассылки')
          return s
        }
        const title =
          input.title?.trim() ||
          (input.kind === 'day_plan'
            ? 'Рассылка · ежедневный отчёт'
            : 'Рассылка · сообщение отделу')
        const body =
          input.body?.trim() ||
          (input.kind === 'day_plan'
            ? 'Напоминание: отправьте ежедневный отчёт старшему инструктору'
            : voice)
        const broadcast: DepartmentBroadcast = {
          id: crypto.randomUUID(),
          departmentId: input.departmentId,
          fromEmployeeId: a.employee.id,
          fromName: a.employee.name,
          kind: input.kind,
          title,
          body,
          voiceScript: voice,
          createdAt: new Date().toISOString(),
        }
        pushLocalNotification(title, body)
        setToast('Рассылка ушла в отдел')
        return pushEvent(
          {
            ...s,
            broadcasts: [broadcast, ...(s.broadcasts ?? [])].slice(0, 80),
          },
          {
            employeeId: a.employee.id,
            employeeName: a.employee.name,
            departmentName: dept.name,
            type: 'broadcast',
            message: `${title}: ${body}`,
          },
        )
      })
    },
    [],
  )

  const sendChatMessage = useCallback(
    (departmentId: string, input: { text: string; attachments: ChatAttachment[] }) => {
      setState((s) => {
        const a = findActor(s)
        if (!canUseDeptChat(a, departmentId)) {
          setToast('Чат только для сотрудников этого отдела')
          return s
        }
        const text = input.text.trim()
        const attachments = input.attachments ?? []
        if (!text && attachments.length === 0) return s
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          departmentId,
          authorId: a!.employee.id,
          authorName: a!.employee.name,
          authorRole: a!.employee.role,
          text,
          attachments,
          createdAt: new Date().toISOString(),
        }
        return {
          ...s,
          chatMessages: pruneChatMessages([
            ...(s.chatMessages ?? []),
            msg,
          ]),
        }
      })
    },
    [],
  )

  /** Удалить своё сообщение — сразу пропадает у всех в отделе */
  const deleteChatMessage = useCallback(
    (departmentId: string, messageId: string) => {
      setState((s) => {
        const a = findActor(s)
        if (!canUseDeptChat(a, departmentId)) {
          setToast('Чат только для сотрудников этого отдела')
          return s
        }
        const msg = (s.chatMessages ?? []).find((m) => m.id === messageId)
        if (!msg || msg.departmentId !== departmentId) {
          setToast('Сообщение не найдено')
          return s
        }
        if (msg.authorId !== a!.employee.id) {
          setToast('Можно удалить только своё сообщение')
          return s
        }
        const mediaIds = msg.attachments.map((att) => att.id)
        void deleteChatBlobs(mediaIds)
        setToast('Сообщение удалено')
        return {
          ...s,
          chatMessages: (s.chatMessages ?? []).filter((m) => m.id !== messageId),
        }
      })
    },
    [],
  )

  const clearEvents = useCallback(() => {
    setState((s) => ({ ...s, events: [] }))
  }, [])

  const changeOwnPassword = useCallback(
    async (nextPassword: string) => {
      const trimmed = nextPassword.trim()
      if (trimmed.length < 4) {
        setToast('Пароль не короче 4 символов')
        return false
      }
      const acc = state.accounts.find((a) => a.id === state.sessionAccountId)
      if (!acc) return false
      if (acc.passwordChangedOnce && !acc.mustChangePassword) {
        setToast('Пароль уже меняли. Обратитесь к старшему инструктору для сброса')
        return false
      }
      const passwordHash = await hashPassword(acc.login, trimmed)
      setState((s) => ({
        ...s,
        accounts: s.accounts.map((a) =>
          a.id === acc.id
            ? {
                ...a,
                passwordHash,
                mustChangePassword: false,
                passwordChangedOnce: true,
              }
            : a,
        ),
      }))
      setToast('Пароль сохранён. Больше самостоятельно не меняется')
      return true
    },
    [state.accounts, state.sessionAccountId],
  )

  const resetEmployeeCredentials = useCallback(
    async (departmentId: string, employeeId: string, newLogin?: string) => {
      const a = findActor(state)
      if (!canManageStaff(a, departmentId)) {
        setToast('Восстанавливать доступы может только старший инструктор отдела')
        return
      }
      const emp = state.departments
        .find((d) => d.id === departmentId)
        ?.employees.find((e) => e.id === employeeId)
      if (!emp) return
      let login = (newLogin?.trim() || loginFromFio(emp.name))
      let n = 2
      while (
        state.accounts.some(
          (x) =>
            x.login.toLowerCase() === login.toLowerCase() &&
            x.employeeId !== employeeId,
        )
      ) {
        login = `${loginFromFio(emp.name)}${n}`
        n += 1
      }
      const passwordHash = await hashPassword(login, DEFAULT_STAFF_PASSWORD)
      setState((s) => {
        const exists = s.accounts.some((x) => x.employeeId === employeeId)
        const nextAcc = {
          id: `acc-${employeeId}`,
          login,
          passwordHash,
          employeeId,
          departmentId,
          mustChangePassword: true,
          passwordChangedOnce: false,
          isAdmin: false,
        }
        return {
          ...s,
          accounts: exists
            ? s.accounts.map((x) =>
                x.employeeId === employeeId ? { ...x, ...nextAcc, id: x.id } : x,
              )
            : [...s.accounts, nextAcc],
        }
      })
      setToast(
        `Доступ восстановлен: ${emp.name} · логин ${login} · пароль ${DEFAULT_STAFF_PASSWORD}`,
      )
    },
    [state],
  )

  const submitOvertimeRequest = useCallback(
    (input: { date: string; timeFrom: string; timeTo: string }) => {
      const a = findActor(state)
      if (!a) {
        setToast('Войдите в учётку')
        return
      }
      if (a.employee.role === 'senior_instructor') {
        setToast('Заявление подаёт инструктор или ассистент')
        return
      }
      const dept = state.departments.find((d) => d.id === a.departmentId)
      if (!dept) return
      const req: OvertimeRequest = {
        id: crypto.randomUUID(),
        employeeId: a.employee.id,
        employeeName: a.employee.name,
        employeeInitials: shortInitials(a.employee.name),
        departmentId: dept.id,
        departmentName: dept.name,
        roleTitle: roleTitleRu(a.employee.role),
        date: input.date,
        timeFrom: input.timeFrom,
        timeTo: input.timeTo,
        status: 'pending',
        createdAt: new Date().toISOString(),
        decidedAt: null,
        decidedByName: null,
      }
      const message = `${req.employeeInitials}: заявление на отлучение ${req.date} с ${req.timeFrom} до ${req.timeTo}`
      pushLocalNotification('Заявление по переработкам', message)
      setState((s) =>
        pushEvent(
          {
            ...s,
            overtimeRequests: [req, ...(s.overtimeRequests ?? [])],
          },
          {
            employeeId: req.employeeId,
            employeeName: req.employeeName,
            departmentName: req.departmentName,
            type: 'overtime_request',
            message,
          },
        ),
      )
      setToast('Заявление отправлено старшему инструктору')
    },
    [state],
  )

  const decideOvertimeRequest = useCallback(
    (requestId: string, status: 'approved' | 'rejected') => {
      setState((s) => {
        const a = findActor(s)
        const req = (s.overtimeRequests ?? []).find((r) => r.id === requestId)
        if (!req || !a || !canManageStaff(a, req.departmentId)) {
          setToast('Решение принимает старший инструктор отдела')
          return s
        }
        const label = status === 'approved' ? 'одобрено' : 'отклонено'
        setToast(`Заявление ${label}: ${req.employeeInitials}`)
        return {
          ...s,
          overtimeRequests: s.overtimeRequests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status,
                  decidedAt: new Date().toISOString(),
                  decidedByName: a.employee.name,
                }
              : r,
          ),
        }
      })
    },
    [],
  )

  const visibleDepartments = useMemo(() => {
    if (!actor) return []
    // Чужие отделы полностью скрыты: видит только свой (админ — все)
    if (actor.isAdmin) return state.departments
    return state.departments.filter((d) => d.id === actor.departmentId)
  }, [state.departments, actor])

  // Не-админ всегда «привязан» к своему отделу — чужой id не удерживаем
  useEffect(() => {
    if (!actor || actor.isAdmin) return
    if (state.activeDepartmentId === actor.departmentId) return
    setState((s) => {
      const a = findActor(s)
      if (!a || a.isAdmin) return s
      if (s.activeDepartmentId === a.departmentId) return s
      return { ...s, activeDepartmentId: a.departmentId }
    })
  }, [actor, state.activeDepartmentId])

  const activeDepartment =
    visibleDepartments.find((d) => d.id === state.activeDepartmentId) ??
    visibleDepartments[0] ??
    null

  const departmentAccounts = useMemo(() => {
    if (!activeDepartment) return []
    return state.accounts.filter((a) => a.departmentId === activeDepartment.id)
  }, [state.accounts, activeDepartment])

  const departmentOvertimeRequests = useMemo(() => {
    if (!activeDepartment) return []
    return (state.overtimeRequests ?? []).filter(
      (r) => r.departmentId === activeDepartment.id,
    )
  }, [state.overtimeRequests, activeDepartment])

  const departmentKnowledgeCuts = useMemo(() => {
    if (!activeDepartment) return []
    const period = monthKey(state.selectedYear, state.selectedMonth)
    const ensured = ensureKnowledgeCutsForDepartment(
      state.knowledgeCuts ?? [],
      activeDepartment.id,
      activeDepartment.employees,
      state.selectedYear,
      state.selectedMonth,
    )
    return ensured.filter(
      (c) =>
        c.departmentId === activeDepartment.id && c.period === period,
    )
  }, [
    activeDepartment,
    state.knowledgeCuts,
    state.selectedMonth,
    state.selectedYear,
  ])

  const departmentDailyReports = useMemo(() => {
    if (!activeDepartment) return []
    const date = todayKey()
    const ensured = ensureDailyWorkReportsForDepartment(
      state.dailyWorkReports ?? [],
      activeDepartment.id,
      activeDepartment.employees,
      date,
    )
    return ensured.filter(
      (r) =>
        r.departmentId === activeDepartment.id && r.date === date,
    )
  }, [activeDepartment, state.dailyWorkReports])

  const departmentChatMessages = useMemo(() => {
    if (!activeDepartment || !actor) return []
    if (!canUseDeptChat(actor, activeDepartment.id)) return []
    return (state.chatMessages ?? [])
      .filter((m) => m.departmentId === activeDepartment.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [activeDepartment, actor, state.chatMessages])

  const departmentBroadcasts = useMemo(() => {
    if (!actor) return []
    return (state.broadcasts ?? [])
      .filter((b) => b.departmentId === actor.departmentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [actor, state.broadcasts])

  const departmentSeniorLessons = useMemo(() => {
    if (!activeDepartment) return []
    return (state.seniorLessons ?? [])
      .filter((l) => l.departmentId === activeDepartment.id)
      .sort((a, b) => {
        const da = a.conductedDate || a.createdAt
        const db = b.conductedDate || b.createdAt
        return db.localeCompare(da)
      })
  }, [activeDepartment, state.seniorLessons])

  const departmentTmcItems = useMemo(() => {
    if (!activeDepartment || !actor) return []
    const all = (state.tmcItems ?? []).filter(
      (i) => i.departmentId === activeDepartment.id,
    )
    if (canManageStaff(actor, activeDepartment.id)) {
      return [...all].sort((a, b) => a.orderNo - b.orderNo || a.name.localeCompare(b.name, 'ru'))
    }
    return all
      .filter((i) => i.employeeId === actor.employee.id)
      .sort((a, b) => a.orderNo - b.orderNo || a.name.localeCompare(b.name, 'ru'))
  }, [activeDepartment, actor, state.tmcItems])

  const departmentTmcBoards = useMemo(() => {
    if (!activeDepartment || !actor) return []
    const all = (state.tmcBoards ?? []).filter(
      (b) => b.departmentId === activeDepartment.id,
    )
    if (canManageStaff(actor, activeDepartment.id)) return all
    return all.filter((b) => b.employeeId === actor.employee.id)
  }, [activeDepartment, actor, state.tmcBoards])

  const departmentTmcBaselines = useMemo(() => {
    if (!activeDepartment || !actor) return [] as TmcInventoryBaseline[]
    const all = (state.tmcBaselines ?? []).filter(
      (b) => b.departmentId === activeDepartment.id,
    )
    if (canManageStaff(actor, activeDepartment.id)) return all
    return all.filter((b) => b.employeeId === actor.employee.id)
  }, [activeDepartment, actor, state.tmcBaselines])

  const departmentTmcRequests = useMemo(() => {
    if (!activeDepartment || !actor) return [] as TmcEquipmentRequest[]
    const all = (state.tmcRequests ?? []).filter(
      (r) => r.departmentId === activeDepartment.id,
    )
    if (canManageStaff(actor, activeDepartment.id)) return all
    return all.filter((r) => r.employeeId === actor.employee.id)
  }, [activeDepartment, actor, state.tmcRequests])

  return {
    state,
    activeDepartment,
    visibleDepartments,
    currentUser,
    currentAccount,
    actor,
    isLoggedIn,
    needsPasswordChange,
    isSystemAdmin: !!actor?.isAdmin,
    departmentAccounts,
    departmentOvertimeRequests,
    departmentKnowledgeCuts,
    departmentDailyReports,
    departmentChatMessages,
    departmentBroadcasts,
    departmentSeniorLessons,
    departmentTmcItems,
    departmentTmcBoards,
    departmentTmcBaselines,
    departmentTmcRequests,
    toast,
    authError,
    authBusy,
    dismissToast: () => setToast(null),
    login,
    logout,
    changeOwnPassword,
    resetEmployeeCredentials,
    submitOvertimeRequest,
    decideOvertimeRequest,
    updateKnowledgeCut,
    updateDailyWorkReport,
    upsertSeniorLesson,
    deleteSeniorLesson,
    upsertTmcItem,
    deleteTmcItem,
    clearEmployeeTmcItems,
    snapshotTmcInventory,
    upsertTmcBoard,
    deleteTmcBoard,
    addTmcBoardsBulk,
    importTmcItems,
    upsertTmcRequest,
    decideTmcRequest,
    deleteTmcRequest,
    submitDailyReportToSenior,
    sendDepartmentBroadcast,
    sendChatMessage,
    deleteChatMessage,
    setActiveDepartment,
    renameDepartment,
    addDepartment,
    removeDepartment,
    addEmployee,
    removeEmployee,
    renameEmployee,
    setDayStatus,
    setOvertime,
    setRole,
    setLocation,
    checkIn,
    checkOut,
    setMonth,
    clearEvents,
    quotas: DAYS_OFF_QUOTA,
    workDayHours: WORK_DAY_HOURS,
    isSaturday,
  }
}

export type AppActions = ReturnType<typeof useAppState>
