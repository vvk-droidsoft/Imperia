import { useEffect, useRef } from 'react'

interface Props {
  className?: string
  sizeClassName?: string
  /** Крупный знак на сплэше / шеврон */
  variant?: 'hero' | 'mark'
}

type Ember = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  hue: number
}

/**
 * Шеврон «ФЦ Империя БАС» — эмблема с надписью по нижнему контуру.
 * Живой огонь / тепло вокруг знака; бренд только внутри изображения.
 */
export function BrandLogo({
  className = '',
  sizeClassName = 'h-[min(80vw,440px)] w-[min(80vw,440px)]',
  variant = 'hero',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (variant !== 'hero') return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    const embers: Ember[] = []
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const pad = 0.12
      const cssW = rect.width * (1 + pad * 2)
      const cssH = rect.height * (1 + pad * 2)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(cssW * dpr))
      canvas.height = Math.max(1, Math.floor(cssH * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const spawn = (w: number, h: number) => {
      const cx = w * 0.5
      const cy = h * 0.55
      const angle = Math.random() * Math.PI * 2
      // Ring around diamond — denser at bottom / sides
      const rx = w * (0.28 + Math.random() * 0.18)
      const ry = h * (0.32 + Math.random() * 0.2)
      const biasY = Math.random() < 0.55 ? 1.15 : 0.75
      embers.push({
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry * biasY,
        vx: (Math.random() - 0.5) * 0.55,
        vy: -0.35 - Math.random() * 1.35,
        life: 0,
        maxLife: 40 + Math.random() * 70,
        size: 1.2 + Math.random() * 2.8,
        hue: 18 + Math.random() * 28,
      })
    }

    const tick = () => {
      if (!running) return
      const w = canvas.width / Math.min(window.devicePixelRatio || 1, 2)
      const h = canvas.height / Math.min(window.devicePixelRatio || 1, 2)
      ctx.clearRect(0, 0, w, h)

      if (!reduced) {
        const budget = Math.min(90, Math.floor((w * h) / 2800))
        while (embers.length < budget) spawn(w, h)
        if (Math.random() < 0.65) spawn(w, h)

        for (let i = embers.length - 1; i >= 0; i--) {
          const e = embers[i]
          e.life += 1
          e.x += e.vx + Math.sin(e.life * 0.12 + e.hue) * 0.35
          e.y += e.vy
          e.vy -= 0.012
          e.vx *= 0.99

          const t = e.life / e.maxLife
          if (t >= 1) {
            embers.splice(i, 1)
            continue
          }

          const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85
          const r = e.size * (1 - t * 0.55)
          const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 3.2)
          g.addColorStop(0, `hsla(${e.hue}, 100%, 72%, ${0.95 * alpha})`)
          g.addColorStop(0.35, `hsla(${e.hue - 8}, 100%, 55%, ${0.55 * alpha})`)
          g.addColorStop(1, `hsla(${e.hue - 16}, 100%, 35%, 0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(e.x, e.y, r * 3.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [variant])

  if (variant === 'mark') {
    return (
      <img
        src="/empire-bas-logo.png"
        alt="ФЦ Империя БАС"
        className={`brand-chevron mx-auto object-contain drop-shadow-[0_0_18px_rgba(255,60,15,0.35)] ${sizeClassName} ${className}`}
      />
    )
  }

  return (
    <div
      ref={wrapRef}
      className={`brand-fire-stage relative mx-auto ${sizeClassName} ${className}`}
      role="img"
      aria-label="ФЦ Империя БАС"
    >
      <div className="brand-fire-heat" aria-hidden />
      <div className="brand-fire-ring brand-fire-ring--outer" aria-hidden />
      <div className="brand-fire-ring brand-fire-ring--mid" aria-hidden />
      <div className="brand-fire-tongues" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <canvas ref={canvasRef} className="brand-fire-canvas" aria-hidden />
      <img
        src="/empire-bas-logo.png"
        alt=""
        draggable={false}
        className="brand-chevron brand-fire-mark relative z-[3] h-full w-full object-contain"
      />
      <div className="brand-fire-core" aria-hidden />
    </div>
  )
}
