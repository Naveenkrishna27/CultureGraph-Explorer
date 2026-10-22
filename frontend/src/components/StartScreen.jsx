import { EXAMPLES } from '../lib/examples.js'
import { categoryOf } from '../lib/contract.js'

export default function StartScreen({ onPick, title, intro, note }) {
  return (
    <div className="start">
      <h2>{title || 'Find the surprising link between the things people love.'}</h2>
      <p className="serif">
        {intro ||
          'Pick a starting point. An agent asks Qloo what audiences connect to it, follows the most surprising thread, and shows the evidence for every link.'}
      </p>
      <ul className="examples" aria-label="Example starting points">
        {EXAMPLES.map((ex) => (
          <li key={ex.name}>
            <button type="button" className="example" style={{ '--chip': categoryOf(ex.category).color }} onClick={() => onPick(ex.name)}>
              <i aria-hidden="true" />
              <span>{ex.name}</span>
              <small>{categoryOf(ex.category).label}</small>
            </button>
          </li>
        ))}
      </ul>
      <p className="fine">{note || 'Or type your own above. No sign-up. The first run takes about half a minute; repeat runs are much faster.'}</p>
    </div>
  )
}
