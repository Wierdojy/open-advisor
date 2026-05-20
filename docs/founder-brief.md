# Open Advisor Founder Brief

## One-line thesis
Open Advisor is a **thesis-driven market copilot** for self-directed investors who want to track what they own, track what they believe, and avoid missing important catalysts.

## The problem
Most investing products are optimized for feeds, trading, or generic watchlists.
That leaves a gap:
- investors have holdings
- investors have themes/beliefs
- important developments happen across both
- nobody cleanly connects those into a calm daily operating system

The real job is not “tell me what stock to buy.”
The real job is:
**help me stay on top of what I care about, understand what changed, and go deeper when needed.**

## Product position
Open Advisor is:
- not a broker
- not a trading terminal
- not an AI stock picker
- not an inbox product

It is a **market copilot** that connects:
**portfolio + watchlists + theses -> catalysts -> alerts + digest + research**

## Simplest coherent UX
The MVP should be small, legible, and obviously useful.

Five product surfaces:
1. **Home** — digest + what matters soon
2. **Portfolio** — holdings and watchlists
3. **Theses** — beliefs/trends/themes
4. **Calendar** — upcoming catalysts and alerts
5. **Research** — on-demand deeper sweep

This is the simplest product shape that still feels complete.

## Day-one MVP
Must-have:
1. holdings + watchlist sync
2. theses as first-class objects
3. auto-populated catalyst calendar
4. timed alerts
5. digest with live news and thesis relevance
6. targeted AI research sweep
7. thin voice access layer

Must not expand into MVP:
- inbox/work queue
- collaboration
- trading/execution
- deep customization
- voice-first control surface

## Why this wedge matters
This direction is better than an inbox-led product because it is:
- **more coherent** — one loop instead of many tools
- **more differentiated** — beliefs are first-class, not bolted on
- **faster to build** — fewer workflow abstractions up front
- **safer** — easier to stay on the monitoring/research side of the advice line

## Core product objects
- Asset
- Holding
- Watchlist
- Thesis
- ThesisAssetLink
- Catalyst
- Alert
- Digest
- ResearchRun
- Note

If a new feature does not strengthen these objects or the loop between them, it should probably wait.

## Product promise
The promise is not “we know what to buy.”
The promise is:
**we help you remember, monitor, and investigate the things that matter to your portfolio and your theses.**

## MVP success criteria
We should feel good about MVP if users say:
- “This helps me not miss things.”
- “This connects my holdings and my themes better than my broker does.”
- “The digest is actually useful.”
- “When something matters, I can go deeper fast.”

## Immediate build priorities
1. lock schema and core object model
2. stand up basic portfolio/thesis/calendar/research API
3. ship a minimal app shell with Home, Portfolio, Calendar, Research
4. prove digest usefulness and catalyst quality
5. add richer matching/ranking only after the core loop feels real
