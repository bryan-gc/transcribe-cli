import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureGeneralGlossary,
  loadGlossaryFiles,
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
