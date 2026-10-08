import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runCli } from './support/cli.js';
import { makeTone } from './support/audio.js';
import { srtBody } from './support/openai-stub.js';
import { seedNotes, type SeededNote } from './support/archive.js';
import { corpus } from './support/corpus.js';
import { glossary, harness } from './support/setup.js';

const MARKER =
  '# ─ automatic: added from your transcriptions; delete a line to reject it for good ─';
const LEARNED = ['Ansible', 'Billing', 'Billing Service', 'Grafana', 'k8s', 'Pulumi', 'Service'];

function autoBlock(raw: string): string[] {
  const lines = raw.split('\n');
  const start = lines.indexOf(MARKER);
  return start === -1 ? [] : lines.slice(start + 1).filter(Boolean);
}

async function learningRun(t: TestContext, mode: string, notes: SeededNote[] = corpus()) {
  const setup = await harness(t, { config: { autoGlossary: mode } });
  seedNotes(setup.sandbox, notes);
  glossary(setup.sandbox, 'general', ['# Glossary: general', 'Mine']);
  setup.api.replies({ body: srtBody([{ start: 0, end: 1, text: 'Nothing special here.' }]) });
  const audio = makeTone(setup.sandbox.file('talk.wav'), 1);
  const run = (extra: string[] = []) =>
    runCli(setup.sandbox, ['-f', audio, ...extra], { env: setup.env });
  const general = () => setup.sandbox.read(setup.sandbox.dataFile('glossaries', 'general.txt'));
  return { ...setup, run, general };
}

test('after a transcription the general glossary learns the terms of the notes, below what you wrote', async (t) => {
  const { sandbox, run, general } = await learningRun(t, 'auto');

  const result = await run();

  assert.equal(result.code, 0, result.screen);
  assert.match(result.screen, /Glossary: general · \+7 auto/);
  const raw = general();
  assert.ok(
    raw.startsWith('# Glossary: general\nMine\n\n'),
    'what you wrote stays on top, untouched',
  );
  assert.deepEqual(
    autoBlock(raw).toSorted((a, b) => a.localeCompare(b)),
    LEARNED,
  );
  assert.equal(sandbox.read(sandbox.transcriptFile('imported', '.txt')), 'Nothing special here.');
});

test('the learned terms are sent with the next transcription', async (t) => {
  const { api, run } = await learningRun(t, 'auto');

  await run();
  await run();

  assert.equal(api.field(0, 'prompt'), 'Mine');
  assert.deepEqual(
    api
      .field(1, 'prompt')!
      .split(', ')
      .toSorted((a, b) => a.localeCompare(b)),
    ['Mine', ...LEARNED].toSorted((a, b) => a.localeCompare(b)),
  );
});

test('running it again with nothing new changes nothing', async (t) => {
  const { run, general } = await learningRun(t, 'auto');

  await run();
  const first = general();
  const again = await run();

  assert.equal(general(), first);
  assert.doesNotMatch(again.screen, /\+\d+ auto/);
});

test('deleting an automatic line rejects that term for good', async (t) => {
  const { sandbox, run, general } = await learningRun(t, 'auto');
  await run();
  const file = sandbox.dataFile('glossaries', 'general.txt');
  fs.writeFileSync(file, general().replace('\nPulumi\n', '\n'));

  await run();
  await run();

  assert.ok(!autoBlock(general()).includes('Pulumi'));
  const store = JSON.parse(
    sandbox.read(sandbox.dataFile('glossaries', '.candidates', 'general.json')),
  ) as {
    rejected: string[];
  };
  assert.ok(store.rejected.includes('Pulumi'));
  const suggested = await runCli(sandbox, ['glossary', 'suggest']);
  assert.doesNotMatch(suggested.stdout, /Pulumi/);
});

test('terms said in too few notes, or only long ago, are not added on their own', async (t) => {
  const { run, general } = await learningRun(t, 'auto', [
    { daysAgo: 1, text: 'Hablamos de Kafka y de Kafka otra vez.' },
    { daysAgo: 2, text: 'Kafka quedó listo con Kafka.' },
    { daysAgo: 40, text: 'Con Terraform empezamos.' },
    { daysAgo: 41, text: 'Terraform y otra vez Terraform.' },
    { daysAgo: 42, text: 'El plan de Terraform.' },
  ]);

  await run();

  assert.deepEqual(autoBlock(general()), []);
});

test('the automatic block keeps to its limits, keeping the best terms', async (t) => {
  const strong = Array.from({ length: 10 }, (_, i) => `Strong${String.fromCharCode(65 + i)}x`);
  const weak = Array.from(
    { length: 60 },
    (_, i) =>
      `Weak${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}y`,
  );
  const notes: SeededNote[] = Array.from({ length: 12 }, (_, doc) => ({
    daysAgo: 1 + doc,
    text: [
      'Nota del día.',
      ...strong.filter((_, i) => (i + doc) % 12 < 5).map((term) => `Hoy vimos ${term} otra vez.`),
      ...weak.filter((_, i) => (i + doc) % 12 < 3).map((term) => `Hoy vimos ${term} otra vez.`),
    ].join(' '),
  }));
  const { run, general } = await learningRun(t, 'auto', notes);

  await run();

  const block = autoBlock(general());
  assert.ok(block.length > 0 && block.length <= 40, `${block.length} terms`);
  const tokens = Math.ceil(['Mine', ...block].join('\n').length / 3);
  assert.ok(tokens <= 110, `${tokens} tokens`);
  for (const term of strong) assert.ok(block.includes(term), `${term} is among the best`);
});

test('in review mode the terms wait for review instead of being written', async (t) => {
  const { sandbox, run, general } = await learningRun(t, 'review');

  const result = await run();

  assert.match(result.screen, /Glossary: general · 8 suggestions/);
  assert.deepEqual(autoBlock(general()), []);
  const store = JSON.parse(
    sandbox.read(sandbox.dataFile('glossaries', '.candidates', 'general.json')),
  ) as {
    pending: unknown[];
  };
  assert.equal(store.pending.length, 8);
});

test('with a topic, its own suggestions are prepared too', async (t) => {
  const { sandbox, run } = await learningRun(t, 'review');
  glossary(sandbox, 'work', ['OpenAI']);

  const result = await run(['-g', 'work']);

  assert.match(result.screen, /Glossary: general \+ work · 6 suggestions/);
  assert.ok(fs.existsSync(sandbox.dataFile('glossaries', '.candidates', 'work.json')));
});

test('with learning off nothing is written to the glossaries', async (t) => {
  const { sandbox, run, general } = await learningRun(t, 'off');

  await run();

  assert.equal(general(), '# Glossary: general\nMine\n');
  assert.ok(!fs.existsSync(sandbox.dataFile('glossaries', '.candidates')));
});
