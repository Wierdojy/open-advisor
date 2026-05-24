# Open Advisor API v1 Draft

## Scope
Initial API for the day-one MVP of a **thesis-driven market copilot**.

The API is centered on the core objects and the simplest coherent UX:
- portfolio context
- thesis tracking
- belief-driven inbox curation
- catalyst calendar
- alerts
- realtime signal inbox
- digest
- research sweeps

## Resources
- assets
- holdings
- watchlists
- theses
- catalysts
- alerts
- digest
- research-runs
- notes

## Endpoints

### Holdings
- `GET /v1/holdings`
- `POST /v1/holdings`
- `PATCH /v1/holdings/:holdingId`
- `DELETE /v1/holdings/:holdingId`

### Watchlists
- `GET /v1/watchlists`
- `POST /v1/watchlists`
- `PATCH /v1/watchlists/:watchlistId`
- `DELETE /v1/watchlists/:watchlistId`
- `POST /v1/watchlists/:watchlistId/items`
- `DELETE /v1/watchlists/:watchlistId/items/:itemId`

### Theses
- `GET /v1/theses`
- `POST /v1/theses`
- `PATCH /v1/theses/:thesisId`
- `DELETE /v1/theses/:thesisId`
- `POST /v1/theses/:thesisId/assets`
- `DELETE /v1/theses/:thesisId/assets/:linkId`

### Calendar / catalysts
- `GET /v1/catalysts?window=today|week|month&scope=all|holdings|watchlists|theses`
- `GET /v1/catalysts/:catalystId`

### Alerts
- `GET /v1/alerts`
- `POST /v1/alerts`
- `PATCH /v1/alerts/:alertId`
- `POST /v1/alerts/:alertId/snooze`
- `POST /v1/alerts/:alertId/seen`

### Digest
- `GET /v1/digest/today`
- `GET /v1/digest/:date`

### Inbox / realtime signals
- `GET /v1/inbox`
- `GET /v1/inbox-beliefs`
- `POST /v1/inbox-beliefs`
- `GET /v1/daily-report`
- `GET /v1/inbox-feed?q=&filter=&category=&limit=&cursor=`
- `GET /v1/stream`
- `POST /v1/signals/ingest`
- `POST /v1/market-signals/ingest`
- `POST /v1/inbox-items/:id/seen`
- `POST /v1/inbox-items/:id/archive`

### Portfolio analytics
- `GET /v1/portfolio/analytics?benchmark=nasdaq-100`

### Chat analysis
- `POST /v1/chat/analysis`

### Research runs
- `GET /v1/research-runs`
- `POST /v1/research-runs`
- `GET /v1/research-runs/:runId`

### Notes
- `POST /v1/theses/:thesisId/notes`
- `POST /v1/assets/:assetId/notes`
- `POST /v1/research-runs/:runId/notes`
- `PATCH /v1/notes/:noteId`
- `DELETE /v1/notes/:noteId`

## Example digest payload
```json
{
  "date": "2026-05-20",
  "summary": "2 catalysts this week, 1 major thesis update, and 3 live news items worth reviewing.",
  "mattersSoon": [
    {
      "type": "catalyst",
      "title": "NVDA earnings tomorrow",
      "whyItMatters": "Linked to your AI infrastructure thesis and current holding.",
      "linkedObjects": ["holding:nvda", "thesis:ai-power-infrastructure"]
    }
  ],
  "liveNews": [
    {
      "title": "Utility capex guidance revised upward",
      "whyItMatters": "Potential second-order support for your AI power infrastructure thesis.",
      "sourceUrl": "https://example.com"
    }
  ],
  "researchSuggestions": [
    {
      "prompt": "What changed in the AI power infrastructure thesis this week?"
    }
  ]
}
```

## Example research run request
```json
{
  "scope": "thesis",
  "targetId": "thesis_ai_power_infrastructure",
  "question": "What changed in this thesis over the last 7 days?"
}
```

## v1 implementation note
Start with authenticated single-user or dev-user mode plus mocked or thin real data feeds. The goal is to validate the core loop:
**portfolio + thesis context -> catalysts -> digest/alerts -> targeted research**

## Explicit non-goals for v1 API
- complex workflow inbox state machine
- workflow/task orchestration
- trading / execution APIs
- multi-user collaboration
- full voice-agent action surface
