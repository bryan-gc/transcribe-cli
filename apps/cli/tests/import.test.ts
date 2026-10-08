import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runCli } from './support/cli.js';
import { makeTone } from './support/audio.js';
import { diarizedBody, srtBody } from './support/openai-stub.js';
import { glossary, harness } from './support/setup.js';

test('an imported file goes to whisper-1 as srt, and the archive keeps audio, subtitles, text and meta', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 3);
  api.replies({
    body: '1\r\n00:00:00,000 --> 00:00:01,500\r\nGood morning.\r\n\r\n2\r\n00:00:01,500 --> 00:00:02,000\r\n2024\r\n\r\n3\r\n00:00:02,000 --> 00:00:03,000\r\nLet us start.\r\n',
  });

  const result = await runCli(sandbox, ['-f', audio], { env });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(api.requests.length, 1);
  const request = api.requests[0]!;
  assert.equal(request.path, '/v1/audio/transcriptions');
  assert.equal(api.field(0, 'model'), 'whisper-1');
  assert.equal(api.field(0, 'response_format'), 'srt');
  assert.equal(api.field(0, 'language'), 'en');
  assert.equal(api.field(0, 'prompt'), undefined, 'the general glossary only has its header');
  assert.match(request.file!.name, /__talk\.wav$/);
  assert.deepEqual(request.file!.content, fs.readFileSync(audio));

  assert.ok(fs.existsSync(audio), 'the original stays where it was');
  const archived = sandbox.transcriptFile('imported', '.wav');
  assert.deepEqual(fs.readFileSync(archived), fs.readFileSync(audio));
  assert.match(sandbox.read(sandbox.transcriptFile('imported', '.srt')), /Good morning\./);
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    'Good morning. Let us start.',
  );

  const meta = sandbox.meta('imported');
  assert.equal(meta.source, 'imported');
  assert.equal(meta.engine, 'openai');
  assert.equal(meta.model, 'whisper-1');
  assert.equal(meta.language, 'en');
  assert.equal(meta.diarized, false);
  assert.equal('aside' in meta, false);
  assert.equal('glossary' in meta, false);
  assert.equal((meta.audio as { file: string }).file, path.basename(archived));
  assert.ok(Math.abs((meta.audio as { seconds: number }).seconds - 3) < 0.1);
  assert.deepEqual(meta.cost, { usd: 0.0003, estimated: true });

  const usage = sandbox.usageLines();
  assert.equal(usage.length, 1);
  assert.equal(usage[0]!.at, meta.at);
  assert.match(result.screen, /Transcription completed and saved\./);
  assert.match(result.screen, /Clipboard: Off/);
});

test('the language comes from the flag, then TRANSCRIBE_LANGUAGE, then the config', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: { selectedLanguage: 'pt' } });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio], { env });
  await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_LANGUAGE: 'fr' } });
  await runCli(sandbox, ['-f', audio, '-l', 'es'], { env: { ...env, TRANSCRIBE_LANGUAGE: 'fr' } });

  assert.deepEqual(
    api.requests.map((request) => request.fields.language?.[0]),
    ['pt', 'fr', 'es'],
  );
});

test('an unknown language or glossary is refused before anything is sent', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const language = await runCli(sandbox, ['-f', audio, '-l', 'xx'], { env });
  assert.equal(language.code, 1);
  assert.equal(language.stderr, 'Unknown language "xx". Available: es, en, pt, fr, de.\n');

  const missing = await runCli(sandbox, ['-f', audio, '-g', 'work'], { env });
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /^No glossaries found, so "work" cannot be used\./);

  glossary(sandbox, 'health', ['Ibuprofen']);
  const unknown = await runCli(sandbox, ['-f', audio, '-g', 'work'], { env });
  assert.match(unknown.stderr, /^Unknown glossary "work"\. Available: health\./);

  const notBoolean = await runCli(sandbox, ['-f', audio], {
    env: { ...env, TRANSCRIBE_COPY: 'maybe' },
  });
  assert.match(notBoolean.stderr, /^Not a boolean: "maybe"\. Use true or false\./);

  assert.equal(api.requests.length, 0);
});

test('the general and topic glossaries reach whisper-1 as one line, without comments or rules', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  glossary(sandbox, 'general', [
    '# Glossary: general',
    'Kubernetes',
    '',
    'OpenAI, Grafana',
    'kuberneti => Kubernetes',
  ]);
  glossary(sandbox, 'work', ['# topic', 'Pulumi']);
  api.replies({
    body: srtBody([
      { start: 0, end: 1, text: 'We deploy kuberneti on KUBERNETI, not on kubernetikos.' },
    ]),
  });

  const result = await runCli(sandbox, ['-f', audio, '-g', 'work'], { env });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(api.field(0, 'prompt'), 'Kubernetes, OpenAI, Grafana, Pulumi');
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    'We deploy Kubernetes on Kubernetes, not on kubernetikos.',
  );
  assert.match(
    sandbox.read(sandbox.transcriptFile('imported', '.srt')),
    /We deploy Kubernetes on Kubernetes/,
  );
  assert.deepEqual(sandbox.meta('imported').glossary, {
    name: 'work',
    applied: true,
    trimmed: false,
    estimatedTokens: 11,
    replacements: 2,
  });
  assert.match(result.screen, /Glossary: general \+ work/);
});

test('-g none and --no-general-glossary leave the glossary out', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  glossary(sandbox, 'general', ['Kubernetes']);
  glossary(sandbox, 'work', ['Pulumi']);

  await runCli(sandbox, ['-f', audio, '-g', 'none'], { env });
  await runCli(sandbox, ['-f', audio, '--no-general-glossary'], { env });
  await runCli(sandbox, ['-f', audio, '--no-general-glossary', '-g', 'work'], { env });
  await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_GLOSSARY: 'none' } });

  assert.deepEqual(
    api.requests.map((request) => request.fields.prompt?.[0]),
    [undefined, undefined, 'Pulumi', undefined],
  );
});

test('replacements match whole words, ignore case, understand accents and take symbols literally', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  glossary(sandbox, 'general', ['año => year', 'c++ => cpp', ' => nothing', 'empty => ']);
  api.replies({
    body: srtBody([{ start: 0, end: 1, text: 'C++ y la añoranza del AÑO, en c+++ o cxx.' }]),
  });

  await runCli(sandbox, ['-f', audio], { env });

  assert.equal(api.field(0, 'prompt'), undefined, 'rule lines are never sent as the prompt');
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    'cpp y la añoranza del year, en cpp+ o cxx.',
  );
});

test('an oversized glossary loses its first lines, keeps the last, and the screen says so', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: { autoCopy: true } });
  sandbox.stubClipboard();
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  const terms = Array.from({ length: 120 }, (_, index) => `Term${String(index).padStart(3, '0')}`);
  glossary(sandbox, 'general', terms);

  const result = await runCli(sandbox, ['-f', audio], { env });

  const sent = api.field(0, 'prompt')!.split(', ');
  assert.equal(sent.at(-1), 'Term119');
  assert.ok(sent.length < terms.length && sent.length > 50, `kept ${sent.length}`);
  assert.deepEqual(sent, terms.slice(terms.length - sent.length));
  const meta = sandbox.meta('imported').glossary as { trimmed: boolean; estimatedTokens: number };
  assert.equal(meta.trimmed, true);
  assert.ok(meta.estimatedTokens <= 220);
  assert.match(
    result.screen,
    new RegExp(`general \\(trimmed: kept the last ${sent.length} of 120 lines\\)`),
  );
  const notice = sandbox.clipboard()!.split('\n').at(-1)!;
  assert.match(notice, /^\[Glossary used as a spelling reference: Term\d{3}; Term\d{3}; .*…\]$/);
  assert.equal(notice.length, '[Glossary used as a spelling reference: '.length + 300 + 1);
});

test('a single huge glossary line is cut by words from the start and never comes back empty', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  const words = Array.from({ length: 400 }, (_, index) => `word${index}`);
  glossary(sandbox, 'general', [words.join(' ')]);

  await runCli(sandbox, ['-f', audio], { env });

  const prompt = api.field(0, 'prompt')!;
  assert.ok(prompt.length > 0 && prompt.length <= 660);
  assert.ok(prompt.endsWith('word399'));
  assert.ok(!prompt.startsWith('word0 '));
});

test('a copied transcript carries the notice in the language of the audio, the saved one stays bare', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: { autoCopy: true } });
  sandbox.stubClipboard();
  const audio = makeTone(sandbox.file('talk.wav'), 1);
  glossary(sandbox, 'general', ['Kubernetes', 'OpenAI']);
  api.replies({ body: srtBody([{ start: 0, end: 1, text: 'Hola a todos.' }]) });

  const result = await runCli(sandbox, ['-f', audio, '-l', 'es'], { env });

  assert.match(result.screen, /Transcription done — copied to clipboard\./);
  assert.match(result.screen, /Clipboard: Copied · marked/);
  assert.equal(sandbox.callArgs('xclip'), '-selection clipboard');
  assert.equal(
    sandbox.clipboard(),
    '[TRANSCRIPCIÓN AUTOMÁTICA — voz a texto, sin revisar. Puede tener palabras cambiadas, nombres mal escritos o frases cortadas; interpretar con criterio.]\n\n' +
      'Hola a todos.\n\n' +
      '[FIN DE LA TRANSCRIPCIÓN]\n[Glosario usado como referencia de ortografía: Kubernetes; OpenAI]',
  );
  assert.equal(sandbox.read(sandbox.transcriptFile('imported', '.txt')), 'Hola a todos.');
});

test('any other language gets the english notice, and without a glossary no glossary line', async (t) => {
  const { sandbox, env } = await harness(t, { config: { autoCopy: true } });
  sandbox.stubClipboard();
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio, '-l', 'de'], { env });

  assert.equal(
    sandbox.clipboard(),
    '[AUTOMATIC TRANSCRIPTION — speech to text, unreviewed. It may contain wrong words, misspelled names or cut-off sentences; read with judgement.]\n\n' +
      'Hello from the stub.\n\n[END OF TRANSCRIPTION]',
  );
});

test('--no-wrap and TRANSCRIBE_WRAP=false copy the bare transcript, --no-copy copies nothing', async (t) => {
  const { sandbox, env } = await harness(t, { config: { autoCopy: true } });
  sandbox.stubClipboard();
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const bare = await runCli(sandbox, ['-f', audio, '--no-wrap'], { env });
  assert.equal(sandbox.clipboard(), 'Hello from the stub.');
  assert.match(bare.screen, /Clipboard: Copied Transcription Result/);

  fs.rmSync(sandbox.clipboardFile);
  await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_WRAP: 'false' } });
  assert.equal(sandbox.clipboard(), 'Hello from the stub.');

  fs.rmSync(sandbox.clipboardFile);
  const result = await runCli(sandbox, ['-f', audio, '--no-copy'], { env });
  assert.equal(sandbox.clipboard(), undefined);
  assert.match(result.screen, /Clipboard: Off/);
});

test('TRANSCRIBE_COPY turns copying on without touching the config', async (t) => {
  const { sandbox, env } = await harness(t);
  sandbox.stubClipboard();
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio, '--no-wrap'], { env: { ...env, TRANSCRIBE_COPY: '1' } });

  assert.equal(sandbox.clipboard(), 'Hello from the stub.');
  assert.equal(sandbox.readConfig().autoCopy, undefined);
});

test('xsel is used when xclip is missing', async (t) => {
  const { sandbox, env } = await harness(t, { config: { autoCopy: true, wrapClipboard: false } });
  sandbox.stubClipboard('xsel');
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio], { env });

  assert.equal(sandbox.callArgs('xsel'), '--clipboard --input');
  assert.equal(sandbox.clipboard(), 'Hello from the stub.');
});

test('a clipboard that fails keeps the transcription and says what went wrong', async (t) => {
  const { sandbox, env } = await harness(t, { config: { autoCopy: true } });
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const result = await runCli(sandbox, ['-f', audio], { env });

  assert.equal(result.code, 0);
  assert.match(
    result.screen,
    /Transcription saved\. ⚠️ Clipboard: Could not copy: neither xclip nor xsel is available\. Run transcribe-cli doctor\./,
  );
  assert.equal(sandbox.read(sandbox.transcriptFile('imported', '.txt')), 'Hello from the stub.');
});

test('--aside marks the meta and the usage log, a normal run carries no aside field', async (t) => {
  const { sandbox, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const result = await runCli(sandbox, ['-f', audio, '-a'], { env });
  assert.match(result.screen, /Aside: marked in the meta and usage log/);
  assert.equal(sandbox.meta('imported').aside, true);
  assert.equal(sandbox.usageLines()[0]!.aside, true);

  const other = await harness(t);
  const plain = makeTone(other.sandbox.file('talk.wav'), 1);
  await runCli(other.sandbox, ['-f', plain], { env: other.env });
  assert.equal('aside' in other.sandbox.meta('imported'), false);
  assert.equal('aside' in other.sandbox.usageLines()[0]!, false);
});

test('--speakers asks the diarize model, without the glossary, and labels each turn', async (t) => {
  const { sandbox, api, env } = await harness(t, { config: { autoCopy: true } });
  sandbox.stubClipboard();
  const audio = makeTone(sandbox.file('talk.wav'), 2);
  glossary(sandbox, 'general', ['Kubernetes', 'reporte => report']);
  api.replies({
    body: diarizedBody(
      [
        { speaker: 'A', start: 0, end: 0.4, text: 'Good morning,' },
        { speaker: 'A', start: 0.4, end: 0.9, text: 'shall we start?' },
        { speaker: 'B', start: 0.9, end: 1.2, text: '' },
        { speaker: 'B', start: 1.2, end: 1.6, text: 'Yes, the reporte is ready.' },
        { speaker: 'A', start: 1.6, end: 3725.5, text: 'Great.' },
      ],
      { input_tokens: 1000, output_tokens: 200 },
    ),
  });

  const result = await runCli(sandbox, ['-f', audio, '-s'], { env });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(api.field(0, 'model'), 'gpt-4o-transcribe-diarize');
  assert.equal(api.field(0, 'response_format'), 'diarized_json');
  assert.equal(api.field(0, 'chunking_strategy'), 'auto');
  assert.equal(api.field(0, 'prompt'), undefined, 'the diarize model takes no prompt');
  assert.equal(api.requests[0]!.fields['known_speaker_names[]'], undefined);

  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    '[Speaker A] Good morning, shall we start?\n[Speaker B] Yes, the report is ready.\n[Speaker A] Great.',
  );
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.srt')),
    '1\n00:00:00,000 --> 00:00:00,900\n[Speaker A] Good morning, shall we start?\n\n' +
      '2\n00:00:01,200 --> 00:00:01,600\n[Speaker B] Yes, the report is ready.\n\n' +
      '3\n00:00:01,600 --> 01:02:05,500\n[Speaker A] Great.\n',
  );
  const diarizedFile = sandbox
    .transcripts('imported')
    .find((file) => file.endsWith('.json') && !file.endsWith('.meta.json'))!;
  const saved = JSON.parse(sandbox.read(diarizedFile)) as {
    segments: { text: string }[];
  };
  assert.equal(saved.segments[3]!.text, 'Yes, the report is ready.');

  const meta = sandbox.meta('imported');
  assert.equal(meta.diarized, true);
  assert.deepEqual(meta.usage, { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 });
  assert.deepEqual(meta.cost, { usd: 0.0045, estimated: true });
  assert.equal((meta.glossary as { applied: boolean }).applied, false);
  assert.equal((meta.glossary as { replacements: number }).replacements, 1);
  assert.match(result.screen, /Glossary: general \(not used by this model\)/);
  assert.match(
    sandbox.clipboard()!,
    /\[Speakers labelled automatically; attribution may be wrong\.\]/,
  );
  assert.doesNotMatch(sandbox.clipboard()!, /Glossary used/);
});

test('one voice gets no labels, and short pieces of it are merged into readable subtitles', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 2);
  api.replies({
    body: diarizedBody([
      { speaker: 'A', start: 0, end: 0.3, text: 'One,' },
      { speaker: 'A', start: 0.3, end: 0.6, text: 'two,' },
      { speaker: 'A', start: 0.6, end: 2, text: 'three.' },
    ]),
  });

  await runCli(sandbox, ['-f', audio, '--speakers'], { env });

  assert.equal(sandbox.read(sandbox.transcriptFile('imported', '.txt')), 'One, two, three.');
  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.srt')),
    '1\n00:00:00,000 --> 00:00:02,000\nOne, two, three.\n',
  );
});

test('the diarized answer captured from the real API keeps one labelled line per turn and its cost', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 10);
  api.replies({
    body: JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'diarized-response.json'), 'utf8'),
    ) as object,
  });

  await runCli(sandbox, ['-f', audio, '-s'], { env });

  assert.equal(
    sandbox.read(sandbox.transcriptFile('imported', '.txt')),
    '[Speaker A] Buenos días, empezamos.\n[Speaker B] Sí.\n[Speaker A] Perfecto.\n[Speaker B] Claro.\n' +
      '[Speaker A] El reporte quedó listo ayer por la tarde sin problemas.\n[Speaker B] Entonces cerramos ese punto y pasamos al siguiente.',
  );
  const srt = sandbox.read(sandbox.transcriptFile('imported', '.srt'));
  assert.equal(
    srt.match(/ --> /g)!.length,
    6,
    'speakers alternate, so every segment is its own cue',
  );
  assert.match(srt, /^2\n00:00:00,700 --> 00:00:01,100\n\[Speaker B\] Sí\.\n/m);
  assert.deepEqual(sandbox.meta('imported').cost, { usd: 0.00347, estimated: true });
});

test('TRANSCRIBE_SPEAKERS turns diarization on from the environment', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_SPEAKERS: 'yes' } });

  assert.equal(api.field(0, 'model'), 'gpt-4o-transcribe-diarize');
});

test('the mock engine answers without the network, from its canned text or a fixture', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const audio = makeTone(sandbox.file('talk.wav'), 1);

  const canned = await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_MOCK: '1' } });
  assert.match(canned.screen, /Engine: mock · canned/);
  assert.match(canned.screen, /Mock transcription\./);

  const fixture = path.join(import.meta.dirname, 'fixtures', 'sample.srt');
  const fromFixture = await runCli(sandbox, ['-f', audio], {
    env: { ...env, TRANSCRIBE_MOCK: 'true', TRANSCRIBE_MOCK_FIXTURE: fixture },
  });
  assert.match(
    fromFixture.screen,
    /Buenos días, empezamos con el reporte\. Ya lo subí ayer por la tarde\. Perfecto, entonces cerramos\./,
  );
  assert.equal(api.requests.length, 0);

  for (const off of ['0', 'false', '']) {
    await runCli(sandbox, ['-f', audio], { env: { ...env, TRANSCRIBE_MOCK: off } });
  }
  assert.equal(api.requests.length, 3, 'an empty, zero or false switch is off');
});

test('a phone file name becomes a short path that is safe to type and never ends in a dash', async (t) => {
  const { sandbox, env } = await harness(t);
  const audio = makeTone(sandbox.file('WhatsApp Ptt 2026-09-01 at 10.20.33 (Ñandú çà)!!.wav'), 1);

  await runCli(sandbox, ['-f', audio], { env });

  const long = makeTone(sandbox.file(`${'a'.repeat(39)} b.wav`), 1);
  await runCli(sandbox, ['-f', long], { env });

  const archived = sandbox
    .transcripts('imported')
    .filter((file) => file.endsWith('.wav'))
    .map((file) => path.basename(file).slice(10));
  assert.deepEqual(
    archived.toSorted((a, b) => a.localeCompare(b)),
    [`${'a'.repeat(39)}.wav`, 'whatsapp-ptt-2026-09-01-at-10-20-33-nand.wav'],
  );
});

test('a format the API does not take is converted to wav with ffmpeg first', async (t) => {
  const { sandbox, api, env } = await harness(t);
  const wav = makeTone(sandbox.file('talk.wav'), 1);
  const aiff = sandbox.file('talk.aiff');
  fs.renameSync(wav, aiff);

  const result = await runCli(sandbox, ['-f', aiff], { env });

  assert.equal(result.code, 0, result.stdout);
  assert.match(api.requests[0]!.file!.name, /__talk\.wav$/);
  assert.equal(api.requests[0]!.file!.content.subarray(0, 4).toString(), 'RIFF');
});
