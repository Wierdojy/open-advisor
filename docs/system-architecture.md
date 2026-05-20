# Open Advisor System Architecture

## Product shape
Open Advisor is a **thesis-driven market copilot**, not an inbox processor.

Core flow:
1. ingest user context (holdings, watchlists, theses)
2. ingest market/news/calendar/catalyst data
3. map external signals to tracked assets and theses
4. generate calendar entries, alerts, digest items, and research prompts
5. deliver the simplest coherent UX across app and lightweight voice access

## Architectural principle
The system should be organized around **core objects**, not around screens like an inbox.

That keeps the architecture aligned with the actual product loop:
**track portfolio + track beliefs + track catalysts + summarize/research what matters**

## Core services

### 1) Web app
Responsibilities:
- auth/session shell
- Home digest UI
- Portfolio UI
- Thesis UI
- Calendar UI
- Research UI
- lightweight alert/preferences UI

Suggested stack:
- Next.js / React
- TypeScript
- Tailwind or similar design system layer

### 2) API service
Responsibilities:
- auth/session handling
- CRUD for holdings, watchlists, theses, notes
- calendar query API
- alert query/mutation API
- digest generation/read API
- research run API
- voice-query support endpoints

Suggested stack:
- Node + TypeScript
- Postgres-backed API
- background jobs for digests, alerts, and research runs

### 3) Signal ingestion pipeline
Responsibilities:
- market/reference ingestion
- live news ingestion
- event/calendar ingestion
- catalyst normalization
- thesis/entity matching
- source confidence/freshness tagging

Suggested pattern:
- pull + stream hybrid
- append-only normalized signal log
- replayable matching pipeline

### 4) Copilot orchestration layer
Responsibilities:
- map signals to holdings/watchlists/theses
- create catalyst records
- generate digest candidates
- generate alert candidates
- launch targeted research sweeps
- maintain lightweight explanation trails

### 5) Voice access layer
Responsibilities:
- support simple read/query actions
- fetch digest highlights
- fetch upcoming catalysts
- trigger a research run

Important boundary:
- voice should be a thin adapter over the same APIs, not a second product architecture

## Core object model

### User-facing objects
- **Asset** — canonical tracked instrument/entity
- **Holding** — user-owned exposure to an asset
- **Watchlist** — user-curated list of assets
- **WatchlistItem** — asset membership in a watchlist
- **Thesis** — user-stated belief, trend, or theme
- **ThesisAssetLink** — relation between a thesis and an asset
- **Catalyst** — upcoming or recent event relevant to an asset/thesis
- **Alert** — timed or event-driven notification candidate
- **Digest** — assembled daily briefing
- **ResearchRun** — targeted AI research sweep and output
- **Note** — user-authored context linked to thesis/asset/research

### System objects
- **SignalEvent** — normalized external event/news item
- **SourceDocument** — source link plus metadata
- **MatchExplanation** — why a signal/catalyst maps to a tracked object
- **DigestRun** — assembly job for a digest
- **AlertDelivery** — delivery attempt/state
- **ResearchSnapshot** — saved output/version for a ResearchRun

## Data flow

### A. Portfolio + thesis context
Input:
- holdings sync
- manual watchlists
- thesis creation/editing

Output:
- canonical tracked graph of user intent

### B. Signal normalization
Input:
- market events
- live news
- filings
- calendar feeds
- thesis-relevant external signals

Output:
- normalized SignalEvents with timestamps, source, confidence, and linked entities

### C. Catalyst generation
Input:
- tracked graph + SignalEvents

Output:
- Catalyst objects tied to holdings, watchlists, and theses

### D. User-facing generation
From catalysts and signals produce:
- upcoming calendar entries
- timed alerts
- digest sections
- research prompts / research runs

## Storage suggestion
- Postgres for primary relational state
- append-only signal/catalyst tables for replayability
- object storage or document table for research outputs
- optional search index later for research and notes

## Day-one implementation boundaries
Build now:
- holdings/watchlists
- theses
- catalyst calendar
- alerts
- digest
- research runs
- thin voice adapter

Defer:
- inbox/work queue
- collaboration
- trading/execution
- advanced personalization layers
- full conversational orchestration

## Build order
1. core object schemas
2. CRUD for holdings/watchlists/theses
3. normalized signal + catalyst pipeline
4. calendar API
5. digest generation
6. alert generation/state
7. research run flow
8. voice adapter over digest/calendar/research APIs
