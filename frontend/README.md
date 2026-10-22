# CultureGraph Explorer: front end

React + Vite. Runs on built-in **demo data** until the backend exists.

## Run it

```bash
cd frontend
npm install
npm run dev          # opens http://localhost:5173
```

You will see a yellow "Demo data" badge. Type anything (the demo only knows
**Interstellar**), pick a mode, and press "Start exploring".

## Where things live

| Path | What it does |
|---|---|
| `src/lib/contract.js` | The data shapes the UI understands. **Read this first.** |
| `src/lib/mockAdapter.js` | Demo journeys. Nothing here comes from Qloo. |
| `src/lib/liveAdapter.js` | Talks to the FastAPI backend (`/api/journey`, `/api/expand`). |
| `src/lib/adapter.js` | Switch: demo data or live backend. |
| `src/lib/layout.js` | Hand-written force layout for the map. |
| `src/components/` | TopBar, GraphCanvas, EvidencePanel, ActivityFeed. |

## Going live later

1. Build the backend so it streams one JSON event per line (NDJSON) in the shapes
   described at the top of `contract.js`.
2. Create `frontend/.env` with `VITE_USE_MOCK=false`.
3. `npm run dev` proxies `/api` to `http://localhost:8000` (see `vite.config.js`).

## Secrets

Never put the Qloo key or any LLM key in this folder. Anything starting with
`VITE_` is shipped to every visitor's browser. Keys belong in the backend `.env`
only, which is git-ignored.
