import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Key, startCli } from './support/cli.js';
import { makeTone } from './support/audio.js';
import { apiError, srtBody } from './support/openai-stub.js';
import { harness } from './support/setup.js';
import { noteDate, seedNotes } from './support/archive.js';
import type { Sandbox } from './support/sandbox.js';

function day(daysAgo: number): string {
  const at = noteDate(daysAgo);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function seedArchive(sandbox: Sandbox) {
  const [older] = seedNotes(sandbox, [
    { daysAgo: 2, text: 'Hola, esto es lo que se dijo.', seconds: 61 },
  ]);
  fs.writeFileSync(
    `${older}.meta.json`,
    JSON.stringify({
      ...JSON.parse(sandbox.read(`${older}.meta.json`)),
      language: 'es',
      glossary: { name: 'general', applied: true, trimmed: false, estimatedTokens: 4 },
    }),
  );
  makeTone(`${older}.wav`, 1);
  fs.writeFileSync(
    `${older}.attempts.json`,
    JSON.stringify([
      {
        at: noteDate(3).toISOString(),
        engine: 'local',
        model: 'large-v3-turbo',
        language: 'es',
        text: 'Primer intento, peor.',
      },
    ]),
  );
  const importedDir = sandbox.dataFile('transcriptions', 'imported', day(1));
  makeTone(path.join(importedDir, '10-30-00__call.m4a'), 1);
  fs.writeFileSync(path.join(importedDir, '10-30-00__call.txt'), 'A call about the budget.');
  const untranscribed = sandbox.dataFile('transcriptions', 'recorded', day(0), '08-15-00.wav');
  makeTone(untranscribed, 1);
  return { older, untranscribed };
}

async function openHistory(
  sandbox: Sandbox,
  env: Record<string, string | undefined>,
  t: TestContext,
) {
  const session = startCli(sandbox, ['list'], env);
  t.after(() => session.kill());
  await session.waitFor('3 transcriptions, newest first.');
  return session;
}

test('list shows every audio in the archive, newest first, even one never transcribed', async (t) => {
  const { sandbox, env } = await harness(t);
  seedArchive(sandbox);

  const session = await openHistory(sandbox, env, t);
  const screen = await session.waitFor('1 / 3');

  const rows = screen.split(/\r?\n/).filter((line) => /^\s*(›\s)?\s*\d{4}-\d{2}-\d{2} /.test(line));
  assert.equal(rows.length, 3);
  assert.match(rows[0]!, new RegExp(`› ${day(0)} 08:15 {2}rec .*\\(no transcript\\)`));
  assert.match(rows[1]!, new RegExp(`${day(1)} 10:30 {2}imp .*call · A call about the budget\\.`));
  assert.match(
    rows[2]!,
    new RegExp(`${day(2)} 09:00 {2}rec +1m 01s {2}×2 {2}Hola, esto es lo que se dijo\\.`),
  );
  await session.press('q');
  assert.equal(await session.exited, 0);
});

test('an attempt can be picked and copied, with the notice in its own language', async (t) => {
  const { sandbox, env } = await harness(t, { config: { autoCopy: true } });
  sandbox.stubClipboard();
  seedArchive(sandbox);

  const session = await openHistory(sandbox, env, t);
  await session.press(Key.DOWN, Key.DOWN, Key.ENTER);
  const opened = await session.waitFor('Pick an attempt.');
  assert.match(
    opened,
    / 1 {2}\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}Local · large-v3-turbo +Primer intento, peor\./,
  );
  assert.match(
    opened,
    /› {2}2 {2}\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}OpenAI · whisper-1 +\(saved\) {2}Hola, esto es lo que se dijo\./,
  );

  await session.press(Key.UP);
  await session.waitFor('Attempt 1:');
  await session.press('c');
  await session.waitFor('📋 Attempt 1 copied · marked.');

  assert.equal(
    sandbox.clipboard(),
    '[TRANSCRIPCIÓN AUTOMÁTICA — voz a texto, sin revisar. Puede tener palabras cambiadas, nombres mal escritos o frases cortadas; interpretar con criterio.]\n\nPrimer intento, peor.\n\n[FIN DE LA TRANSCRIPCIÓN]',
  );
});

test('transcribing again keeps the previous text as an attempt and saves the new one in its place', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const { older } = seedArchive(sandbox);
  api.replies({ body: srtBody([{ start: 0, end: 1, text: 'Tercera vez, la buena.' }]) });

  const session = await openHistory(sandbox, env, t);
  await session.press(Key.DOWN, Key.DOWN, Key.ENTER);
  await session.waitFor('Pick an attempt.');
  await session.press('r');
  await session.waitFor('[Enter] transcribe · [e] change engine · [q] cancel');
  const mark = session.mark();
  await session.press(Key.ENTER);
  await session.waitFor('Transcription completed and saved.', { from: mark });

  assert.equal(api.field(0, 'language'), 'es', 'the language of the first run is kept');
  assert.equal(sandbox.read(`${older}.txt`), 'Tercera vez, la buena.');
  const attempts = JSON.parse(sandbox.read(`${older}.attempts.json`)) as {
    text: string;
    model: string;
  }[];
  assert.deepEqual(
    attempts.map((a) => a.text),
    ['Primer intento, peor.', 'Hola, esto es lo que se dijo.'],
  );
  assert.equal(attempts[1]!.model, 'whisper-1');
  await session.waitFor(/ 3 {2}\d{4}.*\(saved\) {2}Tercera vez, la buena\./, { from: mark });
});

test('a failed attempt changes nothing on disk and offers the engines again', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const { older } = seedArchive(sandbox);
  const before = fs
    .readdirSync(path.dirname(older))
    .map((name) => [name, sandbox.read(path.join(path.dirname(older), name))]);
  api.replies(apiError(401, 'Incorrect API key provided.'));

  const session = await openHistory(sandbox, env, t);
  await session.press(Key.DOWN, Key.DOWN, Key.ENTER);
  await session.waitFor('Pick an attempt.');
  await session.press('r');
  await session.waitFor('[Enter] transcribe');
  const mark = session.mark();
  await session.press(Key.ENTER);
  const failed = await session.waitFor('Transcription failed. Pick an engine to try again.', {
    from: mark,
  });

  assert.match(failed, /Invalid API key — run transcribe-cli -c to update it\./);
  const after = fs
    .readdirSync(path.dirname(older))
    .map((name) => [name, sandbox.read(path.join(path.dirname(older), name))]);
  assert.deepEqual(after, before);
});

test('an audio never transcribed can be transcribed from the list', async (t) => {
  const { sandbox, env } = await harness(t);
  const { untranscribed } = seedArchive(sandbox);

  const session = await openHistory(sandbox, env, t);
  await session.press(Key.ENTER);
  const opened = await session.waitFor('No transcript yet: press r to transcribe it.');
  assert.match(opened, /No attempts yet\./);
  await session.press('r');
  await session.waitFor('[Enter] transcribe');
  await session.press(Key.ENTER);
  await session.waitFor('Transcription completed and saved.');

  const stem = untranscribed.slice(0, -'.wav'.length);
  assert.equal(sandbox.read(`${stem}.txt`), 'Hello from the stub.');
  assert.equal(fs.existsSync(`${stem}.attempts.json`), false, 'there was nothing to keep');
});

test('a long archive pages twelve at a time, and an empty one says so', async (t) => {
  const { sandbox, env } = await harness(t);
  seedNotes(
    sandbox,
    Array.from({ length: 15 }, (_, i) => ({ daysAgo: i + 1, text: `Note ${i}` })),
  );

  const session = startCli(sandbox, ['list'], env);
  t.after(() => session.kill());
  await session.waitFor('1 / 15');
  await session.press(Key.PAGE_DOWN);
  const down = await session.waitFor('13 / 15');
  assert.match(down, /› \d{4}-\d{2}-\d{2} 09:00 {2}rec +1m 00s +Note 12\r?\n/);
  await session.press(Key.PAGE_UP);
  await session.waitFor('1 / 15');
  await session.press('q');
  await session.exited;

  const empty = await harness(t);
  const nothing = startCli(empty.sandbox, ['list'], empty.env);
  t.after(() => nothing.kill());
  assert.match(
    await nothing.waitFor('Nothing in the archive yet.'),
    /0 transcriptions, newest first\./,
  );
});
