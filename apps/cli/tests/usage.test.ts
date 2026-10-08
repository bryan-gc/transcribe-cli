import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from './support/cli.js';
import { Sandbox } from './support/sandbox.js';
import { seedNotes } from './support/archive.js';

function sandboxFor(t: { after: (fn: () => void) => void }) {
  const sandbox = new Sandbox();
  t.after(() => sandbox.remove());
  return sandbox;
}

function run(
  at: string,
  file: string,
  engine: string,
  model: string,
  seconds: number,
  tookMs: number,
  usd: number,
) {
  return JSON.stringify({
    at,
    source: 'recorded',
    audio: { file, seconds },
    engine,
    model,
    tookMs,
    cost: { usd, estimated: true },
  });
}

const LOG = [
  run('2026-09-01T10:00:00.000Z', '10-00-00.wav', 'openai', 'whisper-1', 120, 6000, 0.012),
  run(
    '2026-09-01T11:00:00.000Z',
    '11-00-00.wav',
    'openai',
    'gpt-4o-transcribe-diarize',
    60,
    9000,
    0.05,
  ),
  '{ broken line',
  run('2026-09-02T09:00:00.000Z', '09-00-00.wav', 'local', 'large-v3-turbo', 300, 600_000, 0),
].join('\n');

test('usage adds the runs up by day and by engine, most expensive engine first', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(sandbox.dataFile('usage.jsonl'), `${LOG}\n`);

  const result = await runCli(sandbox, ['usage']);

  assert.equal(result.code, 0);
  assert.equal(
    result.stdout,
    [
      'By day',
      'Day         Runs   Audio     Took   Cost',
      '----------  ----  ------  -------  -----',
      '2026-09-01     2  3m 00s      15s  $0.06',
      '2026-09-02     1  5m 00s  10m 00s   free',
      'Total          3  8m 00s  10m 15s  $0.06',
      '',
      'By engine',
      'Engine                              Runs   Audio     Took   Cost',
      '----------------------------------  ----  ------  -------  -----',
      'openai · gpt-4o-transcribe-diarize     1  1m 00s       9s  $0.05',
      'openai · whisper-1                     1  2m 00s       6s  $0.01',
      'local · large-v3-turbo                 1  5m 00s  10m 00s   free',
      '',
    ].join('\n'),
  );
});

test('usage --all adds one line per run, in the order they happened', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(sandbox.dataFile('usage.jsonl'), `${LOG}\n`);

  const result = await runCli(sandbox, ['usage', '--all']);

  assert.match(
    result.stdout,
    /\nEvery run\nWhen +File +Engine +Audio +Took +Cost\n[- ]+\n2026-09-01 10:00 +10-00-00\.wav +openai · whisper-1 +2m 00s +6s +\$0\.01\n2026-09-01 11:00 +11-00-00\.wav +openai · gpt-4o-transcribe-diarize +1m 00s +9s +\$0\.05\n2026-09-02 09:00 +09-00-00\.wav +local · large-v3-turbo +5m 00s +10m 00s +free\n$/,
  );
});

test('without a log yet, the transcriptions already in the archive are gathered into one', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, [
    { daysAgo: 3, text: 'a', seconds: 60, tookMs: 2000 },
    { daysAgo: 1, text: 'b', seconds: 30, tookMs: 1000, engine: 'local', model: 'large-v3-turbo' },
    { daysAgo: 2, text: 'c', meta: { engine: undefined } },
    { daysAgo: 2, text: 'd', meta: false },
  ]);

  const result = await runCli(sandbox, ['usage']);

  assert.match(result.stdout, /\nTotal +2 +1m 30s +3s +\$0\.01\n/);
  const log = sandbox.usageLines();
  assert.deepEqual(
    log.map((entry) => entry.engine),
    ['openai', 'local'],
    'oldest first, and a meta without an engine is not a run',
  );
});

test('with nothing transcribed, usage says so', async (t) => {
  const sandbox = sandboxFor(t);
  const result = await runCli(sandbox, ['usage']);
  assert.equal(result.stdout, 'No transcriptions recorded yet.\n');
});
