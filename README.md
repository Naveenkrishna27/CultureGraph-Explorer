# CultureGraph Explorer

An agent that follows taste across film, music, books, games, places and brands using
[Qloo](https://qloo.com)'s taste graph, and shows the evidence for every link it draws.
Built for the Qloo Agentic Hackathon.

**What makes it different:** every line on the map comes from a real Qloo result and carries
its provenance (endpoint, parameters, time). The language model only chooses among results Qloo
returned and writes a hedged reading of each link, clearly labelled as interpretation. A dotted
line would mean a guess with no Qloo result behind it.

## How it fits together

```
React map UI  --NDJSON stream-->  FastAPI server  --->  Qloo API (key stays on the server)
(frontend/)                       (backend/)      --->  optional LLM (Claude, OpenAI or Gemini)
                                  agent loop, private cache, rate limits
```

| Folder | What it is |
|---|---|
| `probe.py` | Day-1 script: shows what the Qloo API really returns. Run this first. |
| `backend/app/agent.py` | The bounded exploration loop, scoring rules, validator. **The heart of the project.** |
| `backend/app/qloo.py` | Qloo client: budget, private cache, tolerant parsing. |
| `backend/app/llm.py` | Optional model helper. Any failure falls back to rules. |
| `backend/tests/` | 26 offline tests (fake Qloo and a local stub server). |
| `frontend/` | The map interface. Runs on demo data until `VITE_USE_MOCK=false`. |

## Run it

**1. Keys.** Copy `.env.example` to `.env` and add your Qloo key. Never commit `.env`.

**2. Probe the API** (do this first, it takes five minutes):
```bash
python -m venv .venv
.venv\Scripts\activate            # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
python probe.py
```

**3. Backend** (new terminal, from the project folder):
```bash
cd backend
pip install -r requirements.txt
python -m unittest discover -s tests      # should print OK
uvicorn app.main:app --reload --port 8000
```
Check http://localhost:8000/api/health. It should show `"qloo_key_set": true`.

**4. Front end** (another terminal):
```bash
cd frontend
copy .env.example .env            # Mac/Linux: cp .env.example .env
# edit frontend/.env and set VITE_USE_MOCK=false to use the real backend
npm install
npm run dev                       # http://localhost:5173
```

## Deploy (single container)

`Dockerfile` builds the front end and serves it from the Python server. On a host such as Render or
Fly.io, set `QLOO_API_KEY` (and optionally `LLM_*`) as environment variables, never in the repo.

## Data rules (from the Qloo hackathon developer guide)

- The hackathon key only works against `https://hackathon.api.qloo.com`, sent in the `X-Api-Key` header.
- Private, server-side caching of Qloo responses is allowed.
- **Never commit Qloo response data to this public repo.** `probe_out/` and `backend/.cache/` are git-ignored. Keep it that way.
- Your key allows **5 requests per second and 10,000 per month**. The server paces requests, retries a 429 once the window resets, and refuses new journeys when the monthly quota runs low (`MONTH_QUOTA_FLOOR`).
- Keys are deactivated after judging, so the live demo will stop working afterwards. Record a video for your portfolio.

## License

MIT. See `LICENSE`.
