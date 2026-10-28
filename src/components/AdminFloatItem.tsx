import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { FloatRect } from '../lib/adminLayout'

type Mode = 'drag' | 'resize' | null

export const ADMIN_FLOAT_LAYER_ID = 'admin-float-layer'

interface Props {
  id: string
  enabled: boolean
  editing: boolean
  rect: FloatRect | null
  /** Класс обёртки, пока вкладка в обычном потоке (не перемещена). */
  defaultClassName?: string
  onChange: (id: string, rect: FloatRect) => void
  children: ReactNode
}

/**
 * Для администратора: перетаскивание и ресайз плавающих вкладок.
 * Без сохранённой раскладки остаётся в обычном потоке.
 * При float рендерится в #admin-float-layer (слой внутри панели).
 */
export function AdminFloatItem({
  id,
  enabled,
  editing,
  rect,
  defaultClassName = '',
  onChange,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<FloatRect | null>(rect)
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null)
  const modeRef = useRef<Mode>(null)
  const startRef = useRef({
    px: 0,
    py: 0,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  })

  useEffect(() => {
    setLive(rect)
  }, [rect])

  useEffect(() => {
    setPortalEl(document.getElementById(ADMIN_FLOAT_LAYER_ID))
  }, [])

  const floating = enabled && !!live

  const begin = useCallback(
    (mode: Mode, e: ReactPointerEvent) => {
      if (!enabled || !editing || !mode || !live) return
      e.preventDefault()
      e.stopPropagation()
      const el = rootRef.current
      if (!el) return
      modeRef.current = mode
      startRef.current = {
        px: e.clientX,
        py: e.clientY,
        x: live.x,
        y: live.y,
        w: live.w,
        h: live.h,
      }
      el.setPointerCapture(e.pointerId)
    },
    [enabled, editing, live],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!modeRef.current) return
      const dx = e.clientX - startRef.current.px
      const dy = e.clientY - startRef.current.py
      const parent = portalEl?.parentElement
      const maxW = parent?.clientWidth ?? window.innerWidth
      const maxH = parent?.clientHeight ?? window.innerHeight

      if (modeRef.current === 'drag') {
        setLive({
          x: Math.max(0, Math.min(maxW - startRef.current.w, startRef.current.x + dx)),
          y: Math.max(0, Math.min(maxH - 40, startRef.current.y + dy)),
          w: startRef.current.w,
          h: startRef.current.h,
        })
      } else if (modeRef.current === 'resize') {
        setLive({
          x: startRef.current.x,
          y: startRef.current.y,
          w: Math.max(140, Math.min(maxW - startRef.current.x, startRef.current.w + dx)),
          h: Math.max(44, Math.min(maxH - startRef.current.y, startRef.current.h + dy)),
        })
      }
    },
    [portalEl],
  )

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!modeRef.current) return
      modeRef.current = null
      try {
        rootRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const el = rootRef.current
      if (!el) return
      const parent = portalEl?.parentElement
      if (!parent) {
        setLive((cur) => {
          queueMicrotask(() => {
            if (cur) onChange(id, cur)
          })
          return cur
        })
        return
      }
      const parentBox = parent.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      const next: FloatRect = {
        x: box.left - parentBox.left,
        y: box.top - parentBox.top,
        w: Math.max(140, box.width),
        h: Math.max(44, box.height),
      }
      setLive(next)
      queueMicrotask(() => onChange(id, next))
    },
    [id, onChange, portalEl],
  )

  if (!floating || !live) {
    return (
      <div className={defaultClassName || undefined} data-float-host={id}>
        {children}
      </div>
    )
  }

  const style: CSSProperties = {
    position: 'absolute',
    left: live.x,
    top: live.y,
    width: live.w,
    height: live.h,
    zIndex: editing ? 8 : 6,
  }

  const node = (
    <div
      ref={rootRef}
      className={`admin-float-item ${editing ? 'admin-float-item--editing' : ''}`}
      style={style}
      data-float-id={id}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {editing ? (
        <button
          type="button"
          className="admin-float-item__drag"
          aria-label="Переместить"
          onPointerDown={(e) => begin('drag', e)}
        >
          ↔︎
        </button>
      ) : null}
      <div className="admin-float-item__body">{children}</div>
      {editing ? (
        <button
          type="button"
          className="admin-float-item__resize"
          aria-label="Изменить размер"
          onPointerDown={(e) => begin('resize', e)}
        />
      ) : null}
    </div>
  )

  if (portalEl) {
    return (
      <>
        <div
          className="admin-float-item__placeholder"
          aria-hidden
          style={{ display: 'none' }}
          data-float-host={id}
        />
        {createPortal(node, portalEl)}
      </>
    )
  }

  return node
}
