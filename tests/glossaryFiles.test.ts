import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureGeneralGlossary,
  glossaryMetaName,
  glossarySelectionLabel,
  loadGlossaryFiles,
  readSelectedGlossaries,
  selectedGlossaryFiles,
} from '../src/utils/fileUtils.js';
import { DIR, GENERAL_GLOSSARY, GENERAL_GLOSSARY_HEADER } from '../src/constants.js';

function tempBase(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-'));
  fs.mkdirSync(path.join(base, DIR.GLOSSARIES));
  return base;
}

test('the general glossary is created once with its header and never overwritten', () => {
  const base = tempBase();
  const file = path.join(base, DIR.GLOSSARIES, GENERAL_GLOSSARY);
  ensureGeneralGlossary(base);
  assert.equal(fs.readFileSync(file, 'utf-8'), GENERAL_GLOSSARY_HEADER);

  fs.writeFileSync(file, 'Grafana\n');
  ensureGeneralGlossary(base);
  assert.equal(fs.readFileSync(file, 'utf-8'), 'Grafana\n');
});

test('the topic list leaves out the general glossary and anything that is not a .txt', () => {
  const base = tempBase();
  const dir = path.join(base, DIR.GLOSSARIES);
  for (const name of [GENERAL_GLOSSARY, 'devops.txt', 'music.txt', 'notes.md']) {
    fs.writeFileSync(path.join(dir, name), '');
  }
  fs.mkdirSync(path.join(dir, '.candidates'));
  assert.deepEqual(loadGlossaryFiles(base), ['devops.txt', 'music.txt']);
});

test('the general glossary goes first and the topic last, so the topic survives trimming', () => {
  assert.deepEqual(selectedGlossaryFiles('devops.txt', true), [GENERAL_GLOSSARY, 'devops.txt']);
  assert.deepEqual(selectedGlossaryFiles('devops.txt', false), ['devops.txt']);
  assert.deepEqual(selectedGlossaryFiles('', true), [GENERAL_GLOSSARY]);
  assert.deepEqual(selectedGlossaryFiles('', false), []);
});

test('general and topic are read together, and trimming eats the general one first', async () => {
  const { buildGlossaryPrompt } = await import('../src/utils/glossaryPrompt.js');
  const base = tempBase();
  const dir = path.join(base, DIR.GLOSSARIES);
  const general = Array.from({ length: 30 }, (_, i) => `general invented term ${i}`).join('\n');
  fs.writeFileSync(path.join(dir, GENERAL_GLOSSARY), `# header\n${general}\n`);
  fs.writeFileSync(path.join(dir, 'devops.txt'), 'Kubernetes, Terraform\n');

  const raw = readSelectedGlossaries(base, 'devops.txt', true)!;
  assert.ok(raw.endsWith('Kubernetes, Terraform'));
  const prompt = buildGlossaryPrompt(raw)!;
  assert.equal(prompt.trimmed, true);
  assert.ok(prompt.text.endsWith('Kubernetes, Terraform'), 'the topic survives');
  assert.ok(!prompt.text.includes('general invented term 0'), 'the general top lines go first');

  assert.equal(readSelectedGlossaries(base, 'devops.txt', false), 'Kubernetes, Terraform');
  assert.equal(readSelectedGlossaries(tempBase(), '', true), undefined);
});

test('labels and meta names describe the selection', () => {
  assert.equal(glossarySelectionLabel('devops.txt', true), 'general + devops');
  assert.equal(glossarySelectionLabel('', true), 'general');
  assert.equal(glossarySelectionLabel('', false), '(none)');
  assert.equal(glossaryMetaName('devops.txt', true), 'devops');
  assert.equal(glossaryMetaName('', true), 'general');
  assert.equal(glossaryMetaName('', false), undefined);
});
