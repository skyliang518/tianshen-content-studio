import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function start(kind) {
  const port = kind === 'workbench' ? 14317 : 14318;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, SITE_KIND: kind, PORT: String(port), APP_ROOT: root },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await Promise.race([
    once(child.stdout, 'data'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('server start timeout')), 5000))
  ]);
  return { child, base: `http://127.0.0.1:${port}` };
}

for (const kind of ['workbench', 'analytics']) {
  test(`${kind} is read-only and healthy`, async () => {
    const { child, base } = await start(kind);
    try {
      assert.equal((await fetch(`${base}/healthz`)).status, 200);
      assert.equal((await fetch(base)).status, 200);
      assert.equal((await fetch(`${base}/.env`)).status, 404);
      assert.equal((await fetch(`${base}/../../etc/passwd`)).status, 404);
      assert.equal((await fetch(base, { method: 'POST', body: '{}' })).status, 403);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
}
