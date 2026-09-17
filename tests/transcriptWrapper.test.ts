import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAudioLength,
  WRAP_GLOSSARY_MAX_CHARS,
  wrapTranscript,
} from '../src/utils/transcriptWrapper.js';
import { LanguageCode } from '../src/constants.js';

const plain = { diarized: false };

test('spanish audio gets the notice and the closing mark in spanish', () => {
  const out = wrapTranscript('hola que tal', { ...plain, language: LanguageCode.SPANISH });
  assert.match(out, /^\[TRANSCRIPCIÓN AUTOMÁTICA/);
  assert.match(out, /\[FIN DE LA TRANSCRIPCIÓN\]$/);
  assert.ok(out.includes('\n\nhola que tal\n\n'), 'the text sits intact between the marks');
});

test('any other language gets the english notice', () => {
  for (const language of [LanguageCode.ENGLISH, LanguageCode.PORTUGUESE]) {
    const out = wrapTranscript('hello', { ...plain, language });
    assert.match(out, /^\[AUTOMATIC TRANSCRIPTION/);
    assert.match(out, /\[END OF TRANSCRIPTION\]$/);
  }
});

test('the glossary line appears only when a glossary was used, one entry per line', () => {
  const without = wrapTranscript('x', { ...plain, language: LanguageCode.ENGLISH });
  assert.ok(!without.includes('Glossary'));

  const withIt = wrapTranscript('x', {
    ...plain,
    language: LanguageCode.ENGLISH,
    glossaryUsed: 'Kubernetes, Terraform\nGrafana',
  });
  assert.match(
    withIt,
    /\[Glossary used as a spelling reference: Kubernetes, Terraform; Grafana\]$/,
  );
});

test('a long glossary is cut in the notice', () => {
  const out = wrapTranscript('x', {
    ...plain,
    language: LanguageCode.ENGLISH,
    glossaryUsed: 'term '.repeat(200),
  });
  const line = out.split('\n').at(-1)!;
  const terms = line.slice(line.indexOf(': ') + 2, -1);
  assert.equal(terms.length, WRAP_GLOSSARY_MAX_CHARS);
  assert.ok(terms.endsWith('…'));
});

test('diarized transcripts warn that the speaker labels may be wrong', () => {
  const out = wrapTranscript('A: hola', { language: LanguageCode.SPANISH, diarized: true });
  assert.ok(out.includes('[Hablantes etiquetados automáticamente'));
});

test('the audio length is only mentioned for audio over ten minutes', () => {
  const short = wrapTranscript('x', {
    ...plain,
    language: LanguageCode.SPANISH,
    audioSeconds: 300,
  });
  assert.ok(!short.includes('Duración'));
  const long = wrapTranscript('x', {
    ...plain,
    language: LanguageCode.SPANISH,
    audioSeconds: 3720,
  });
  assert.ok(long.includes('[Duración del audio: 1 h 02 min]'));
});

test('audio length reads in hours and minutes', () => {
  assert.equal(formatAudioLength(3720), '1 h 02 min');
  assert.equal(formatAudioLength(900), '15 min');
});
