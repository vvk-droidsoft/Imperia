import type {
  AppState,
  ChatAttachment,
  ChatAttachmentKind,
  ChatMessage,
  DailyControlStatus,
  DepartmentBroadcast,
  DailyWorkReport,
  DayCell,
  DayPlanReview,
  Employee,
  KnowledgeCut,
  MeetingFormat,
  MonthSchedule,
  Role,
  SeniorLessonRecord,
  TmcBoard,
  TmcBoardKind,
  TmcBoardStatus,
  TmcEquipmentRequest,
  TmcInventoryBaseline,
  TmcItem,
  TmcItemCondition,
  TmcRequestKind,
  TmcRequestLine,
  TmcRequestStatus,
  UserAccount,
} from '../types'
import {
  TMC_BOARD_KINDS,
  TMC_BOARD_STATUSES,
  TMC_ITEM_CONDITIONS,
  TMC_REQUEST_KINDS,
  TMC_REQUEST_STATUSES,
} from '../types'
import {
  DEPT_17_ID,
  DEFAULT_STAFF_PASSWORD,
  hashPassword,
  loginFromFio,
  MALYUGO_EMPLOYEE_ID,
  MALYUGO_LOGIN,
  MALYUGO_PASSWORD_HASH,
} from './auth'
import {
  daysInMonth,
  monthKey,
  previousMonthKey,
  sumDayOvertime,
} from './rules'

const STORAGE_KEY = 'personnel-duty-v12'
/** Одноразовая очистка ТМЦ: инструкторы вводят оборудование заново вручную */
const TMC_MANUAL_WIPE_FLAG = 'personnel-duty-tmc-manual-wipe-v1'
const LEGACY_STORAGE_KEYS = [
  'personnel-duty-v11',
  'personnel-duty-v10',
  'personnel-duty-v9',
  'personnel-duty-v8',
  'personnel-duty-v7',
  'personnel-duty-v6',
  'personnel-duty-v5',
  'personnel-duty-v4',
  'personnel-duty-v3',
  'personnel-duty-v2',
  'personnel-duty-v1',
] as const
const VALID_ROLES: Role[] = ['senior_instructor', 'instructor', 'assistant']
const VALID_FORMATS: MeetingFormat[] = ['in_person', 'remote']
const VALID_DAILY_CONTROL: DailyControlStatus[] = [
  'pending',
  'ok',
  'attention',
  'fail',
]
const VALID_DAY_PLAN_REVIEW: DayPlanReview[] = ['best', 'revise']
const LEGACY_DAY_PLAN_REVIEW: Record<string, DayPlanReview> = {
  excellent: 'best',
  good: 'best',
  revise: 'revise',
  best: 'best',
}
const VALID_CHAT_KINDS: ChatAttachmentKind[] = [
  'image',
  'video',
  'audio',
  'file',
]
/** Сколько последних сообщений чата хранить на отдел */
export const MAX_CHAT_MESSAGES_PER_DEPT = 100

function normalizeChatAttachment(
  raw: Partial<ChatAttachment>,
): ChatAttachment | null {
  const hasInline = typeof raw.dataUrl === 'string' && !!raw.dataUrl
  const id = raw.id ?? (hasInline ? crypto.randomUUID() : '')
  if (!id) return null
  const kind =
    raw.kind && VALID_CHAT_KINDS.includes(raw.kind) ? raw.kind : 'file'
  return {
    id,
    kind,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'файл',
    mime: typeof raw.mime === 'string' ? raw.mime : 'application/octet-stream',
    size: Math.max(0, Number(raw.size) || 0),
    // Не тащим тяжёлые dataUrl в localStorage — только мелкие legacy
    dataUrl:
      hasInline && raw.dataUrl!.length < 200_000 ? raw.dataUrl : undefined,
  }
}

/** Метаданные чата без бинарных dataUrl — файлы в IndexedDB */
export function stripChatPayloadForStorage(
  messages: ChatMessage[],
): ChatMessage[] {
  return pruneChatMessages(messages).map((m) => ({
    ...m,
    attachments: m.attachments.map(({ dataUrl: _drop, ...meta }) => meta),
  }))
}

function normalizeChatMessage(raw: Partial<ChatMessage>): ChatMessage | null {
  if (!raw.departmentId || !raw.authorId || !raw.createdAt) return null
  const role =
    raw.authorRole && VALID_ROLES.includes(raw.authorRole)
      ? raw.authorRole
      : 'instructor'
  const attachments = (
    Array.isArray(raw.attachments) ? raw.attachments : []
  )
    .map((a) => normalizeChatAttachment(a))
    .filter((a): a is ChatAttachment => !!a)
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    authorId: raw.authorId,
    authorName:
      typeof raw.authorName === 'string' && raw.authorName
        ? raw.authorName
        : 'Сотрудник',
    authorRole: role,
    text: typeof raw.text === 'string' ? raw.text : '',
    attachments,
    createdAt: raw.createdAt,
  }
}

export function pruneChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const byDept = new Map<string, ChatMessage[]>()
  for (const msg of messages) {
    const list = byDept.get(msg.departmentId) ?? []
    list.push(msg)
    byDept.set(msg.departmentId, list)
  }
  const out: ChatMessage[] = []
  for (const list of byDept.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    out.push(...list.slice(-MAX_CHAT_MESSAGES_PER_DEPT))
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function todayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function createEmptyDailyWorkReport(
  departmentId: string,
  employeeId: string,
  date: string,
): DailyWorkReport {
  return {
    id: crypto.randomUUID(),
    departmentId,
    employeeId,
    date,
    workDone: '',
    programTopics: '',
    improveSuggestions: '',
    planFileId: null,
    planFileName: '',
    planMime: '',
    planSize: 0,
    planUploadedAt: null,
    planSubmittedAt: null,
    planReview: '',
    seniorNote: '',
    controlStatus: '',
    updatedAt: null,
    updatedByName: null,
  }
}

export function createEmptySeniorLesson(
  departmentId: string,
  instructorId: string,
  instructorName: string,
): SeniorLessonRecord {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    departmentId,
    instructorId,
    instructorName,
    topic: '',
    groupNumber: '',
    stream: '',
    conductedDate: '',
    planFileId: null,
    planFileName: '',
    planMime: '',
    planSize: 0,
    planUploadedAt: null,
    note: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeSeniorLesson(
  raw: Partial<SeniorLessonRecord>,
): SeniorLessonRecord | null {
  if (!raw.departmentId || !raw.instructorId) return null
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    instructorId: raw.instructorId,
    instructorName:
      typeof raw.instructorName === 'string' && raw.instructorName
        ? raw.instructorName
        : 'Старший инструктор',
    topic: typeof raw.topic === 'string' ? raw.topic : '',
    groupNumber: typeof raw.groupNumber === 'string' ? raw.groupNumber : '',
    stream: typeof raw.stream === 'string' ? raw.stream : '',
    conductedDate:
      typeof raw.conductedDate === 'string' ? raw.conductedDate : '',
    planFileId:
      typeof raw.planFileId === 'string' && raw.planFileId
        ? raw.planFileId
        : null,
    planFileName:
      typeof raw.planFileName === 'string' ? raw.planFileName : '',
    planMime: typeof raw.planMime === 'string' ? raw.planMime : '',
    planSize: Math.max(0, Number(raw.planSize) || 0),
    planUploadedAt: raw.planUploadedAt ?? null,
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date().toISOString(),
  }
}

export function normalizeTmcItem(raw: Partial<TmcItem>): TmcItem | null {
  if (!raw.departmentId || !raw.employeeId) return null
  const now = new Date().toISOString()
  const condition =
    raw.condition && TMC_ITEM_CONDITIONS.includes(raw.condition)
      ? raw.condition
      : ('ok' as TmcItemCondition)
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    employeeId: raw.employeeId,
    category: typeof raw.category === 'string' ? raw.category : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    quantity: typeof raw.quantity === 'string' ? raw.quantity : '1',
    condition,
    brand: typeof raw.brand === 'string' ? raw.brand : '',
    model: typeof raw.model === 'string' ? raw.model : '',
    serial: typeof raw.serial === 'string' ? raw.serial : '',
    warehouseNumber:
      typeof raw.warehouseNumber === 'string' ? raw.warehouseNumber : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    orderNo: Math.max(0, Number(raw.orderNo) || 0),
    positionNo: Math.max(0, Number(raw.positionNo) || 0),
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
  }
}

export function normalizeTmcBoard(raw: Partial<TmcBoard>): TmcBoard | null {
  if (!raw.departmentId || !raw.employeeId) return null
  const kind =
    raw.kind && TMC_BOARD_KINDS.includes(raw.kind as TmcBoardKind)
      ? (raw.kind as TmcBoardKind)
      : null
  if (!kind) return null
  const status =
    raw.status && TMC_BOARD_STATUSES.includes(raw.status as TmcBoardStatus)
      ? (raw.status as TmcBoardStatus)
      : 'intact'
  const now = new Date().toISOString()
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    employeeId: raw.employeeId,
    kind,
    status,
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
  }
}

export function normalizeTmcBaseline(
  raw: Partial<TmcInventoryBaseline>,
): TmcInventoryBaseline | null {
  if (!raw.departmentId || !raw.employeeId) return null
  const items = Array.isArray(raw.items)
    ? raw.items.map((i) => {
        const condition =
          i.condition && TMC_ITEM_CONDITIONS.includes(i.condition)
            ? i.condition
            : ('ok' as TmcItemCondition)
        return {
          category: typeof i.category === 'string' ? i.category : '',
          name: typeof i.name === 'string' ? i.name : '',
          quantity: typeof i.quantity === 'string' ? i.quantity : '',
          condition,
          brand: typeof i.brand === 'string' ? i.brand : '',
          model: typeof i.model === 'string' ? i.model : '',
          serial: typeof i.serial === 'string' ? i.serial : '',
          warehouseNumber:
            typeof i.warehouseNumber === 'string' ? i.warehouseNumber : '',
          note: typeof i.note === 'string' ? i.note : '',
        }
      })
    : []
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    employeeId: raw.employeeId,
    takenAt: raw.takenAt ?? new Date().toISOString(),
    sourceFileName:
      typeof raw.sourceFileName === 'string' ? raw.sourceFileName : '',
    items,
  }
}

function normalizeTmcRequestLine(raw: Partial<TmcRequestLine>): TmcRequestLine {
  const condition =
    raw.condition && TMC_ITEM_CONDITIONS.includes(raw.condition)
      ? raw.condition
      : ('ok' as TmcItemCondition)
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: typeof raw.name === 'string' ? raw.name : '',
    warehouseNumber:
      typeof raw.warehouseNumber === 'string' ? raw.warehouseNumber : '',
    quantity: typeof raw.quantity === 'string' ? raw.quantity : '1',
    condition,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    sourceItemId:
      typeof raw.sourceItemId === 'string' ? raw.sourceItemId : null,
  }
}

export function normalizeTmcRequest(
  raw: Partial<TmcEquipmentRequest>,
): TmcEquipmentRequest | null {
  if (!raw.departmentId || !raw.employeeId) return null
  const kind =
    raw.kind && TMC_REQUEST_KINDS.includes(raw.kind as TmcRequestKind)
      ? (raw.kind as TmcRequestKind)
      : null
  if (!kind) return null
  const status =
    raw.status && TMC_REQUEST_STATUSES.includes(raw.status as TmcRequestStatus)
      ? (raw.status as TmcRequestStatus)
      : ('draft' as TmcRequestStatus)
  const now = new Date().toISOString()
  const lines = Array.isArray(raw.lines)
    ? raw.lines.map((l) => normalizeTmcRequestLine(l))
    : []
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    employeeId: raw.employeeId,
    employeeName: typeof raw.employeeName === 'string' ? raw.employeeName : '',
    kind,
    status,
    title: typeof raw.title === 'string' ? raw.title : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    docDate: typeof raw.docDate === 'string' ? raw.docDate : '',
    requestNo: typeof raw.requestNo === 'string' ? raw.requestNo : '',
    streamNo: typeof raw.streamNo === 'string' ? raw.streamNo : '',
    groupNo: typeof raw.groupNo === 'string' ? raw.groupNo : '',
    cabinet: typeof raw.cabinet === 'string' ? raw.cabinet : '',
    roleTitle: typeof raw.roleTitle === 'string' ? raw.roleTitle : 'инструктор',
    addressee:
      typeof raw.addressee === 'string'
        ? raw.addressee
        : 'Руководителю управления организационной работой',
    lines,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
    submittedAt: raw.submittedAt ?? null,
    decidedAt: raw.decidedAt ?? null,
    decidedByEmployeeId: raw.decidedByEmployeeId ?? null,
    decidedByName: raw.decidedByName ?? null,
    decisionNote: typeof raw.decisionNote === 'string' ? raw.decisionNote : '',
  }
}

function normalizeDailyWorkReport(
  raw: Partial<DailyWorkReport>,
): DailyWorkReport | null {
  if (!raw.departmentId || !raw.employeeId || !raw.date) return null
  const controlStatus =
    raw.controlStatus &&
    VALID_DAILY_CONTROL.includes(raw.controlStatus as DailyControlStatus)
      ? (raw.controlStatus as DailyControlStatus)
      : ''
  const rawReview = typeof raw.planReview === 'string' ? raw.planReview : ''
  const planReview =
    rawReview && VALID_DAY_PLAN_REVIEW.includes(rawReview as DayPlanReview)
      ? (rawReview as DayPlanReview)
      : LEGACY_DAY_PLAN_REVIEW[rawReview] ?? ''
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    employeeId: raw.employeeId,
    date: raw.date,
    workDone: typeof raw.workDone === 'string' ? raw.workDone : '',
    programTopics:
      typeof raw.programTopics === 'string' ? raw.programTopics : '',
    improveSuggestions:
      typeof (raw as DailyWorkReport).improveSuggestions === 'string'
        ? (raw as DailyWorkReport).improveSuggestions
        : '',
    planFileId:
      typeof raw.planFileId === 'string' && raw.planFileId
        ? raw.planFileId
        : null,
    planFileName:
      typeof raw.planFileName === 'string' ? raw.planFileName : '',
    planMime: typeof raw.planMime === 'string' ? raw.planMime : '',
    planSize: Math.max(0, Number(raw.planSize) || 0),
    planUploadedAt: raw.planUploadedAt ?? null,
    planSubmittedAt: raw.planSubmittedAt ?? null,
    planReview,
    seniorNote: typeof raw.seniorNote === 'string' ? raw.seniorNote : '',
    controlStatus,
    updatedAt: raw.updatedAt ?? null,
    updatedByName: raw.updatedByName ?? null,
  }
}

/** Отчёты за дату: инструкторы и ассистенты отдела */
export function ensureDailyWorkReportsForDepartment(
  reports: DailyWorkReport[],
  departmentId: string,
  employees: Employee[],
  date: string,
): DailyWorkReport[] {
  const subjects = employees.filter((e) => e.role !== 'senior_instructor')
  const next = [...reports]
  for (const emp of subjects) {
    const exists = next.some(
      (r) =>
        r.departmentId === departmentId &&
        r.employeeId === emp.id &&
        r.date === date,
    )
    if (!exists) {
      next.push(createEmptyDailyWorkReport(departmentId, emp.id, date))
    }
  }
  return next
}

export function createEmptyKnowledgeCut(
  departmentId: string,
  employeeId: string,
  period: string,
): KnowledgeCut {
  return {
    id: crypto.randomUUID(),
    departmentId,
    employeeId,
    period,
    plannedDate: '',
    conductedDate: '',
    format: '',
    assignment: '',
    theory: null,
    practice: null,
    methodology: null,
    reportFileId: null,
    reportFileName: '',
    reportMime: '',
    reportSize: 0,
    reportUploadedAt: null,
    updatedAt: null,
    assessedByName: null,
  }
}

function normalizeScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const clamped = Math.round(n)
  if (clamped < 1 || clamped > 5) return null
  return clamped
}

function normalizeKnowledgeCut(raw: Partial<KnowledgeCut>): KnowledgeCut | null {
  if (!raw.departmentId || !raw.employeeId || !raw.period) return null
  const format =
    raw.format && VALID_FORMATS.includes(raw.format as MeetingFormat)
      ? (raw.format as MeetingFormat)
      : ''
  return {
    id: raw.id ?? crypto.randomUUID(),
    departmentId: raw.departmentId,
    employeeId: raw.employeeId,
    period: raw.period,
    plannedDate: typeof raw.plannedDate === 'string' ? raw.plannedDate : '',
    conductedDate:
      typeof raw.conductedDate === 'string' ? raw.conductedDate : '',
    format,
    assignment: typeof raw.assignment === 'string' ? raw.assignment : '',
    theory: normalizeScore(raw.theory),
    practice: normalizeScore(raw.practice),
    methodology: normalizeScore(raw.methodology),
    reportFileId:
      typeof raw.reportFileId === 'string' && raw.reportFileId
        ? raw.reportFileId
        : null,
    reportFileName:
      typeof raw.reportFileName === 'string' ? raw.reportFileName : '',
    reportMime: typeof raw.reportMime === 'string' ? raw.reportMime : '',
    reportSize: Math.max(0, Number(raw.reportSize) || 0),
    reportUploadedAt: raw.reportUploadedAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    assessedByName: raw.assessedByName ?? null,
  }
}

/** Строки среза на месяц: весь состав отдела, кроме старших инструкторов */
export function ensureKnowledgeCutsForDepartment(
  cuts: KnowledgeCut[],
  departmentId: string,
  employees: Employee[],
  year: number,
  month: number,
): KnowledgeCut[] {
  const period = monthKey(year, month)
  const subjects = employees.filter((e) => e.role !== 'senior_instructor')
  const next = [...cuts]
  for (const emp of subjects) {
    const exists = next.some(
      (c) =>
        c.departmentId === departmentId &&
        c.employeeId === emp.id &&
        c.period === period,
    )
    if (!exists) {
      next.push(createEmptyKnowledgeCut(departmentId, emp.id, period))
    }
  }
  return next
}

export function emptyDays(): DayCell[] {
  return Array.from({ length: 31 }, () => ({
    status: 'work' as const,
    overtimeHours: 0,
  }))
}

export function createEmployee(
  name: string,
  role: Role = 'instructor',
  id?: string,
): Employee {
  const now = new Date()
  const key = monthKey(now.getFullYear(), now.getMonth())
  return {
    id: id ?? crypto.randomUUID(),
    name,
    role,
    location: 'lik',
    attendance: 'out',
    lastCheckIn: null,
    lastCheckOut: null,
    months: {
      [key]: { days: emptyDays(), carriedIn: 0 },
    },
  }
}

function normalizeDays(raw: unknown): DayCell[] {
  if (!Array.isArray(raw) || raw.length < 31) return emptyDays()
  return raw.slice(0, 31).map((cell) => {
    const c = cell as Partial<DayCell>
    return {
      status:
        c.status === 'off' || c.status === 'trip' || c.status === 'sick'
          ? c.status
          : 'work',
      overtimeHours: Math.max(0, Number(c.overtimeHours) || 0),
    }
  })
}

function normalizeMonths(
  raw: Partial<Employee> & { days?: DayCell[] },
): Record<string, MonthSchedule> {
  if (raw.months && typeof raw.months === 'object') {
    const out: Record<string, MonthSchedule> = {}
    for (const [key, value] of Object.entries(raw.months)) {
      out[key] = {
        days: normalizeDays(value?.days),
        carriedIn: Math.max(0, Number(value?.carriedIn) || 0),
      }
    }
    if (Object.keys(out).length) return out
  }
  const now = new Date()
  const key = monthKey(now.getFullYear(), now.getMonth())
  return {
    [key]: {
      days: normalizeDays(raw.days),
      carriedIn: 0,
    },
  }
}

function normalizeEmployee(
  raw: Partial<Employee> & { name?: string; days?: DayCell[] },
): Employee {
  const role =
    raw.role && VALID_ROLES.includes(raw.role) ? raw.role : 'instructor'
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name?.trim() || 'Без имени',
    role,
    location: raw.location ?? 'lik',
    attendance: raw.attendance === 'in' ? 'in' : 'out',
    lastCheckIn: raw.lastCheckIn ?? null,
    lastCheckOut: raw.lastCheckOut ?? null,
    months: normalizeMonths(raw),
  }
}

export function ensureEmployeeMonth(
  emp: Employee,
  year: number,
  month: number,
): Employee {
  const key = monthKey(year, month)
  if (emp.months[key]) return emp

  const prev = previousMonthKey(year, month)
  const prevSched = emp.months[prev.key]
  let carriedIn = 0
  if (prevSched) {
    const dayCount = daysInMonth(prev.year, prev.month)
    carriedIn =
      (prevSched.carriedIn || 0) + sumDayOvertime(prevSched.days, dayCount)
  }

  return {
    ...emp,
    months: {
      ...emp.months,
      [key]: { days: emptyDays(), carriedIn },
    },
  }
}

export function getMonthSchedule(
  emp: Employee,
  year: number,
  month: number,
): MonthSchedule {
  const ensured = ensureEmployeeMonth(emp, year, month)
  return ensured.months[monthKey(year, month)]
}

export function createMalyugoAccount(): UserAccount {
  return {
    id: 'acc-malyugo-dn',
    login: MALYUGO_LOGIN,
    passwordHash: MALYUGO_PASSWORD_HASH,
    employeeId: MALYUGO_EMPLOYEE_ID,
    departmentId: DEPT_17_ID,
    mustChangePassword: false,
    passwordChangedOnce: true,
    isAdmin: true,
  }
}

export async function createStaffAccount(params: {
  employeeId: string
  departmentId: string
  fullName: string
  forceReset?: boolean
}): Promise<UserAccount> {
  const login = loginFromFio(params.fullName)
  const passwordHash = await hashPassword(login, DEFAULT_STAFF_PASSWORD)
  return {
    id: `acc-${params.employeeId}`,
    login,
    passwordHash,
    employeeId: params.employeeId,
    departmentId: params.departmentId,
    mustChangePassword: true,
    passwordChangedOnce: false,
    isAdmin: false,
  }
}

/** Исходный состав 17 отдела (ФИО без удвоений букв, как в Империи БАС). */
export const DEPT_17_ROSTER: { id: string; name: string; role: Role }[] = [
  {
    id: MALYUGO_EMPLOYEE_ID,
    name: 'Малюго Дмитрий Николаевич',
    role: 'senior_instructor',
  },
  {
    id: 'emp-balabaev-ayu',
    name: 'Балабаев Антон Юрьевич',
    role: 'instructor',
  },
  {
    id: 'emp-gavshin-da',
    name: 'Гавшин Дмитрий Алексеевич',
    role: 'instructor',
  },
  {
    id: 'emp-mishurov-ai',
    name: 'Мишуров Алексей Игоревич',
    role: 'instructor',
  },
  {
    id: 'emp-purtov-aa',
    name: 'Пуртов Андрей Александрович',
    role: 'instructor',
  },
  {
    id: 'emp-gornyakov-ayu',
    name: 'Горняков Андрей Юрьевич',
    role: 'assistant',
  },
  {
    id: 'emp-kuzmin-ii',
    name: 'Кузьмин Иван Иванович',
    role: 'assistant',
  },
  {
    id: 'emp-kurbatov-vv',
    name: 'Курбатов Валерий Владимирович',
    role: 'assistant',
  },
  {
    id: 'emp-lukyanov-sy',
    name: 'Лукьянов Сергей Юрьевич',
    role: 'assistant',
  },
  {
    id: 'emp-taratynov-yy',
    name: 'Таратынов Юрий Яковлевич',
    role: 'assistant',
  },
  {
    id: 'emp-tkach-ea',
    name: 'Ткач Евгений Александрович',
    role: 'assistant',
  },
]

function normPersonKey(name: string): string {
  return name
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/(.)\1+/g, '$1')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

export function createDept17(): AppState['departments'][number] {
  return {
    id: DEPT_17_ID,
    name: '17 отдел',
    employees: DEPT_17_ROSTER.map((row) =>
      createEmployee(row.name, row.role, row.id),
    ),
  }
}

/** Дописывает исходный состав 17 отдела, если кого-то нет. */
function ensureDept17Roster(state: AppState): AppState {
  const deptIdx = state.departments.findIndex((d) => d.id === DEPT_17_ID)
  if (deptIdx === -1) {
    return {
      ...state,
      departments: [createDept17(), ...state.departments],
    }
  }

  const dept = state.departments[deptIdx]
  const byId = new Map(dept.employees.map((e) => [e.id, e]))
  const byName = new Map(
    dept.employees.map((e) => [normPersonKey(e.name), e]),
  )
  let changed = false
  const idRemap = new Map<string, string>()
  const nextEmployees = [...dept.employees]

  for (const row of DEPT_17_ROSTER) {
    const existing =
      byId.get(row.id) || byName.get(normPersonKey(row.name))
    if (existing) {
      if (
        existing.id !== row.id ||
        existing.name !== row.name ||
        existing.role !== row.role
      ) {
        const idx = nextEmployees.findIndex((e) => e.id === existing.id)
        if (idx >= 0) {
          if (existing.id !== row.id) idRemap.set(existing.id, row.id)
          nextEmployees[idx] = {
            ...existing,
            id: row.id,
            name: row.name,
            role: row.role,
          }
          changed = true
        }
      }
      continue
    }
    nextEmployees.push(createEmployee(row.name, row.role, row.id))
    changed = true
  }

  if (!changed) return state

  const mapId = (id: string) => idRemap.get(id) ?? id
  const departments = [...state.departments]
  departments[deptIdx] = {
    ...dept,
    name: '17 отдел',
    employees: nextEmployees,
  }

  return {
    ...state,
    departments,
    accounts: (state.accounts ?? []).map((a) =>
      idRemap.has(a.employeeId)
        ? { ...a, employeeId: mapId(a.employeeId), departmentId: DEPT_17_ID }
        : a,
    ),
    knowledgeCuts: (state.knowledgeCuts ?? []).map((k) =>
      k.departmentId === DEPT_17_ID && idRemap.has(k.employeeId)
        ? { ...k, employeeId: mapId(k.employeeId) }
        : k,
    ),
    dailyWorkReports: (state.dailyWorkReports ?? []).map((r) =>
      r.departmentId === DEPT_17_ID && idRemap.has(r.employeeId)
        ? { ...r, employeeId: mapId(r.employeeId) }
        : r,
    ),
  }
}

export function createDefaultState(): AppState {
  const dept17 = createDept17()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  return {
    departments: [dept17],
    accounts: [createMalyugoAccount()],
    overtimeRequests: [],
    knowledgeCuts: ensureKnowledgeCutsForDepartment(
      [],
      DEPT_17_ID,
      dept17.employees,
      year,
      month,
    ),
    dailyWorkReports: ensureDailyWorkReportsForDepartment(
      [],
      DEPT_17_ID,
      dept17.employees,
      todayKey(now),
    ),
    chatMessages: [],
    broadcasts: [],
    seniorLessons: [],
    tmcItems: [],
    tmcBoards: [],
    tmcBaselines: [],
    tmcRequests: [],
    activeDepartmentId: DEPT_17_ID,
    currentUserId: null,
    sessionAccountId: null,
    events: [],
    selectedMonth: month,
    selectedYear: year,
  }
}

function normalizeAccount(raw: Partial<UserAccount>): UserAccount | null {
  if (!raw.employeeId || !raw.login || !raw.passwordHash || !raw.departmentId) {
    return null
  }
  const isMalyugo = raw.employeeId === MALYUGO_EMPLOYEE_ID
  return {
    id: raw.id ?? `acc-${raw.employeeId}`,
    login: raw.login,
    passwordHash: raw.passwordHash,
    employeeId: raw.employeeId,
    departmentId: raw.departmentId,
    mustChangePassword: raw.mustChangePassword ?? !isMalyugo,
    passwordChangedOnce: raw.passwordChangedOnce ?? isMalyugo,
    isAdmin: raw.isAdmin ?? isMalyugo,
  }
}

function ensureMalyugoPresent(state: AppState): AppState {
  state = ensureDept17Roster(state)
  let departments = [...state.departments]
  let accounts = [...(state.accounts ?? [])]

  const deptIdx = departments.findIndex((d) => d.id === DEPT_17_ID)
  if (deptIdx === -1) {
    departments = [createDept17(), ...departments]
  } else {
    const dept = departments[deptIdx]
    const hasEmp = dept.employees.some((e) => e.id === MALYUGO_EMPLOYEE_ID)
    if (!hasEmp) {
      departments[deptIdx] = {
        ...dept,
        name: dept.name || '17 отдел',
        employees: [
          createEmployee(
            'Малюго Дмитрий Николаевич',
            'senior_instructor',
            MALYUGO_EMPLOYEE_ID,
          ),
          ...dept.employees,
        ],
      }
    } else {
      departments[deptIdx] = {
        ...dept,
        name: '17 отдел',
        employees: dept.employees.map((e) =>
          e.id === MALYUGO_EMPLOYEE_ID
            ? {
                ...e,
                name: 'Малюго Дмитрий Николаевич',
                role: 'senior_instructor' as const,
              }
            : e,
        ),
      }
    }
  }

  if (!accounts.some((a) => a.employeeId === MALYUGO_EMPLOYEE_ID)) {
    accounts = [createMalyugoAccount(), ...accounts]
  } else {
    accounts = accounts.map((a) =>
      a.employeeId === MALYUGO_EMPLOYEE_ID
        ? {
            ...createMalyugoAccount(),
            id: a.id,
            isAdmin: true,
          }
        : { ...a, isAdmin: a.isAdmin ?? false },
    )
  }

  const year = state.selectedYear
  const month = state.selectedMonth
  const dept17 = departments.find((d) => d.id === DEPT_17_ID)
  const knowledgeCuts = ensureKnowledgeCutsForDepartment(
    state.knowledgeCuts ?? [],
    DEPT_17_ID,
    dept17?.employees ?? [],
    year,
    month,
  )
  const dailyWorkReports = ensureDailyWorkReportsForDepartment(
    state.dailyWorkReports ?? [],
    DEPT_17_ID,
    dept17?.employees ?? [],
    todayKey(),
  )

  return {
    ...state,
    departments,
    accounts,
    overtimeRequests: state.overtimeRequests ?? [],
    knowledgeCuts,
    dailyWorkReports,
    chatMessages: pruneChatMessages(state.chatMessages ?? []),
    broadcasts: Array.isArray(state.broadcasts) ? state.broadcasts : [],
    seniorLessons: Array.isArray(state.seniorLessons)
      ? state.seniorLessons
          .map((r) => normalizeSeniorLesson(r))
          .filter((r): r is SeniorLessonRecord => !!r)
      : [],
    tmcItems: Array.isArray(state.tmcItems)
      ? state.tmcItems
          .map((r) => normalizeTmcItem(r))
          .filter((r): r is TmcItem => !!r)
      : [],
    tmcBoards: Array.isArray(state.tmcBoards)
      ? state.tmcBoards
          .map((r) => normalizeTmcBoard(r))
          .filter((r): r is TmcBoard => !!r)
      : [],
    tmcBaselines: Array.isArray(state.tmcBaselines)
      ? state.tmcBaselines
          .map((r) => normalizeTmcBaseline(r))
          .filter((r): r is TmcInventoryBaseline => !!r)
      : [],
    tmcRequests: Array.isArray(state.tmcRequests)
      ? state.tmcRequests
          .map((r) => normalizeTmcRequest(r))
          .filter((r): r is TmcEquipmentRequest => !!r)
      : [],
  }
}

/** Создаёт учётки инструкторам/ассистентам со стартовым паролем 1234 */
export async function ensureStaffAccounts(state: AppState): Promise<AppState> {
  const accounts = [...state.accounts]
  let changed = false

  for (const dept of state.departments) {
    for (const emp of dept.employees) {
      if (emp.role === 'senior_instructor' && emp.id === MALYUGO_EMPLOYEE_ID) {
        continue
      }
      if (emp.role === 'senior_instructor') {
        // другим старшим тоже учётка, но без принудительной смены если уже есть
      }
      const existing = accounts.find((a) => a.employeeId === emp.id)
      if (!existing) {
        const acc = await createStaffAccount({
          employeeId: emp.id,
          departmentId: dept.id,
          fullName: emp.name,
        })
        // unique login if collision
        let login = acc.login
        let n = 2
        while (
          accounts.some(
            (a) => a.login.toLowerCase() === login.toLowerCase() && a.employeeId !== emp.id,
          )
        ) {
          login = `${acc.login}${n}`
          n += 1
        }
        if (login !== acc.login) {
          acc.login = login
          acc.passwordHash = await hashPassword(login, DEFAULT_STAFF_PASSWORD)
        }
        accounts.push(acc)
        changed = true
      }
    }
  }

  // drop accounts for removed employees (except keep malyugo)
  const empIds = new Set(
    state.departments.flatMap((d) => d.employees.map((e) => e.id)),
  )
  const pruned = accounts.filter(
    (a) => a.employeeId === MALYUGO_EMPLOYEE_ID || empIds.has(a.employeeId),
  )
  if (pruned.length !== accounts.length) changed = true

  if (!changed && pruned === accounts) return state
  return { ...state, accounts: pruned }
}

export function loadState(): AppState {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY)
    let raw = currentRaw
    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        const legacy = localStorage.getItem(key)
        if (legacy) {
          raw = legacy
          break
        }
      }
    }
    if (!raw) return createDefaultState()
    const wipeTmc = !localStorage.getItem(TMC_MANUAL_WIPE_FLAG)
    if (wipeTmc) localStorage.setItem(TMC_MANUAL_WIPE_FLAG, '1')
    const parsed = JSON.parse(raw) as Partial<AppState> & {
      departments: Array<{
        id?: string
        name?: string
        employees: Array<Partial<Employee> & { days?: DayCell[] }>
      }>
    }
    if (!parsed.departments?.length) return createDefaultState()

    const departments = parsed.departments.map((d) => ({
      id: d.id ?? crypto.randomUUID(),
      name: d.name ?? 'Отдел',
      employees: (d.employees ?? []).map((e) => normalizeEmployee(e)),
    }))

    const year = parsed.selectedYear ?? new Date().getFullYear()
    const month = parsed.selectedMonth ?? new Date().getMonth()

    const accounts = (Array.isArray(parsed.accounts) ? parsed.accounts : [])
      .map((a) => normalizeAccount(a))
      .filter((a): a is UserAccount => !!a)

    const knowledgeCuts = (
      Array.isArray(parsed.knowledgeCuts) ? parsed.knowledgeCuts : []
    )
      .map((c) => normalizeKnowledgeCut(c))
      .filter((c): c is KnowledgeCut => !!c)

    const dailyWorkReports = (
      Array.isArray(parsed.dailyWorkReports) ? parsed.dailyWorkReports : []
    )
      .map((r) => normalizeDailyWorkReport(r))
      .filter((r): r is DailyWorkReport => !!r)

    const chatMessages = pruneChatMessages(
      (Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [])
        .map((m) => normalizeChatMessage(m))
        .filter((m): m is ChatMessage => !!m),
    )

    const broadcasts = (
      Array.isArray(parsed.broadcasts) ? parsed.broadcasts : []
    )
      .filter(
        (b): b is DepartmentBroadcast =>
          !!b &&
          typeof b === 'object' &&
          typeof (b as DepartmentBroadcast).id === 'string' &&
          typeof (b as DepartmentBroadcast).departmentId === 'string' &&
          typeof (b as DepartmentBroadcast).voiceScript === 'string',
      )
      .slice(-80)

    const seniorLessons = (
      Array.isArray(parsed.seniorLessons) ? parsed.seniorLessons : []
    )
      .map((r) => normalizeSeniorLesson(r))
      .filter((r): r is SeniorLessonRecord => !!r)

    const tmcItems = wipeTmc
      ? []
      : (Array.isArray(parsed.tmcItems) ? parsed.tmcItems : [])
          .map((r) => normalizeTmcItem(r))
          .filter((r): r is TmcItem => !!r)

    const tmcBoards = wipeTmc
      ? []
      : (Array.isArray(parsed.tmcBoards) ? parsed.tmcBoards : [])
          .map((r) => normalizeTmcBoard(r))
          .filter((r): r is TmcBoard => !!r)

    const tmcBaselines = wipeTmc
      ? []
      : (Array.isArray(parsed.tmcBaselines) ? parsed.tmcBaselines : [])
          .map((r) => normalizeTmcBaseline(r))
          .filter((r): r is TmcInventoryBaseline => !!r)

    const tmcRequests = (
      Array.isArray(parsed.tmcRequests) ? parsed.tmcRequests : []
    )
      .map((r) => normalizeTmcRequest(r))
      .filter((r): r is TmcEquipmentRequest => !!r)

    const base: AppState = ensureMalyugoPresent({
      departments: departments.map((d) => ({
        ...d,
        employees: d.employees.map((e) => ensureEmployeeMonth(e, year, month)),
      })),
      accounts,
      overtimeRequests: Array.isArray(parsed.overtimeRequests)
        ? parsed.overtimeRequests
        : [],
      knowledgeCuts,
      dailyWorkReports,
      chatMessages,
      broadcasts,
      seniorLessons,
      tmcItems,
      tmcBoards,
      tmcBaselines,
      tmcRequests,
      activeDepartmentId: DEPT_17_ID,
      currentUserId: parsed.sessionAccountId ? parsed.currentUserId ?? null : null,
      sessionAccountId: parsed.sessionAccountId ?? null,
      events: parsed.events ?? [],
      selectedMonth: month,
      selectedYear: year,
    })

    if (
      base.sessionAccountId &&
      !base.accounts.some((a) => a.id === base.sessionAccountId)
    ) {
      base.sessionAccountId = null
      base.currentUserId = null
    }

    return base
  } catch {
    return createDefaultState()
  }
}

export function saveState(state: AppState): void {
  const toSave: AppState = {
    ...state,
    chatMessages: stripChatPayloadForStorage(state.chatMessages ?? []),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    const slim = {
      ...toSave,
      chatMessages: stripChatPayloadForStorage(toSave.chatMessages).slice(-40),
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
    } catch {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...slim, chatMessages: [] }),
      )
    }
  }
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export { daysInMonth } from './rules'

export function totalOvertime(days: DayCell[], dayCount: number): number {
  return sumDayOvertime(days, dayCount)
}
