import { useMemo } from 'react'
import { categoryOf } from '../lib/contract.js'

function CategoryChip({ category }) {
  const c = categoryOf(category)
  return (
    <span className="chip" style={{ '--chip': c.color }}>
      <i aria-hidden="true" />
      {c.label}
    </span>
  )
}

function MockNote() {
  return <p className="mock-note">Demo data. This block was not returned by Qloo.</p>
}

export default function EvidencePanel({ nodes, edges, selection, path, summary, onSelect, onExpand, onOpenBrief, running, atBudget, isMock }) {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges])

  // Nothing yet.
  if (nodes.length === 0) {
    return (
      <aside className="side" aria-label="Evidence">
        <div className="panel">
          <h2>Follow a trail through culture</h2>
          <p className="serif">
            Enter something you love. The agent asks Qloo what audiences connect it to, picks a branch,
            and keeps going. Every line on the map shows what Qloo returned and what the agent added.
          </p>
          <ul className="how">
            <li><span className="swatch solid" />A solid line is a link Qloo returned.</li>
            <li><span className="swatch dotted" />A dotted line is a guess by the agent. No single Qloo result backs it.</li>
            <li><span className="swatch route" />The dark route is the discovery the agent settled on.</li>
          </ul>
          {isMock && <MockNote />}
        </div>
      </aside>
    )
  }

  // A node is selected.
  if (selection?.type === 'node' && nodeById.has(selection.id)) {
    const node = nodeById.get(selection.id)
    const touching = edges.filter((e) => e.source === node.id || e.target === node.id)
    return (
      <aside className="side" aria-label="Evidence">
        <div className="panel">
          <p className="crumb">
            <button type="button" className="link" onClick={() => onSelect(null)}>Back to the route</button>
          </p>
          <h2>{node.name}</h2>
          <p className="meta">
            <CategoryChip category={node.category} />
            <span>{node.role === 'seed' ? 'Where you started' : `${node.depth} hop${node.depth === 1 ? '' : 's'} from the start`}</span>
          </p>
          {node.blurb && <p className="serif">{node.blurb}</p>}

          <button
            type="button"
            className="btn btn-primary wide"
            onClick={() => onExpand(node.id)}
            disabled={running || atBudget}
          >
            Follow this thread
          </button>
          {atBudget && <p className="fine">The query budget is used up. Start a new journey to keep exploring.</p>}

          <h3>Connections ({touching.length})</h3>
          {touching.length === 0 ? (
            <p className="fine">No links yet. Follow this thread to ask Qloo.</p>
          ) : (
            <ul className="links">
              {touching.map((e) => {
                const otherId = e.source === node.id ? e.target : e.source
                const other = nodeById.get(otherId)
                return (
                  <li key={e.id}>
                    <button type="button" className="link-row" onClick={() => onSelect({ type: 'edge', id: e.id })}>
                      <span className="link-name">{other ? other.name : otherId}</span>
                      <span className="link-kind">
                        {e.kind === 'inferred' ? 'Agent guess' : 'Returned by Qloo'}
                        {e.crossCategory ? ', crosses category' : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    )
  }

  // A link is selected.
  if (selection?.type === 'edge' && edgeById.has(selection.id)) {
    const edge = edgeById.get(selection.id)
    const a = nodeById.get(edge.source)
    const b = nodeById.get(edge.target)
    const direct = edge.kind === 'direct'
    return (
      <aside className="side" aria-label="Evidence">
        <div className="panel">
          <p className="crumb">
            <button type="button" className="link" onClick={() => onSelect(null)}>Back to the route</button>
          </p>
          <h2>Why {a?.name} and {b?.name} are linked</h2>
          <p className="meta">
            {a && <CategoryChip category={a.category} />}
            <span aria-hidden="true">to</span>
            {b && <CategoryChip category={b.category} />}
          </p>

          {direct ? (
            <section className="block block-evidence">
              <h3>What Qloo returned</h3>
              <p>
                Asking Qloo about <strong>{a?.name}</strong> returned <strong>{b?.name}</strong>
                {edge.score != null && <> with a relative score of <strong>{Number(edge.score).toFixed(2)}</strong></>}.
              </p>
              {edge.retrieved && (
                <dl className="kv">
                  <dt>Endpoint</dt>
                  <dd><code>{edge.retrieved.endpoint}</code></dd>
                  <dt>Parameters</dt>
                  <dd>
                    {Object.entries(edge.retrieved.params || {}).map(([k, v]) => (
                      <code key={k} className="param">{k} = {v}</code>
                    ))}
                  </dd>
                  <dt>Retrieved</dt>
                  <dd>{new Date(edge.retrieved.retrievedAt).toLocaleString()}</dd>
                </dl>
              )}
              {edge.sharedTags?.length > 0 && (
                <p className="tags-line"><strong>Tags Qloo gives both:</strong> {edge.sharedTags.join(', ')}</p>
              )}
              {edge.targetTags?.length > 0 && (
                <p className="tags-line"><strong>Qloo describes {b?.name} as:</strong> {edge.targetTags.join(', ')}</p>
              )}
              {edge.retrieved?.mock && <MockNote />}
            </section>
          ) : (
            <section className="block block-guess">
              <h3>No single Qloo result links these</h3>
              <p>
                The agent is proposing this link by comparing separate results. Treat it as a hypothesis
                you can test, not as something Qloo reported.
              </p>
            </section>
          )}

          {edge.interpretation && (
            <section className="block block-interpretation">
              <h3>{edge.interpretedBy === 'model' ? 'What the agent makes of it' : 'In plain words'}</h3>
              <p className="serif interpretation">{edge.interpretation}</p>
              <p className="fine">
                {edge.interpretedBy === 'model'
                  ? 'Written by the language model from the data above. '
                  : 'Put together by the app from the data above. '}
                It is not part of Qloo’s response, and shared audiences do not show that one thing causes the other.
              </p>
              {isMock && <MockNote />}
            </section>
          )}
        </div>
      </aside>
    )
  }

  // Default: the discovery route, or a prompt to pick something.
  const routeNodes = path.map((id) => nodeById.get(id)).filter(Boolean)
  return (
    <aside className="side" aria-label="Evidence">
      <div className="panel">
        {routeNodes.length > 1 ? (
          <>
            <h2>The route the agent found</h2>
            <ol className="route-list">
              {routeNodes.map((n) => (
                <li key={n.id}>
                  <button type="button" className="link-row" onClick={() => onSelect({ type: 'node', id: n.id })}>
                    <span className="link-name">{n.name}</span>
                    <CategoryChip category={n.category} />
                  </button>
                </li>
              ))}
            </ol>
            {summary && <p className="serif">{summary}</p>}
            <p className="fine">Each step on the route is its own Qloo result. The route as a whole is the agent’s construction.</p>
            {onOpenBrief && (
              <>
                <button type="button" className="btn btn-primary wide" onClick={onOpenBrief}>Create Bridge Brief</button>
                <p className="fine">A one-page summary of this route that you can copy, download or print.</p>
              </>
            )}
          </>
        ) : (
          <>
            <h2>Pick a station or a line</h2>
            <p className="serif">
              {summary || 'Select any circle to see where it sits, or any line to see the evidence behind it.'}
            </p>
            <p className="fine">You can also use the keyboard: tab to a station and press Enter.</p>
          </>
        )}
        {isMock && <MockNote />}
      </div>
    </aside>
  )
}
