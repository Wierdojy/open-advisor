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
  const child = spawn('node', ['services/api/server.js'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port) } });
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await wait(500);
    await json(`http://localhost:${port}/v1/reset`, { method: 'POST' });

    const before = await json(`http://localhost:${port}/v1/bootstrap`);
    assert.equal(before.holdings.length, 2);

    const afterHolding = await json(`http://localhost:${port}/v1/holdings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'TSM', name: 'Taiwan Semiconductor', quantity: 12 })
    });
    assert.equal(afterHolding.holdings.length, 3);

    const afterThesis = await json(`http://localhost:${port}/v1/theses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Grid modernization', summary: 'Utilities and grid upgrades', assets: [{ symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund' }] })
    });
    assert.ok(afterThesis.theses.some((t) => t.title === 'Grid modernization'));

    const afterCatalyst = await json(`http://localhost:${port}/v1/catalysts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'TSM capex update', symbol: 'TSM', type: 'news', scheduledFor: new Date().toISOString(), whyItMatters: 'Potential read-through for semiconductor supply chain', createAlert: true })
    });
    assert.ok(afterCatalyst.catalysts.some((c) => c.title === 'TSM capex update'));
    assert.ok(afterCatalyst.alerts.some((a) => a.title.includes('TSM capex update')));

    const thesis = afterCatalyst.theses.find((t) => t.title === 'Grid modernization') || afterCatalyst.theses[0];
    const afterNote = await json(`http://localhost:${port}/v1/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'thesis', targetId: thesis.id, body: 'Need to track utility capex confirmation.' })
    });
    assert.ok(afterNote.notes.some((n) => n.body.includes('utility capex')));

    console.log('Open Advisor API integration test passed');
  } finally {
    child.kill('SIGINT');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
