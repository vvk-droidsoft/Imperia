import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Move,
  RotateCcw,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { ActivityFeed } from './ActivityFeed'
import { AccountManager } from './AccountManager'
import { AdminFloatItem, ADMIN_FLOAT_LAYER_ID } from './AdminFloatItem'
import { DailyControlPanel } from './DailyControlPanel'
import { DepartmentChat } from './DepartmentChat'
import { StaffAccountPanel } from './StaffAccountPanel'
import { KnowledgeCutPanel } from './KnowledgeCutPanel'
import { OvertimeMemoPanel } from './OvertimeMemoPanel'
import { ScheduleTable } from './ScheduleTable'
import { SeniorLessonsPanel } from './SeniorLessonsPanel'
import { GeneratorPanel } from './GeneratorPanel'
import { PolygonPanel } from './PolygonPanel'
import { TmcPanel } from './TmcPanel'
import type { AppActions } from '../hooks/useAppState'
import type {
  ChatMessage,
  DailyWorkReport,
  Department,
  KnowledgeCut,
  OvertimeRequest,
  SeniorLessonRecord,
  TmcBoard,
  TmcEquipmentRequest,
  TmcInventoryBaseline,
  TmcItem,
  UserAccount,
} from '../types'
import {
  canUseDeptChat,
  isAdmin,
  isDeptHead,
  WORK_DAY_LABEL,
  type ActorContext,
} from '../lib/rules'
import {
  clearAdminLayout,
  loadAdminLayout,
  saveAdminLayout,
  type AdminLayoutMap,
  type FloatRect,
} from '../lib/adminLayout'

type DeptView =
  | 'menu'
  | 'schedule'
  | 'accounts'
  | 'tmc'
  | 'knowledge'
  | 'daily'
  | 'chat'
  | 'myaccount'
  | 'polygon'
  | 'generator'

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

interface Props {
  department: Department
  month: number
  year: number
  actor: ActorContext | null
  events: AppActions['state']['events']
  accounts: UserAccount[]
  overtimeRequests: OvertimeRequest[]
  knowledgeCuts: KnowledgeCut[]
  dailyReports: DailyWorkReport[]
  chatMessages: ChatMessage[]
  seniorLessons: SeniorLessonRecord[]
  tmcItems: TmcItem[]
  tmcBoards: TmcBoard[]
  tmcBaselines: TmcInventoryBaseline[]
  tmcRequests: TmcEquipmentRequest[]
  onClose: () => void
  onShiftMonth: (delta: number) => void
  onResetCredentials: (employeeId: string, newLogin?: string) => void
  onSubmitOvertime: (input: {
    date: string
    timeFrom: string
    timeTo: string
  }) => void
  onDecideOvertime: (id: string, status: 'approved' | 'rejected') => void
  onUpdateKnowledgeCut: AppActions['updateKnowledgeCut']
  onUpdateDailyWork: AppActions['updateDailyWorkReport']
  onUpsertSeniorLesson: AppActions['upsertSeniorLesson']
  onDeleteSeniorLesson: AppActions['deleteSeniorLesson']
  onUpsertTmcItem: AppActions['upsertTmcItem']
  onDeleteTmcItem: AppActions['deleteTmcItem']
  onClearEmployeeTmcItems: AppActions['clearEmployeeTmcItems']
  onSnapshotTmcInventory: AppActions['snapshotTmcInventory']
  onAddTmcBoardsBulk: AppActions['addTmcBoardsBulk']
  onUpsertTmcBoard: AppActions['upsertTmcBoard']
  onDeleteTmcBoard: AppActions['deleteTmcBoard']
  onImportTmcItems: AppActions['importTmcItems']
  onUpsertTmcRequest: AppActions['upsertTmcRequest']
  onDecideTmcRequest: AppActions['decideTmcRequest']
  onDeleteTmcRequest: AppActions['deleteTmcRequest']
  onSubmitDailyReport: AppActions['submitDailyReportToSenior']
  onSendChat: AppActions['sendChatMessage']
  onDeleteChat: AppActions['deleteChatMessage']
  actions: Pick<
    AppActions,
    | 'renameEmployee'
    | 'removeEmployee'
    | 'addEmployee'
    | 'setDayStatus'
    | 'setOvertime'
    | 'setRole'
    | 'setLocation'
    | 'checkIn'
    | 'checkOut'
    | 'clearEvents'
  >
}

export function DepartmentPanel({
  department,
  month,
  year,
  actor,
  events,
  accounts,
  overtimeRequests,
  knowledgeCuts,
  dailyReports,
  chatMessages,
  seniorLessons,
  tmcItems,
  tmcBoards,
  tmcBaselines,
  tmcRequests,
  onClose,
  onShiftMonth,
  onResetCredentials,
  onSubmitOvertime,
  onDecideOvertime,
  onUpdateKnowledgeCut,
  onUpdateDailyWork,
  onUpsertSeniorLesson,
  onDeleteSeniorLesson,
  onUpsertTmcItem,
  onDeleteTmcItem,
  onClearEmployeeTmcItems,
  onSnapshotTmcInventory,
  onAddTmcBoardsBulk,
  onUpsertTmcBoard,
  onDeleteTmcBoard,
  onImportTmcItems,
  onUpsertTmcRequest,
  onDecideTmcRequest,
  onDeleteTmcRequest,
  onSubmitDailyReport,
  onSendChat,
  onDeleteChat,
  actions,
}: Props) {
  const [view, setView] = useState<DeptView>('menu')
  const admin = isAdmin(actor)
  const [layoutEdit, setLayoutEdit] = useState(false)
  const [layout, setLayout] = useState<AdminLayoutMap>(() => loadAdminLayout())

  const persistLayout = useCallback((next: AdminLayoutMap) => {
    setLayout(next)
    saveAdminLayout(next)
  }, [])

  const onFloatChange = useCallback(
    (id: string, rect: FloatRect) => {
      persistLayout({ ...loadAdminLayout(), [id]: rect })
    },
    [persistLayout],
  )

  /** Зафиксировать текущие позиции вкладок (ещё в потоке), затем включить редактирование. */
  const startLayoutEdit = useCallback(() => {
    const panel = document.querySelector('.dept-strike-bg') as HTMLElement | null
    if (panel) {
      const next = { ...loadAdminLayout() }
      let changed = false
      panel.querySelectorAll<HTMLElement>('[data-float-seed]').forEach((node) => {
        const id = node.dataset.floatSeed
        if (!id || next[id]) return
        const parentBox = panel.getBoundingClientRect()
        const box = node.getBoundingClientRect()
        next[id] = {
          x: box.left - parentBox.left,
          y: box.top - parentBox.top,
          w: Math.max(140, box.width),
          h: Math.max(44, box.height),
        }
        changed = true
      })
      if (changed) persistLayout(next)
      else setLayout(next)
    }
    setLayoutEdit(true)
  }, [persistLayout])

  const onDuty = department.employees.filter((e) => e.attendance === 'in').length
  const showRadio = isDeptHead(actor, department.id)
  const head = showRadio
  const canChat = canUseDeptChat(actor, department.id)
  const isStaff =
    !!actor &&
    actor.departmentId === department.id &&
    (actor.employee.role === 'instructor' ||
      actor.employee.role === 'assistant')
  const pendingOt = overtimeRequests.filter((r) => r.status === 'pending').length
  const knowledgeSubjects = department.employees.filter(
    (e) => e.role !== 'senior_instructor',
  ).length

  const title =
    view === 'menu'
      ? 'Меню отдела'
      : view === 'schedule'
        ? 'График рабочей нагрузки'
        : view === 'accounts'
          ? 'Учётки сотрудников'
          : view === 'tmc'
            ? 'ТМЦ'
            : view === 'myaccount'
              ? 'Моя учётка'
              : view === 'knowledge'
                ? head
                  ? 'Срез знаний · проведение занятий'
                  : 'Срез знаний'
                : view === 'daily'
                  ? 'Контроль работы'
                  : view === 'polygon'
                    ? 'Полигон'
                    : view === 'generator'
                      ? 'Генератор'
                      : 'Чат отдела'

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={department.name}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label="Закрыть"
        onClick={onClose}
      />

      <div className="dept-panel-enter dept-strike-bg hud-frame relative z-10 flex h-[94svh] max-h-[94svh] w-full max-w-[1600px] flex-col overflow-hidden border border-[var(--accent-hot)]/70">
        <header className="dept-glass flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--accent-hot)]/45 px-3 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
              {title}
              {actor ? ` · вы: ${actor.employee.name}` : ''}
              {showRadio ? ' · радиообмен онлайн' : ''}
            </div>
            <h2 className="m-0 truncate font-[family-name:var(--display)] text-xl uppercase tracking-wide text-[var(--text)] sm:text-2xl">
              {department.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {view === 'schedule' || view === 'knowledge' ? (
              <div className="flex items-center gap-1 border border-[var(--border)] bg-black/40 px-1 py-1">
                <button
                  type="button"
                  onClick={() => onShiftMonth(-1)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)]"
                  aria-label="Предыдущий месяц"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="min-w-[130px] text-center font-[family-name:var(--mono)] text-sm font-semibold uppercase tracking-wide">
                  {MONTHS[month]} {year}
                </div>
                <button
                  type="button"
                  onClick={() => onShiftMonth(1)}
                  className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)]"
                  aria-label="Следующий месяц"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            ) : null}
            {view !== 'menu' ? (
              <button
                type="button"
                onClick={() => setView('menu')}
                className="inline-flex items-center gap-1.5 border border-[var(--border)] bg-black/40 px-3 py-2 font-[family-name:var(--mono)] text-xs uppercase tracking-wider text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <ArrowLeft size={16} />
                Меню
              </button>
            ) : null}
            {admin && view === 'menu' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (layoutEdit) setLayoutEdit(false)
                    else startLayoutEdit()
                  }}
                  className={`inline-flex items-center gap-1.5 border px-3 py-2 font-[family-name:var(--mono)] text-xs uppercase tracking-wider ${
                    layoutEdit
                      ? 'border-[var(--present)]/60 bg-[var(--present)]/15 text-[var(--present)]'
                      : 'border-[var(--border)] bg-black/40 text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  }`}
                >
                  <Move size={14} />
                  {layoutEdit ? 'Готово' : 'Раскладка'}
                </button>
                {layoutEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearAdminLayout()
                      setLayout({})
                      setLayoutEdit(false)
                    }}
                    className="inline-flex items-center gap-1.5 border border-[var(--accent-hot)]/50 bg-[var(--accent-hot)]/10 px-3 py-2 font-[family-name:var(--mono)] text-xs uppercase tracking-wider text-[var(--accent-hot)]"
                  >
                    <RotateCcw size={14} />
                    Сброс
                  </button>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 border border-[var(--accent-hot)]/50 bg-[var(--accent-hot)]/15 px-3 py-2 font-[family-name:var(--mono)] text-xs uppercase tracking-wider text-[var(--accent-hot)] hover:bg-[var(--accent-hot)]/30"
            >
              <X size={16} />
              Закрыть
            </button>
          </div>
        </header>

        {admin && layoutEdit && view === 'menu' ? (
          <div className="pointer-events-none absolute left-1/2 top-[4.75rem] z-[7] -translate-x-1/2 border border-[var(--present)]/40 bg-black/70 px-3 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)]">
            Перетаскивайте ↔︎ · тяните угол для размера
          </div>
        ) : null}

        {view === 'menu' ? (
          <AdminFloatItem
            id="tab-polygon"
            enabled={admin}
            editing={layoutEdit}
            rect={layout['tab-polygon'] ?? null}
            onChange={onFloatChange}
            defaultClassName="polygon-tab-slot"
          >
            <div data-float-seed="tab-polygon">
              <MenuButton
                fill={!!layout['tab-polygon'] || layoutEdit}
                icon={<MilPolygonIcon />}
                title="Полигон"
                subtitle="Алабино · Головеньки · Дракино · Волосово"
                onClick={() => {
                  if (layoutEdit) return
                  setView('polygon')
                }}
              />
            </div>
          </AdminFloatItem>
        ) : null}

        {view === 'menu' ? (
          <AdminFloatItem
            id="tab-generator"
            enabled={admin}
            editing={layoutEdit}
            rect={layout['tab-generator'] ?? null}
            onChange={onFloatChange}
            defaultClassName="generator-tab-slot"
          >
            <div data-float-seed="tab-generator">
              <MenuButton
                fill={!!layout['tab-generator'] || layoutEdit}
                icon={<MilGeneratorIcon />}
                title="Генератор"
                subtitle=""
                onClick={() => {
                  if (layoutEdit) return
                  setView('generator')
                }}
              />
            </div>
          </AdminFloatItem>
        ) : null}

        <div
          className={`grid min-h-0 flex-1 gap-3 overflow-hidden p-3 sm:p-4 ${
            showRadio
              ? 'lg:grid-cols-[1fr_300px] lg:grid-rows-1'
              : 'grid-cols-1'
          }`}
        >
          <div className="min-h-0 min-w-0 overflow-hidden">
            {view === 'menu' ? (
              <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
                <div className="dept-glass w-full max-w-md shrink-0 border px-3 py-2">
                  <div className="mb-1.5 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.25em] text-[var(--accent)]">
                    <Users size={12} />
                    Сводка
                  </div>
                  <p className="m-0 text-xs text-[var(--text)]">
                    Личный состав: <b>{department.employees.length}</b>
                  </p>
                  <p className="mt-0.5 m-0 text-xs text-[var(--present)]">
                    На месте сейчас: <b>{onDuty}</b>
                  </p>
                  <p className="mt-1.5 m-0 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                    Смена {WORK_DAY_LABEL}
                    {pendingOt > 0
                      ? ` · заявлений на рассмотрении: ${pendingOt}`
                      : ''}
                  </p>
                </div>

                <div className="dept-menu-tabs flex w-full max-w-md flex-col gap-2">
                  <AdminFloatItem
                    id="tab-schedule"
                    enabled={admin}
                    editing={layoutEdit}
                    rect={layout['tab-schedule'] ?? null}
                    onChange={onFloatChange}
                  >
                    <div data-float-seed="tab-schedule">
                      <MenuButton
                        fill={!!layout['tab-schedule'] || layoutEdit}
                        icon={<MilScheduleIcon />}
                        title="График рабочей нагрузки"
                        subtitle={
                          pendingOt > 0
                            ? `Состав, дни, переработки · заявлений на согласовании: ${pendingOt}`
                            : 'Состав, дни, места · заявления по переработкам снизу'
                        }
                        onClick={() => {
                          if (layoutEdit) return
                          setView('schedule')
                        }}
                      />
                    </div>
                  </AdminFloatItem>
                  <AdminFloatItem
                    id="tab-knowledge"
                    enabled={admin}
                    editing={layoutEdit}
                    rect={layout['tab-knowledge'] ?? null}
                    onChange={onFloatChange}
                  >
                    <div data-float-seed="tab-knowledge">
                      <MenuButton
                        fill={!!layout['tab-knowledge'] || layoutEdit}
                        icon={<MilKnowledgeIcon />}
                        title="Срез знаний"
                        subtitle={
                          head
                            ? `Беседа и оценки · проведение занятий СИ · состав: ${knowledgeSubjects}`
                            : `Беседа, задание и оценки · состав отдела: ${knowledgeSubjects}`
                        }
                        onClick={() => {
                          if (layoutEdit) return
                          setView('knowledge')
                        }}
                      />
                    </div>
                  </AdminFloatItem>
                  {head ? (
                    <AdminFloatItem
                      id="tab-accounts"
                      enabled={admin}
                      editing={layoutEdit}
                      rect={layout['tab-accounts'] ?? null}
                      onChange={onFloatChange}
                    >
                      <div data-float-seed="tab-accounts">
                        <MenuButton
                          fill={!!layout['tab-accounts'] || layoutEdit}
                          icon={<MilAccountsIcon />}
                          title="Учётки сотрудников"
                          subtitle="Восстановить логин и пароль 1234 своему отделу"
                          onClick={() => {
                            if (layoutEdit) return
                            setView('accounts')
                          }}
                        />
                      </div>
                    </AdminFloatItem>
                  ) : null}
                  {isStaff ? (
                    <AdminFloatItem
                      id="tab-myaccount"
                      enabled={admin}
                      editing={layoutEdit}
                      rect={layout['tab-myaccount'] ?? null}
                      onChange={onFloatChange}
                    >
                      <div data-float-seed="tab-myaccount">
                        <MenuButton
                          fill={!!layout['tab-myaccount'] || layoutEdit}
                          icon={<MilAccountsIcon />}
                          title="Моя учётка"
                          subtitle="Логин и роль · отчёт за день — в «Контроль работы»"
                          onClick={() => {
                            if (layoutEdit) return
                            setView('myaccount')
                          }}
                        />
                      </div>
                    </AdminFloatItem>
                  ) : null}
                  <AdminFloatItem
                    id="tab-tmc"
                    enabled={admin}
                    editing={layoutEdit}
                    rect={layout['tab-tmc'] ?? null}
                    onChange={onFloatChange}
                  >
                    <div data-float-seed="tab-tmc">
                      <MenuButton
                        fill={!!layout['tab-tmc'] || layoutEdit}
                        icon={<MilTmcIcon />}
                        title="ТМЦ"
                        subtitle="Импорт файлов, заявки на списание/получение, борты"
                        onClick={() => {
                          if (layoutEdit) return
                          setView('tmc')
                        }}
                      />
                    </div>
                  </AdminFloatItem>
                  <AdminFloatItem
                    id="tab-daily"
                    enabled={admin}
                    editing={layoutEdit}
                    rect={layout['tab-daily'] ?? null}
                    onChange={onFloatChange}
                  >
                    <div data-float-seed="tab-daily">
                      <MenuButton
                        fill={!!layout['tab-daily'] || layoutEdit}
                        icon={<MilDailyIcon />}
                        title="Контроль работы"
                        subtitle="План на день · отчёты · реакция СИ"
                        onClick={() => {
                          if (layoutEdit) return
                          setView('daily')
                        }}
                      />
                    </div>
                  </AdminFloatItem>
                  {canChat ? (
                    <AdminFloatItem
                      id="tab-chat"
                      enabled={admin}
                      editing={layoutEdit}
                      rect={layout['tab-chat'] ?? null}
                      onChange={onFloatChange}
                    >
                      <div data-float-seed="tab-chat">
                        <MenuButton
                          fill={!!layout['tab-chat'] || layoutEdit}
                          icon={<MilChatIcon />}
                          title="Чат отдела"
                          subtitle="Сообщения, фото, видео, голос и файлы · только свой отдел"
                          onClick={() => {
                            if (layoutEdit) return
                            setView('chat')
                          }}
                        />
                      </div>
                    </AdminFloatItem>
                  ) : null}
                </div>
              </div>
            ) : null}

            {view === 'schedule' ? (
              <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
                <div className="min-h-[420px] flex-1 overflow-hidden">
                  <ScheduleTable
                    department={department}
                    month={month}
                    year={year}
                    actor={actor}
                    onRenameEmployee={(id, name) =>
                      actions.renameEmployee(department.id, id, name)
                    }
                    onRemoveEmployee={(id) =>
                      actions.removeEmployee(department.id, id)
                    }
                    onAddEmployee={(name) =>
                      actions.addEmployee(department.id, name)
                    }
                    onSetDayStatus={(empId, day, status) =>
                      actions.setDayStatus(department.id, empId, day, status)
                    }
                    onSetOvertime={(empId, day, hours) =>
                      actions.setOvertime(department.id, empId, day, hours)
                    }
                    onSetRole={(empId, role) =>
                      actions.setRole(department.id, empId, role)
                    }
                    onSetLocation={(empId, loc) =>
                      actions.setLocation(department.id, empId, loc)
                    }
                    onCheckIn={(id) => actions.checkIn(department.id, id)}
                    onCheckOut={(id) => actions.checkOut(department.id, id)}
                  />
                </div>
                <div className="shrink-0 pb-2">
                  <OvertimeMemoPanel
                    embedded
                    actor={actor}
                    departmentId={department.id}
                    departmentName={department.name}
                    requests={overtimeRequests}
                    onSubmit={onSubmitOvertime}
                    onDecide={onDecideOvertime}
                  />
                </div>
              </div>
            ) : null}

            {view === 'accounts' && head ? (
              <AccountManager
                employees={department.employees}
                accounts={accounts}
                onReset={onResetCredentials}
              />
            ) : null}

            {view === 'tmc' && actor ? (
              <TmcPanel
                departmentId={department.id}
                departmentName={department.name}
                employees={department.employees}
                items={tmcItems}
                boards={tmcBoards}
                baselines={tmcBaselines}
                actor={actor}
                onUpsertItem={onUpsertTmcItem}
                onDeleteItem={onDeleteTmcItem}
                onClearItems={onClearEmployeeTmcItems}
                onSnapshot={onSnapshotTmcInventory}
                onAddBoards={onAddTmcBoardsBulk}
                onUpdateBoard={onUpsertTmcBoard}
                onDeleteBoard={onDeleteTmcBoard}
                requests={tmcRequests}
                onImportItems={onImportTmcItems}
                onUpsertRequest={onUpsertTmcRequest}
                onDecideRequest={onDecideTmcRequest}
                onDeleteRequest={onDeleteTmcRequest}
              />
            ) : null}

            {view === 'myaccount' && isStaff && actor ? (
              <StaffAccountPanel
                employee={actor.employee}
                account={
                  accounts.find((a) => a.employeeId === actor.employee.id) ??
                  null
                }
              />
            ) : null}

            {view === 'knowledge' ? (
              head ? (
                <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
                  <div className="min-h-[380px] flex-1 overflow-hidden">
                    <KnowledgeCutPanel
                      departmentId={department.id}
                      employees={department.employees}
                      cuts={knowledgeCuts}
                      actor={actor}
                      monthLabel={`${MONTHS[month]} ${year}`}
                      onUpdate={(employeeId, patch) =>
                        onUpdateKnowledgeCut(department.id, employeeId, patch)
                      }
                    />
                  </div>
                  <div className="min-h-[420px] shrink-0 pb-2">
                    <SeniorLessonsPanel
                      departmentId={department.id}
                      lessons={seniorLessons}
                      onUpsert={onUpsertSeniorLesson}
                      onDelete={onDeleteSeniorLesson}
                    />
                  </div>
                </div>
              ) : (
                <KnowledgeCutPanel
                  departmentId={department.id}
                  employees={department.employees}
                  cuts={knowledgeCuts}
                  actor={actor}
                  monthLabel={`${MONTHS[month]} ${year}`}
                  onUpdate={(employeeId, patch) =>
                    onUpdateKnowledgeCut(department.id, employeeId, patch)
                  }
                />
              )
            ) : null}

            {view === 'daily' ? (
              <DailyControlPanel
                department={department}
                reports={dailyReports}
                events={events}
                actor={actor}
                onUpdate={(employeeId, patch) =>
                  onUpdateDailyWork(department.id, employeeId, patch)
                }
                onSubmitToSenior={
                  isStaff
                    ? () => onSubmitDailyReport(department.id)
                    : undefined
                }
              />
            ) : null}

            {view === 'chat' ? (
              <DepartmentChat
                department={department}
                messages={chatMessages}
                actor={actor}
                onSend={(input) => onSendChat(department.id, input)}
                onDelete={(messageId) =>
                  onDeleteChat(department.id, messageId)
                }
              />
            ) : null}

            {view === 'polygon' ? (
              <PolygonPanel department={department} />
            ) : null}

            {view === 'generator' ? <GeneratorPanel /> : null}
          </div>

          {showRadio ? (
            <aside className="flex min-h-[220px] min-w-0 flex-col lg:min-h-0">
              <div className="mb-2 shrink-0 font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--present)]">
                Радиообмен · кто / где / когда
              </div>
              <div className="min-h-0 flex-1">
                <ActivityFeed events={events} onClear={actions.clearEvents} />
              </div>
            </aside>
          ) : null}
        </div>

        <div
          id={ADMIN_FLOAT_LAYER_ID}
          className="admin-float-layer pointer-events-none absolute inset-0 z-[6] overflow-hidden"
          aria-hidden
        />
      </div>
    </div>
  )
}

function MenuButton({
  icon,
  title,
  subtitle,
  onClick,
  fill = false,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  onClick: () => void
  fill?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dept-menu-tab hud-frame dept-glass group flex w-full items-center gap-2.5 border px-2.5 text-left transition hover:border-[var(--accent)] hover:shadow-[0_0_50px_rgba(255,60,0,0.35)] ${
        fill ? 'dept-menu-tab--fill max-w-none' : ''
      }`}
    >
      <div className="mil-icon-badge flex h-7 w-7 shrink-0 items-center justify-center text-[var(--accent)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="dept-menu-tab__title font-[family-name:var(--display)] text-[0.95rem] leading-tight uppercase tracking-wide text-[var(--text)]">
          {title}
        </div>
        <p className="dept-menu-tab__sub mt-0.5 m-0 text-[11px] leading-snug text-[var(--text-muted)]">
          {subtitle}
        </p>
      </div>
      <span className="shrink-0 text-sm text-[var(--accent)] transition group-hover:translate-x-1">
        →
      </span>
    </button>
  )
}

/** Menu glyphs ~30% smaller than previous 18px mark */
const ICON_PX = 13

function MilScheduleIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <rect x="3" y="4" width="18" height="17" rx="3.5" ry="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9.5h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 2.8v3.2M16 2.8v3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="6.5" y="12" width="3.2" height="3.2" rx="0.9" fill="currentColor" />
      <rect x="10.4" y="12" width="3.2" height="3.2" rx="0.9" fill="currentColor" opacity="0.55" />
      <rect x="14.3" y="12" width="3.2" height="3.2" rx="0.9" fill="currentColor" opacity="0.35" />
      <rect x="6.5" y="16.2" width="3.2" height="2.6" rx="0.9" fill="currentColor" opacity="0.35" />
      <path
        d="M15.2 16.1l1.1 1.1 2.2-2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MilTmcIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <path
        d="M4 8.5l8-4 8 4v7l-8 4-8-4v-7z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12 12.5v7M4 8.5l8 4 8-4"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MilAccountsIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <rect x="2.5" y="5" width="19" height="14" rx="4" ry="4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.55" />
      <path
        d="M13.2 10.2h5.2M13.2 13.8h3.6"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <circle cx="19.2" cy="7.2" r="1.35" fill="currentColor" />
    </svg>
  )
}

function MilKnowledgeIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <rect
        x="3"
        y="3.5"
        width="18"
        height="17"
        rx="3.5"
        ry="3.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M7 8.2h10M7 12h7M7 15.8h5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <circle cx="16.6" cy="15.6" r="3.1" stroke="currentColor" strokeWidth="1.45" />
      <path
        d="M15.4 15.6l0.9 0.9 1.7-1.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MilDailyIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="3.5"
        ry="3.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="8.2" cy="10" r="2" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="15.8" cy="10" r="2" stroke="currentColor" strokeWidth="1.45" />
      <path
        d="M5.8 16.2c.7-1.4 1.9-2.2 3.4-2.2s2.7.8 3.4 2.2M12.8 16.2c.5-1 1.4-1.7 2.8-1.7 1.2 0 2.1.5 2.7 1.4"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M17.2 6.2l1.2 1.2 2-2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MilChatIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <path
        d="M4.5 5.5h15a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.2v-3.2H4.5A2.5 2.5 0 0 1 2 15V8a2.5 2.5 0 0 1 2.5-2.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 10.2h10M7 13.2h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MilPolygonIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <path
        d="M4 16.5l4-9 4 3.5 4-6.5 4 12H4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 19h17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="11" r="1.2" fill="currentColor" />
    </svg>
  )
}

function MilGeneratorIcon() {
  return (
    <svg
      width={ICON_PX}
      height={ICON_PX}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mil-glyph"
    >
      <path
        d="M8 4h8l2 4H6l2-4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 8h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 12h4M12 10v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
