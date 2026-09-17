import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCorpus } from '../src/glossary/corpus.js';
import {
  candidatesFile,
  formatCandidates,
  glossaryKeys,
  readStore,
  suggestCandidates,
  writeStore,
} from '../src/glossary/candidates.js';
import { DIR, GENERAL_GLOSSARY, RecordingKind } from '../src/constants.js';

const NOW = new Date('2026-09-17T00:00:00Z');

function base(notes: { text: string; topic?: string }[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cand-'));
  const dir = path.join(root, DIR.DATA, RecordingKind.RECORDED, '2026-09-10');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, DIR.GLOSSARIES));
  notes.forEach((note, i) => {
    const stem = path.join(dir, `10-00-${String(i).padStart(2, '0')}`);
    fs.writeFileSync(`${stem}.txt`, note.text);
    fs.writeFileSync(
      `${stem}.meta.json`,
      JSON.stringify({
        at: `2026-09-10T10:00:${String(i).padStart(2, '0')}Z`,
        ...(note.topic ? { glossary: { name: note.topic } } : {}),
      }),
    );
  });
  return root;
}

const filler = 'entonces vamos a revisar esto pero luego seguimos';
const notes = Array.from({ length: 20 }, (_, i) => ({
  text: `${filler}.\n${i < 3 ? 'hablamos con Zorblax y Quixel otra vez' : ''}`,
  topic: i < 3 ? 'demo' : undefined,
}));

test('the corpus reads every transcript with its topic and date, skipping the meta files', () => {
  const docs = readCorpus(base(notes));
  assert.equal(docs.length, 20);
  assert.equal(docs[0]!.topic, 'demo');
  assert.equal(docs[0]!.at, '2026-09-10T10:00:00Z');
  assert.equal(docs[5]!.topic, undefined);
});

test('suggesting stores the candidates and leaves out terms already in the glossaries', () => {
  const root = base(notes);
  fs.writeFileSync(path.join(root, DIR.GLOSSARIES, GENERAL_GLOSSARY), '# c\nQuixel, Grafana\n');
  const store = suggestCandidates(root, undefined, NOW);
  const terms = store.pending.map((c) => c.term);
  assert.ok(terms.includes('Zorblax'));
  assert.ok(!terms.includes('Quixel'), 'already in the general glossary');
  assert.deepEqual(readStore(root, 'general').pending, store.pending);
  assert.match(formatCandidates('general', store), /Zorblax\s+3× in +3 notes/);
});

test('rejected terms are never suggested again', () => {
  const root = base(notes);
  writeStore(root, 'general', { updatedAt: '', pending: [], added: [], rejected: ['zorblax'] });
  const terms = suggestCandidates(root, undefined, NOW).pending.map((c) => c.term);
  assert.ok(!terms.includes('Zorblax'));
});

test('a missing or broken store reads as empty', () => {
  const root = base([]);
  assert.deepEqual(readStore(root, 'general').pending, []);
  fs.mkdirSync(path.dirname(candidatesFile(root, 'x')), { recursive: true });
  fs.writeFileSync(candidatesFile(root, 'x'), '{broken');
  assert.deepEqual(readStore(root, 'x').rejected, []);
});

test('glossary keys cover comma lists and both sides of a replacement', () => {
  assert.deepEqual([...glossaryKeys('# c\nCloud Run, BigQuery\ncloud ran => Cloud Run\n')].sort(), [
    'bigquery',
    'cloud ran',
    'cloud run',
  ]);
});
