const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function text(url, options) {
  const res = await fetch(url, options);
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return body;
}

async function json(url, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const child = spawn('node', ['scripts/dev.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, OPEN_ADVISOR_WEB_PORT: '3200', OPEN_ADVISOR_API_PORT: '3201' }
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await wait(1200);
    const apiHealth = await json('http://localhost:3201/health/deep');
    assert.equal(apiHealth.ok, true);
    assert.equal(apiHealth.backend, 'sqlite');

    const html = await text('http://localhost:3200/');
    assert.match(html, /Open Advisor/i);

    console.log('Open Advisor runtime test passed');
  } finally {
    child.kill('SIGINT');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
