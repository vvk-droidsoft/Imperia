import { Plus, Radio, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Department, Location } from '../types'
import { LOCATION_LABELS, ROLE_LABELS } from '../types'
import {
  assignFrequenciesToTents,
  DIGITAL_FREQ_END_MHZ,
  DIGITAL_FREQ_START_MHZ,
  DIGITAL_FREQ_STEP_MHZ,
  FPV_ACHIEVABLE_GAP_MHZ,
  FPV_GRID_SOURCE,
  FPV_MIN_GAP_MHZ,
  generateFrequencyLayout,
  loadLayoutSeed,
  saveLayoutSeed,
  vtxDisplayName,
} from '../lib/fpvFrequencyGrid'
import {
  getTentRoster,
  loadTentRosterStore,
  newCadetId,
  setTentRoster,
  type TentRoster,
  type TentRosterStore,
} from '../lib/tentRoster'

const POLYGON_TABS: { id: Location; label: string }[] = [
  { id: 'alabino', label: 'Алабино' },
  { id: 'golovenki', label: 'Головеньки' },
  { id: 'drakino', label: 'Дракино' },
  { id: 'volosovo', label: 'Волосово' },
]

const TENT_COUNT = 10
const TENT_TABS = Array.from({ length: TENT_COUNT }, (_, i) => ({
  id: i + 1,
  label: `Палатка №${i + 1}`,
}))

interface Props {
  department: Department
}

export function PolygonPanel({ department }: Props) {
  const [tab, setTab] = useState<Location>('alabino')
  const [tent, setTent] = useState(1)
  const [store, setStore] = useState<TentRosterStore>(() => loadTentRosterStore())
  const [staffPick, setStaffPick] = useState('')
  const [cadetNumber, setCadetNumber] = useState('')
  const [cadetCallsign, setCadetCallsign] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [freqSeed, setFreqSeed] = useState(
    () => loadLayoutSeed(department.id, 'alabino') ?? 1,
  )
  const [freqHint, setFreqHint] = useState<string | null>(null)

  const roster = useMemo(
    () => getTentRoster(store, department.id, tab, tent),
    [store, department.id, tab, tent],
  )

  const staffPool = useMemo(
    () =>
      department.employees.filter(
        (e) => e.role === 'instructor' || e.role === 'assistant',
      ),
    [department.employees],
  )

  const tentStaff = useMemo(
    () =>
      roster.staffIds
        .map((id) => staffPool.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => !!e),
    [roster.staffIds, staffPool],
  )

  const availableStaff = useMemo(
    () => staffPool.filter((e) => !roster.staffIds.includes(e.id)),
    [staffPool, roster.staffIds],
  )

  const onSite = useMemo(
    () =>
      department.employees.filter(
        (e) => e.location === tab && e.attendance === 'in',
      ),
    [department.employees, tab],
  )

  const assigned = useMemo(
    () => department.employees.filter((e) => e.location === tab),
    [department.employees, tab],
  )

  const active = POLYGON_TABS.find((t) => t.id === tab)!
  const tentLabel = `Палатка №${tent}`

  const tentFrequencies = useMemo(
    () => assignFrequenciesToTents(tab, TENT_COUNT, FPV_MIN_GAP_MHZ, freqSeed),
    [tab, freqSeed],
  )
  const currentFreqs = tentFrequencies[tent] ?? []

  const switchPolygon = (location: Location) => {
    setTab(location)
    setTent(1)
    setHint(null)
    setFreqSeed(loadLayoutSeed(department.id, location) ?? 1)
    setFreqHint(null)
  }

  const generateFrequencies = () => {
    const result = generateFrequencyLayout(tab, TENT_COUNT, FPV_MIN_GAP_MHZ)
    setFreqSeed(result.seed)
    saveLayoutSeed(department.id, tab, result.seed)
    setFreqHint(
      `Сгенерировано: ${result.bothVtx}/10 палаток Foxeer+Blitz · ${result.total} частот · разнос ≥${result.minGapActual} МГц`,
    )
  }

  const persist = (next: TentRoster) => {
    setStore(setTentRoster(store, department.id, tab, tent, next))
  }

  const tentBadge = (tentId: number) => {
    const r = getTentRoster(store, department.id, tab, tentId)
    return r.staffIds.length + r.cadets.length
  }

  const addStaff = () => {
    if (!staffPick) {
      setHint('Выберите инструктора или ассистента')
      return
    }
    if (roster.staffIds.includes(staffPick)) return
    persist({ ...roster, staffIds: [...roster.staffIds, staffPick] })
    setStaffPick('')
    setHint(null)
  }

  const removeStaff = (employeeId: string) => {
    persist({
      ...roster,
      staffIds: roster.staffIds.filter((id) => id !== employeeId),
    })
  }

  const addCadet = () => {
    const number = cadetNumber.trim()
    const callsign = cadetCallsign.trim()
    if (!number && !callsign) {
      setHint('Укажите индивидуальный номер и/или позывной')
      return
    }
    persist({
      ...roster,
      cadets: [
        ...roster.cadets,
        { id: newCadetId(), number, callsign },
      ],
    })
    setCadetNumber('')
    setCadetCallsign('')
    setHint(null)
  }

  const updateCadet = (
    id: string,
    patch: Partial<Pick<TentRoster['cadets'][number], 'number' | 'callsign'>>,
  ) => {
    persist({
      ...roster,
      cadets: roster.cadets.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })
  }

  const removeCadet = (id: string) => {
    persist({
      ...roster,
      cadets: roster.cadets.filter((c) => c.id !== id),
    })
  }

  return (
    <div className="dept-glass flex h-full min-h-0 flex-col overflow-hidden border">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        <div className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">
          Полигон
        </div>
        <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
          Полигон → палатка: Foxeer + Blitz 5.8 и цифра{' '}
          {DIGITAL_FREQ_START_MHZ}–{DIGITAL_FREQ_END_MHZ} МГц (шаг{' '}
          {DIGITAL_FREQ_STEP_MHZ}), генерация, состав, номера и позывные.
        </p>
      </div>

      <div className="shrink-0 overflow-x-auto border-b border-[var(--border)] px-2 py-2">
        <div className="flex min-w-max gap-1.5">
          {POLYGON_TABS.map((t) => {
            const activeTab = t.id === tab
            const count = department.employees.filter(
              (e) => e.location === t.id,
            ).length
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchPolygon(t.id)}
                className={`inline-flex items-center gap-1.5 border px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider transition ${
                  activeTab
                    ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'border-[var(--border)] bg-black/40 text-[var(--text-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]'
                }`}
              >
                {t.label}
                <span className="font-[family-name:var(--mono)] text-[9px] opacity-80">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="shrink-0 overflow-x-auto border-b border-[var(--border)] px-2 py-2">
        <div className="mb-1.5 font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {active.label} · палатки
        </div>
        <div className="flex min-w-max gap-1.5">
          {TENT_TABS.map((t) => {
            const activeTent = t.id === tent
            const badge = tentBadge(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTent(t.id)
                  setHint(null)
                }}
                className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider transition ${
                  activeTent
                    ? 'border-[var(--present)]/70 bg-[var(--present)]/15 text-[var(--present)]'
                    : 'border-[var(--border)] bg-black/40 text-[var(--text-muted)] hover:border-[var(--present)]/40 hover:text-[var(--present)]'
                }`}
              >
                {t.label}
                {badge > 0 ? (
                  <span className="opacity-80">{badge}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="roster-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="border border-[var(--accent)]/35 bg-black/45 px-3 py-3">
          <div className="font-[family-name:var(--display)] text-lg uppercase tracking-wide text-[var(--text)]">
            {LOCATION_LABELS[active.id]}
          </div>
          <p className="mt-1 m-0 font-[family-name:var(--mono)] text-xs uppercase tracking-wider text-[var(--present)]">
            {tentLabel}
          </p>
          <p className="mt-1 m-0 text-xs text-[var(--text-muted)]">
            На палатке: состав <b className="text-[var(--text)]">{tentStaff.length}</b>
            {' · '}
            курсантов <b className="text-[var(--text)]">{roster.cadets.length}</b>
            {' · '}
            частот <b className="text-[var(--text)]">{currentFreqs.length}</b>
            {' · '}
            на полигоне сейчас:{' '}
            <b className="text-[var(--present)]">{onSite.length}</b>
          </p>
        </section>

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
              <Radio size={12} />
              Частотная сетка · {tentLabel} · разнос ≥{FPV_MIN_GAP_MHZ} МГц
            </div>
            <span className="font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {FPV_GRID_SOURCE}
            </span>
          </div>
          <p className="mb-3 m-0 text-xs text-[var(--text-muted)]">
            На палатке три частоты: Foxeer 5.8, Blitz 5.8 и цифровая{' '}
            {DIGITAL_FREQ_START_MHZ}+(N−1)×{DIGITAL_FREQ_STEP_MHZ} МГц (палатка
            1 → {DIGITAL_FREQ_START_MHZ}, …, 9 → {DIGITAL_FREQ_END_MHZ}, 10 →{' '}
            {DIGITAL_FREQ_START_MHZ + 9 * DIGITAL_FREQ_STEP_MHZ}). Обязательные
            Foxeer на 1–6: X5, X8, L6, R5, R7, H8. Аналог 5.8 — разнос ≥
            {FPV_ACHIEVABLE_GAP_MHZ} МГц. «Сгенерировать» переставляет только
            Foxeer/Blitz; цифра закреплена за номером палатки.
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generateFrequencies}
              className="inline-flex items-center gap-1.5 border border-[var(--present)]/60 bg-[var(--present)]/15 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/25"
            >
              <RefreshCw size={14} />
              Сгенерировать частоты
            </button>
            <span className="self-center font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
              seed {freqSeed}
            </span>
          </div>
          {freqHint ? (
            <p className="mb-3 m-0 text-[11px] text-[var(--present)]">{freqHint}</p>
          ) : null}

          {currentFreqs.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              Для этой палатки частоты не назначены. Нажмите «Сгенерировать
              частоты».
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {currentFreqs.map((ch) => (
                <div
                  key={ch.id}
                  className={`border px-2 py-2 ${
                    ch.vtx === 'foxeer'
                      ? 'border-[var(--accent)]/40 bg-black/55'
                      : ch.vtx === 'blitz'
                        ? 'border-[var(--present)]/35 bg-black/55'
                        : 'border-[var(--trip)]/40 bg-black/55'
                  }`}
                >
                  <div className="font-[family-name:var(--mono)] text-[11px] uppercase tracking-wider text-[var(--accent)]">
                    {ch.label}
                  </div>
                  <div className="font-[family-name:var(--display)] text-base leading-tight text-[var(--text)]">
                    {ch.freqMHz}
                    <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                      МГц
                    </span>
                  </div>
                  <div
                    className={`mt-1 font-[family-name:var(--mono)] text-[9px] uppercase tracking-wide ${
                      ch.vtx === 'foxeer'
                        ? 'text-[var(--accent)]'
                        : ch.vtx === 'blitz'
                          ? 'text-[var(--present)]'
                          : 'text-[var(--trip)]'
                    }`}
                  >
                    {ch.vtx === 'digital' ? 'Цифра' : 'Видек'}:{' '}
                    {vtxDisplayName(ch.vtx)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="mb-2 font-[family-name:var(--mono)] text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Все палатки · {active.label}
            </div>
            <div className="space-y-1.5">
              {TENT_TABS.map((t) => {
                const freqs = tentFrequencies[t.id] ?? []
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTent(t.id)}
                    className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 border px-2 py-1.5 text-left transition ${
                      t.id === tent
                        ? 'border-[var(--present)]/50 bg-[var(--present)]/10'
                        : 'border-[var(--border)] bg-black/40 hover:border-[var(--accent)]/40'
                    }`}
                  >
                    <span className="shrink-0 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)]">
                      №{t.id}
                    </span>
                    <span className="min-w-0 flex-1 font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                      {freqs
                        .map((f) => {
                          const tag =
                            f.vtx === 'foxeer'
                              ? 'Foxeer'
                              : f.vtx === 'blitz'
                                ? 'Blitz'
                                : 'Цифра'
                          return `${f.label} ${f.freqMHz} (${tag})`
                        })
                        .join(' · ') || '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            <Users size={12} />
            Состав палатки · инструкторы и ассистенты
          </div>

          {staffPool.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              В отделе пока нет инструкторов и ассистентов.
            </p>
          ) : (
            <div className="mb-3 flex flex-wrap gap-2">
              <select
                value={staffPick}
                onChange={(e) => setStaffPick(e.target.value)}
                className="min-w-[12rem] flex-1 border border-[var(--border)] bg-black/55 px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
              >
                <option value="">Выберите сотрудника…</option>
                {availableStaff.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {ROLE_LABELS[e.role]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addStaff}
                disabled={!staffPick}
                className="inline-flex items-center gap-1.5 border border-[var(--present)]/60 bg-[var(--present)]/15 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/25 disabled:opacity-40"
              >
                <UserPlus size={14} />
                Добавить
              </button>
            </div>
          )}

          {tentStaff.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              На {tentLabel.toLowerCase()} пока никто не назначен.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tentStaff.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 border border-[var(--border)] bg-black/50 px-2.5 py-2"
                >
                  <div>
                    <div className="font-semibold text-[var(--text)]">{e.name}</div>
                    <div className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                      {ROLE_LABELS[e.role]}
                      {e.attendance === 'in' ? ' · на месте' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStaff(e.id)}
                    className="inline-flex items-center gap-1 border border-[var(--accent-hot)]/40 px-2 py-1 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)] hover:bg-[var(--accent-hot)]/15"
                    aria-label={`Убрать ${e.name}`}
                  >
                    <Trash2 size={12} />
                    Убрать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            <Plus size={12} />
            Курсанты · индивидуальный номер и позывной
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Индивидуальный номер
              </span>
              <input
                value={cadetNumber}
                onChange={(e) => setCadetNumber(e.target.value)}
                placeholder="Например: 17-042"
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Позывной
              </span>
              <input
                value={cadetCallsign}
                onChange={(e) => setCadetCallsign(e.target.value)}
                placeholder="Например: Сокол"
                className="w-full border border-[var(--border)] bg-black/55 px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={addCadet}
                className="inline-flex w-full items-center justify-center gap-1.5 border border-[var(--present)]/60 bg-[var(--present)]/15 px-3 py-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--present)] hover:bg-[var(--present)]/25 sm:w-auto"
              >
                <Plus size={14} />
                Добавить
              </button>
            </div>
          </div>

          {roster.cadets.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              Список курсантов пуст. Добавьте номер и позывной.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {roster.cadets.map((c, index) => (
                <li
                  key={c.id}
                  className="grid gap-2 border border-[var(--border)] bg-black/50 px-2.5 py-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center"
                >
                  <span className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                    {index + 1}.
                  </span>
                  <label className="block min-w-0">
                    <span className="sr-only">Индивидуальный номер</span>
                    <input
                      value={c.number}
                      onChange={(e) =>
                        updateCadet(c.id, { number: e.target.value })
                      }
                      placeholder="№"
                      className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="sr-only">Позывной</span>
                    <input
                      value={c.callsign}
                      onChange={(e) =>
                        updateCadet(c.id, { callsign: e.target.value })
                      }
                      placeholder="Позывной"
                      className="w-full border border-[var(--border)] bg-black/55 px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeCadet(c.id)}
                    className="inline-flex items-center justify-center gap-1 border border-[var(--accent-hot)]/40 px-2 py-1.5 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent-hot)] hover:bg-[var(--accent-hot)]/15"
                    aria-label="Удалить курсанта"
                  >
                    <Trash2 size={12} />
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {hint ? (
          <p className="m-0 text-center text-[11px] text-[var(--accent)]">{hint}</p>
        ) : null}

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            На месте на полигоне · {onSite.length}
          </div>
          {onSite.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              Сейчас никто не отмечен на этом полигоне.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {onSite.map((e) => (
                <li
                  key={e.id}
                  className="border border-[var(--present)]/30 bg-[var(--present)]/10 px-2.5 py-2"
                >
                  <div className="font-semibold text-[var(--text)]">{e.name}</div>
                  <div className="font-[family-name:var(--mono)] text-[10px] text-[var(--present)]">
                    {ROLE_LABELS[e.role]} · на месте
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-[var(--border)] bg-black/40 px-3 py-3">
          <div className="mb-2 font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider text-[var(--accent)]">
            Состав полигона (график) · {assigned.length}
          </div>
          {assigned.length === 0 ? (
            <p className="m-0 text-sm text-[var(--text-muted)]">
              В графике никто не закреплён за {active.label}.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {assigned.map((e) => (
                <li
                  key={e.id}
                  className="border border-[var(--border)] bg-black/50 px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[var(--text)]">
                        {e.name}
                      </div>
                      <div className="font-[family-name:var(--mono)] text-[10px] text-[var(--text-muted)]">
                        {ROLE_LABELS[e.role]}
                      </div>
                    </div>
                    <span
                      className={`font-[family-name:var(--mono)] text-[10px] uppercase tracking-wider ${
                        e.attendance === 'in'
                          ? 'text-[var(--present)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {e.attendance === 'in' ? 'на месте' : 'вне объекта'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
