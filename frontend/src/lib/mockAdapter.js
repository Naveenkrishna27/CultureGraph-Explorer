// DEMO DATA. Nothing in this file comes from Qloo.
// Every edge is flagged mock:true and the UI shows a "Demo data" badge.
// It exists so the interface can be built and tested before the API key arrives.
// Run with VITE_USE_MOCK=false to use the live adapter instead.

const MAX_CALLS = 12

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

let uid = 0
const step = (type, title, detail, tool, calls) => ({
  type: 'step',
  step: { id: `s${++uid}`, type, title, detail, tool, calls },
})

const NODES = {
  interstellar: { name: 'Interstellar', category: 'movie', blurb: 'Film' },
  hans_zimmer: { name: 'Hans Zimmer', category: 'artist', blurb: 'Composer and music artist' },
  the_martian: { name: 'The Martian', category: 'movie', blurb: 'Film' },
  cosmos: { name: 'Cosmos', category: 'tv_show', blurb: 'Television series' },
  project_hail_mary: { name: 'Project Hail Mary', category: 'book', blurb: 'Novel' },
  brian_eno: { name: 'Brian Eno', category: 'artist', blurb: 'Musician and producer' },
  ludovico_einaudi: { name: 'Ludovico Einaudi', category: 'artist', blurb: 'Composer and pianist' },
  griffith_observatory: { name: 'Griffith Observatory', category: 'place', blurb: 'Observatory in Los Angeles' },
  outer_wilds: { name: 'Outer Wilds', category: 'video_game', blurb: 'Video game' },
  teenage_engineering: { name: 'Teenage Engineering', category: 'brand', blurb: 'Electronics design company' },
  moog: { name: 'Moog', category: 'brand', blurb: 'Synthesizer maker' },
}

const DEPTH = {
  interstellar: 0,
  hans_zimmer: 1, the_martian: 1, cosmos: 1, project_hail_mary: 1,
  brian_eno: 2, ludovico_einaudi: 2, griffith_observatory: 2, outer_wilds: 2,
  teenage_engineering: 3, moog: 3,
}

// What "asking about X" returns in the demo. Scores are invented.
const CHILDREN = {
  interstellar: [
    { id: 'hans_zimmer', score: 0.91, shared: ['Cinematic'], tags: ['Atmospheric', 'Ambient', 'Film Score'], why: 'Audiences who like Interstellar also tend to like Hans Zimmer. The film score is a likely bridge, but the data shows overlapping taste, not the reason.' },
    { id: 'the_martian', score: 0.84, why: 'A same-category match: people who watch one tend to watch the other. Expected, so the agent ranks it lower for novelty.' },
    { id: 'cosmos', score: 0.8, why: 'Crosses from film to television. The overlap suggests an audience that enjoys science presented with awe.' },
    { id: 'project_hail_mary', score: 0.78, shared: ['Sci-Fi'], tags: ['Hard Science Fiction', 'Space'], why: 'Crosses from film to books. A shared appetite for hard science fiction is one plausible reading.' },
  ],
  hans_zimmer: [
    { id: 'brian_eno', score: 0.74, why: 'Stays in music but moves from orchestral film scores toward ambient work. Less obvious than a fellow film composer.' },
    { id: 'ludovico_einaudi', score: 0.77, why: 'A close, familiar neighbour: piano-led cinematic music. Relevant but predictable.' },
  ],
  cosmos: [
    { id: 'griffith_observatory', score: 0.66, why: 'Crosses from television to a real place. The agent reads this as an audience that likes to visit what it watches.' },
  ],
  project_hail_mary: [
    { id: 'outer_wilds', score: 0.62, why: 'Crosses from books to games. Both centre on working out a scientific puzzle.' },
  ],
  brian_eno: [
    { id: 'teenage_engineering', score: 0.58, why: 'Crosses from music to a design brand. People who like experimental electronic music also follow instrument design.' },
    { id: 'moog', score: 0.71, why: 'The obvious hardware answer for this audience, so the agent treats it as less surprising.' },
  ],
}

const typeUrn = (category) => `urn:entity:${category}`

const makeNode = (id) => ({
  id,
  name: NODES[id].name,
  category: NODES[id].category,
  role: DEPTH[id] === 0 ? 'seed' : 'found',
  depth: DEPTH[id],
  blurb: NODES[id].blurb,
  qlooId: `mock:${id}`,
})

const makeEdge = (parentId, kid) => ({
  id: `${parentId}__${kid.id}`,
  source: parentId,
  target: kid.id,
  kind: 'direct',
  crossCategory: NODES[parentId].category !== NODES[kid.id].category,
  score: kid.score,
  retrieved: {
    endpoint: '/v2/insights',
    params: {
      'filter.type': typeUrn(NODES[kid.id].category),
      'signal.interests.entities': `mock:${parentId}`,
    },
    retrievedAt: new Date().toISOString(),
    mock: true,
  },
  interpretation: kid.why,
  ...(kid.shared ? { sharedTags: kid.shared } : {}),
  ...(kid.tags ? { targetTags: kid.tags } : {}),
})

async function* reveal(parentId, kids, signal) {
  for (const kid of kids) {
    yield { type: 'node', node: makeNode(kid.id) }
    yield { type: 'edge', edge: makeEdge(parentId, kid) }
    await sleep(320, signal)
  }
}

const find = (parentId, id) => CHILDREN[parentId].find((k) => k.id === id)

export async function* streamJourney({ seed, mode, goal, signal }) {
  const wanted = (seed || '').trim()
  yield { type: 'budget', used: 0, max: MAX_CALLS }

  if (goal) {
    yield step('note', 'Goal set', goal, 'agent.plan')
    await sleep(500, signal)
  }
  if (!wanted.toLowerCase().includes('interstellar')) {
    yield step('note', 'Demo data has one sample journey', `This run uses Interstellar instead of “${wanted}”. Live Qloo data will handle any starting point.`)
    await sleep(700, signal)
  }

  yield { type: 'status', message: `Looking up “${wanted}”…` }
  await sleep(700, signal)
  yield step('resolve', 'Looking up the starting point', 'Matched 1 entity: Interstellar (film).', 'qloo.search', 1)
  yield { type: 'status', message: 'Asking Qloo what connects to Interstellar…' }
  yield { type: 'node', node: makeNode('interstellar') }
  await sleep(500, signal)

  if (mode === 'explore') {
    yield step('query', 'Asking what audiences connect to it', '4 related entities came back: a composer, a film, a series, a novel.', 'qloo.insights', 2)
    yield* reveal('interstellar', CHILDREN.interstellar, signal)
    yield step('stop', 'Ready for you to choose', 'Select any station, then follow that thread.')
    yield { type: 'done', path: [], summary: 'Pick a station and choose “Follow this thread” to go one step further.' }
    return
  }

  if (mode === 'serendipity') {
    yield step('query', 'Asking what audiences connect to it', '4 related entities came back.', 'qloo.insights', 2)
    await sleep(500, signal)
    yield step('evaluate', 'Setting aside the obvious', 'The Martian is another film, so it is the least surprising match. Keeping links that cross categories.', 'agent.rank')
    await sleep(700, signal)
    yield* reveal('interstellar', CHILDREN.interstellar.filter((k) => k.id !== 'the_martian'), signal)
    yield step('choose', 'Leading with Hans Zimmer', 'Highest score among links that cross from film to another category.', 'agent.plan')
    yield step('stop', 'Stopped here on purpose', 'Serendipity mode shows one step of surprise. Switch to Rabbit hole to keep going.')
    yield { type: 'done', path: ['interstellar', 'hans_zimmer'], summary: 'Three links cross into another category. Hans Zimmer scored highest.' }
    return
  }

  // Rabbit hole: the agent keeps choosing branches within its query budget.
  yield step('query', 'Asking what audiences connect to it', '4 related entities came back.', 'qloo.insights', 2)
  yield* reveal('interstellar', CHILDREN.interstellar, signal)
  yield step('evaluate', 'Ranking the first four', 'Hans Zimmer crosses from film to music with the strongest score. The Martian stays in film, so it ranks lower.', 'agent.rank')
  await sleep(900, signal)
  yield step('choose', 'Following Hans Zimmer', 'Crosses category and still relevant.', 'agent.plan')
  await sleep(600, signal)
  yield step('verify', 'Asking again from Hans Zimmer', '2 new entities came back. Each is a separate Qloo result.', 'qloo.insights', 3)
  yield* reveal('hans_zimmer', CHILDREN.hans_zimmer, signal)
  yield step('evaluate', 'Comparing the two', 'Ludovico Einaudi is a familiar neighbour. Brian Eno is further from the original film.', 'agent.rank')
  await sleep(900, signal)
  yield step('choose', 'Following Brian Eno', 'Less obvious and still grounded in a returned result.', 'agent.plan')
  await sleep(600, signal)
  yield step('verify', 'Asking again from Brian Eno', '2 new entities came back, both brands.', 'qloo.insights', 4)
  yield* reveal('brian_eno', CHILDREN.brian_eno, signal)
  yield step('evaluate', 'Picking the surprise', 'Moog is the expected answer. Teenage Engineering is a less obvious brand link, so it wins.', 'agent.rank')
  await sleep(900, signal)

  // A hypothesis the agent offers. It is NOT a Qloo result and is drawn dotted.
  yield step('note', 'Noticed a possible link', 'The Martian and Project Hail Mary sit near the same starting film in separate results. No single Qloo response connects them, so this is a hypothesis.', 'agent.rank')
  yield {
    type: 'edge',
    edge: {
      id: 'the_martian__project_hail_mary',
      source: 'the_martian',
      target: 'project_hail_mary',
      kind: 'inferred',
      crossCategory: true,
      interpretation: 'The agent noticed both appear near the starting film in separate results. No single Qloo response links them. Treat this as a hypothesis to test, not a finding.',
    },
  }
  await sleep(900, signal)

  yield step('stop', 'Found a route and stopped', 'Film to music to a design brand in 3 hops. Used 4 of 12 queries.')
  yield {
    type: 'done',
    path: ['interstellar', 'hans_zimmer', 'brian_eno', 'teenage_engineering'],
    summary: 'It starts in film, passes through two musicians, and lands on a design brand.',
  }
}

export async function* expandNode({ nodeId, signal, callsSoFar = 0 }) {
  const kids = CHILDREN[nodeId]
  const name = NODES[nodeId]?.name || 'this entity'
  if (callsSoFar >= MAX_CALLS) {
    yield step('note', 'Query budget reached', `All ${MAX_CALLS} queries are used. Start a new journey to continue.`)
    yield { type: 'done' }
    return
  }
  if (!kids) {
    yield step('note', `Nothing new for ${name}`, 'The demo data has no further links here. Live data will.', 'qloo.insights', callsSoFar + 1)
    yield { type: 'done' }
    return
  }
  yield step('query', `Asking what connects to ${name}`, `${kids.length} entities came back.`, 'qloo.insights', callsSoFar + 1)
  await sleep(500, signal)
  yield* reveal(nodeId, kids, signal)
  yield { type: 'done' }
}
