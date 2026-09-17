import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGlossaryPrompt,
  estimateTokens,
  glossaryLines,
  PROMPT_TOKEN_BUDGET,
} from '../src/utils/glossaryPrompt.js';

test('comments and blank lines never reach the prompt', () => {
  assert.deepEqual(glossaryLines('# header\n\nKubernetes, Terraform\n  # note\nGrafana  \n'), [
    'Kubernetes, Terraform',
    'Grafana',
  ]);
});

test('a glossary that fits is sent untouched', () => {
  const prompt = buildGlossaryPrompt('Kubernetes, Terraform\nGrafana');
  assert.equal(prompt?.text, 'Kubernetes, Terraform\nGrafana');
  assert.equal(prompt?.trimmed, false);
  assert.equal(prompt?.droppedLines, 0);
});

test('an oversized glossary loses its top lines first, as whisper would', () => {
  const lines = Array.from({ length: 25 }, (_, i) => `term number ${i} with some context words`);
  const prompt = buildGlossaryPrompt(lines.join('\n'));
  assert.ok(prompt);
  assert.equal(prompt.trimmed, true);
  assert.ok(prompt.droppedLines > 0);
  assert.ok(prompt.estimatedTokens <= PROMPT_TOKEN_BUDGET);
  assert.ok(prompt.text.endsWith(lines.at(-1)!), 'the bottom line is always kept');
  assert.ok(!prompt.text.includes(lines[0]));
});

test('a single huge line is cut by words from the start and never comes back empty', () => {
  const words = Array.from({ length: 400 }, (_, i) => `word${i}`);
  const prompt = buildGlossaryPrompt(words.join(' '));
  assert.ok(prompt);
  assert.equal(prompt.trimmed, true);
  assert.ok(prompt.text.length > 0);
  assert.ok(prompt.estimatedTokens <= PROMPT_TOKEN_BUDGET);
  assert.ok(prompt.text.endsWith('word399'));
});

test('no glossary yields no prompt', () => {
  assert.equal(buildGlossaryPrompt(undefined), undefined);
  assert.equal(buildGlossaryPrompt(''), undefined);
  assert.equal(buildGlossaryPrompt('# only comments\n\n'), undefined);
});

test('the token estimate is conservative: three characters per token', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 2);
});
