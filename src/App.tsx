import { Crosshair, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BrandLogo } from './components/BrandLogo'
import { ChangePasswordForm } from './components/ChangePasswordForm'
import { DepartmentLauncher } from './components/DepartmentLauncher'
import { DepartmentPanel } from './components/DepartmentPanel'
import { LoginForm } from './components/LoginForm'
import { useAppState } from './hooks/useAppState'
import { ROLE_LABELS } from './types'

export default function App() {
  const app = useAppState()
  const {
    state,
    activeDepartment,
    visibleDepartments,
    currentUser,
    currentAccount,
    actor,
    isLoggedIn,
    needsPasswordChange,
    isSystemAdmin,
    departmentAccounts,
    departmentOvertimeRequests,
    departmentKnowledgeCuts,
    departmentDailyReports,
    departmentChatMessages,
    departmentSeniorLessons,
    departmentTmcItems,
    departmentTmcBoards,
    departmentTmcBaselines,
    departmentTmcRequests,
    toast,
    authError,
    authBusy,
    dismissToast,
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
    addTmcBoardsBulk,
    upsertTmcBoard,
    deleteTmcBoard,
    importTmcItems,
    upsertTmcRequest,
    decideTmcRequest,
    deleteTmcRequest,
    submitDailyReportToSenior,
    sendChatMessage,
    deleteChatMessage,
    setActiveDepartment,
    renameDepartment,
    addDepartment,
    removeDepartment,
    setMonth,
  } = app

  const [panelOpen, setPanelOpen] = useState(false)

  const openDepartment = (id: string) => {
    setActiveDepartment(id)
    setPanelOpen(true)
  }

  const closePanel = () => setPanelOpen(false)

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen])

  useEffect(() => {
    document.body.style.overflow = panelOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [panelOpen])

  const shiftMonth = (delta: number) => {
    const date = new Date(state.selectedYear, state.selectedMonth + delta, 1)
    setMonth(date.getMonth(), date.getFullYear())
  }

  const liveCount = visibleDepartments.reduce(
    (sum, d) => sum + d.employees.filter((e) => e.attendance === 'in').length,
    0,
  )

  return (
    <div className="relative min-h-svh w-full">
      <div className="splash-bg" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-between px-4 py-6 sm:px-6 sm:py-10">
        <header className="pt-[5vh] text-center sm:pt-[8vh]">
          <BrandLogo className="mb-2" />
          {isLoggedIn && !needsPasswordChange ? (
            <div className="mt-4 inline-flex items-center gap-2 font-[family-name:var(--mono)] text-xs uppercase tracking-[0.22em] text-[var(--present)]">
              <Crosshair size={14} className="text-[var(--accent)]" />
              на объекте сейчас: {liveCount}
            </div>
          ) : null}
        </header>

        <main className="my-6 flex-1">
          {!isLoggedIn ? (
            <LoginForm busy={authBusy} error={authError} onLogin={login} />
          ) : needsPasswordChange && currentAccount ? (
            <ChangePasswordForm
              login={currentAccount.login}
              onSubmit={changeOwnPassword}
              onLogout={() => {
                setPanelOpen(false)
                logout()
              }}
            />
          ) : (
            <>
              <div className="mx-auto mb-4 flex w-full max-w-xl flex-wrap items-center justify-between gap-2 border border-[var(--border)] bg-black/55 px-3 py-2 backdrop-blur-md">
                <div className="min-w-0 text-left">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">
                    {currentUser?.name}
                  </div>
                  <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
                    {currentUser ? ROLE_LABELS[currentUser.role] : ''}
                    {isSystemAdmin ? ' · администратор' : ''} ·{' '}
                    {visibleDepartments[0]?.name} · логин{' '}
                    {currentAccount?.login}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPanelOpen(false)
                    logout()
                  }}
                  className="inline-flex items-center gap-1.5 border border-[var(--border)] px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--accent-hot)] hover:text-[var(--accent-hot)]"
                >
                  <LogOut size={12} />
                  Выйти
                </button>
              </div>
              <DepartmentLauncher
                departments={visibleDepartments}
                isSystemAdmin={isSystemAdmin}
                canRename={
                  !!actor &&
                  (isSystemAdmin ||
                    (actor.employee.role === 'senior_instructor' &&
                      visibleDepartments.some(
                        (d) => d.id === actor.departmentId,
                      )))
                }
                onOpen={openDepartment}
                onRename={renameDepartment}
                onAdd={addDepartment}
                onRemove={removeDepartment}
              />
            </>
          )}
        </main>
      </div>

      {panelOpen && activeDepartment && !needsPasswordChange ? (
        <DepartmentPanel
          key={activeDepartment.id}
          department={activeDepartment}
          month={state.selectedMonth}
          year={state.selectedYear}
          actor={actor}
          events={state.events}
          accounts={departmentAccounts}
          overtimeRequests={departmentOvertimeRequests}
          knowledgeCuts={departmentKnowledgeCuts}
          dailyReports={departmentDailyReports}
          chatMessages={departmentChatMessages}
          seniorLessons={departmentSeniorLessons}
          tmcItems={departmentTmcItems}
          tmcBoards={departmentTmcBoards}
          tmcBaselines={departmentTmcBaselines}
          tmcRequests={departmentTmcRequests}
          onClose={closePanel}
          onShiftMonth={shiftMonth}
          onResetCredentials={(employeeId, newLogin) =>
            void resetEmployeeCredentials(
              activeDepartment.id,
              employeeId,
              newLogin,
            )
          }
          onSubmitOvertime={submitOvertimeRequest}
          onDecideOvertime={decideOvertimeRequest}
          onUpdateKnowledgeCut={updateKnowledgeCut}
          onUpdateDailyWork={updateDailyWorkReport}
          onUpsertSeniorLesson={upsertSeniorLesson}
          onDeleteSeniorLesson={deleteSeniorLesson}
          onUpsertTmcItem={upsertTmcItem}
          onDeleteTmcItem={deleteTmcItem}
          onClearEmployeeTmcItems={clearEmployeeTmcItems}
          onSnapshotTmcInventory={snapshotTmcInventory}
          onAddTmcBoardsBulk={addTmcBoardsBulk}
          onUpsertTmcBoard={upsertTmcBoard}
          onDeleteTmcBoard={deleteTmcBoard}
          onImportTmcItems={importTmcItems}
          onUpsertTmcRequest={upsertTmcRequest}
          onDecideTmcRequest={decideTmcRequest}
          onDeleteTmcRequest={deleteTmcRequest}
          onSubmitDailyReport={submitDailyReportToSenior}
          onSendChat={sendChatMessage}
          onDeleteChat={deleteChatMessage}
          actions={app}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 border border-[var(--accent-hot)] bg-black/90 px-4 py-3 text-center text-sm text-[var(--text)] shadow-lg">
          <button
            type="button"
            className="absolute right-2 top-1 text-[var(--text-muted)]"
            onClick={dismissToast}
            aria-label="Закрыть"
          >
            ×
          </button>
          {toast}
        </div>
      ) : null}
    </div>
  )
}
