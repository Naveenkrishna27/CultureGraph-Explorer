// Talks to the FastAPI backend (built after the Qloo probe).
// The backend streams newline-delimited JSON (NDJSON): one event object per line.
// Contract: see contract.js. Keys and secrets never appear here; the backend holds them.

async function* readNdjson(url, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    let detail = ''
    try {
      const j = await res.json()
      if (typeof j.detail === 'string') detail = j.detail
    } catch {
      // not JSON: fall through to the generic message
    }
    throw new Error(detail || `The server answered with status ${res.status}. Try again in a moment.`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer)
}

export async function* streamJourney({ seed, seedId, mode, goal, signal }) {
  const body = { seed, mode, goal }
  if (seedId) body.seed_id = seedId   // set when the visitor picked one of several matches
  yield* readNdjson('/api/journey', body, signal)
}

export async function* expandNode({ nodeId, node, visited, mode, signal, callsSoFar }) {
  const body = {
    node_id: nodeId,
    name: node?.name ?? '',
    category: node?.category ?? 'other',
    depth: node?.depth ?? 1,
    visited: visited ?? [],
    mode,
    calls_so_far: callsSoFar ?? 0,
  }
  yield* readNdjson('/api/expand', body, signal)
}
