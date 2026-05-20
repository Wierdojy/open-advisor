const { spawn } = require('node:child_process');

const procs = [
  { name: 'api', cmd: 'node', args: ['services/api/server.js'], color: '\x1b[36m' },
  { name: 'web', cmd: 'node', args: ['apps/web/server.js'], color: '\x1b[35m' }
];

const children = procs.map((proc) => {
  const child = spawn(proc.cmd, proc.args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const prefix = `${proc.color}[${proc.name}]\x1b[0m`;

  child.stdout.on('data', (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  child.on('exit', (code) => console.log(`${prefix} exited with code ${code}`));
  return child;
});

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 200);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
