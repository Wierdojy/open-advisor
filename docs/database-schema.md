# Open Advisor Database Schema

This schema turns the new product scope into a relational model.

Design goal:
- model the **core objects** cleanly
- support the loop **portfolio + theses -> catalysts -> alerts + digest + research**
- keep inbox/workflow concepts out of day-one MVP

## Schema principles
- **Assets** are canonical and shared.
- **Holdings**, **watchlists**, and **theses** express user intent.
- **Catalysts** are the central planning/calendar object.
- **Alerts**, **digests**, and **research runs** are generated user-facing outputs.
- External data enters as normalized **signal events** and **source documents**.

## Core tables

### users
Represents an account owner.

Key columns:
- `id`
- `email`
- `display_name`
- `timezone`
- `created_at`
- `updated_at`

### assets
Canonical tracked instruments/entities.

Key columns:
- `id`
- `symbol`
- `name`
- `asset_type` (`equity`, `etf`, `crypto`, `ipo_candidate`, `macro`, `other`)
- `primary_exchange`
- `currency`
- `is_active`
- `metadata_json`

### holdings
A user-owned exposure to an asset.

Key columns:
- `id`
- `user_id`
- `asset_id`
- `quantity`
- `cost_basis`
- `opened_at`
- `closed_at`
- `source_type` (`manual`, `broker_sync`)
- `source_ref`

### watchlists
User-curated lists of assets.

Key columns:
- `id`
- `user_id`
- `name`
- `description`
- `kind` (`manual`, `theme_supporting`, `system`)

### watchlist_items
Membership rows for assets inside watchlists.

Key columns:
- `id`
- `watchlist_id`
- `asset_id`
- `added_at`
- `notes`

### theses
User-defined beliefs, trends, or themes.

Key columns:
- `id`
- `user_id`
- `title`
- `slug`
- `summary`
- `rationale`
- `status` (`active`, `paused`, `archived`)
- `priority`
- `review_cadence`

### thesis_asset_links
Links assets to a thesis.

Key columns:
- `id`
- `thesis_id`
- `asset_id`
- `relationship_type` (`core`, `supporting`, `watch`, `hedge`, `contra`)
- `why_relevant`
- `confidence`

### signal_events
Normalized incoming external events/news items.

Key columns:
- `id`
- `event_type`
- `title`
- `summary`
- `occurred_at`
- `source_published_at`
- `source_document_id`
- `confidence`
- `severity`
- `raw_payload_json`

### signal_event_assets
Links signal events to assets.

Key columns:
- `id`
- `signal_event_id`
- `asset_id`
- `match_reason`

### catalysts
User-relevant upcoming/recent catalysts derived from signals or calendars.

Key columns:
- `id`
- `user_id`
- `asset_id`
- `thesis_id`
- `source_signal_event_id`
- `catalyst_type` (`earnings`, `filing`, `etf_change`, `macro`, `listing`, `news`, `thesis_update`, `custom`)
- `title`
- `summary`
- `scheduled_for`
- `window_start`
- `window_end`
- `status` (`upcoming`, `active`, `resolved`, `dismissed`)
- `importance_score`
- `why_it_matters`

### alerts
Timed or event-driven notification objects.

Key columns:
- `id`
- `user_id`
- `catalyst_id`
- `asset_id`
- `thesis_id`
- `alert_type` (`pre_event`, `change_detected`, `digest_prompt`, `custom`)
- `state` (`pending`, `seen`, `snoozed`, `muted`, `sent`, `cancelled`)
- `scheduled_for`
- `sent_at`
- `snoozed_until`
- `message`

### digests
Generated daily/periodic summaries.

Key columns:
- `id`
- `user_id`
- `digest_date`
- `window_label`
- `summary`
- `payload_json`
- `generated_at`

### research_runs
On-demand or suggested research sweeps.

Key columns:
- `id`
- `user_id`
- `scope_type` (`asset`, `thesis`, `portfolio`, `custom`)
- `asset_id`
- `thesis_id`
- `question`
- `status` (`queued`, `running`, `completed`, `failed`)
- `started_at`
- `completed_at`

### research_snapshots
Versioned outputs for research runs.

Key columns:
- `id`
- `research_run_id`
- `version_number`
- `summary`
- `body_markdown`
- `sources_json`
- `created_at`

### notes
User-authored context.

Key columns:
- `id`
- `user_id`
- `target_type` (`asset`, `holding`, `watchlist`, `thesis`, `catalyst`, `research_run`)
- `target_id`
- `body`
- `created_at`
- `updated_at`

### source_documents
Primary source records.

Key columns:
- `id`
- `url`
- `source_name`
- `title`
- `published_at`
- `retrieved_at`
- `document_type`
- `metadata_json`

## Relationships
- `holdings.user_id -> users.id`
- `holdings.asset_id -> assets.id`
- `watchlists.user_id -> users.id`
- `watchlist_items.watchlist_id -> watchlists.id`
- `watchlist_items.asset_id -> assets.id`
- `theses.user_id -> users.id`
- `thesis_asset_links.thesis_id -> theses.id`
- `thesis_asset_links.asset_id -> assets.id`
- `signal_events.source_document_id -> source_documents.id`
- `signal_event_assets.signal_event_id -> signal_events.id`
- `signal_event_assets.asset_id -> assets.id`
- `catalysts.user_id -> users.id`
- `catalysts.asset_id -> assets.id`
- `catalysts.thesis_id -> theses.id`
- `catalysts.source_signal_event_id -> signal_events.id`
- `alerts.user_id -> users.id`
- `alerts.catalyst_id -> catalysts.id`
- `digests.user_id -> users.id`
- `research_runs.user_id -> users.id`
- `research_snapshots.research_run_id -> research_runs.id`
- `notes.user_id -> users.id`

## Day-one indexes
- `assets(symbol)` unique when present
- `holdings(user_id, asset_id)`
- `watchlists(user_id, name)`
- `theses(user_id, status)`
- `thesis_asset_links(thesis_id, asset_id)` unique
- `signal_events(event_type, occurred_at desc)`
- `signal_event_assets(asset_id, signal_event_id)`
- `catalysts(user_id, scheduled_for)`
- `catalysts(user_id, thesis_id, scheduled_for)`
- `alerts(user_id, scheduled_for, state)`
- `digests(user_id, digest_date)` unique
- `research_runs(user_id, created_at desc)`
- `notes(user_id, target_type, target_id)`

## Tables intentionally deferred
Not part of day-one schema:
- inbox items
- workflow tasks
- trade/order drafts
- collaboration spaces
- team permissions

Those can be layered later without changing the core product loop.
