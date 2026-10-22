import { useEffect, useRef, useState } from 'react'
import { categoryOf } from '../lib/contract.js'
import { toMarkdown } from '../lib/brief.js'

const f2 = (n) => Number(n).toFixed(2)

export default function BriefDialog({ brief, onClose }) {
  const closeRef = useRef(null)
  const [status, setStatus] = useState('')
  const markdown = toMarkdown(brief)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setStatus('Copied to the clipboard.')
    } catch {
      setStatus('Copying was blocked by the browser. Use Download instead.')
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'bridge-brief.md'
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Downloaded bridge-brief.md.')
  }

  return (
    <div className="overlay" onClick={onClose}>
      <article
        className="brief"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brief-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="brief-head">
          <h2 id="brief-title">{brief.title}</h2>
          <button ref={closeRef} type="button" className="btn btn-outline no-print" onClick={onClose}>Close</button>
        </header>

        {brief.mock && <p className="mock-note">Demo data. None of this was returned by Qloo.</p>}

        <p className="brief-lead">{brief.headline}</p>

        <section>
          <h3>The route</h3>
          <ol className="brief-route">
            {brief.route.map((n) => (
              <li key={n.id} style={{ '--dot': categoryOf(n.category).color }}>
                <strong>{n.name}</strong>
                <span>{categoryOf(n.category).label}</span>
              </li>
            ))}
          </ol>
          <p className="serif">
            It crosses {brief.categories.length} categories: {brief.categories.join(', ')}. Each hop is its own Qloo
            result. The route as a whole is the agent’s construction.
          </p>
        </section>

        {brief.language.length > 0 && (
          <section>
            <h3>The language this audience shares</h3>
            <p className="brief-tags">
              {brief.language.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </p>
            <p className="fine">Tags Qloo gives to both ends of a hop.</p>
          </section>
        )}

        <section>
          <h3>Hop by hop</h3>
          <ul className="brief-hops">
            {brief.hops.map((h) => (
              <li key={`${h.from.id}-${h.to.id}`}>
                <strong>{h.from.name} to {h.to.name}</strong>
                <span>
                  {h.score != null ? `relative score ${f2(h.score)}` : 'no score returned'}
                  {h.sharedTags.length > 0 && `. Shared tags: ${h.sharedTags.join(', ')}`}
                </span>
              </li>
            ))}
          </ul>
          {brief.weakest && (
            <p className="fine">
              Weakest link: {brief.weakest.from.name} to {brief.weakest.to.name} ({f2(brief.weakest.score)}).
            </p>
          )}
        </section>

        {brief.ideas.length > 0 && (
          <section>
            <h3>Ways to use it</h3>
            <ol className="brief-ideas">
              {brief.ideas.map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ol>
            <p className="fine">These are the app’s suggestions, not Qloo data.</p>
          </section>
        )}

        <section>
          <h3>Read this carefully</h3>
          <p className="serif">
            Qloo shows that audiences overlap. It does not show why, and it does not show that one thing causes the
            other. Treat each idea as a hypothesis to test.
          </p>
        </section>

        <footer className="brief-actions no-print">
          <button type="button" className="btn btn-primary" onClick={copy}>Copy as text</button>
          <button type="button" className="btn btn-outline" onClick={download}>Download</button>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>Print or save as PDF</button>
          <span className="fine" role="status" aria-live="polite">{status}</span>
        </footer>
      </article>
    </div>
  )
}
