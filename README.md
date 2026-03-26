# Incident Response Dispatch (MongoDB + FastAPI + React)

A minimal end-to-end system to report incidents and optimize instant dispatch of resources.

## Stack
- Backend: Python 3.11, FastAPI, Motor (MongoDB async), Pydantic v2, JWT
- Optimization: OR-Tools CP-SAT (lexicographic objectives)
- Frontend: React + TypeScript (Vite), MUI, Leaflet
- DevOps: Docker Compose

## Quick Start (Docker)
1. Start services

```bash
docker-compose up --build
```

2. Seed demo data

```bash
docker-compose --profile seed up --build seed
```

3. Open apps
- Frontend: http://localhost:5173
- Backend docs: http://localhost:8000/docs

## Demo Credentials
- Company admin: `admin@acme.local` / `admin123`
- Unit user: `unit1@acme.local` / `unit123`

## Local (without Docker)
Backend:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Seed:
```bash
cd backend
python -m app.seed.seed_data
```

Frontend:
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

## Key Endpoints
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/incident-types`
- `POST /api/incidents`
- `GET /api/incidents?scope=unit`
- `GET /api/incidents?scope=company&status=OPEN`
- `POST /api/optimize/dispatch-now`

## Optimization Notes
- Decision variable: assign one tech to at most one incident (dispatch-now).
- Constraints: skills, tools, licenses, vehicles, mode feasibility.
- Objectives (lexicographic):
  1. Maximize weighted incidents `Σ priority * assigned`.
  2. Minimize weighted time-to-restore in minutes.
  3. Minimize travel cost for onsite assignments.

## Repo Structure
- `backend/` FastAPI app and optimization
- `frontend/` React app
- `docker-compose.yml`
