import { categoryOf } from '../lib/contract.js'

export default function ChoicePicker({ query, options, onPick, onCancel }) {
  return (
    <div className="start">
      <h2>Which one did you mean?</h2>
      <p className="serif">Qloo found more than one match for “{query}”.</p>
      <ul className="choices">
        {options.map((o) => {
          const c = categoryOf(o.category)
          return (
            <li key={o.id}>
              <button type="button" className="choice" onClick={() => onPick(o)}>
                <strong>{o.name}</strong>
                <span className="chip" style={{ '--chip': c.color }}><i aria-hidden="true" />{c.label}</span>
                {o.blurb && <small>{o.blurb}</small>}
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="link" onClick={onCancel}>None of these. Let me retype.</button>
    </div>
  )
}
