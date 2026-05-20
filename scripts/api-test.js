const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function json(url, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
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

    const before = await json(`http://localhost:${port}/v1/bootstrap`);
    assert.equal(before.holdings.length, 2);
    assert.equal(before.themes.length, 1);

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

    console.log('Open Advisor API integration test passed');
  } finally {
    child.kill('SIGINT');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
