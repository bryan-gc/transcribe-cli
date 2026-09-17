import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReplacements, parseReplacements } from '../src/utils/replacements.js';
import { buildGlossaryPrompt } from '../src/utils/glossaryPrompt.js';

const GLOSSARY =
  '# c\nCloud Run\ncloud ran => Cloud Run\nbig query=>BigQuery\n => nothing\nbroken =>\n';

test('only arrow lines become rules, trimmed and without empty sides', () => {
  assert.deepEqual(parseReplacements(GLOSSARY), [
    { from: 'cloud ran', to: 'Cloud Run' },
    { from: 'big query', to: 'BigQuery' },
  ]);
  assert.deepEqual(parseReplacements(undefined), []);
});

test('arrow lines are never sent as part of the prompt', () => {
  assert.equal(buildGlossaryPrompt(GLOSSARY)?.text, 'Cloud Run');
});

test('replacements ignore case and only match whole words', () => {
  const rules = parseReplacements('cloud ran => Cloud Run');
  const { text, count } = applyReplacements(
    'Cloud ran ayer. cloud random no. Lo subí a cloud ran.',
    rules,
  );
  assert.equal(text, 'Cloud Run ayer. cloud random no. Lo subí a Cloud Run.');
  assert.equal(count, 2);
});

test('word boundaries understand accents', () => {
  const rules = parseReplacements('kubernetes => Kubernetes');
  assert.equal(applyReplacements('kubernetesá kubernetes', rules).text, 'kubernetesá Kubernetes');
});

test('special characters in a rule are taken literally', () => {
  const rules = parseReplacements('c++ => C++');
  assert.equal(applyReplacements('uso c++ y c', rules).text, 'uso C++ y c');
});
