// Builds the "Bridge Brief" from what is already on screen. No extra Qloo queries, no model.
// Everything factual (scores, tags, route) comes from Qloo results. The ideas are the app's own
// suggestions and are labelled that way.
import { categoryOf } from './contract.js'

const IDEAS = {
  artist: (a, b) => `Programme ${b} in a playlist, listening session or live night aimed at people who love ${a}.`,
  tv_show: (a, b) => `Pair ${a} with ${b} in a screening night or an "if you liked this" feature.`,
  book: (a, b) => `Offer ${b} as a reading-list companion for fans of ${a}.`,
  brand: (a, b) => `Explore a collaboration or sponsorship that puts ${b} alongside content built around ${a}.`,
  movie: (a, b) => `Curate a double bill or watchlist that pairs ${a} with ${b}.`,
  place: (a, b) => `Build a visit guide or experience that connects fans of ${a} with ${b}.`,
  video_game: (a, b) => `Feature ${b} in a recommendation list or event for people who enjoy ${a}.`,
  podcast: (a, b) => `Pitch a guest segment or episode that links ${a} with ${b}.`,
  person: (a, b) => `Invite ${b} into a conversation or feature that speaks to fans of ${a}.`,
  destination: (a, b) => `Design a trip or itinerary theme that connects ${a} with ${b}.`,
}
const fallbackIdea = (a, b) => `Use the link between ${a} and ${b} as the theme for a curated feature.`

export function buildBrief({ nodes, edges, path }) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edgeById = new Map(edges.map((e) => [e.id, e]))
  const route = (path || []).map((id) => byId.get(id)).filter(Boolean)
  if (route.length < 2) return null

  const hops = []
  for (let i = 0; i < route.length - 1; i += 1) {
    const from = route[i]
    const to = route[i + 1]
    const e = edgeById.get(`${from.id}__${to.id}`)
    hops.push({
      from,
      to,
      score: e?.score ?? null,
      sharedTags: e?.sharedTags || [],
      targetTags: e?.targetTags || [],
      crossCategory: from.category !== to.category,
      mock: !!e?.retrieved?.mock,
    })
  }

  // The shared "language" of this audience: tags Qloo gives to BOTH ends of a hop, most frequent first.
  const counts = new Map()
  hops.forEach((h) => h.sharedTags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)))
  let language = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 8)
  if (language.length === 0) {
    // Fall back to descriptive tags that recur on at least two hops.
    const recurring = new Map()
    hops.forEach((h) => new Set(h.targetTags).forEach((t) => recurring.set(t, (recurring.get(t) || 0) + 1)))
    language = [...recurring.entries()].filter(([, n]) => n >= 2).map(([t]) => t).slice(0, 6)
  }

  const scored = hops.filter((h) => h.score != null)
  const weakest = scored.length ? scored.reduce((m, h) => (h.score < m.score ? h : m)) : null

  const ideas = hops
    .filter((h) => h.crossCategory)
    .map((h) => {
      const idea = (IDEAS[h.to.category] || fallbackIdea)(h.from.name, h.to.name)
      return h.sharedTags.length ? `${idea} Lean on what Qloo says they share: ${h.sharedTags.slice(0, 3).join(', ')}.` : idea
    })
    .slice(0, 3)

  // One sentence that says the point, built only from the route and its shared tags.
  const first = hops[0]
  const lastName = route[route.length - 1].name
  const tagBit = first.sharedTags.length ? `, and the overlap runs on ${first.sharedTags.slice(0, 3).join(', ')}` : ''
  const tail = route.length > 2 ? ` Follow the thread and it leads on to ${lastName}.` : ''
  const headline = `People who love ${route[0].name} also tend to love ${route[1].name}${tagBit}.${tail}`

  return {
    title: `Bridge Brief: ${route[0].name} to ${route[route.length - 1].name}`,
    headline,
    route,
    hops,
    language,
    weakest,
    ideas,
    categories: [...new Set(route.map((n) => categoryOf(n.category).label))],
    mock: hops.some((h) => h.mock),
  }
}

const f2 = (n) => Number(n).toFixed(2)

export function toMarkdown(b) {
  const lines = [`# ${b.title}`, '']
  if (b.mock) lines.push('> Demo data. Not returned by Qloo.', '')
  lines.push(b.headline, '')
  lines.push('## The route', '', b.route.map((n) => `${n.name} (${categoryOf(n.category).label})`).join(' → '), '')
  lines.push(`It crosses ${b.categories.length} categories: ${b.categories.join(', ')}. Each hop is its own Qloo result; the route as a whole is the agent's construction.`, '')
  if (b.language.length) {
    lines.push('## The language this audience shares', '', b.language.join(', '), '', 'Tags Qloo gives to both ends of a hop.', '')
  }
  lines.push('## Hop by hop', '')
  b.hops.forEach((h) => {
    const parts = [`**${h.from.name} → ${h.to.name}**`]
    if (h.score != null) parts.push(`relative score ${f2(h.score)}`)
    if (h.sharedTags.length) parts.push(`shared tags: ${h.sharedTags.join(', ')}`)
    lines.push(`- ${parts.join('; ')}`)
  })
  if (b.weakest) lines.push('', `Weakest link: ${b.weakest.from.name} → ${b.weakest.to.name} (${f2(b.weakest.score)}).`)
  if (b.ideas.length) {
    lines.push('', '## Ways to use it', '')
    b.ideas.forEach((idea, i) => lines.push(`${i + 1}. ${idea}`))
    lines.push('', "These are the app's suggestions, not Qloo data.")
  }
  lines.push('', '## Read this carefully', '', 'Qloo shows that audiences overlap. It does not show why, and it does not show that one thing causes the other. Treat each idea as a hypothesis to test.', '')
  return lines.join('\n')
}
