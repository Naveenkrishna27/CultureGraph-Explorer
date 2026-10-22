import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ForceSim } from '../lib/layout.js'
import { categoryOf } from '../lib/contract.js'

// Long titles such as "Chain of Gold (The Last Hours, #1)" crowd the map. The full name stays in the
// side panel, the hover tooltip and the screen-reader label.
const shortLabel = (name) => {
  const base = String(name).replace(/\s*\([^)]*\)\s*$/, '')
  return base.length > 24 ? `${base.slice(0, 23)}…` : base
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function GraphCanvas({ nodes, edges, path, selection, onSelect }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const simRef = useRef(null)
  if (!simRef.current) simRef.current = new ForceSim()
  const sim = simRef.current

  const rafRef = useRef(0)
  const dragRef = useRef(null)
  const userMovedView = useRef(false)

  const [, setFrame] = useState(0)
  const [size, setSize] = useState({ w: 800, h: 560 })
  const [view, setView] = useState({ x: 400, y: 280, k: 1 })
  const sizeRef = useRef(size)
  sizeRef.current = size

  // Keep every station in view until the person pans or zooms themselves.
  // Room is left at the top for the zoom buttons and at the bottom for the legend.
  const fit = useCallback(
    (snap) => {
      if (userMovedView.current) return
      const ns = [...sim.nodes.values()]
      const { w, h } = sizeRef.current
      if (ns.length === 0) {
        setView({ x: w / 2, y: h / 2, k: 1 })
        return
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const n of ns) {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
      }
      const padX = 90, padTop = 56, padBottom = 76
      const bw = Math.max(maxX - minX, 1) + padX * 2
      const bh = Math.max(maxY - minY, 1) + 50
      const k = Math.min(1.1, Math.max(0.35, Math.min(w / bw, (h - padTop - padBottom) / bh)))
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const tx = w / 2 - cx * k
      const ty = padTop + (h - padTop - padBottom) / 2 - cy * k
      setView((v) => (snap ? { x: tx, y: ty, k } : { k: v.k + (k - v.k) * 0.15, x: v.x + (tx - v.x) * 0.15, y: v.y + (ty - v.y) * 0.15 }))
    },
    [sim],
  )

  // ---- simulation loop ----
  const loop = useCallback(() => {
    if (sim.ticksLeft > 0) {
      sim.tick()
      fit(false)
      setFrame((f) => f + 1)
      rafRef.current = requestAnimationFrame(loop)
    } else {
      rafRef.current = 0
    }
  }, [sim, fit])

  const kick = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  useEffect(() => {
    sim.sync(nodes, edges)
    if (prefersReducedMotion()) {
      sim.settle()
      fit(true)
      setFrame((f) => f + 1)
    } else {
      kick()
    }
  }, [nodes, edges, sim, kick, fit])

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    },
    [],
  )

  // ---- size and centring ----
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    fit(true)
  }, [size, fit])

  // ---- wheel zoom (needs a non-passive listener to prevent page scroll) ----
  useEffect(() => {
    const el = svgRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      userMovedView.current = true
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.4, v.k * (e.deltaY < 0 ? 1.1 : 0.9)))
        const wx = (px - v.x) / v.k
        const wy = (py - v.y) / v.k
        return { k, x: px - wx * k, y: py - wy * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (factor) => {
    userMovedView.current = true
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.4, v.k * factor))
      const wx = (size.w / 2 - v.x) / v.k
      const wy = (size.h / 2 - v.y) / v.k
      return { k, x: size.w / 2 - wx * k, y: size.h / 2 - wy * k }
    })
  }

  const resetView = () => {
    userMovedView.current = false
    fit(true)
  }

  // ---- pointer handling: pan the map, drag a station, or click ----
  const toWorld = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }
  }

  const onBackgroundDown = (e) => {
    if (e.button !== 0) return
    svgRef.current.setPointerCapture(e.pointerId)
    dragRef.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
  }

  const onNodeDown = (e, id) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { type: 'node', id, sx: e.clientX, sy: e.clientY, moved: false }
  }

  const onMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    if (d.type === 'pan') {
      userMovedView.current = true
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
    } else {
      const p = toWorld(e)
      const n = sim.nodes.get(d.id)
      if (n) {
        n.x = p.x
        n.y = p.y
        n.fixed = true
        sim.reheat()
        kick()
      }
    }
  }

  const onUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.type === 'node') {
      const n = sim.nodes.get(d.id)
      if (n) n.fixed = false
      if (!d.moved) onSelect({ type: 'node', id: d.id })
    } else if (!d.moved) {
      onSelect(null)
    }
  }

  // ---- derived data for drawing ----
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const pathSet = useMemo(() => new Set(path), [path])
  const selNodeId = selection?.type === 'node' ? selection.id : null
  const selEdgeId = selection?.type === 'edge' ? selection.id : null
  const pos = (id) => sim.nodes.get(id)

  // Positions change every frame, so the route is rebuilt on every render.
  const routeD =
    path.length < 2
      ? ''
      : path
          .map((id) => sim.nodes.get(id))
          .filter(Boolean)
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' ')

  const presentCategories = [...new Set(nodes.map((n) => n.category))]

  return (
    <div className="canvas" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="graph"
        role="group"
        aria-label="Map of cultural connections. Use Tab to move between stations."
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map((e) => {
            const a = pos(e.source)
            const b = pos(e.target)
            if (!a || !b) return null
            const isSel = selEdgeId === e.id
            const touching = selNodeId && (e.source === selNodeId || e.target === selNodeId)
            const dim = selNodeId && !touching
            const color = e.kind === 'inferred' ? 'var(--ink-soft)' : categoryOf(nodeById.get(e.target)?.category).color
            return (
              <g key={e.id} className={`edge${dim ? ' dim' : ''}`}>
                <line
                  className="edge-hit"
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => onSelect({ type: 'edge', id: e.id })}
                />
                <line
                  className="edge-line"
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color}
                  strokeWidth={isSel ? 8 : e.crossCategory ? 5 : 3}
                  strokeLinecap="round"
                  strokeDasharray={e.kind === 'inferred' ? '1 9' : undefined}
                  style={{ color }}
                />
              </g>
            )
          })}

          {routeD && (
            <g className="route" key={path.join('>')} aria-hidden="true">
              <path d={routeD} pathLength="1" className="route-casing" fill="none" />
              <path d={routeD} pathLength="1" className="route-core" fill="none" />
            </g>
          )}

          {nodes.map((n) => {
            const p = pos(n.id)
            if (!p) return null
            const color = categoryOf(n.category).color
            const r = n.role === 'seed' ? 15 : 10
            const sel = selNodeId === n.id
            const onRoute = pathSet.has(n.id)
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className="node"
                role="button"
                tabIndex={0}
                aria-pressed={sel}
                aria-label={`${n.name}, ${categoryOf(n.category).label}${n.role === 'seed' ? ', starting point' : ''}`}
                onPointerDown={(ev) => onNodeDown(ev, n.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    onSelect({ type: 'node', id: n.id })
                  }
                }}
              >
                <g className="node-pop" style={{ color }}>
                  <circle r={r + 12} fill="transparent" />
                  {sel && <circle r={r + 9} className="node-sel" />}
                  {n.role === 'seed' && <circle r={r + 5} fill="none" stroke="var(--ink)" strokeWidth="2" />}
                  <circle r={r} fill="var(--station)" stroke={color} strokeWidth="4" />
                  {onRoute && <circle r={r - 5} fill="var(--ink)" />}
                  <title>{n.name}</title>
                  <text y={r + 19} textAnchor="middle" className="node-label">{shortLabel(n.name)}</text>
                </g>
              </g>
            )
          })}
        </g>
      </svg>


      {nodes.length > 0 && (
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">−</button>
        <button type="button" onClick={resetView} aria-label="Reset view">Fit</button>
      </div>
      )}

      {nodes.length > 0 && (
        <div className="legend" aria-label="Legend">
          <ul>
            {presentCategories.map((c) => (
              <li key={c}>
                <i style={{ borderColor: categoryOf(c).color }} aria-hidden="true" />
                {categoryOf(c).label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
