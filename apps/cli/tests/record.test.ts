import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Key, startCli, until } from './support/cli.js';
import { apiError, srtBody } from './support/openai-stub.js';
import { harness } from './support/setup.js';
import { fakeMicrophone, processState } from './support/microphone.js';

const RAZER = {
  id: 'alsa_input.usb-Razer_Seiren_V2_Pro-00.analog-stereo',
  label: 'Razer Seiren V2 Pro',
};
const BUILT_IN = {
  id: 'alsa_input.pci-0000_00_1f.3.analog-stereo',
  label: 'Built-in Audio Analog Stereo',
};

test('by default it records at once, and Enter stops, transcribes, saves and copies', async (t) => {
  const { sandbox, api, env } = await harness(t, {
    config: { autoCopy: true, wrapClipboard: false },
  });
  sandbox.stubClipboard();
  const { tone } = fakeMicrophone(sandbox);

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  await session.waitFor(/🔴 Recording {3}0:0\d/);
  assert.ok(
    await session.shows([
      /Microphone: Default Device/,
      /Clipboard: {2}On\r?\n/,
      /\[space\] pause · \[Enter\] stop and transcribe/,
    ]),
  );
  await session.press(Key.ENTER);
  await session.waitFor('Transcription done — copied to clipboard.');
  assert.equal(await session.exited, 0);

  assert.equal(
    sandbox.callArgs('arecord'),
    ['-q', '-f', 'S16_LE', '-c', '1', '-r', '16000', '-t', 'wav', 'PULSE_SOURCE='].join('\n'),
  );
  const audio = sandbox.transcriptFile('recorded', '.wav');
  assert.deepEqual(fs.readFileSync(audio), fs.readFileSync(tone));
  assert.deepEqual(api.requests[0]!.file!.content, fs.readFileSync(tone));
  assert.equal(sandbox.meta('recorded').source, 'recorded');
  assert.equal(sandbox.clipboard(), 'Hello from the stub.');
});

test('the first connected microphone of the priority list wins, through PipeWire', async (t) => {
  const { sandbox, env } = await harness(t, {
    config: { microphonePriority: ['bluez_input.headset', BUILT_IN.id, RAZER.id] },
  });
  fakeMicrophone(sandbox, { pipewire: [RAZER, BUILT_IN] });

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  await session.waitFor(
    /🔴 Recording.*with Built-in Audio Analog Stereo \(preferred mic not connected\)/,
  );
  assert.ok(await session.shows([/Microphone: Built-in Audio Analog Stereo/]));
  await until(() => sandbox.callArgs('arecord') !== undefined, 'arecord starts');

  const args = sandbox.callArgs('arecord')!.split('\n');
  assert.deepEqual(args.slice(-3), ['-D', 'pulse', `PULSE_SOURCE=${BUILT_IN.id}`]);
  await session.press(Key.ENTER);
  await session.waitFor('Transcription completed and saved.');
});

test('the list decides the order, not the order the system lists the microphones in', async (t) => {
  const { sandbox, env } = await harness(t, {
    config: { microphonePriority: [RAZER.id, BUILT_IN.id] },
  });
  fakeMicrophone(sandbox, { pipewire: [BUILT_IN, RAZER] });

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  const screen = await session.waitFor('Microphone: Razer Seiren V2 Pro');
  assert.doesNotMatch(screen, /preferred mic not connected/);
  await until(() => sandbox.callArgs('arecord') !== undefined, 'arecord starts');
  assert.match(sandbox.callArgs('arecord')!, new RegExp(`PULSE_SOURCE=${RAZER.id}$`));
});

test('with none of the list connected it falls back to the default and says so; an empty list does not', async (t) => {
  const { sandbox, env } = await harness(t, {
    config: { microphonePriority: ['alsa_input.unplugged'] },
  });
  fakeMicrophone(sandbox, { pipewire: [BUILT_IN] });

  const unplugged = startCli(sandbox, [], env);
  t.after(() => unplugged.kill());
  await unplugged.waitFor(/Recording.*with Default Device \(preferred mic not connected\)/);
  await unplugged.press(Key.ENTER);
  await unplugged.exited;

  sandbox.writeConfig({
    autoGlossary: 'off',
    askMetaBackfill: false,
    microphonePriority: [],
    selectedMicrophone: '',
  });
  const empty = startCli(sandbox, [], env);
  t.after(() => empty.kill());
  const screen = await empty.waitFor('Microphone: Default Device');
  assert.doesNotMatch(screen, /preferred mic not connected/);
});

test('without PipeWire the ALSA devices are read from arecord, and the label comes from the device', async (t) => {
  const { sandbox, env } = await harness(t, {
    config: { microphonePriority: ['plughw:CARD=PCH,DEV=0'] },
  });
  fakeMicrophone(sandbox, {
    alsa: 'null\n    Discard all samples\ndefault\n    Default ALSA Output\nsysdefault:CARD=PCH\n    HDA Intel PCH\nplughw:CARD=PCH,DEV=0\n    HDA Intel PCH, ALC3254 Analog\n',
  });

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  await session.waitFor('Microphone: PCH  DEV 0 (plug)');
  await until(() => sandbox.callArgs('arecord') !== undefined, 'arecord starts');
  assert.deepEqual(sandbox.callArgs('arecord')!.split('\n').slice(-3), [
    '-D',
    'plughw:CARD=PCH,DEV=0',
    'PULSE_SOURCE=',
  ]);
});

function lastClock(text: string): string | undefined {
  const all = [...text.matchAll(/(Paused|Recording) {3}(\d+:\d\d)/g)];
  const last = all.at(-1);
  return last ? `${last[1]} ${last[2]}` : undefined;
}

test('space pauses the microphone and the clock, and resumes both', async (t) => {
  const { sandbox, env } = await harness(t);
  fakeMicrophone(sandbox);

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  await session.waitFor(/🔴 Recording {3}0:01/);
  await session.press(Key.SPACE);
  const paused = await session.waitFor(/⏸ {2}Paused {3}0:0\d/);
  assert.match(paused, /\[space\] resume · \[Enter\] stop and transcribe/);
  await until(() => processState(sandbox).startsWith('T'), 'the microphone process is stopped');
  const clockWhenPaused = lastClock(session.text);

  const pausedAt = Date.now();
  await until(() => Date.now() - pausedAt >= 2500, 'time passes while paused');
  assert.equal(lastClock(session.text), clockWhenPaused, 'the clock does not count paused time');

  const mark = session.mark();
  await session.press(Key.SPACE);
  await session.waitFor(/🔴 Recording/, { from: mark });
  await until(() => !processState(sandbox).startsWith('T'), 'the microphone process runs again');
});

test('a microphone that goes quiet after resuming is reported, and Enter keeps what was recorded', async (t) => {
  const { sandbox, env } = await harness(t);
  fakeMicrophone(sandbox);

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  await session.waitFor(/🔴 Recording {3}0:01/);
  await session.press(Key.SPACE);
  await session.waitFor('Paused');
  await until(() => processState(sandbox).startsWith('T'), 'paused');
  const resumedAt = Date.now();
  await session.press(Key.SPACE);
  await session.waitFor(
    '⚠️ No audio since resuming — the microphone may have dropped. [Enter] keeps what was recorded.',
    {
      deadlineMs: 10_000,
    },
  );
  assert.ok(Date.now() - resumedAt >= 2900, 'it waits for the microphone before warning');
  await session.press(Key.ENTER);
  await session.waitFor('Transcription completed and saved.');
  assert.ok(sandbox.transcripts('recorded').some((file) => file.endsWith('.txt')));
});

test('a microphone that produced nothing says so instead of sending silence', async (t) => {
  const { sandbox, api, env } = await harness(t);
  fakeMicrophone(sandbox, { audio: 'header-only' });

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  await session.waitFor('🔴 Recording');
  await session.press(Key.ENTER);
  await session.waitFor('Nothing was recorded.');

  assert.ok(
    await session.shows([
      /The microphone produced no audio\. Check it with transcribe-cli --manual\./,
    ]),
  );
  assert.equal(api.requests.length, 0);
  await session.press('q');
  assert.equal(await session.exited, 0);
});

test('a failed recording transcription can be sent again without recording again', async (t) => {
  const { sandbox, api, env } = await harness(t);
  fakeMicrophone(sandbox);
  api.replies(apiError(401, 'Incorrect API key provided.'), {
    body: srtBody([{ start: 0, end: 1, text: 'Second go.' }]),
  });

  const session = startCli(sandbox, [], env);
  t.after(() => session.kill());
  await session.waitFor('🔴 Recording');
  await session.press(Key.ENTER);
  await session.waitFor('Transcription failed. Pick an engine to try again.');
  assert.ok(
    await session.shows([
      /Invalid API key — run transcribe-cli -c to update it\./,
      /Audio saved at .*transcriptions\/recorded\//,
    ]),
  );
  const mark = session.mark();
  await session.press(Key.ENTER);
  await session.waitFor('Transcription completed and saved.', { from: mark });

  assert.equal(api.requests.length, 2);
  assert.equal(sandbox.read(sandbox.transcriptFile('recorded', '.txt')), 'Second go.');
  assert.equal(sandbox.transcripts('recorded').filter((file) => file.endsWith('.wav')).length, 1);
});

test('without arecord the recording stops with what to install', async (t) => {
  const { sandbox, api, env } = await harness(t);

  const session = startCli(sandbox, ['--engine', 'openai'], env);
  t.after(() => session.kill());
  await session.waitFor('🔴 Recording');
  await session.press(Key.ENTER);
  await session.waitFor('Nothing was recorded.');

  assert.ok(
    await session.shows([
      /arecord is not installed\. Run transcribe-cli doctor to see what is missing\./,
    ]),
  );
  assert.equal(api.requests.length, 0);
});
