import type { TmcBaselineItem, TmcItem, TmcItemCondition } from '../types'

/** Ключ позиции для сравнения с инвентаризацией */
export function tmcItemKey(item: {
  warehouseNumber?: string
  serial?: string
  name?: string
  brand?: string
  model?: string
}): string {
  const wh = (item.warehouseNumber ?? '').trim().toLocaleLowerCase('ru-RU')
  if (wh && wh !== 'нет') return `wh:${wh}`
  const sn = (item.serial ?? '').trim().toLocaleLowerCase('ru-RU')
  if (sn && sn !== 'нет') return `sn:${sn}`
  const name = (item.name ?? '').trim().toLocaleLowerCase('ru-RU')
  const brand = (item.brand ?? '').trim().toLocaleLowerCase('ru-RU')
  const model = (item.model ?? '').trim().toLocaleLowerCase('ru-RU')
  return `nm:${name}|${brand}|${model}`
}

/** Позиции из предыдущей инвентаризации, которых нет в текущем списке */
export function findMissingTmcItems(
  baseline: TmcBaselineItem[] | undefined,
  current: TmcItem[],
): TmcBaselineItem[] {
  if (!baseline?.length) return []
  const present = new Set(current.map((i) => tmcItemKey(i)))
  return baseline.filter((b) => !present.has(tmcItemKey(b)))
}

export function toBaselineItems(
  items: Array<{
    category: string
    name: string
    quantity: string
    condition: TmcItemCondition
    brand: string
    model: string
    serial: string
    warehouseNumber: string
    note: string
  }>,
): TmcBaselineItem[] {
  return items.map((i) => ({
    category: i.category,
    name: i.name,
    quantity: i.quantity,
    condition: i.condition,
    brand: i.brand,
    model: i.model,
    serial: i.serial,
    warehouseNumber: i.warehouseNumber,
    note: i.note,
  }))
}
