export type DayStatus = 'work' | 'off' | 'trip' | 'sick'

export type Location =
  | 'lik'
  | 'bas'
  | 'trip'
  | 'sick'
  | 'alabino'
  | 'golovenki'
  | 'volosovo'
  | 'drakino'

export type AttendanceStatus = 'out' | 'in'

export type Role = 'senior_instructor' | 'instructor' | 'assistant'

export interface DayCell {
  status: DayStatus
  overtimeHours: number
}

export interface MonthSchedule {
  days: DayCell[]
  carriedIn: number
}

export interface Employee {
  id: string
  name: string
  role: Role
  location: Location
  attendance: AttendanceStatus
  lastCheckIn: string | null
  lastCheckOut: string | null
  /** Графики по месяцам: YYYY-MM */
  months: Record<string, MonthSchedule>
}

export interface Department {
  id: string
  name: string
  employees: Employee[]
}

export interface UserAccount {
  id: string
  login: string
  passwordHash: string
  employeeId: string
  departmentId: string
  /** Нужно сменить стартовый пароль 1234 */
  mustChangePassword: boolean
  /** Уже менял пароль один раз (повторно нельзя, пока старший не сбросит) */
  passwordChangedOnce: boolean
  /** Администратор системы (полный доступ) */
  isAdmin: boolean
}

export type OvertimeRequestStatus = 'pending' | 'approved' | 'rejected'

/** Служебная записка об отлучении в счёт переработок */
export interface OvertimeRequest {
  id: string
  employeeId: string
  employeeName: string
  employeeInitials: string
  departmentId: string
  departmentName: string
  roleTitle: string
  /** YYYY-MM-DD */
  date: string
  timeFrom: string
  timeTo: string
  status: OvertimeRequestStatus
  createdAt: string
  decidedAt: string | null
  decidedByName: string | null
}

export interface ActivityEvent {
  id: string
  employeeId: string
  employeeName: string
  departmentName: string
  type:
    | 'check_in'
    | 'check_out'
    | 'location'
    | 'status'
    | 'overtime_request'
    | 'daily_report'
    | 'broadcast'
  message: string
  at: string
}

/** Формат беседы старшего инструктора со срезом знаний */
export type MeetingFormat = 'in_person' | 'remote'

/**
 * Ежемесячный срез знаний: одна беседа на инструктора,
 * оценки по теории / практике / методике + задание.
 */
export interface KnowledgeCut {
  id: string
  departmentId: string
  employeeId: string
  /** Период YYYY-MM */
  period: string
  /** Плановая дата беседы YYYY-MM-DD */
  plannedDate: string
  /** Фактическая дата проведения YYYY-MM-DD */
  conductedDate: string
  format: MeetingFormat | ''
  /** Задание после беседы */
  assignment: string
  /** Оценки 1–5, null — ещё не выставлена */
  theory: number | null
  practice: number | null
  methodology: number | null
  /** Отчётный файл по сотруднику (IndexedDB) */
  reportFileId: string | null
  reportFileName: string
  reportMime: string
  reportSize: number
  reportUploadedAt: string | null
  updatedAt: string | null
  assessedByName: string | null
}

/** Статус контроля работы старшим инструктором за день */
export type DailyControlStatus = 'pending' | 'ok' | 'attention' | 'fail'

/** Реакция старшего на ежедневный отчёт */
export type DayPlanReview = 'best' | 'revise'

/** Ежедневный отчёт: тема, сделанное, предложения + реакция старшего */
export interface DailyWorkReport {
  id: string
  departmentId: string
  employeeId: string
  /** YYYY-MM-DD */
  date: string
  /** Что сделал сегодня для группы / отдела */
  workDone: string
  /** Какую тему рассказал слушателям */
  programTopics: string
  /** Предложения улучшить работу */
  improveSuggestions: string
  /** Файл плана на день (IndexedDB по planFileId) */
  planFileId: string | null
  planFileName: string
  planMime: string
  planSize: number
  planUploadedAt: string | null
  /** Когда отчёт отправлен старшему */
  planSubmittedAt: string | null
  /** Реакция старшего: лучший / доработай */
  planReview: DayPlanReview | ''
  /** Заметка старшего инструктора */
  seniorNote: string
  controlStatus: DailyControlStatus | ''
  updatedAt: string | null
  updatedByName: string | null
}

export type ChatAttachmentKind = 'image' | 'video' | 'audio' | 'file'

export interface ChatAttachment {
  id: string
  kind: ChatAttachmentKind
  name: string
  mime: string
  size: number
  /**
   * Устаревшее inline-хранение. Новые файлы лежат в IndexedDB по id.
   * Оставляем только для совместимости со старыми мелкими вложениями.
   */
  dataUrl?: string
}

/** Сообщение внутреннего чата отдела */
export interface ChatMessage {
  id: string
  departmentId: string
  authorId: string
  authorName: string
  authorRole: Role
  text: string
  attachments: ChatAttachment[]
  createdAt: string
}

/** Рассылка старшего всему отделу (уведомления) */
export interface DepartmentBroadcast {
  id: string
  departmentId: string
  fromEmployeeId: string
  fromName: string
  kind: 'day_plan' | 'general'
  title: string
  body: string
  /** Текст уведомления для сотрудников */
  voiceScript: string
  createdAt: string
}

/**
 * Учёт занятий старшего инструктора:
 * тема, группа, поток курсантов + план-конспект перед занятием.
 */
export interface SeniorLessonRecord {
  id: string
  departmentId: string
  instructorId: string
  instructorName: string
  /** Тема занятия */
  topic: string
  /** Номер группы (например «23») */
  groupNumber: string
  /** Поток курсантов (например «24») */
  stream: string
  /** Дата проведения YYYY-MM-DD; пусто — ещё не проведено */
  conductedDate: string
  /** План-конспект (файл в IndexedDB) */
  planFileId: string | null
  planFileName: string
  planMime: string
  planSize: number
  planUploadedAt: string | null
  note: string
  createdAt: string
  updatedAt: string
}

/** Тип борта (БВС) на учёте ТМЦ */
export type TmcBoardKind =
  | 'boomerang'
  | 'lis1'
  | 'lis2'
  | 'chernika1'
  | 'chernika2'

/** Состояние борта */
export type TmcBoardStatus = 'intact' | 'broken' | 'lost'

/** Состояние единицы оборудования */
export type TmcItemCondition =
  | 'ok'
  | 'faulty'
  | 'repair'
  | 'lost'

/** Позиция оборудования сотрудника */
export interface TmcItem {
  id: string
  departmentId: string
  employeeId: string
  /** Раздел (legacy, не показывается в форме) */
  category: string
  /** Наименование изделия */
  name: string
  quantity: string
  /** Состояние оборудования */
  condition: TmcItemCondition
  brand: string
  model: string
  serial: string
  /** Инвентарный номер */
  warehouseNumber: string
  note: string
  orderNo: number
  positionNo: number
  createdAt: string
  updatedAt: string
}

/** Учёт борта у сотрудника */
export interface TmcBoard {
  id: string
  departmentId: string
  employeeId: string
  kind: TmcBoardKind
  status: TmcBoardStatus
  note: string
  createdAt: string
  updatedAt: string
}

/** Снимок последней инвентаризации (для подсветки пропавшего) */
export interface TmcBaselineItem {
  category: string
  name: string
  quantity: string
  condition: TmcItemCondition
  brand: string
  model: string
  serial: string
  warehouseNumber: string
  note: string
}

export interface TmcInventoryBaseline {
  id: string
  departmentId: string
  employeeId: string
  takenAt: string
  sourceFileName: string
  items: TmcBaselineItem[]
}

/** Заявка на списание или получение оборудования */
export type TmcRequestKind = 'writeoff' | 'receipt'
export type TmcRequestStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'

export interface TmcRequestLine {
  id: string
  name: string
  warehouseNumber: string
  quantity: string
  condition: TmcItemCondition
  /** Причина / комментарий к позиции */
  reason: string
  /** Связь с позицией ТМЦ (для передачи на ремонт) */
  sourceItemId: string | null
}

export interface TmcEquipmentRequest {
  id: string
  departmentId: string
  employeeId: string
  employeeName: string
  kind: TmcRequestKind
  status: TmcRequestStatus
  /** Тема / краткое основание */
  title: string
  note: string
  /** Дата документа ДД.ММ.ГГГГ */
  docDate: string
  /** № заявки (для получения) */
  requestNo: string
  /** Поток */
  streamNo: string
  /** Группа */
  groupNo: string
  /** Кабинет */
  cabinet: string
  /** Должность заявителя */
  roleTitle: string
  /** Адресат шапки (получение) */
  addressee: string
  lines: TmcRequestLine[]
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  decidedAt: string | null
  decidedByEmployeeId: string | null
  decidedByName: string | null
  decisionNote: string
}

export interface AppState {
  departments: Department[]
  accounts: UserAccount[]
  overtimeRequests: OvertimeRequest[]
  knowledgeCuts: KnowledgeCut[]
  dailyWorkReports: DailyWorkReport[]
  chatMessages: ChatMessage[]
  broadcasts: DepartmentBroadcast[]
  seniorLessons: SeniorLessonRecord[]
  tmcItems: TmcItem[]
  tmcBoards: TmcBoard[]
  tmcBaselines: TmcInventoryBaseline[]
  tmcRequests: TmcEquipmentRequest[]
  activeDepartmentId: string
  /** Кто сейчас работает в приложении (после входа) */
  currentUserId: string | null
  /** Авторизованная учётка */
  sessionAccountId: string | null
  events: ActivityEvent[]
  selectedMonth: number
  selectedYear: number
}

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  work: 'Рабочий',
  off: 'Выходной',
  trip: 'Командировка',
  sick: 'Больничный',
}

export const LOCATION_LABELS: Record<Location, string> = {
  lik: 'ЛИК',
  bas: 'БАС',
  trip: 'Командировка',
  sick: 'Больничный',
  alabino: 'Полигон Алабино',
  golovenki: 'Полигон Головеньки',
  volosovo: 'Полигон Волосово',
  drakino: 'Полигон Дракино',
}

export const ROLE_LABELS: Record<Role, string> = {
  senior_instructor: 'Старший инструктор',
  instructor: 'Инструктор',
  assistant: 'Ассистент',
}

export const MEETING_FORMAT_LABELS: Record<MeetingFormat, string> = {
  in_person: 'Очно',
  remote: 'Заочно',
}

export const KNOWLEDGE_SCORE_OPTIONS = [1, 2, 3, 4, 5] as const

export const DAILY_CONTROL_LABELS: Record<DailyControlStatus, string> = {
  pending: 'На проверке',
  ok: 'Норма',
  attention: 'Замечание',
  fail: 'Неудовл.',
}

export const DAY_PLAN_REVIEW_LABELS: Record<DayPlanReview, string> = {
  best: 'Лучший',
  revise: 'Доработай',
}

export const TMC_BOARD_KIND_LABELS: Record<TmcBoardKind, string> = {
  boomerang: 'Бумеранг',
  lis1: 'БВС Лис 1',
  lis2: 'БВС Лис 2.0',
  chernika1: 'БВС Черника 1',
  chernika2: 'БВС Черника 2',
}

export const TMC_BOARD_KINDS = Object.keys(
  TMC_BOARD_KIND_LABELS,
) as TmcBoardKind[]

export const TMC_BOARD_STATUS_LABELS: Record<TmcBoardStatus, string> = {
  intact: 'Цел',
  broken: 'Разбит',
  lost: 'Потерян',
}

export const TMC_BOARD_STATUSES = Object.keys(
  TMC_BOARD_STATUS_LABELS,
) as TmcBoardStatus[]

export const TMC_ITEM_CONDITION_LABELS: Record<TmcItemCondition, string> = {
  ok: 'Исправно',
  faulty: 'Неисправно',
  repair: 'В ремонте',
  lost: 'Утеряно',
}

export const TMC_ITEM_CONDITIONS = Object.keys(
  TMC_ITEM_CONDITION_LABELS,
) as TmcItemCondition[]

export const TMC_REQUEST_KIND_LABELS: Record<TmcRequestKind, string> = {
  writeoff: 'Передача на ремонт',
  receipt: 'Получение ТМЦ',
}

export const TMC_REQUEST_KINDS = Object.keys(
  TMC_REQUEST_KIND_LABELS,
) as TmcRequestKind[]

export const TMC_REQUEST_STATUS_LABELS: Record<TmcRequestStatus, string> = {
  draft: 'Черновик',
  submitted: 'На рассмотрении',
  approved: 'Одобрена',
  rejected: 'Отклонена',
}

export const TMC_REQUEST_STATUSES = Object.keys(
  TMC_REQUEST_STATUS_LABELS,
) as TmcRequestStatus[]

/** Типовые темы программы БАС (как в журнале проведения занятий СИ) */
export const BAS_LESSON_TOPICS = [
  '1.2 - Пульты дистанционного управления',
  '1.3 - Основы аэродинамики и авиационной метеорологии. Принцип управления БВС',
  '2.1 - Аккумуляторные батареи. Зарядные устройства',
  '2.2 - Винтомоторные группы',
  '2.3 - Основы радиосвязи',
  '2.4 - Системы радиоуправления и телеметрии',
  '2.5 - Системы видеосвязи',
  '2.6 - Наземные станции управления',
  '3.2 - Настройка БВС',
  '4.2 - Диагностика и устранение неисправностей БАС',
  '5.1 - Система обнаружения и определения воздушных целей',
  '5.2 - Система автоматического радиокомандного наведения БВС',
  '5.3 - Система автоматического удержания цели',
] as const
