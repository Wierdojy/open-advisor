# Open Advisor Core Objects

This document defines the minimum product objects for the new Open Advisor scope.

The rule: if an object does not help power the loop
**holdings/watchlists + beliefs -> catalysts -> alerts + digest + research**
it should probably not be first-class in MVP.

## 1) Asset
A canonical tracked instrument or entity.

Examples:
- NVDA
- an ETF
- BTC
- an upcoming IPO candidate
- a macro series or sector proxy later

Why it exists:
- everything else needs a stable thing to point at

## 2) Holding
A user-owned exposure to an asset.

Why it exists:
- relevance changes when the user owns something

## 3) Watchlist
A user-curated list of assets they care about but may not own.

Why it exists:
- not everything important is already owned

## 4) Thesis
A user-stated belief, trend, or theme.

Examples:
- AI power infrastructure
- defense drones
- stablecoin rails

Why it exists:
- this is the key differentiator in the new scope
- the product is not just portfolio monitoring; it is belief-aware monitoring

## 5) ThesisAssetLink
A relation between a thesis and an asset.

Why it exists:
- lets the product explain why an asset belongs in a thesis
- lets catalysts/news map upward into a thesis

## 6) Catalyst
An event or development that may matter to a tracked asset or thesis.

Examples:
- earnings
- filing
- ETF launch/change
- macro event
- thesis-relevant company announcement

Why it exists:
- the calendar and alerts should be built from catalysts, not from generic feed items

## 7) Alert
A notification tied to time, a catalyst, or a meaningful change.

Why it exists:
- this is how the product helps the user not miss something

## 8) Digest
An assembled briefing of what changed and what matters soon.

Why it exists:
- creates the calm, high-signal daily experience

## 9) ResearchRun
A targeted AI research sweep requested by the user or suggested by the system.

Examples:
- research this company
- research this thesis
- what changed in this thesis since last week

Why it exists:
- lets the product go deeper without turning the default UX into a noisy research terminal

## 10) Note
User-authored context linked to a thesis, asset, or research run.

Why it exists:
- helps preserve intent and interpretation over time

## Objects explicitly not required for day-one MVP
- InboxItem
- WorkflowTask
- CollaborationSpace
- OrderDraft
- TradeJournalEntry

Those may appear later, but they should not shape the first architecture.
