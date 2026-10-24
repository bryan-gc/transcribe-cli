import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { installGlobally, Key, startCli, until } from './support/cli.js';
import { harness } from './support/setup.js';
import { fakeMicrophone } from './support/microphone.js';

const CURRENT = (
  JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

async function fakeRegistry(latest: string) {
  const requested: string[] = [];
  const server = http.createServer((request, response) => {
    requested.push(request.url ?? '');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ name: '@bryan-gc/transcribe-cli', version: latest }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/`, requested, close: () => server.close() };
}

test('a global install checks npm for a newer version and prints the command that updates it', async (t) => {
  const { sandbox, env } = await harness(t);
  fakeMicrophone(sandbox);
  const registry = await fakeRegistry('99.0.0');
  t.after(registry.close);
  const appEnv = { ...env, npm_config_registry: registry.url };
  const npmGlobal = installGlobally(sandbox, 'prefix/lib');

  const first = startCli(sandbox, [], appEnv, npmGlobal);
  t.after(() => first.kill());
  await first.waitFor(/🔴 Recording {3}0:01/);
  await until(() => registry.requested.length > 0, 'it asks the registry');
  assert.deepEqual(registry.requested, ['/@bryan-gc%2ftranscribe-cli/latest']);
  await first.press(Key.ENTER);
  await first.waitFor('Transcription completed and saved.');
  assert.equal(await first.exited, 0);
  assert.doesNotMatch(first.text, /is out/);

  const notice = `transcribe-cli 99.0.0 is out (you have ${CURRENT}). Update with:`;
  const second = startCli(sandbox, ['usage'], appEnv, npmGlobal);
  t.after(() => second.kill());
  await second.waitFor(`${notice} npm install -g @bryan-gc/transcribe-cli@latest`, { flat: true });

  const pnpmGlobal = installGlobally(sandbox, 'pnpm-home/pnpm/global/5');
  const pnpm = startCli(sandbox, ['usage'], appEnv, pnpmGlobal);
  t.after(() => pnpm.kill());
  await pnpm.waitFor(`${notice} pnpm add -g @bryan-gc/transcribe-cli@latest`, { flat: true });

  const requestsBefore = registry.requested.length;
  const fromTheRepo = startCli(sandbox, ['usage'], appEnv);
  t.after(() => fromTheRepo.kill());
  await fromTheRepo.exited;
  assert.doesNotMatch(fromTheRepo.text, /is out/);
  assert.equal(registry.requested.length, requestsBefore, 'a checkout never asks the registry');
});
