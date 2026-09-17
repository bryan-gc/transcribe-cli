import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AUTO_MARKER,
  fitAutoTerms,
  joinGeneral,
  splitGeneral,
  updateAutoGeneral,
} from '../src/glossary/autoGeneral.js';
import { readStore } from '../src/glossary/candidates.js';
import { DIR, GENERAL_GLOSSARY, RecordingKind } from '../src/constants.js';

const NOW = new Date('2026-09-17T00:00:00Z');
const filler = 'entonces vamos a revisar esto pero luego seguimos';

function base(extra: string[]): { root: string; general: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-'));
  const dir = path.join(root, DIR.DATA, RecordingKind.RECORDED, '2026-09-10');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, DIR.GLOSSARIES));
  for (let i = 0; i < 20; i++) {
    const stem = path.join(dir, `10-00-${String(i).padStart(2, '0')}`);
    fs.writeFileSync(`${stem}.txt`, `${filler}.\n${extra[i] ?? ''}`);
    fs.writeFileSync(`${stem}.meta.json`, JSON.stringify({ at: '2026-09-10T10:00:00Z' }));
  }
  const general = path.join(root, DIR.GLOSSARIES, GENERAL_GLOSSARY);
  fs.writeFileSync(general, '# mine\nGrafana\n');
  return { root, general };
}

const four = (term: string) => [1, 2, 3, 4].map(() => `hablamos con ${term} otra vez`);

test('the automatic block is added under the user part, which is never touched', () => {
  const { root, general } = base(four('Zorblax'));
  const result = updateAutoGeneral(root, NOW);
  assert.deepEqual(result.added, ['Zorblax']);
  assert.equal(fs.readFileSync(general, 'utf-8'), `# mine\nGrafana\n\n${AUTO_MARKER}\nZorblax\n`);
});

test('deleting an automatic line rejects that term for good', () => {
  const { root, general } = base(four('Zorblax'));
  updateAutoGeneral(root, NOW);
  fs.writeFileSync(general, `# mine\nGrafana\n\n${AUTO_MARKER}\n`);

  const result = updateAutoGeneral(root, NOW);
  assert.deepEqual(result.rejected, ['Zorblax']);
  assert.deepEqual(result.added, []);
  assert.ok(readStore(root, 'general').rejected.includes('Zorblax'));
  assert.doesNotMatch(fs.readFileSync(general, 'utf-8'), /Zorblax/);
});

test('terms said in too few notes or too long ago are not added on their own', () => {
  const { root } = base(['con Zorblax y Zorblax', 'con Zorblax']);
  assert.deepEqual(updateAutoGeneral(root, NOW).added, []);
  const later = base(four('Quixel'));
  assert.deepEqual(updateAutoGeneral(later.root, new Date('2027-03-01T00:00:00Z')).added, []);
});

test('running it twice changes nothing', () => {
  const { root, general } = base(four('Zorblax'));
  updateAutoGeneral(root, NOW);
  const once = fs.readFileSync(general, 'utf-8');
  const again = updateAutoGeneral(root, NOW);
  assert.deepEqual(again, { added: [], rejected: [], dropped: [] });
  assert.equal(fs.readFileSync(general, 'utf-8'), once);
});

test('the block never passes its term and token limits, keeping the best ones', () => {
  const user = 'Grafana';
  const many = Array.from({ length: 60 }, (_, i) => `Term${i}`);
  const byTerms = fitAutoTerms(user, many, { maxTerms: 10, maxTokens: 1000 });
  assert.equal(byTerms.length, 10);
  assert.equal(byTerms.at(-1), 'Term59', 'the end of the list is the best-ranked');
  const byTokens = fitAutoTerms(user, many, { maxTerms: 60, maxTokens: 20 });
  assert.ok(byTokens.length < 10);
});

test('split and join round-trip, with or without an automatic block', () => {
  const raw = `# mine\nGrafana\n\n${AUTO_MARKER}\nZorblax\nQuixel\n`;
  const parts = splitGeneral(raw);
  assert.deepEqual(parts, { user: '# mine\nGrafana', auto: ['Zorblax', 'Quixel'] });
  assert.equal(joinGeneral(parts.user, parts.auto), raw);
  assert.deepEqual(splitGeneral('Grafana\n'), { user: 'Grafana', auto: [] });
});
