# Open Advisor

Open Advisor is a **thesis-driven market copilot** for self-directed investors.

It is not a broker, not an AI stock picker, and not an inbox product.
Its job is to help a user:
- track what they own
- track what they believe
- auto-track catalysts that matter
- get timely alerts
- receive a useful digest
- run deeper research on demand

## Product thesis
Most investors do not need another market feed. They need a calm system that connects:
**holdings + watchlists + beliefs -> catalysts -> alerts + digest + research**

The product wins if it helps a user avoid missing important developments in the assets and themes they already care about.

## Simplest coherent UX
The MVP should feel like one compact loop, not a bundle of tools.

Primary surfaces:
- **Home** — today’s digest and what matters soon
- **Portfolio** — holdings and watchlists
- **Theses** — beliefs, trends, and themes being tracked
- **Calendar** — upcoming catalysts and timed alerts
- **Research** — targeted research sweeps and saved outputs

Voice remains deferred to a thin adapter layer later.

## Finished MVP in this repo
Implemented now:
1. File-backed app state persistence
2. Holdings and watchlist management
3. Thesis creation with linked assets and notes
4. Catalyst calendar creation and derived timeline
5. Timed alert creation, seen, snooze, and delete flows
6. Derived digest generation
7. Targeted research sweep creation and deletion
8. Notes attached to theses, catalysts, and research
9. Runnable web app + runnable API

## Architecture choice
Based on the decision council, the build follows a **hybrid MVP path**:
- keep the web shell simple
- keep the API dependency-light
- keep the core objects and service seams clean
- preserve an easy migration path to Postgres/framework upgrades later

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
- Dedicated inbox
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

Then open:
- Web: `http://localhost:3000`
- API: `http://localhost:3001/v1/bootstrap`

## Verification
```bash
npm test
```

## Next likely step
Replace file-backed persistence with a real database-backed read/write layer while preserving the current core object seams.
