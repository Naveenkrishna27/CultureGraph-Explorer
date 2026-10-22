// A small force layout, written by hand to avoid a dependency.
// Nodes repel, linked nodes are pulled toward a rest length (stronger score = closer),
// and a faint pull toward the centre keeps the map together.

export class ForceSim {
  constructor() {
    this.nodes = new Map()
    this.links = []
    this.ticksLeft = 0
  }

  sync(nodeList, edgeList) {
    const present = new Set(nodeList.map((n) => n.id))
    const linksBefore = this.links.length
    let changed = false
    for (const id of [...this.nodes.keys()]) {
      if (!present.has(id)) {
        this.nodes.delete(id)
        changed = true
      }
    }

    for (const n of nodeList) {
      if (this.nodes.has(n.id)) {
        this.nodes.get(n.id).depth = n.depth ?? 1
        continue
      }
      // Spawn a new node next to a neighbour that is already placed.
      let anchor = { x: 0, y: 0 }
      for (const e of edgeList) {
        const other = e.source === n.id ? e.target : e.target === n.id ? e.source : null
        if (other && this.nodes.has(other)) {
          anchor = this.nodes.get(other)
          break
        }
      }
      changed = true
      const angle = Math.random() * Math.PI * 2
      this.nodes.set(n.id, {
        id: n.id,
        x: anchor.x + Math.cos(angle) * 40,
        y: anchor.y + Math.sin(angle) * 40,
        vx: 0,
        vy: 0,
        depth: n.depth ?? 1,
        fixed: false,
      })
    }

    this.links = edgeList
      .filter((e) => this.nodes.has(e.source) && this.nodes.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, score: e.score ?? 0.5 }))
    if (changed || this.links.length !== linksBefore) this.ticksLeft = 360
  }

  reheat() {
    this.ticksLeft = Math.max(this.ticksLeft, 120)
  }

  settle() {
    for (let i = 0; i < 360; i += 1) this.tick()
    this.ticksLeft = 0
  }

  tick() {
    const ns = [...this.nodes.values()]

    for (let i = 0; i < ns.length; i += 1) {
      for (let j = i + 1; j < ns.length; j += 1) {
        const a = ns[i]
        const b = ns[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          d2 = dx * dx + dy * dy + 0.01
        }
        const d = Math.sqrt(d2)
        const f = Math.min(13000 / d2, 8)
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    for (const l of this.links) {
      const a = this.nodes.get(l.source)
      const b = this.nodes.get(l.target)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const rest = 175 - 70 * l.score
      const k = (0.04 * (d - rest)) / d
      a.vx += dx * k
      a.vy += dy * k
      b.vx -= dx * k
      b.vy -= dy * k
    }

    for (const n of ns) {
      if (n.fixed) {
        n.vx = 0
        n.vy = 0
        continue
      }
      // Each hop sits in its own column, so the map reads left to right as a journey.
      n.vx += ((n.depth - 1.5) * 210 - n.x) * 0.014
      n.vy -= n.y * 0.0085
      n.vx *= 0.85
      n.vy *= 0.85
      n.x += Math.max(-20, Math.min(20, n.vx))
      n.y += Math.max(-20, Math.min(20, n.vy))
    }

    this.ticksLeft -= 1
  }
}
