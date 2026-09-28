import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidates, normalizeTerm, type Doc } from '../src/glossary/extractTerms.js';

const NOW = new Date('2026-09-17T00:00:00Z');
const filler = 'entonces vamos a revisar esto pero luego seguimos con lo demás';

function corpus(
  extra: Record<number, string>,
  size = 30,
  topicOf?: (i: number) => string | undefined,
): Doc[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `d${i}`,
    text: `${filler}.\n${extra[i] ?? ''}`,
    topic: topicOf?.(i),
    at: '2026-09-10T10:00:00Z',
  }));
}

const terms = (docs: Doc[], options = {}) =>
  extractCandidates(docs, { now: NOW, ...options }).map((c) => c.term);

test('words said in almost every note are common and never proposed', () => {
  const docs = corpus({
    1: 'hablamos con Zorblax sobre el tema',
    2: 'otra vez con Zorblax ayer',
    3: 'y Zorblax dijo que sí',
  });
  const found = terms(docs);
  assert.ok(found.includes('Zorblax'));
  for (const common of ['entonces', 'vamos', 'revisar', 'pero']) {
    assert.ok(!found.some((t) => normalizeTerm(t).includes(common)), `${common} leaked`);
  }
});

test('a capital at the start of a sentence does not make a proper noun', () => {
  const docs = corpus({
    1: 'Presupuesto cerrado. hablamos',
    2: 'Presupuesto listo. seguimos',
    3: 'Presupuesto final. vale',
  });
  assert.ok(!terms(docs).includes('Presupuesto'));
});

test('technical shapes are proposed even in lower case', () => {
  const docs = corpus({
    1: 'usamos gpt-4o y la tabla de DynamoDB',
    2: 'otra vez gpt-4o con DynamoDB',
    3: 'gpt-4o responde y DynamoDB guarda',
  });
  const found = extractCandidates(docs, { now: NOW });
  const gpt = found.find((c) => c.term === 'gpt-4o');
  assert.ok(gpt?.reasons.includes('shape'));
  assert.ok(found.find((c) => c.term === 'DynamoDB')?.reasons.includes('shape'));
});

test('repeated pairs of rare words come out as one term', () => {
  const docs = corpus({
    1: 'lo subimos a Cloud Run ayer',
    2: 'en Cloud Run no hay logs',
    3: 'reiniciamos Cloud Run otra vez',
  });
  const pair = extractCandidates(docs, { now: NOW }).find((c) => c.term === 'Cloud Run');
  assert.ok(pair);
  assert.ok(pair.reasons.includes('bigram'));
  assert.equal(pair.docs, 3);
});

test('known terms, accepted or rejected, are not proposed again', () => {
  const docs = corpus({ 1: 'con Zorblax', 2: 'con Zorblax', 3: 'con Zorblax' });
  assert.ok(!terms(docs, { known: new Set([normalizeTerm('Zorblax')]) }).includes('Zorblax'));
});

test('a term said in a single note is not enough', () => {
  const docs = corpus({ 1: 'Zorblax Zorblax Zorblax Zorblax' });
  assert.ok(!terms(docs).includes('Zorblax'));
});

test('for a topic, terms concentrated in its notes win and outside terms are left out', () => {
  const docs = corpus(
    {
      1: 'el deploy de terraform falló',
      2: 'terraform plan otra vez',
      3: 'revisar terraform mañana',
      20: 'la guitarra Fender suena',
      21: 'la Fender nueva',
      22: 'afinar la Fender',
    },
    30,
    (i) => (i < 10 ? 'devops' : undefined),
  );
  const found = extractCandidates(docs, { now: NOW, topic: 'devops' });
  const terraform = found.find((c) => c.term === 'terraform');
  assert.ok(terraform?.reasons.includes('distinctive'));
  assert.ok(!found.some((c) => c.term === 'Fender'));
});

test('speaker labels from diarized notes are not taken as terms', () => {
  const docs = corpus({
    1: '[Speaker A] hola\n[Speaker B] qué tal',
    2: '[Speaker A] bien\n[Speaker B] vale',
    3: '[Speaker A] listo\nA: sigue',
  });
  assert.ok(!terms(docs).some((t) => /Speaker/.test(t)));
});

test('older terms rank below recent ones with the same signals', () => {
  const docs = corpus({
    1: 'con Zorblax',
    2: 'con Zorblax',
    3: 'con Zorblax',
    4: 'con Quixel',
    5: 'con Quixel',
    6: 'con Quixel',
  });
  for (const i of [4, 5, 6]) docs[i]!.at = '2026-01-01T00:00:00Z';
  const found = extractCandidates(docs, { now: NOW });
  const recent = found.find((c) => c.term === 'Zorblax')!;
  const old = found.find((c) => c.term === 'Quixel')!;
  assert.ok(recent.score > old.score);
  assert.match(recent.example, /Zorblax/);
});

test('whisper hallucinations in old transcripts never become glossary terms', () => {
  const amara = 'Subtítulos por la comunidad de Amara.org';
  const docs = corpus({
    1: amara,
    2: amara,
    3: `${amara} ${amara}`,
    4: '¡Gracias por ver el video!',
  });
  const found = terms(docs).map(normalizeTerm);
  assert.ok(!found.includes('amara.org'));
  assert.ok(!found.some((t) => t.includes('amara')));
});
