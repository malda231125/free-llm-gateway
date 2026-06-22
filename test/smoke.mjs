#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const distMain = join(projectRoot, 'dist', 'main.js');

const isolatedEnvKeys = [
  'GOOGLE_AI_API_KEY',
  'GROQ_API_KEY',
  'CEREBRAS_API_KEY',
  'MISTRAL_API_KEY',
  'NVIDIA_API_KEY',
  'OPENROUTER_API_KEY',
  'GITHUB_TOKEN',
  'DOCS_USER',
  'DOCS_PASSWORD',
  'GATEWAY_API_KEY',
];

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) resolvePort(port);
        else reject(new Error('Could not reserve a test port'));
      });
    });
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.json();
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }

    try {
      const body = await fetchJson(`${baseUrl}/health`);
      if (body?.ok === true && body?.app === 'free-llm-gateway') return body;
      lastError = new Error(`unexpected /health response: ${JSON.stringify(body)}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`server did not become healthy: ${lastError?.message || 'timeout'}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;

  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    sleep(2000).then(() => false),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'exit'), sleep(1000)]);
  }
}

async function main() {
  await access(distMain, constants.R_OK);

  const port = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), 'free-llm-gateway-smoke-'));
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    GATEWAY_DATA_DIR: dataDir,
  };

  for (const key of isolatedEnvKeys) env[key] = '';

  const child = spawn(process.execPath, [distMain], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealth(baseUrl, child);

    const providers = await fetchJson(`${baseUrl}/v1/providers`);
    if (!Array.isArray(providers) || !providers.some((p) => p.provider === 'GOOGLE')) {
      throw new Error(`unexpected /v1/providers response: ${JSON.stringify(providers)}`);
    }

    console.log(`Smoke test passed (${baseUrl})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (stdout.trim()) console.error(`\nstdout:\n${stdout.trim()}`);
    if (stderr.trim()) console.error(`\nstderr:\n${stderr.trim()}`);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
