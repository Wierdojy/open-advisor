# Open Advisor API

Runnable MVP API using Node's built-in HTTP server plus durable SQLite persistence via Node's built-in `node:sqlite` module.

Current capabilities:
- bootstrap full app state
- realtime SSE stream for inbox/digest/calendar updates
- derived digest and calendar
- add holdings
- add watchlists
- add theses
- create inbox belief profiles with user stance + conviction metadata
- add catalysts
- ingest market/news signals into the inbox with scoring + dedupe
- generate a daily report payload with trending stocks + curated news basket
- add alerts
- create research runs
- mark alerts seen
- snooze alerts
- reset demo data

Key endpoints:
- `GET /health`
- `GET /health/deep`
- `GET /v1/bootstrap`
- `GET /v1/stream`
- `GET /v1/digest/today`
- `GET /v1/calendar`
- `GET /v1/inbox`
- `GET|POST /v1/inbox-beliefs`
- `GET /v1/daily-report`
- `GET /v1/inbox-feed?q=&filter=&category=&limit=&cursor=`
- `GET /v1/inbox-items/:id`
- `GET|POST /v1/holdings`
- `GET|POST /v1/watchlists`
- `GET|POST /v1/theses`
- `GET|POST /v1/catalysts`
- `GET /v1/events/:id`
- `GET|POST /v1/alerts`
- `GET /v1/reminders/:id`
- `GET|POST /v1/research-runs`
- `GET|POST /v1/source-adapters`
- `GET /v1/source-adapters/:id`
- `GET /v1/source-health`
- `GET /v1/delivery-queue`
- `GET /v1/portfolio/analytics?benchmark=nasdaq-100`
- `POST /v1/chat/analysis`
- `POST /v1/signals/ingest`
- `POST /v1/market-signals/ingest`
- `POST /v1/signals/ingest/batch`
- `POST /v1/market-signals/ingest/batch`
- `POST /v1/delivery-queue/:id/delivered`
- `POST /v1/delivery-queue/:id/failed`
- `POST /v1/delivery-queue/:id/cancelled`
- `POST /v1/alerts/:id/seen`
- `POST /v1/alerts/:id/snooze`
- `POST /v1/reset`

Persistence:
- SQLite database lives at `data/app-state.sqlite`
- legacy `data/app-state.json` is imported automatically on first boot if present
- reset with `node scripts/reset-data.js`
