import {
  ClipboardList,
  Download,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  TmcEquipmentRequest,
  TmcItem,
  TmcItemCondition,
  TmcRequestKind,
  TmcRequestLine,
} from '../types'
import {
  TMC_ITEM_CONDITION_LABELS,
  TMC_ITEM_CONDITIONS,
  TMC_REQUEST_KIND_LABELS,
  TMC_REQUEST_STATUS_LABELS,
} from '../types'
import { downloadTmcAct, shareTmcAct } from '../lib/tmcActExcel'

type DraftLine = {
  key: string
  name: string
  warehouseNumber: string
  quantity: string
  condition: TmcItemCondition
  reason: string
  sourceItemId: string | null
}

function emptyLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    name: '',
    warehouseNumber: '',
    quantity: '1',
    condition: 'ok',
    reason: '',
    sourceItemId: null,
  }
}

function todayInput(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export type TmcRequestUpsertPatch = {
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
  status?: TmcEquipmentRequest['status']
}

interface Props {
  departmentId: string
  employeeId: string
  employeeName?: string
  isSenior: boolean
  myItems: TmcItem[]
  requests: TmcEquipmentRequest[]
  onUpsert: (
    departmentId: string,
    requestId: string | null,
    patch: TmcRequestUpsertPatch,
  ) => void
  onDecide: (
    departmentId: string,
    requestId: string,
    status: 'approved' | 'rejected',
    decisionNote?: string,
  ) => void
  onDelete: (departmentId: string, requestId: string) => void
}

export function TmcRequestsSection({
  departmentId,
  employeeId,
  isSenior,
  myItems,
  requests,
  onUpsert,
  onDecide,
  onDelete,
}: Props) {
  const [kind, setKind] = useState<TmcRequestKind>('receipt')
  const [docDate, setDocDate] = useState(todayInput)
  const [requestNo, setRequestNo] = useState('')
  const [streamNo, setStreamNo] = useState('')
  const [groupNo, setGroupNo] = useState('')
  const [cabinet, setCabinet] = useState('')
  const [roleTitle, setRoleTitle] = useState('инструктор')
  const [addressee, setAddressee] = useState(
    'Руководителю управления организационной работой',
  )
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [localHint, setLocalHint] = useState<string | null>(null)

  const sorted = useMemo(
    () =>
      [...requests].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [requests],
  )

  const pending = sorted.filter((r) => r.status === 'submitted')

  const fillFromItem = (key: string, itemId: string) => {
    const item = myItems.find((i) => i.id === itemId)
    if (!item) return
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              sourceItemId: item.id,
              name: item.name,
              warehouseNumber: item.warehouseNumber,
              quantity: item.quantity || '1',
              condition: item.condition,
            }
          : l,
      ),
    )
  }

  const buildPatch = (
    status: 'draft' | 'submitted',
  ): TmcRequestUpsertPatch => ({
    kind,
    title:
      kind === 'receipt'
        ? `Заявка на получение ТМЦ · гр.${groupNo || '—'} поток ${streamNo || '—'}`
        : `Акт передачи на ремонтный участок · поток ${streamNo || '—'} гр.${groupNo || '—'}`,
    note: note.trim(),
    docDate,
    requestNo: requestNo.trim(),
    streamNo: streamNo.trim(),
    groupNo: groupNo.trim(),
    cabinet: cabinet.trim(),
    roleTitle: roleTitle.trim() || 'инструктор',
    addressee: addressee.trim(),
    status,
    lines: lines.map((l) => ({
      name: l.name,
      warehouseNumber: l.warehouseNumber,
      quantity: l.quantity,
      condition: l.condition,
      reason: l.reason,
      sourceItemId: l.sourceItemId,
    })),
  })

  const save = (status: 'draft' | 'submitted') => {
    onUpsert(departmentId, null, buildPatch(status))
    setLines([emptyLine()])
    setNote('')
    setLocalHint(
      status === 'submitted'
        ? 'Заявка отправлена. Скачайте Excel или поделитесь из журнала ниже.'
        : 'Черновик сохранён',
    )
  }

  const exportAct = async (
    req: TmcEquipmentRequest,
    mode: 'download' | 'share',
  ) => {
    setBusyId(req.id)
    setLocalHint(null)
    try {
      const result =
        mode === 'share' ? await shareTmcAct(req) : await downloadTmcAct(req)
      setLocalHint(
        result === 'shared'
          ? 'Открыт системный шаринг (мессенджер / почта / диск)'
          : 'Excel скачан на устройство',
      )
    } catch {
      setLocalHint('Не удалось сформировать файл')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
        <ClipboardList size={12} />
        Акты · получение и передача на ремонт
      </div>
      <p className="mb-3 m-0 text-xs text-[var(--text-muted)]">
        Формы по образцам: «Заявка на получение ТМЦ» и «Акт передачи на
        ремонтный участок». Готовый Excel можно скачать или отправить в
        установленный мессенджер / почту / соцсеть через системный шаринг.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <a
          href="/tmc-templates/Заявка_на_получение_ТМЦ_образец.xlsx"
          download
          className="inline-flex items-center gap-1.5 border border-[var(--border)] px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <Download size={12} />
          Образец заявки
        </a>
        <a
          href="/tmc-templates/Акт_передачи_на_ремонтный_участок_образец.xlsx"
          download
          className="inline-flex items-center gap-1.5 border border-[var(--border)] px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <Download size={12} />
          Образец акта на ремонт
        </a>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(['receipt', 'writeoff'] as TmcRequestKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`border px-3 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider ${
              kind === k
                ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-muted)]'
            }`}
          >
            {TMC_REQUEST_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
            Дата
          </span>
          <input
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        {kind === 'receipt' ? (
          <label className="block">
            <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
              № заявки
            </span>
            <input
              value={requestNo}
              onChange={(e) => setRequestNo(e.target.value)}
              placeholder="2"
              className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
            Поток
          </span>
          <input
            value={streamNo}
            onChange={(e) => setStreamNo(e.target.value)}
            placeholder="36"
            className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
            Группа
          </span>
          <input
            value={groupNo}
            onChange={(e) => setGroupNo(e.target.value)}
            placeholder={kind === 'writeoff' ? '44-45' : '37'}
            className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
            Кабинет
          </span>
          <input
            value={cabinet}
            onChange={(e) => setCabinet(e.target.value)}
            placeholder={kind === 'writeoff' ? '206-207' : 'БЛ'}
            className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
            Должность
          </span>
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        {kind === 'receipt' ? (
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
              Адресат
            </span>
            <input
              value={addressee}
              onChange={(e) => setAddressee(e.target.value)}
              className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        ) : null}
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
            Примечание к акту
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Доп. сведения…"
            className="w-full resize-y border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>

      <div className="mt-3 space-y-2">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          Позиции ·{' '}
          {kind === 'receipt'
            ? 'наименование, кол-во, комментарий'
            : 'наименование, инв. №, комментарий'}
        </div>
        {lines.map((line) => (
          <div
            key={line.key}
            className="space-y-2 border border-[var(--border)]/80 bg-black/35 px-2 py-2"
          >
            {kind === 'writeoff' && myItems.length ? (
              <label className="block">
                <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                  Из моего ТМЦ
                </span>
                <select
                  value={line.sourceItemId ?? ''}
                  onChange={(e) => fillFromItem(line.key, e.target.value)}
                  className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Выбрать позицию…</option>
                  {myItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.warehouseNumber ? ` · инв. ${i.warehouseNumber}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                  Наименование ТМЦ
                </span>
                <input
                  value={line.name}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, name: e.target.value } : l,
                      ),
                    )
                  }
                  placeholder={
                    kind === 'receipt' ? 'БВС ЛИС 2.0  день' : 'БВС "ЛИС 2.0"'
                  }
                  className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
              {kind === 'writeoff' ? (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Инвентарный номер
                  </span>
                  <input
                    value={line.warehouseNumber}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? { ...l, warehouseNumber: e.target.value }
                            : l,
                        ),
                      )
                    }
                    placeholder="07.10.00.001639"
                    className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Кол-во шт.
                  </span>
                  <input
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? { ...l, quantity: e.target.value }
                            : l,
                        ),
                      )
                    }
                    className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </label>
              )}
              {kind === 'receipt' ? (
                <label className="block">
                  <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                    Состояние
                  </span>
                  <select
                    value={line.condition}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? {
                                ...l,
                                condition: e.target.value as TmcItemCondition,
                              }
                            : l,
                        ),
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
              ) : null}
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                  Комментарий
                </span>
                <input
                  value={line.reason}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key
                          ? { ...l, reason: e.target.value }
                          : l,
                      ),
                    )
                  }
                  placeholder={
                    kind === 'receipt'
                      ? 'группа37 каб БЛ'
                      : 'Неисправность / на ремонт…'
                  }
                  className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            {lines.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => prev.filter((l) => l.key !== line.key))
                }
                className="inline-flex items-center gap-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)]"
              >
                <Trash2 size={12} />
                Убрать строку
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
          className="inline-flex items-center gap-1.5 border border-[var(--border)] px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          <Plus size={12} />
          Ещё позиция
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save('draft')}
          disabled={!employeeId}
          className="inline-flex items-center gap-1.5 border border-[var(--border)] px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          Сохранить черновик
        </button>
        <button
          type="button"
          onClick={() => save('submitted')}
          disabled={!employeeId}
          className="inline-flex items-center gap-1.5 border border-[var(--present)]/60 bg-[var(--present)]/15 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/25 disabled:opacity-50"
        >
          Отправить на согласование
        </button>
      </div>

      {localHint ? (
        <p className="mt-2 m-0 text-[11px] text-[var(--present)]">{localHint}</p>
      ) : null}

      {isSenior && pending.length ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            На рассмотрении · {pending.length}
          </div>
          <div className="space-y-2">
            {pending.map((req) => (
              <div
                key={req.id}
                className="border border-[var(--accent)]/35 bg-black/45 px-2 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold text-[var(--text)]">
                    {TMC_REQUEST_KIND_LABELS[req.kind]} · {req.employeeName}
                  </div>
                  <div className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                    {req.lines.length} поз.
                    {req.streamNo ? ` · п.${req.streamNo}` : ''}
                    {req.groupNo ? ` · гр.${req.groupNo}` : ''}
                  </div>
                </div>
                <ul className="mt-2 space-y-1">
                  {req.lines.map((l) => (
                    <li
                      key={l.id}
                      className="font-[family-name:var(--mono)] text-[11px] text-[var(--text-muted)]"
                    >
                      <span className="text-[var(--text)]">{l.name}</span>
                      {req.kind === 'receipt'
                        ? ` · ${l.quantity}`
                        : l.warehouseNumber
                          ? ` · инв. ${l.warehouseNumber}`
                          : ''}
                      {l.reason ? ` · ${l.reason}` : ''}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void exportAct(req, 'download')}
                    className="inline-flex items-center gap-1 border border-[var(--trip)]/40 px-2 py-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--trip)]"
                  >
                    <Download size={12} /> Excel
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void exportAct(req, 'share')}
                    className="inline-flex items-center gap-1 border border-[var(--accent)]/40 px-2 py-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]"
                  >
                    <Share2 size={12} /> Поделиться
                  </button>
                </div>
                <input
                  value={decisionNotes[req.id] ?? ''}
                  onChange={(e) =>
                    setDecisionNotes((prev) => ({
                      ...prev,
                      [req.id]: e.target.value,
                    }))
                  }
                  placeholder="Комментарий к решению…"
                  className="mt-2 w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onDecide(
                        departmentId,
                        req.id,
                        'approved',
                        decisionNotes[req.id] ?? '',
                      )
                    }
                    className="border border-[var(--present)]/50 bg-[var(--present)]/15 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)]"
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onDecide(
                        departmentId,
                        req.id,
                        'rejected',
                        decisionNotes[req.id] ?? '',
                      )
                    }
                    className="border border-[var(--accent-hot)]/40 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)]"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {sorted.length ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Журнал актов · {sorted.length}
          </div>
          <ul className="space-y-2">
            {sorted.map((req) => (
              <li
                key={req.id}
                className="border border-[var(--border)]/70 bg-black/35 px-2 py-2 text-[12px]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-[var(--text)]">
                      {TMC_REQUEST_KIND_LABELS[req.kind]}
                    </span>
                    <span className="ml-2 font-[family-name:var(--mono)] text-[10px] text-[var(--accent)]">
                      {TMC_REQUEST_STATUS_LABELS[req.status]}
                    </span>
                    <div className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                      {req.employeeName}
                      {req.requestNo ? ` · №${req.requestNo}` : ''}
                      {req.streamNo ? ` · поток ${req.streamNo}` : ''}
                      {req.groupNo ? ` · гр. ${req.groupNo}` : ''}
                      {req.cabinet ? ` · каб. ${req.cabinet}` : ''}
                      {` · ${req.lines.length} поз.`}
                    </div>
                  </div>
                  {(req.status === 'draft' || isSenior) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm('Удалить заявку?')) return
                        onDelete(departmentId, req.id)
                      }}
                      className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)]"
                    >
                      Удалить
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void exportAct(req, 'download')}
                    className="inline-flex items-center gap-1.5 border border-[var(--trip)]/50 bg-[var(--trip)]/10 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--trip)] disabled:opacity-50"
                  >
                    <Download size={12} />
                    Скачать Excel
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void exportAct(req, 'share')}
                    className="inline-flex items-center gap-1.5 border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)] disabled:opacity-50"
                  >
                    <Share2 size={12} />
                    Поделиться
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
