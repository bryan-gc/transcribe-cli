import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Key, runCli, startCli, until } from './support/cli.js';
import { audioSeconds, makeTone } from './support/audio.js';
import { diarizedBody } from './support/openai-stub.js';
import { harness } from './support/setup.js';
import type { Sandbox } from './support/sandbox.js';

const LONG_LINE =
  'This line is far too long to be shown whole in the list of voices, so it gets cut.';

const MEETING = diarizedBody([
  { speaker: 'A', start: 0, end: 12, text: 'Good morning, let us go through the numbers.' },
  { speaker: 'B', start: 12, end: 13.5, text: 'Sure.' },
  { speaker: 'A', start: 13.5, end: 26, text: LONG_LINE },
  { speaker: 'B', start: 26, end: 28, text: 'Agreed, ship it.' },
]);

async function diarizedTranscript(t: TestContext, config: Record<string, unknown> = {}) {
  const setup = await harness(t, { config });
  setup.api.replies({ body: MEETING });
  const audio = makeTone(setup.sandbox.file('meeting.wav'), 28);
  const result = await runCli(setup.sandbox, ['-f', audio, '-s'], { env: setup.env });
  assert.equal(result.code, 0, result.screen);
  const text = setup.sandbox.transcriptFile('imported', '.txt');
  const stem = text.slice(0, -'.txt'.length);
  return { ...setup, audio, text, stem };
}

function files(sandbox: Sandbox, stem: string) {
  return {
    text: sandbox.read(`${stem}.txt`),
    srt: sandbox.read(`${stem}.srt`),
    speakers: (
      JSON.parse(sandbox.read(`${stem}.json`)) as { segments: { speaker: string }[] }
    ).segments.map((segment) => segment.speaker),
    names: fs.existsSync(`${stem}.speakers.json`)
      ? JSON.parse(sandbox.read(`${stem}.speakers.json`))
      : undefined,
  };
}

test('naming the voices on the command line rewrites text, subtitles and speaker data, and remembers them', async (t) => {
  const { sandbox, text, stem } = await diarizedTranscript(t);

  const result = await runCli(sandbox, ['speakers', text, 'A=Ana', 'B=Luis']);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    'Renamed. Speakers now:\n' +
      '  Ana            2 turns · 25s  "This line is far too long to be shown whole in the list of …"\n' +
      '  Luis           2 turns · 4s  "Agreed, ship it."\n',
  );
  const after = files(sandbox, stem);
  assert.equal(
    after.text,
    `[Ana] Good morning, let us go through the numbers.\n[Luis] Sure.\n[Ana] ${LONG_LINE}\n[Luis] Agreed, ship it.`,
  );
  assert.match(after.srt, /^1\n00:00:00,000 --> 00:00:12,000\n\[Ana\] Good morning/);
  assert.deepEqual(after.speakers, ['Ana', 'Luis', 'Ana', 'Luis']);
  assert.deepEqual(after.names, { A: { name: 'Ana' }, B: { name: 'Luis' } });
});

test('without names or a terminal it lists the voices by talk time and says how to rename them', async (t) => {
  const { sandbox, text } = await diarizedTranscript(t);

  const result = await runCli(sandbox, ['speakers', text]);

  assert.equal(
    result.stdout,
    '  Speaker A      2 turns · 25s  "This line is far too long to be shown whole in the list of …"\n' +
      '  Speaker B      2 turns · 4s  "Agreed, ship it."\n' +
      `Rename with: transcribe-cli speakers ${text} A=Name B=Name\n`,
  );
});

test('any file of the transcript, or its stem, names it', async (t) => {
  const { sandbox, stem } = await diarizedTranscript(t);
  const archivedAudio = sandbox.transcriptFile('imported', '.wav');

  for (const target of [`${stem}.srt`, `${stem}.json`, `${stem}.meta.json`, archivedAudio, stem]) {
    const result = await runCli(sandbox, ['speakers', target]);
    assert.equal(result.code, 0, `${target}: ${result.stderr}`);
    assert.match(result.stdout, /Speaker A/);
  }
  await runCli(sandbox, ['speakers', stem, 'A=Ana']);
  const result = await runCli(sandbox, ['speakers', `${stem}.speakers.json`]);
  assert.match(result.stdout, /^ {2}Ana /);
});

test('names map only the labels they mention, and a second rename works on the first names', async (t) => {
  const { sandbox, text, stem } = await diarizedTranscript(t);

  await runCli(sandbox, ['speakers', text, 'B=Luis']);
  assert.match(files(sandbox, stem).text, /^\[Speaker A\] Good morning.*\n\[Luis\] Sure\./);

  await runCli(sandbox, ['speakers', text, 'Luis=Luis Pérez', 'A=Ana']);
  const after = files(sandbox, stem);
  assert.deepEqual(after.speakers, ['Ana', 'Luis Pérez', 'Ana', 'Luis Pérez']);
  assert.deepEqual(after.names, {
    B: { name: 'Luis' },
    Luis: { name: 'Luis Pérez' },
    A: { name: 'Ana' },
  });
});

test('giving two labels the same name merges them into one voice, which needs no labels', async (t) => {
  const { sandbox, text, stem } = await diarizedTranscript(t);

  await runCli(sandbox, ['speakers', text, 'A=Ana', 'B=Ana']);

  assert.equal(
    files(sandbox, stem).text,
    `Good morning, let us go through the numbers. Sure. ${LONG_LINE} Agreed, ship it.`,
  );
});

test('a rename that is not LABEL=Name, a missing file or a plain transcript explain themselves', async (t) => {
  const { sandbox, api, env, text } = await diarizedTranscript(t);

  const bad = await runCli(sandbox, ['speakers', text, 'Ana']);
  assert.equal(bad.code, 1);
  assert.equal(bad.stderr, '"Ana" is not a rename. Use LABEL=Name, for example A=Ana.\n');

  const usage = await runCli(sandbox, ['speakers']);
  assert.equal(usage.stderr, 'Usage: transcribe-cli speakers <transcript file> [A=Name B=Name…]\n');

  const missing = await runCli(sandbox, ['speakers', sandbox.file('nothing.txt')]);
  assert.equal(
    missing.stderr,
    `No speaker data at ${sandbox.file('nothing.json')}. Only transcripts made with --speakers can be renamed.\n`,
  );

  api.replies({ body: '1\n00:00:00,000 --> 00:00:01,000\nPlain.\n' });
  const plain = makeTone(sandbox.file('plain.wav'), 1);
  await runCli(sandbox, ['-f', plain], { env });
  const plainText = sandbox.transcripts('imported').find((file) => file.endsWith('__plain.txt'))!;
  const notDiarized = await runCli(sandbox, ['speakers', plainText]);
  assert.match(notDiarized.stderr, /Only transcripts made with --speakers can be renamed\./);
});

test('in a terminal each voice can be heard and named, and s saves the names', async (t) => {
  const { sandbox, stem, text } = await diarizedTranscript(t);
  sandbox.linkSystemTool('which');
  sandbox.stub('play', `printf '%s\\n' "$@" > '${sandbox.logDir}/play.args'`);

  const session = startCli(sandbox, ['speakers', text]);
  t.after(() => session.kill());
  await session.waitFor('Who is speaking? (2 voices)');
  assert.ok(
    await session.shows([
      /▸ A {2}2 turns · 0m 25s/,
      / {2}B {2}2 turns · 0m 04s {2}"Agreed, ship it\." {2}\(no clean clip\)/,
    ]),
  );

  await session.send('p');
  await until(() => sandbox.callArgs('play') !== undefined, 'the clip is played');
  const clip = sandbox.callArgs('play')!;
  assert.match(clip, /\.cache\/voices\/voice-1\.wav$/);
  const seconds = audioSeconds(clip);
  assert.ok(seconds > 3 && seconds <= 10, `clip of ${seconds}s`);

  await session.press(Key.ENTER);
  await session.waitFor('Name for A:');
  await session.type('Ana');
  await session.press(Key.ENTER);
  await session.waitFor('→ Ana');
  await session.press(Key.ENTER);
  await session.waitFor('Name for B:');
  await session.type('Luis');
  await session.press(Key.ENTER);
  await session.waitFor('→ Luis');
  await session.press('s');
  await session.waitFor('Speakers named and saved.');
  assert.equal(await session.exited, 0);

  assert.deepEqual(files(sandbox, stem).speakers, ['Ana', 'Luis', 'Ana', 'Luis']);
});

test('leaving the naming screen with q changes nothing', async (t) => {
  const { sandbox, stem, text } = await diarizedTranscript(t);
  const before = files(sandbox, stem);

  const session = startCli(sandbox, ['speakers', text]);
  t.after(() => session.kill());
  await session.waitFor('Who is speaking?');
  await session.press(Key.ENTER);
  await session.waitFor('Name for A:');
  await session.type('Ana');
  await session.press(Key.ENTER);
  await session.waitFor('→ Ana');
  await session.press('q');
  await session.waitFor('Nothing changed.');

  assert.deepEqual(files(sandbox, stem), before);
});

test('--name-speakers asks for the names right after transcribing and copies the named text', async (t) => {
  const setup = await harness(t, { config: { autoCopy: true } });
  setup.sandbox.stubClipboard();
  setup.api.replies({ body: MEETING });
  const audio = makeTone(setup.sandbox.file('meeting.wav'), 28);

  const session = startCli(setup.sandbox, ['-f', audio, '--name-speakers'], setup.env);
  t.after(() => session.kill());
  await session.waitFor('Name the voices, or press q to keep the labels.');
  assert.equal(setup.api.field(0, 'model'), 'gpt-4o-transcribe-diarize');
  await session.press(Key.ENTER);
  await session.waitFor('Name for A:');
  await session.type('Ana');
  await session.press(Key.ENTER);
  await session.waitFor('→ Ana');
  await session.press('s');
  await session.waitFor('Speakers named and saved.');
  await session.exited;

  const named = `[Ana] Good morning, let us go through the numbers.\n[Speaker B] Sure.\n[Ana] ${LONG_LINE}\n[Speaker B] Agreed, ship it.`;
  assert.equal(setup.sandbox.read(setup.sandbox.transcriptFile('imported', '.txt')), named);
  assert.match(
    setup.sandbox.clipboard()!,
    /\[Speakers labelled automatically; attribution may be wrong\.\]\n\n\[Ana\] Good morning/,
  );
});
