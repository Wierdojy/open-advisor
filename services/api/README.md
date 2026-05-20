# Open Advisor API

Runnable MVP API using Node's built-in HTTP server plus file-backed JSON persistence.

Current capabilities:
- bootstrap full app state
- derived digest and calendar
- add holdings
- add watchlists
- add theses
- add catalysts
- add alerts
- create research runs
- mark alerts seen
- snooze alerts
- reset demo data

Key endpoints:
- `GET /health`
- `GET /v1/bootstrap`
- `GET /v1/digest/today`
- `GET /v1/calendar`
- `GET|POST /v1/holdings`
- `GET|POST /v1/watchlists`
- `GET|POST /v1/theses`
- `GET|POST /v1/catalysts`
- `GET|POST /v1/alerts`
- `GET|POST /v1/research-runs`
- `POST /v1/alerts/:id/seen`
- `POST /v1/alerts/:id/snooze`
- `POST /v1/reset`

Persistence:
- data file lives at `data/app-state.json`
- reset with `node scripts/reset-data.js`
