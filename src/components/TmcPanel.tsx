import {
  Camera,
  Download,
  FileUp,
  Package,
  Plus,
  Trash2,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type {
  Employee,
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
} from '../types'
import {
  ROLE_LABELS,
  TMC_BOARD_KIND_LABELS,
  TMC_BOARD_KINDS,
  TMC_BOARD_STATUS_LABELS,
  TMC_BOARD_STATUSES,
  TMC_ITEM_CONDITION_LABELS,
  TMC_ITEM_CONDITIONS,
} from '../types'
import type { ActorContext } from '../lib/rules'
import { isDeptHead } from '../lib/rules'
import { findMissingTmcItems } from '../lib/tmcDiff'
import {
  downloadDepartmentTmcExcel,
  downloadEmployeeTmcExcel,
} from '../lib/tmcExcel'
import {
  isSupportedTmcImportFile,
  parseTmcImportFile,
  type ParsedTmcRow,
} from '../lib/tmcImport'
import { TmcRequestsSection } from './TmcRequestsSection'

interface Props {
  departmentId: string
  departmentName: string
  employees: Employee[]
  items: TmcItem[]
  boards: TmcBoard[]
  baselines: TmcInventoryBaseline[]
  actor: ActorContext | null
  onUpsertItem: (
    departmentId: string,
    employeeId: string,
    itemId: string | null,
    patch: Partial<TmcItem>,
  ) => void
  onDeleteItem: (departmentId: string, itemId: string) => void
  onClearItems: (departmentId: string, employeeId: string) => void
  onSnapshot: (departmentId: string, employeeId: string) => void
  onAddBoards: (
    departmentId: string,
    employeeId: string,
    kind: TmcBoardKind,
    count: number,
    status: TmcBoardStatus,
  ) => void
  onUpdateBoard: (
    departmentId: string,
    employeeId: string,
    boardId: string | null,
    patch: Partial<Pick<TmcBoard, 'kind' | 'status' | 'note'>>,
  ) => void
  onDeleteBoard: (departmentId: string, boardId: string) => void
  requests: TmcEquipmentRequest[]
  onImportItems: (
    departmentId: string,
    employeeId: string,
    rows: ParsedTmcRow[],
    sourceFileName: string,
  ) => void
  onUpsertRequest: (
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
  ) => void
  onDecideRequest: (
    departmentId: string,
    requestId: string,
    status: 'approved' | 'rejected',
    decisionNote?: string,
  ) => void
  onDeleteRequest: (departmentId: string, requestId: string) => void
}

export function TmcPanel({
  departmentId,
  departmentName,
  employees,
  items,
  boards,
  baselines,
  actor,
  onUpsertItem,
  onDeleteItem,
  onClearItems,
  onSnapshot,
  onAddBoards,
  onUpdateBoard,
  onDeleteBoard,
  requests,
  onImportItems,
  onUpsertRequest,
  onDecideRequest,
  onDeleteRequest,
}: Props) {
  const isSenior = isDeptHead(actor, departmentId)
  const selfId = actor?.employee.id ?? ''
  const [selectedId, setSelectedId] = useState(selfId)
  const targetId = isSenior ? selectedId || selfId : selfId
  const targetEmp =
    employees.find((e) => e.id === targetId) ??
    employees.find((e) => e.id === selfId) ??
    null

  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<{
    fileName: string
    rows: ParsedTmcRow[]
    warnings: string[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [warehouseNumber, setWarehouseNumber] = useState('')
  const [condition, setCondition] = useState<TmcItemCondition>('ok')
  const [quantity, setQuantity] = useState('1')

  const [boardKind, setBoardKind] = useState<TmcBoardKind>('lis2')
  const [boardStatus, setBoardStatus] = useState<TmcBoardStatus>('intact')
  const [boardCount, setBoardCount] = useState(1)

  const myItems = useMemo(
    () => items.filter((i) => i.employeeId === targetId),
    [items, targetId],
  )
  const myBoards = useMemo(
    () => boards.filter((b) => b.employeeId === targetId),
    [boards, targetId],
  )
  const myBaseline = useMemo(
    () => baselines.find((b) => b.employeeId === targetId),
    [baselines, targetId],
  )
  const missing = useMemo(
    () => findMissingTmcItems(myBaseline?.items, myItems),
    [myBaseline, myItems],
  )

  const deptByEmployee = useMemo(() => {
    if (!isSenior) return []
    return employees
      .map((emp) => {
        const empItems = items.filter((i) => i.employeeId === emp.id)
        return { emp, empItems, count: empItems.length }
      })
      .filter((row) => row.count > 0)
  }, [isSenior, employees, items])

  const boardSummary = useMemo(() => {
    return TMC_BOARD_KINDS.map((kind) => {
      const list = myBoards.filter((b) => b.kind === kind)
      return {
        kind,
        total: list.length,
        intact: list.filter((b) => b.status === 'intact').length,
        broken: list.filter((b) => b.status === 'broken').length,
        lost: list.filter((b) => b.status === 'lost').length,
      }
    })
  }, [myBoards])

  const addItem = () => {
    if (!targetId || !name.trim()) {
      setHint('Укажите наименование')
      return
    }
    onUpsertItem(departmentId, targetId, null, {
      name: name.trim(),
      warehouseNumber: warehouseNumber.trim(),
      condition,
      quantity: quantity.trim() || '1',
      orderNo: myItems.length + 1,
      positionNo: myItems.length + 1,
    })
    setName('')
    setWarehouseNumber('')
    setCondition('ok')
    setQuantity('1')
    setHint('Позиция добавлена')
  }

  const downloadOne = () => {
    if (!targetEmp) return
    void (async () => {
      setBusy(true)
      try {
        await downloadEmployeeTmcExcel({
          departmentName,
          employee: targetEmp,
          items: myItems,
          boards: myBoards,
          baselineItems: myBaseline?.items,
        })
        setHint('Excel скачан')
      } catch {
        setHint('Не удалось сформировать Excel')
      } finally {
        setBusy(false)
      }
    })()
  }

  const downloadAll = () => {
    void (async () => {
      setBusy(true)
      try {
        await downloadDepartmentTmcExcel({
          departmentName,
          employees,
          items,
          boards,
        })
        setHint('Полный список отдела скачан')
      } catch {
        setHint('Не удалось сформировать Excel')
      } finally {
        setBusy(false)
      }
    })()
  }

  const onPickImportFile = (file: File | null) => {
    if (!file) return
    if (!isSupportedTmcImportFile(file)) {
      setHint('Поддерживаются Excel, Word (.docx), PDF, CSV, TXT')
      return
    }
    void (async () => {
      setBusy(true)
      setHint(null)
      try {
        const result = await parseTmcImportFile(file)
        setImportPreview(result)
        if (!result.rows.length) {
          setHint(
            result.warnings[0] ??
              'В файле не найдено позиций оборудования',
          )
        } else {
          setHint(
            `Распознано позиций: ${result.rows.length}${
              result.warnings.length ? ` · ${result.warnings[0]}` : ''
            }`,
          )
        }
      } catch {
        setHint('Не удалось разобрать файл')
        setImportPreview(null)
      } finally {
        setBusy(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    })()
  }

  const applyImport = () => {
    if (!targetId || !importPreview?.rows.length) return
    onImportItems(
      departmentId,
      targetId,
      importPreview.rows,
      importPreview.fileName,
    )
    setImportPreview(null)
    setHint(`Внесено в базу: ${importPreview.rows.length} поз.`)
  }

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          ТМЦ · личное оборудование
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          {isSenior
            ? 'Импорт из Excel/Word/PDF, заявки на списание и получение, выгрузка Excel по отделу. Сотрудники ведут своё оборудование.'
            : 'Внесите оборудование вручную или загрузите файл (Excel, Word, PDF, CSV). Оформите заявку на списание или получение.'}
        </p>
      </div>

      <div className="roster-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {isSenior ? (
          <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
            <label className="mb-2 block">
              <span className="mb-1 block font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
                Сотрудник отдела
              </span>
              <select
                value={targetId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {ROLE_LABELS[e.role]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !targetEmp}
                onClick={downloadOne}
                className="inline-flex items-center gap-1.5 border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
              >
                <Download size={13} />
                Скачать
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={downloadAll}
                className="inline-flex items-center gap-1.5 border border-[var(--border)] px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                <Download size={13} />
                Скачать полный список
              </button>
            </div>
          </section>
        ) : (
          <section className="border border-[var(--border)] bg-black/40 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-[var(--text)]">
                  {actor?.employee.name}
                </div>
                <div className="font-[family-name:var(--mono)] text-[11px] text-[var(--accent)]">
                  {actor ? ROLE_LABELS[actor.employee.role] : ''}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={downloadOne}
                className="inline-flex items-center gap-1.5 border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
              >
                <Download size={13} />
                Скачать
              </button>
            </div>
          </section>
        )}

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            <FileUp size={12} />
            Загрузка файла → база ТМЦ
          </div>
          <p className="mb-3 m-0 text-xs text-[var(--text-muted)]">
            Excel (.xlsx), Word (.docx), PDF, CSV или TXT. Система читает
            наименование, инв. №, состояние и количество и предлагает внести в
            учёт{targetEmp ? ` · ${targetEmp.name}` : ''}.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.docx,.pdf,.csv,.tsv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain"
            className="hidden"
            onChange={(e) => onPickImportFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !targetId}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 border border-[var(--trip)]/50 bg-[var(--trip)]/10 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--trip)] hover:bg-[var(--trip)]/20 disabled:opacity-50"
            >
              <FileUp size={14} />
              Выбрать файл
            </button>
            {importPreview?.rows.length ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={applyImport}
                  className="inline-flex items-center gap-1.5 border border-[var(--present)]/60 bg-[var(--present)]/15 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/25"
                >
                  Внести {importPreview.rows.length} в базу
                </button>
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="inline-flex items-center gap-1.5 border border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                >
                  Отменить
                </button>
              </>
            ) : null}
          </div>
          {importPreview?.rows.length ? (
            <div className="mt-3 max-h-48 overflow-y-auto border border-[var(--border)]/70 bg-black/35">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-black/80 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-1">Наименование</th>
                    <th className="px-2 py-1">Инв.</th>
                    <th className="px-2 py-1">Сост.</th>
                    <th className="px-2 py-1">Кол-во</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 40).map((row, idx) => (
                    <tr
                      key={`${row.name}-${idx}`}
                      className="border-t border-[var(--border)]/40 text-[var(--text-muted)]"
                    >
                      <td className="px-2 py-1 text-[var(--text)]">{row.name}</td>
                      <td className="px-2 py-1 font-[family-name:var(--mono)]">
                        {row.warehouseNumber || '—'}
                      </td>
                      <td className="px-2 py-1">
                        {TMC_ITEM_CONDITION_LABELS[row.condition]}
                      </td>
                      <td className="px-2 py-1 font-[family-name:var(--mono)]">
                        {row.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.rows.length > 40 ? (
                <div className="px-2 py-1 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                  … ещё {importPreview.rows.length - 40}
                </div>
              ) : null}
            </div>
          ) : null}
          {importPreview?.warnings.length ? (
            <p className="mt-2 m-0 text-[11px] text-[var(--overtime)]">
              {importPreview.warnings.join(' · ')}
            </p>
          ) : null}
        </section>

        <TmcRequestsSection
          departmentId={departmentId}
          employeeId={targetId}
          isSenior={isSenior}
          myItems={myItems}
          requests={requests}
          onUpsert={onUpsertRequest}
          onDecide={onDecideRequest}
          onDelete={onDeleteRequest}
        />

        {isSenior ? (
          <section className="border border-[var(--accent)]/35 bg-black/45 px-3 py-3">
            <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
              Всё оборудование отдела · {items.length}
            </div>
            {deptByEmployee.length === 0 ? (
              <p className="m-0 text-sm text-[var(--text-muted)]">
                Пока никто не внёс оборудование.
              </p>
            ) : (
              <div className="space-y-3">
                {deptByEmployee.map(({ emp, empItems, count }) => (
                  <div key={emp.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(emp.id)}
                      className="mb-1 flex w-full items-baseline justify-between gap-2 text-left"
                    >
                      <span className="font-semibold text-[var(--text)]">
                        {emp.name}
                        <span className="ml-2 font-[family-name:var(--mono)] text-[10px] font-normal text-[var(--text-muted)]">
                          {ROLE_LABELS[emp.role]}
                        </span>
                      </span>
                      <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--accent)]">
                        {count} поз.
                      </span>
                    </button>
                    <ul className="space-y-1">
                      {empItems.slice(0, 8).map((item) => (
                        <li
                          key={item.id}
                          className="border border-[var(--border)]/70 bg-black/40 px-2 py-1 text-[12px] text-[var(--text-muted)]"
                        >
                          <span className="text-[var(--text)]">{item.name}</span>
                          <span className="ml-2 font-[family-name:var(--mono)] text-[10px]">
                            {[
                              item.warehouseNumber
                                ? `инв. ${item.warehouseNumber}`
                                : '',
                              TMC_ITEM_CONDITION_LABELS[item.condition],
                              item.quantity,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </li>
                      ))}
                      {empItems.length > 8 ? (
                        <li className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                          … ещё {empItems.length - 8}. Выберите сотрудника выше.
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            Добавить оборудование
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Наименование
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Компьютер (Ноутбук)"
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Инвентарный номер
              </span>
              <input
                value={warehouseNumber}
                onChange={(e) => setWarehouseNumber(e.target.value)}
                placeholder="Инв. №"
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Состояние
              </span>
              <select
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as TmcItemCondition)
                }
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              >
                {TMC_ITEM_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {TMC_ITEM_CONDITION_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Количество
              </span>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-[var(--present)]/60 bg-[var(--present)]/15 px-3 py-2.5 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--present)] hover:bg-[var(--present)]/25"
          >
            <Plus size={14} />
            Добавить в ТМЦ
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!targetId || !myItems.length}
              onClick={() => {
                if (!targetId) return
                onSnapshot(departmentId, targetId)
                setHint('Инвентаризация зафиксирована')
              }}
              className="inline-flex items-center gap-1.5 border border-[var(--accent)]/50 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/15 disabled:opacity-50"
            >
              <Camera size={14} />
              Зафиксировать инвентаризацию
            </button>
            {myItems.length ? (
              <button
                type="button"
                onClick={() => {
                  if (
                    !targetId ||
                    !confirm('Очистить оборудование этого сотрудника?')
                  )
                    return
                  onClearItems(departmentId, targetId)
                }}
                className="inline-flex items-center gap-1.5 border border-[var(--accent-hot)]/40 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)]"
              >
                <Trash2 size={14} />
                Очистить список
              </button>
            ) : null}
          </div>
        </section>

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            <Package size={12} />
            Борта БВС
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {boardSummary.map((row) => (
              <div
                key={row.kind}
                className="border border-[var(--border)] bg-black/40 px-2 py-2"
              >
                <div className="text-[12px] font-semibold text-[var(--text)]">
                  {TMC_BOARD_KIND_LABELS[row.kind]}
                </div>
                <div className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                  всего {row.total}
                </div>
                <div className="mt-1 font-[family-name:var(--mono)] text-[10px]">
                  <span className="text-[var(--present)]">цел {row.intact}</span>
                  {' · '}
                  <span className="text-[var(--accent-hot)]">
                    разбит {row.broken}
                  </span>
                  {' · '}
                  <span className="text-[var(--accent)]">
                    потерян {row.lost}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Тип борта
              </span>
              <select
                value={boardKind}
                onChange={(e) => setBoardKind(e.target.value as TmcBoardKind)}
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              >
                {TMC_BOARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TMC_BOARD_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Статус
              </span>
              <select
                value={boardStatus}
                onChange={(e) =>
                  setBoardStatus(e.target.value as TmcBoardStatus)
                }
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              >
                {TMC_BOARD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TMC_BOARD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Кол-во
              </span>
              <input
                type="number"
                min={1}
                max={50}
                value={boardCount}
                onChange={(e) => setBoardCount(Number(e.target.value) || 1)}
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!targetId) return
              onAddBoards(
                departmentId,
                targetId,
                boardKind,
                boardCount,
                boardStatus,
              )
            }}
            className="inline-flex items-center gap-1.5 border border-[var(--accent)]/50 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/15"
          >
            <Plus size={13} />
            Добавить борта
          </button>
          {myBoards.length ? (
            <ul className="mt-3 space-y-1.5">
              {myBoards.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-2 border border-[var(--border)] bg-black/45 px-2 py-1.5"
                >
                  <span className="min-w-[120px] text-sm text-[var(--text)]">
                    {TMC_BOARD_KIND_LABELS[b.kind]}
                  </span>
                  <select
                    value={b.status}
                    onChange={(e) =>
                      onUpdateBoard(departmentId, b.employeeId, b.id, {
                        status: e.target.value as TmcBoardStatus,
                      })
                    }
                    className="border border-[var(--border)] bg-black/55 px-2 py-1 text-xs outline-none"
                  >
                    {TMC_BOARD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TMC_BOARD_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onDeleteBoard(departmentId, b.id)}
                    className="ml-auto text-[var(--accent-hot)]"
                    aria-label="Удалить борт"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {!isSenior && missing.length ? (
          <section className="border border-[var(--accent-hot)]/50 bg-[var(--accent-hot)]/10 px-3 py-3">
            <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)]">
              Пропало относительно инвентаризации · {missing.length}
            </div>
            <ul className="space-y-1.5">
              {missing.map((item, idx) => (
                <li
                  key={`${item.warehouseNumber}-${item.name}-${idx}`}
                  className="border border-[var(--accent-hot)]/40 bg-black/40 px-2.5 py-2"
                >
                  <div className="font-semibold text-[var(--accent-hot)]">
                    {item.name}
                  </div>
                  <div className="mt-0.5 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                    {[
                      item.warehouseNumber
                        ? `инв. ${item.warehouseNumber}`
                        : '',
                      TMC_ITEM_CONDITION_LABELS[item.condition],
                      item.quantity,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
              Список оборудования · {myItems.length}
              {targetEmp && isSenior ? ` · ${targetEmp.name}` : ''}
            </div>
            {myBaseline ? (
              <div className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                база:{' '}
                {new Date(myBaseline.takenAt).toLocaleDateString('ru-RU')}
                {missing.length ? (
                  <span className="ml-2 text-[var(--accent-hot)]">
                    пропало {missing.length}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {myItems.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              Пока пусто. Добавьте наименование, инвентарный номер, состояние и
              количество.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {myItems.map((item) => (
                <li
                  key={item.id}
                  className="border border-[var(--border)] bg-black/50 px-2.5 py-2"
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="mb-0.5 block text-[10px] text-[var(--text-muted)]">
                        Наименование
                      </span>
                      <input
                        value={item.name}
                        onChange={(e) =>
                          onUpsertItem(
                            departmentId,
                            item.employeeId,
                            item.id,
                            { name: e.target.value },
                          )
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] text-[var(--text-muted)]">
                        Инвентарный номер
                      </span>
                      <input
                        value={item.warehouseNumber}
                        onChange={(e) =>
                          onUpsertItem(
                            departmentId,
                            item.employeeId,
                            item.id,
                            { warehouseNumber: e.target.value },
                          )
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 font-[family-name:var(--mono)] text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] text-[var(--text-muted)]">
                        Состояние
                      </span>
                      <select
                        value={item.condition}
                        onChange={(e) =>
                          onUpsertItem(
                            departmentId,
                            item.employeeId,
                            item.id,
                            {
                              condition: e.target
                                .value as TmcItemCondition,
                            },
                          )
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                      >
                        {TMC_ITEM_CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {TMC_ITEM_CONDITION_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] text-[var(--text-muted)]">
                        Количество
                      </span>
                      <input
                        value={item.quantity}
                        onChange={(e) =>
                          onUpsertItem(
                            departmentId,
                            item.employeeId,
                            item.id,
                            { quantity: e.target.value },
                          )
                        }
                        className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 font-[family-name:var(--mono)] text-sm outline-none focus:border-[var(--accent)]"
                      />
                    </label>
                    <div className="flex items-end sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm('Удалить позицию?')) return
                          onDeleteItem(departmentId, item.id)
                        }}
                        className="inline-flex items-center gap-1 text-[var(--accent-hot)]"
                        aria-label="Удалить"
                      >
                        <Trash2 size={14} />
                        Удалить
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {hint ? (
          <p className="m-0 text-center text-[11px] text-[var(--accent)]">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
