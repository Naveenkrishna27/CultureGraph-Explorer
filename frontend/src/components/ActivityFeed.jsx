import { useEffect, useRef } from 'react'

const TYPE_LABEL = {
  resolve: 'Look up',
  query: 'Ask Qloo',
  choose: 'Choose',
  verify: 'Check',
  evaluate: 'Weigh up',
  stop: 'Stop',
  note: 'Note',
}

export default function ActivityFeed({ steps, running, budget, error }) {
  const logRef = useRef(null)

  // Scroll only the log itself. scrollIntoView would also scroll the whole page.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [steps.length, running])

  const blocks = Array.from({ length: budget.max }, (_, i) => i < budget.used)

  return (
    <section className="log-wrap" aria-label="Journey log">
      <div className="log" ref={logRef}>
        <h2>Journey log</h2>
        {error && (
          <p className="error" role="alert">{error}</p>
        )}
        {steps.length === 0 && !error ? (
          <p className="empty-note">Each decision the agent makes will appear here: what it asked, what came back, and why it moved on.</p>
        ) : (
          <ol aria-live="polite">
            {steps.map((s) => (
              <li key={s.id} data-type={s.type}>
                <div className="step-head">
                  <span className="step-type">{TYPE_LABEL[s.type] || s.type}</span>
                  <strong>{s.title}</strong>
                  {s.tool && <code className="tool">{s.tool}</code>}
                </div>
                {s.detail && <p className="step-detail">{s.detail}</p>}
              </li>
            ))}
            {running && (
              <li data-type="working" className="working">
                <div className="step-head"><strong>Working</strong></div>
              </li>
            )}
          </ol>
        )}
      </div>

      <aside className="budget" aria-label="Qloo query budget">
        <h3>Query budget</h3>
        <p className="budget-count">
          <strong>{budget.used}</strong> of {budget.max} used
        </p>
        <div className="budget-bar" role="img" aria-label={`${budget.used} of ${budget.max} Qloo queries used`}>
          {blocks.map((on, i) => (
            <span key={i} className={on ? 'on' : ''} />
          ))}
        </div>
        <p className="fine">The agent stops when it finds a good route, and keeps a few queries back so you can follow threads yourself.</p>
      </aside>
    </section>
  )
}
