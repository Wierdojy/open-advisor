const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStreamMatch(reader, pattern, timeoutMs = 3000) {
  const started = Date.now();
  let text = '';
  while (Date.now() - started < timeoutMs) {
    const result = await Promise.race([
      reader.read(),
      wait(250).then(() => ({ timeout: true }))
    ]);

    if (result && result.timeout) continue;
    if (!result || result.done) break;
    text += Buffer.from(result.value).toString('utf8');
    if (pattern.test(text)) return text;
  }
  throw new Error(`Timed out waiting for stream pattern ${pattern}`);
}

async function json(url, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function expectStatus(url, status, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  assert.equal(res.status, status, `Expected ${status}, got ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const port = 3101;
  const child = spawn('node', ['services/api/server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) }
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await wait(500);
    await json(`http://localhost:${port}/v1/reset`, { method: 'POST' });

    const streamController = new AbortController();
    const streamResponse = await fetch(`http://localhost:${port}/v1/stream`, { signal: streamController.signal });
    assert.match(streamResponse.headers.get('content-type') || '', /text\/event-stream/);
    const streamReader = streamResponse.body.getReader();
    await waitForStreamMatch(streamReader, /event: bootstrap/);

    const before = await json(`http://localhost:${port}/v1/bootstrap`);
    assert.equal(before.holdings.length, 2);
    assert.equal(before.themes.length, 1);
    assert.ok(Array.isArray(before.beliefProfiles));
    assert.ok(before.dailyReport);

    const initialInboxFeed = await json(`http://localhost:${port}/v1/inbox-feed?filter=all&limit=10`);
    assert.ok(Array.isArray(initialInboxFeed.items));
    assert.ok(initialInboxFeed.facets.all >= 2);

    const deepHealth = await json(`http://localhost:${port}/health/deep`);
    assert.equal(deepHealth.backend, 'sqlite');
    assert.ok(deepHealth.counts.assets >= 4);

    const portfolioAnalytics = await json(`http://localhost:${port}/v1/portfolio/analytics?benchmark=nasdaq-100`);
    assert.equal(portfolioAnalytics.benchmark.label, 'NASDAQ-100');
    assert.ok(Array.isArray(portfolioAnalytics.currentPositions));
    assert.ok(Array.isArray(portfolioAnalytics.sectorBreakdown));
    assert.ok(Array.isArray(portfolioAnalytics.performanceSeries));

    const chatAnalysis = await json(`http://localhost:${port}/v1/chat/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How is my portfolio performing versus the NASDAQ-100, especially tech exposure?' })
    });
    assert.ok(chatAnalysis.answer.headline);
    assert.ok(Array.isArray(chatAnalysis.cards));
    assert.ok(chatAnalysis.cards.some((card) => card.type === 'benchmark_comparison'));
    assert.ok(Array.isArray(chatAnalysis.sources));
    assert.ok(Array.isArray(chatAnalysis.follow_ups));

    const adapterCreate = await json(`http://localhost:${port}/v1/source-adapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'adapter_live_prices',
        name: 'Live Price Feed',
        tier: 'tier_1',
        status: 'healthy',
        coverage: 'intraday_market_moves'
      })
    });
    assert.equal(adapterCreate.ok, true);
    assert.equal(adapterCreate.adapter.id, 'adapter_live_prices');
    const adapterGet = await json(`http://localhost:${port}/v1/source-adapters/adapter_live_prices`);
    assert.equal(adapterGet.name, 'Live Price Feed');

    const afterHolding = await json(`http://localhost:${port}/v1/holdings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'TSM', name: 'Taiwan Semiconductor', quantity: 12 })
    });
    assert.equal(afterHolding.holdings.length, 3);

    const afterTheme = await json(`http://localhost:${port}/v1/themes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Grid modernization',
        summary: 'Utilities and grid upgrades',
        assets: [{ symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund' }]
      })
    });
    assert.ok(afterTheme.themes.some((theme) => theme.title === 'Grid modernization'));

    const gridTheme = afterTheme.themes.find((theme) => theme.title === 'Grid modernization');
    const afterEvent = await json(`http://localhost:${port}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'TSM capex update',
        symbol: 'TSM',
        eventType: 'news',
        scheduledFor: new Date().toISOString(),
        factualSummary: 'TSM discussed capex pacing on a management update.',
        reason: 'Potential read-through for semiconductor supply chain capacity and AI buildout.',
        themeId: gridTheme.id
      })
    });
    assert.ok(afterEvent.canonicalEvents.some((event) => event.title === 'TSM capex update'));
    assert.ok(afterEvent.inbox.some((item) => item.event?.title === 'TSM capex update'));

    const createdEvent = afterEvent.canonicalEvents.find((event) => event.title === 'TSM capex update');
    const fetchedEvent = await json(`http://localhost:${port}/v1/events/${createdEvent.id}`);
    assert.equal(fetchedEvent.title, 'TSM capex update');
    const afterReminder = await json(`http://localhost:${port}/v1/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Revisit TSM capex update',
        relatedType: 'event',
        relatedId: createdEvent.id,
        dueAt: new Date().toISOString()
      })
    });
    assert.ok(afterReminder.reminders.some((reminder) => reminder.title === 'Revisit TSM capex update'));
    const createdReminder = afterReminder.reminders.find((reminder) => reminder.title === 'Revisit TSM capex update');
    const fetchedReminder = await json(`http://localhost:${port}/v1/reminders/${createdReminder.id}`);
    assert.equal(fetchedReminder.id, createdReminder.id);

    const afterResearch = await json(`http://localhost:${port}/v1/research-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggerType: 'user_request',
        targetType: 'theme',
        targetId: gridTheme.id,
        relatedEventId: createdEvent.id,
        question: 'Why does the TSM capex update matter to grid modernization?'
      })
    });
    assert.ok(afterResearch.researchJobs.some((job) => job.question.includes('TSM capex update')));
    assert.ok(afterResearch.researchReports.some((report) => report.relatedEventId === createdEvent.id));
    assert.ok(afterResearch.eventEnrichments.some((item) => item.eventId === createdEvent.id));

    const afterNote = await json(`http://localhost:${port}/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'theme',
        targetId: gridTheme.id,
        body: 'Need to track utility capex confirmation.'
      })
    });
    assert.ok(afterNote.notes.some((note) => note.body.includes('utility capex')));

    const ingestedSignal = await json(`http://localhost:${port}/v1/signals/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dedupeKey: 'nvda_export_rule_drop',
        title: 'NVDA drops after export-rule headline',
        symbol: 'NVDA',
        eventType: 'market_change',
        factualSummary: 'NVDA fell sharply in premarket trading after an export-rule headline.',
        changePercent: -7.4,
        sourceLabel: 'Live market feed',
        sourceTier: 'tier_1',
        importance: 'high',
        truthStatus: 'developing',
        whyItMatters: 'Could change near-term sentiment around the core holding and AI infrastructure thesis.'
      })
    });
    assert.equal(ingestedSignal.ok, true);
    assert.equal(ingestedSignal.mode, 'created');
    assert.equal(ingestedSignal.priority, 'critical');
    assert.ok(ingestedSignal.inboxItem.score >= 70);
    assert.ok(ingestedSignal.bootstrap.deliveryQueue.some((item) => item.targetId === ingestedSignal.inboxItem.id));
    const fetchedInboxItem = await json(`http://localhost:${port}/v1/inbox-items/${ingestedSignal.inboxItem.id}`);
    assert.equal(fetchedInboxItem.id, ingestedSignal.inboxItem.id);

    const streamText = await waitForStreamMatch(streamReader, /event: inbox_update[\s\S]*signal_ingested/);
    assert.match(streamText, /NVDA/);

    const mergedSignal = await json(`http://localhost:${port}/v1/market-signals/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dedupeKey: 'nvda_export_rule_drop',
        title: 'NVDA drops after export-rule headline',
        symbol: 'NVDA',
        eventType: 'market_change',
        factualSummary: 'NVDA extended the premarket drop as the headline circulated further.',
        changePercent: -8.1,
        sourceLabel: 'Live market feed',
        sourceTier: 'tier_1',
        importance: 'high',
        truthStatus: 'developing'
      })
    });
    assert.equal(mergedSignal.mode, 'merged');
    assert.equal(mergedSignal.event.id, ingestedSignal.event.id);

    const batchSignals = await json(`http://localhost:${port}/v1/signals/ingest/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            dedupeKey: 'btc_macro_rate_cut',
            title: 'BTC jumps on rate-cut odds',
            symbol: 'BTC',
            eventType: 'market_change',
            factualSummary: 'Bitcoin rallied as traders priced in higher odds of rate cuts.',
            changePercent: 4.4,
            sourceLabel: 'Live price feed',
            sourceTier: 'tier_1',
            importance: 'high'
          },
          {
            dedupeKey: 'xlu_grid_spend_note',
            title: 'Grid spend note lifts utility basket',
            symbol: 'XLU',
            eventType: 'news',
            factualSummary: 'A sell-side note highlighted accelerating grid spend.',
            sourceLabel: 'Sector note monitor',
            sourceTier: 'tier_2',
            importance: 'normal',
            whyItMatters: 'Could strengthen the AI power infrastructure read-through.'
          }
        ]
      })
    });
    assert.equal(batchSignals.ok, true);
    assert.equal(batchSignals.count, 2);
    assert.ok(batchSignals.created >= 1);
    assert.equal(batchSignals.created + batchSignals.merged, 2);

    const inbox = await json(`http://localhost:${port}/v1/inbox`);
    const nvdaItem = inbox.find((item) => item.id === ingestedSignal.inboxItem.id);
    assert.ok(nvdaItem, 'merged inbox item missing');
    assert.equal(nvdaItem.event.realtimeMeta.updateCount, 2);
    assert.equal(nvdaItem.priority, 'critical');

    const unreadInboxFeed = await json(`http://localhost:${port}/v1/inbox-feed?filter=unread&q=nvda&limit=5`);
    assert.ok(unreadInboxFeed.items.some((item) => item.id === ingestedSignal.inboxItem.id));
    assert.ok(unreadInboxFeed.pageInfo.limit === 5);
    assert.ok(typeof unreadInboxFeed.facets.unread === 'number');

    const queuedDelivery = ingestedSignal.bootstrap.deliveryQueue.find((item) => item.targetId === ingestedSignal.inboxItem.id);
    assert.ok(queuedDelivery, 'queued delivery missing');

    const delivered = await json(`http://localhost:${port}/v1/delivery-queue/${queuedDelivery.id}/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'in_app' })
    });
    assert.equal(delivered.ok, true);
    assert.equal(delivered.delivery.status, 'delivered');

    const sourceHealth = await json(`http://localhost:${port}/v1/source-health`);
    assert.ok(sourceHealth.some((item) => item.id === 'adapter_live_prices'));

    const dailyReport = await json(`http://localhost:${port}/v1/daily-report`);
    assert.ok(Array.isArray(dailyReport.trendingStocks));
    assert.ok(Array.isArray(dailyReport.newsBasket));

    const beliefsBefore = await json(`http://localhost:${port}/v1/inbox-beliefs`);
    assert.ok(Array.isArray(beliefsBefore));

    const createdBelief = await json(`http://localhost:${port}/v1/inbox-beliefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Crypto liquidity reflex',
        summary: 'Crypto moves can accelerate when macro liquidity expectations loosen.',
        symbols: 'BTC',
        assets: [{ symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' }],
        stance: 'bullish',
        conviction: 'medium',
        timeHorizon: '1-3 months',
        actionBias: 'buy_strength_selectively',
        disconfirmSignals: 'ETF outflows and deteriorating macro liquidity.'
      })
    });
    assert.equal(createdBelief.ok, true);
    assert.equal(createdBelief.beliefProfile.stance, 'bullish');
    assert.ok(createdBelief.bootstrap.beliefProfiles.some((item) => item.id === createdBelief.beliefProfile.id));

    const invalidSignal = await expectStatus(`http://localhost:${port}/v1/signals/ingest`, 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', eventType: 'market_change' })
    });
    assert.equal(invalidSignal.error, 'Invalid signal payload');

    const invalidChatAnalysis = await expectStatus(`http://localhost:${port}/v1/chat/analysis`, 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ benchmark: 'nasdaq-100' })
    });
    assert.equal(invalidChatAnalysis.error, 'Invalid chat analysis payload');

    const invalidBelief = await expectStatus(`http://localhost:${port}/v1/inbox-beliefs`, 400, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: 'missing title' })
    });
    assert.equal(invalidBelief.error, 'Invalid inbox belief payload');

    streamController.abort();

    console.log('Open Advisor API integration test passed');
  } finally {
    child.kill('SIGINT');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
