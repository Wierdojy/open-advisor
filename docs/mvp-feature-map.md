# Open Advisor MVP Feature Map

## Product shape
Open Advisor is a **thesis-driven market copilot**.

The MVP is not an inbox. It is a compact system for:
**holdings/watchlists + beliefs -> catalyst tracking -> alerts + digest + research**

## Simplest coherent UX
The product should revolve around five simple surfaces:
1. **Home**
2. **Portfolio**
3. **Theses**
4. **Calendar**
5. **Research**

This is the smallest coherent UX that expresses the product clearly.

### Home
- Today’s digest
- What matters soon
- Important live news tied to tracked assets/theses
- Quick jump into research or calendar

### Portfolio
- Holdings
- Watchlists
- Owned vs watched state
- Link assets to theses

### Theses
- User-defined beliefs, trends, and themes
- Linked assets
- Why the thesis matters
- What catalysts should be watched

### Calendar
- Upcoming catalysts
- Timed alerts
- Earnings, filings, ETF launches, macro dates, thesis-relevant events
- Filter by holdings, watchlists, or theses

### Research
- Targeted research sweep for a company, asset, or thesis
- Saved research outputs
- “What changed?” follow-up sweeps

## MVP user jobs
1. I want to connect what I own and what I am watching.
2. I want to define the beliefs/themes I care about.
3. I want the product to automatically track catalysts around both.
4. I want timely alerts instead of constant monitoring.
5. I want one digest that tells me what matters and why.
6. I want to run a deeper research sweep when something deserves attention.

## Day-one MVP features

### 1) Holdings + watchlists
- API-connected holdings sync
- Manual watchlist creation/editing
- Owned vs watched state
- Basic grouping/tagging

### 2) Theses / beliefs
- Create a thesis or trend to track
- Link assets to a thesis
- Store short rationale / notes
- Track thesis status (active, paused, archived)

### 3) Catalyst calendar
- Auto-populate from tracked assets and theses
- Event types:
  - earnings
  - filings
  - ETF launches/changes
  - macro dates
  - thesis-relevant company events
- Calendar views: upcoming, this week, later

### 4) Timed alerts
- Alert before catalyst
- Alert on major change tied to a thesis or tracked asset
- Snooze / mute / mark seen
- Delivery targets later; in-app first is enough for MVP

### 5) Digest
- What changed today
- What matters soon
- Live news tied to tracked assets/theses
- Why it matters
- Links into Calendar or Research

### 6) Targeted AI research sweep
- Research a company
- Research a thesis/theme
- Research what changed since last review
- Save outputs for later reference

### 7) Voice as a thin layer
- Ask for today’s important items
- Ask for upcoming catalysts
- Ask for a research sweep
- Read digest highlights aloud

## Core objects behind the MVP
- Holding
- Watchlist
- Asset
- Thesis
- Catalyst
- Alert
- Digest
- ResearchRun

## Explicit non-goals for MVP
- Dedicated inbox
- Full workflow/task center
- Trading / order entry
- Direct investment advice
- Collaboration / multi-user workspaces
- Full conversational voice-first app control
- Dense terminal-style analytics

## Post-MVP expansion
- Richer thesis tracking and change history
- Better alert routing and delivery channels
- Broker/account sync expansion
- More advanced research memory
- Advisor/collaborative workflows
- Optional inbox/work queue if user demand proves real
