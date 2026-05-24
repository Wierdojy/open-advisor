# Open Advisor

Open Advisor is a **thesis-driven market copilot** for self-directed investors.

It is not a broker and not an AI stock picker.
Its job is to help a user:
- track what they own
- track what they believe
- auto-track catalysts that matter
- get timely alerts
- receive a useful digest
- run deeper research on demand
- surface a calm realtime signal inbox when tracked things materially change

## Product thesis
Most investors do not need another market feed. They need a calm system that connects:
**holdings + watchlists + beliefs -> catalysts -> alerts + digest + research**

The product wins if it helps a user avoid missing important developments in the assets and themes they already care about.

The inbox is now designed around a tighter loop:
**user beliefs + realtime signals + AI suggestions + daily report**

## Simplest coherent UX
The MVP should feel like one compact loop, not a bundle of tools.

Primary surfaces:
- **Home** — today’s digest and what matters soon
- **Portfolio** — holdings and watchlists
- **Theses** — beliefs, trends, and themes being tracked
- **Inbox** — realtime market updates, AI suggestions, and the daily report/news basket
- **Calendar** — upcoming catalysts and timed alerts
- **Research** — targeted research sweeps and saved outputs

Voice remains deferred to a thin adapter layer later.

## Finished MVP in this repo
Implemented now:
1. Durable SQLite-backed app state persistence with automatic legacy JSON import
2. Holdings and watchlist management
3. Thesis creation with linked assets and notes
4. Catalyst calendar creation and derived timeline
5. Timed alert creation, seen, snooze, and delete flows
6. Derived digest generation
7. Targeted research sweep creation and deletion
8. Notes attached to theses, catalysts, and research
9. Realtime signal inbox with scoring, dedupe, reminders, delivery queue, and SSE updates
10. Runnable web app + runnable API
11. Belief-profile driven inbox curation with stance, conviction, disconfirming rules, and time horizon
12. Daily market brief with trending stocks and curated news basket
13. Static GitHub Pages build that ships the working product shell instead of only redirecting to Stitch references

## Architecture choice
Based on the decision council, the build follows a **hybrid MVP path**:
- keep the web shell simple
- keep the API dependency-light
- keep the core objects and service seams clean
- preserve an easy migration path to Postgres/framework upgrades later

The current local backend uses SQLite via Node's built-in `node:sqlite` runtime so the feature is durable without adding external services for development.

## Core objects
- Holding
- Watchlist
- Thesis
- Asset
- Catalyst
- Alert
- Digest
- ResearchRun
- Note

## Explicitly deferred
- Full workflow/task-management inbox
- Workflow/task management
- Collaboration
- Trade journaling
- Full voice-first control
- Deep customization
- Trading / execution

## Project layout
- **apps/web** — runnable static MVP UI
- **services/api** — runnable JSON API with persistence and core workflows
- **packages/domain** — shared state, derivations, and domain objects
- **db/** — future relational schema
- **docs/** — product, UX, architecture, API, schema, and founder docs

## Run locally
```bash
cd /root/.openclaw/workspace/open-advisor
node scripts/reset-data.js
node scripts/dev.js
```

Optional ports:
```bash
OPEN_ADVISOR_WEB_PORT=3200 OPEN_ADVISOR_API_PORT=3201 node scripts/dev.js
```

Then open:
- Web: `http://localhost:3000`
- API: `http://localhost:3001/v1/bootstrap`
- API health: `http://localhost:3001/health/deep`

## Verification
```bash
npm test
```

## Next likely step
Add a repository layer that maps the current durable SQLite runtime more directly onto the future Postgres schema without changing the realtime signal ingestion flow.
