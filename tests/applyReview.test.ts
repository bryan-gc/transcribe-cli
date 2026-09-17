import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendTerms, applyReview, linesFor, ReviewAction } from '../src/glossary/applyReview.js';
import { AUTO_MARKER } from '../src/glossary/autoGeneral.js';
import { readStore, writeStore } from '../src/glossary/candidates.js';
import { runGlossaryCommand } from '../src/glossary/glossaryCommand.js';
import { DIR, GENERAL_GLOSSARY, RecordingKind } from '../src/constants.js';

const NOW = new Date('2026-09-18T02:00:00Z');

function base() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'));
  const glossaries = path.join(root, DIR.GLOSSARIES);
  fs.mkdirSync(glossaries);
  fs.writeFileSync(
    path.join(glossaries, GENERAL_GLOSSARY),
    `# mine\nGrafana\n\n${AUTO_MARKER}\nQuixel\n`,
  );
  fs.writeFileSync(path.join(glossaries, 'devops.txt'), 'Kubernetes\n');
  const candidate = (term: string) => ({
    term,
    key: term.toLowerCase(),
    score: 3,
    count: 5,
    docs: 3,
    lastSeen: NOW.toISOString(),
    reasons: [],
    example: term,
  });
  writeStore(root, 'devops', {
    updatedAt: '',
    pending: ['Zorblax', 'dinamo db', 'Snap', 'Later'].map(candidate),
    added: [],
    rejected: [],
  });
  return { root, glossaries };
}

test('added terms go to the end of the topic, general ones above the automatic block', () => {
  const { root, glossaries } = base();
  const summary = applyReview(
    root,
    'devops',
    [
      { term: 'Zorblax', action: ReviewAction.ADD },
      { term: 'dinamo db', action: ReviewAction.ADD, corrected: 'DynamoDB' },
      { term: 'Snap', action: ReviewAction.GENERAL },
      { term: 'Later', action: ReviewAction.SKIP },
    ],
    NOW,
  );

  assert.deepEqual(summary, { addedToTopic: 2, addedToGeneral: 1, rejected: 0 });
  assert.equal(
    fs.readFileSync(path.join(glossaries, 'devops.txt'), 'utf-8'),
    'Kubernetes\n\n# added by review 2026-09-18\nZorblax\nDynamoDB\ndinamo db => DynamoDB\n',
  );
  assert.equal(
    fs.readFileSync(path.join(glossaries, GENERAL_GLOSSARY), 'utf-8'),
    `# mine\nGrafana\n\n# added by review 2026-09-18\nSnap\n\n${AUTO_MARKER}\nQuixel\n`,
  );
  assert.deepEqual(
    readStore(root, 'devops').pending.map((c) => c.term),
    ['Later'],
    'skipped terms stay pending',
  );
});

test('rejected terms leave the pending list and are remembered', () => {
  const { root } = base();
  const summary = applyReview(root, 'devops', [{ term: 'Snap', action: ReviewAction.REJECT }], NOW);
  assert.equal(summary.rejected, 1);
  const store = readStore(root, 'devops');
  assert.deepEqual(store.rejected, ['Snap']);
  assert.ok(!store.pending.some((c) => c.term === 'Snap'));
});

test('a corrected spelling adds the term and the replacement for the old one', () => {
  assert.deepEqual(linesFor({ term: 'x', action: ReviewAction.ADD }), ['x']);
  assert.deepEqual(linesFor({ term: 'x', action: ReviewAction.ADD, corrected: ' x ' }), ['x']);
  assert.deepEqual(
    linesFor({ term: 'big query', action: ReviewAction.ADD, corrected: 'BigQuery' }),
    ['BigQuery', 'big query => BigQuery'],
  );
  assert.equal(appendTerms('', ['A'], NOW), '# added by review 2026-09-18\nA\n');
});

test('review without a terminal prints the suggestions instead of hanging', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-cmd-'));
  const dir = path.join(root, DIR.DATA, RecordingKind.RECORDED, '2026-09-10');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 20; i++) {
    fs.writeFileSync(path.join(dir, `n${i}.txt`), i < 3 ? 'con Zorblax' : 'entonces vamos a ver');
  }
  const out: string[] = [];
  const write = (text: string) => void out.push(text);
  await runGlossaryCommand(root, ['review'], true, { write, edit: async () => 0 });
  assert.match(out.join(''), /Zorblax[\s\S]*needs an interactive terminal/);

  let offered: string[] = [];
  await runGlossaryCommand(root, ['review'], true, {
    write,
    edit: async () => 0,
    review: async (_name, candidates) => {
      offered = candidates.map((c) => c.term);
      return [{ term: 'Zorblax', action: ReviewAction.ADD }];
    },
  });
  assert.ok(offered.includes('Zorblax'));
  assert.match(out.at(-1)!, /Saved: 0 to the topic, 1 to general, 0 rejected/);
  assert.match(
    fs.readFileSync(path.join(root, DIR.GLOSSARIES, GENERAL_GLOSSARY), 'utf-8'),
    /Zorblax/,
  );
});
