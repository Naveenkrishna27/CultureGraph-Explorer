import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import TopBar from './components/TopBar.jsx'
import GraphCanvas from './components/GraphCanvas.jsx'
import EvidencePanel from './components/EvidencePanel.jsx'
import ActivityFeed from './components/ActivityFeed.jsx'
import BriefDialog from './components/BriefDialog.jsx'
import StartScreen from './components/StartScreen.jsx'
import ChoicePicker from './components/ChoicePicker.jsx'
import { buildBrief } from './lib/brief.js'
import { streamJourney, expandNode, isMock } from './lib/adapter.js'

const MAX_CALLS = 12

const initial = {
  nodes: [],
  edges: [],
  steps: [],
  path: [],
  summary: '',
  status: '',
  budget: { used: 0, max: MAX_CALLS },
}

// Every event from the adapter (mock or live) lands here. See lib/contract.js.
function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return { ...initial }
    case 'step':
      return {
        ...state,
        steps: [...state.steps, action.step],
        budget: action.step.calls != null ? { ...state.budget, used: action.step.calls } : state.budget,
      }
    case 'node':
      return state.nodes.some((n) => n.id === action.node.id) ? state : { ...state, nodes: [...state.nodes, action.node] }
    case 'edge': {
      // A repeat of an existing id is an update (for example, a better explanation arrived).
      const i = state.edges.findIndex((e) => e.id === action.edge.id)
      if (i === -1) return { ...state, edges: [...state.edges, action.edge] }
      const edges = state.edges.slice()
      edges[i] = action.edge
      return { ...state, edges }
    }
    case 'status':
      return { ...state, status: action.message || '' }
    case 'budget':
      return { ...state, budget: { used: action.used, max: action.max ?? state.budget.max } }
    case 'done':
      return {
        ...state,
        path: action.path && action.path.length ? action.path : state.path,
        summary: action.summary ?? state.summary,
        status: '',
      }
    default:
      return state
  }
}

export default function App() {
  const [graph, dispatch] = useReducer(reducer, initial)
  const [seed, setSeed] = useState('')
  const [mode, setMode] = useState('rabbit_hole')
  const [goal, setGoal] = useState('')
  const [selection, setSelection] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [briefOpen, setBriefOpen] = useState(false)
  const [choices, setChoices] = useState(null)
  const abortRef = useRef(null)

  const run = useCallback(async (makeStream) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    setError('')
    try {
      for await (const ev of makeStream(ctrl.signal)) {
        if (ctrl.signal.aborted) break
        if (ev.type === 'error') {
          setError(ev.message || 'The run failed. Try again.')
          break
        }
        if (ev.type === 'choices') {
          setChoices({ query: ev.query, options: ev.options })
          continue
        }
        dispatch(ev)
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Something went wrong. Try again.')
    } finally {
      if (abortRef.current === ctrl) setRunning(false)
      dispatch({ type: 'status', message: '' })
    }
  }, [])

  const start = (override, entity) => {
    const s = (override ?? seed).trim()
    if (!s) {
      setError('Enter something you love to start from, like a film, band or book.')
      return
    }
    dispatch({ type: 'reset' })
    setSelection(null)
    setChoices(null)
    run((signal) => streamJourney({ seed: s, seedId: entity?.id, mode, goal: goal.trim(), signal }))
  }

  const pickExample = (name) => {
    setSeed(name)
    start(name)
  }

  const pickChoice = (opt) => {
    setSeed(opt.name)
    start(opt.name, opt)
  }

  const stop = () => abortRef.current?.abort()

  const expand = (nodeId) => {
    const node = graph.nodes.find((n) => n.id === nodeId)
    const visited = [...new Set(graph.nodes.map((n) => n.category))]
    run((signal) => expandNode({ nodeId, node, visited, mode, signal, callsSoFar: graph.budget.used }))
  }

  const atBudget = graph.budget.used >= graph.budget.max
  const lastStop = [...graph.steps].reverse().find((st) => st.type === 'stop')
  const noMatch = !running && lastStop?.title === 'No match found'
  const deadEnd = !running && lastStop?.title === 'Nothing came back'
  const brief = useMemo(
    () => (briefOpen ? buildBrief({ nodes: graph.nodes, edges: graph.edges, path: graph.path }) : null),
    [briefOpen, graph.nodes, graph.edges, graph.path],
  )

  return (
    <>
    <div className="app">
      <TopBar
        seed={seed} setSeed={setSeed}
        mode={mode} setMode={setMode}
        goal={goal} setGoal={setGoal}
        running={running} onStart={() => start()} onStop={stop}
        isMock={isMock}
      />
      <main className="workspace">
        <div className={`canvas-wrap${noMatch || deadEnd ? ' canvas-wrap--cover' : ''}`}>
          <GraphCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            path={graph.path}
            selection={selection}
            onSelect={setSelection}
          />
          {!running && !choices && noMatch && (
            <StartScreen
              onPick={pickExample}
              title="We couldn't find that one."
              intro="Qloo has nothing under that name. Check the spelling, try a fuller title, or start from one of these."
              note="Or type another name above."
            />
          )}
          {!running && !choices && deadEnd && (
            <StartScreen
              onPick={pickExample}
              title="Nothing is connected to that one yet."
              intro="Qloo found the record but has no related results for it. Try another match, or start from one of these."
              note="Or type another name above."
            />
          )}
          {graph.nodes.length === 0 && !running && !choices && !noMatch && !deadEnd && <StartScreen onPick={pickExample} />}
          {choices && !running && (
            <ChoicePicker query={choices.query} options={choices.options} onPick={pickChoice} onCancel={() => setChoices(null)} />
          )}
          {running && (
            <div className="status-pill" role="status" aria-live="polite">
              <i aria-hidden="true" />
              <span>{graph.status || `Looking up “${seed.trim()}”…`}</span>
            </div>
          )}
        </div>
        <EvidencePanel
          nodes={graph.nodes}
          edges={graph.edges}
          selection={selection}
          path={graph.path}
          summary={graph.summary}
          onSelect={setSelection}
          onExpand={expand}
          onOpenBrief={() => setBriefOpen(true)}
          running={running}
          atBudget={atBudget}
          isMock={isMock}
        />
      </main>
      <ActivityFeed steps={graph.steps} running={running} budget={graph.budget} error={error} />
    </div>
    {brief && <BriefDialog brief={brief} onClose={() => setBriefOpen(false)} />}
    </>
  )
}
