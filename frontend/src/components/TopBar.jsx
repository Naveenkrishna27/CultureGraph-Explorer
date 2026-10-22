import { MODES } from '../lib/contract.js'

export default function TopBar({ seed, setSeed, mode, setMode, goal, setGoal, running, onStart, onStop, isMock }) {
  const activeMode = MODES.find((m) => m.id === mode)

  const submit = (e) => {
    e.preventDefault()
    if (running) onStop()
    else onStart()
  }

  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M10 44 L30 20 L54 30" fill="none" stroke="#083A5C" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10" cy="44" r="7" fill="#FFFFFF" stroke="#FF5A47" strokeWidth="5" />
          <circle cx="30" cy="20" r="7" fill="#FFFFFF" stroke="#F29A00" strokeWidth="5" />
          <circle cx="54" cy="30" r="7" fill="#FFFFFF" stroke="#B5359A" strokeWidth="5" />
        </svg>
        <span className="brand-name">CultureGraph</span>
        {isMock && (
          <span className="demo-badge" title="You are looking at a built-in sample, not live Qloo results.">
            Demo data
          </span>
        )}
      </div>

      <div className="seedbox">
      <form className="search" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="seed">Start with something you love</label>
        <input
          id="seed"
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="Try a film, band, book or brand"
          autoComplete="off"
          maxLength={80}
          disabled={running}
        />
        <button type="submit" className={running ? 'btn btn-outline' : 'btn btn-primary'}>
          {running ? 'Stop' : 'Start exploring'}
        </button>
      </form>
        {mode === 'rabbit_hole' && (
          <div className="goal">
            <label className="visually-hidden" htmlFor="goal">Goal for the agent (optional)</label>
            <input
              id="goal"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Optional goal, such as: find a link to visual art"
              autoComplete="off"
              maxLength={200}
              disabled={running}
            />
          </div>
        )}
      </div>

      <div className="modebar">
        <div className="modes" role="radiogroup" aria-label="How the agent explores">
          {MODES.map((m) => (
            <label key={m.id}>
              <input
                type="radio"
                name="mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
                disabled={running}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
        <p className="mode-hint">{activeMode?.hint}</p>
      </div>
    </header>
  )
}
