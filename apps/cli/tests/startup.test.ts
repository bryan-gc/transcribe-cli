import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runCli, startCli } from './support/cli.js';
import { makeTone } from './support/audio.js';
import { Sandbox } from './support/sandbox.js';

function sandboxFor(t: { after: (fn: () => void) => void }, config: Record<string, unknown> = {}) {
  const sandbox = new Sandbox({ config: { autoGlossary: 'off', ...config } });
  t.after(() => sandbox.remove());
  return sandbox;
}

function mockImport(sandbox: Sandbox) {
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  return runCli(sandbox, ['-f', audio], { env: { TRANSCRIBE_MOCK: '1' } });
}

const PROMPT = /\[y\] yes · \[n\] not now · \[never\] do not ask again: $/;

test('the old tmp layout moves under transcriptions/recorded, and the microphone test into the cache', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(sandbox.dataFile('tmp', '2026-05-15', '19-11-00.wav'), 'audio');
  sandbox.write(sandbox.dataFile('tmp', '2026-05-15', '19-11-00.txt'), 'transcript');
  sandbox.write(sandbox.dataFile('tmp', 'mic-test.wav'), 'test');

  const result = await mockImport(sandbox);

  assert.equal(result.code, 0, result.screen);
  const recorded = sandbox.dataFile('transcriptions', 'recorded', '2026-05-15');
  assert.equal(sandbox.read(path.join(recorded, '19-11-00.wav')), 'audio');
  assert.equal(sandbox.read(path.join(recorded, '19-11-00.txt')), 'transcript');
  assert.equal(sandbox.read(sandbox.dataFile('.cache', 'mic-test.wav')), 'test');
  assert.equal(fs.existsSync(sandbox.dataFile('tmp')), false, 'the emptied folder is removed');
  for (const dir of ['transcriptions/imported', 'glossaries', '.cache']) {
    assert.ok(fs.statSync(sandbox.dataFile(dir)).isDirectory(), dir);
  }
  assert.match(
    sandbox.read(sandbox.dataFile('glossaries', 'general.txt')),
    /^# Glossary: general\n/,
  );
});

test('once migrated, a tmp folder made later is left alone', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(sandbox.dataFile('tmp', '2026-05-15', '19-11-00.txt'), 'first');
  await mockImport(sandbox);
  sandbox.write(sandbox.dataFile('tmp', '2026-05-16', '08-00-00.txt'), 'later');

  await mockImport(sandbox);

  assert.equal(sandbox.read(sandbox.dataFile('tmp', '2026-05-16', '08-00-00.txt')), 'later');
  assert.equal(fs.existsSync(sandbox.dataFile('transcriptions', 'recorded', '2026-05-16')), false);
});

test('what is already at the destination is never overwritten', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(sandbox.dataFile('tmp', 'mic-test.wav'), 'new');
  sandbox.write(sandbox.dataFile('.cache', 'mic-test.wav'), 'old');

  await mockImport(sandbox);

  assert.equal(sandbox.read(sandbox.dataFile('.cache', 'mic-test.wav')), 'old');
  assert.equal(sandbox.read(sandbox.dataFile('tmp', 'mic-test.wav')), 'new', 'kept where it was');
});

test('a file named tmp is not mistaken for the old folder', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(sandbox.dataFile('tmp'), 'just a file');

  const result = await mockImport(sandbox);

  assert.equal(result.code, 0);
  assert.equal(sandbox.read(sandbox.dataFile('tmp')), 'just a file');
});

function seedWithoutMeta(sandbox: Sandbox) {
  makeTone(sandbox.dataFile('transcriptions', 'recorded', '2026-05-15', '19-11-00.wav'), 2);
  sandbox.write(
    sandbox.dataFile('transcriptions', 'recorded', '2026-05-15', '19-11-00.txt'),
    'old note',
  );
  sandbox.write(
    sandbox.dataFile('transcriptions', 'imported', '2026-05-16', '08-30-05__call.txt'),
    'old call',
  );
  sandbox.write(
    sandbox.dataFile('transcriptions', 'recorded', '2026-05-17', '10-00-00.txt'),
    'has meta',
  );
  sandbox.write(
    sandbox.dataFile('transcriptions', 'recorded', '2026-05-17', '10-00-00.meta.json'),
    '{"mine":true}',
  );
  sandbox.write(
    sandbox.dataFile('transcriptions', 'recorded', 'notes', '10-00-00.txt'),
    'not a day folder',
  );
  sandbox.write(
    sandbox.dataFile('transcriptions', 'recorded', '2026-05-17', 'draft.txt'),
    'no time in the name',
  );
}

test('transcripts without a meta are offered one at start, and y writes it from the folder and the name', async (t) => {
  const sandbox = sandboxFor(t);
  seedWithoutMeta(sandbox);

  const session = startCli(sandbox, ['usage']);
  t.after(() => session.kill());
  const screen = await session.waitFor(PROMPT);
  assert.match(
    screen,
    /^2 transcriptions have no \.meta\.json, so nothing says whether they were recorded or imported\./m,
  );
  session.answer('y');
  await session.waitFor('Done: 2 transcriptions now say where they came from.');
  assert.equal(await session.exited, 0);

  const recorded = JSON.parse(
    sandbox.read(
      sandbox.dataFile('transcriptions', 'recorded', '2026-05-15', '19-11-00.meta.json'),
    ),
  ) as {
    at: string;
    source: string;
    audio: { file: string; seconds: number };
    backfilled: boolean;
  };
  assert.equal(recorded.at, new Date(2026, 4, 15, 19, 11, 0).toISOString());
  assert.equal(recorded.source, 'recorded');
  assert.equal(recorded.audio.file, '19-11-00.wav');
  assert.ok(Math.abs(recorded.audio.seconds - 2) < 0.1);
  assert.equal(recorded.backfilled, true);

  const imported = JSON.parse(
    sandbox.read(
      sandbox.dataFile('transcriptions', 'imported', '2026-05-16', '08-30-05__call.meta.json'),
    ),
  ) as Record<string, unknown>;
  assert.deepEqual(imported, {
    at: new Date(2026, 4, 16, 8, 30, 5).toISOString(),
    source: 'imported',
    backfilled: true,
  });
  assert.equal(
    sandbox.read(
      sandbox.dataFile('transcriptions', 'recorded', '2026-05-17', '10-00-00.meta.json'),
    ),
    '{"mine":true}',
  );
});

test('n leaves them and asks again next time; never stops asking for good', async (t) => {
  const sandbox = sandboxFor(t);
  seedWithoutMeta(sandbox);

  const first = startCli(sandbox, ['usage']);
  t.after(() => first.kill());
  await first.waitFor(PROMPT);
  first.answer('n');
  await first.waitFor('Left as they are. You will be asked next time.');
  await first.exited;
  assert.equal(
    fs.existsSync(
      sandbox.dataFile('transcriptions', 'recorded', '2026-05-15', '19-11-00.meta.json'),
    ),
    false,
  );

  const second = startCli(sandbox, ['usage']);
  t.after(() => second.kill());
  await second.waitFor(PROMPT);
  second.answer('never');
  await second.waitFor('Not asking again. Set askMetaBackfill to true in the config to be asked.');
  await second.exited;
  assert.equal(sandbox.readConfig().askMetaBackfill, false);

  const third = startCli(sandbox, ['usage']);
  t.after(() => third.kill());
  await third.waitFor('No transcriptions recorded yet.');
  assert.doesNotMatch(third.text, /have no \.meta\.json/);
});

test('without a terminal nothing is asked', async (t) => {
  const sandbox = sandboxFor(t);
  seedWithoutMeta(sandbox);

  const result = await runCli(sandbox, ['usage']);

  assert.equal(result.stdout, 'No transcriptions recorded yet.\n');
});
