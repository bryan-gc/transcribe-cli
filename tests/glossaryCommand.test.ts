import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GlossaryCommandError,
  glossaryOptionLabel,
  readGlossarySummary,
  runGlossaryCommand,
  summarizeGlossary,
} from '../src/glossary/glossaryCommand.js';
import { DIR, GENERAL_GLOSSARY } from '../src/constants.js';

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-'));
  const out: string[] = [];
  const edited: string[] = [];
  const deps = {
    write: (text: string) => void out.push(text),
    edit: async (file: string) => {
      edited.push(file);
      fs.appendFileSync(file, 'Kubernetes\n');
      return 0;
    },
  };
  return { base, dir: path.join(base, DIR.GLOSSARIES), out, edited, deps };
}

test('listing creates the general glossary and shows lines and tokens for each', async () => {
  const { base, dir, out, deps } = setup();
  await runGlossaryCommand(base, [], true, deps);
  fs.writeFileSync(path.join(dir, 'devops.txt'), 'x'.repeat(900));
  await runGlossaryCommand(base, [], true, deps);

  assert.ok(fs.existsSync(path.join(dir, GENERAL_GLOSSARY)));
  const listing = out.at(-1)!;
  assert.match(listing, /general\s+0 lines/);
  assert.match(listing, /devops\s+1 lines\s+~300 tokens\s+⚠ over budget/);
});

test('new writes the header, opens the editor and refuses to overwrite', async () => {
  const { base, dir, edited, out, deps } = setup();
  await runGlossaryCommand(base, ['new', 'devops'], true, deps);
  const file = path.join(dir, 'devops.txt');
  assert.deepEqual(edited, [file]);
  assert.match(fs.readFileSync(file, 'utf-8'), /^# Glossary: devops\n/);
  assert.match(out.at(-1)!, /devops\s+1 lines/);

  await assert.rejects(
    () => runGlossaryCommand(base, ['new', 'devops'], true, deps),
    /already exists/,
  );
});

test('edit defaults to the general glossary and rejects unknown or unsafe names', async () => {
  const { base, dir, edited, deps } = setup();
  await runGlossaryCommand(base, ['edit'], true, deps);
  assert.deepEqual(edited, [path.join(dir, GENERAL_GLOSSARY)]);

  await assert.rejects(
    () => runGlossaryCommand(base, ['edit', 'nope'], true, deps),
    /glossary new nope/,
  );
  await assert.rejects(
    () => runGlossaryCommand(base, ['edit', '../../etc/passwd'], true, deps),
    GlossaryCommandError,
  );
});

test('show prints exactly what would be sent, general first', async () => {
  const { base, dir, out, deps } = setup();
  await runGlossaryCommand(base, [], true, deps);
  fs.writeFileSync(path.join(dir, GENERAL_GLOSSARY), '# c\nGrafana\n');
  fs.writeFileSync(path.join(dir, 'devops.txt'), 'Kubernetes\n');

  await runGlossaryCommand(base, ['show', 'devops'], true, deps);
  assert.match(out.at(-1)!, /sent whole\):\n\nGrafana\nKubernetes$/m);

  await runGlossaryCommand(base, ['show', 'devops'], false, deps);
  assert.match(out.at(-1)!, /\n\nKubernetes\n?$/);
});

test('an unknown subcommand lists the ones that exist', async () => {
  const { base, deps } = setup();
  await assert.rejects(
    () => runGlossaryCommand(base, ['review'], true, deps),
    /Available: edit, new, show/,
  );
});

test('comments do not count towards the summary', () => {
  assert.deepEqual(summarizeGlossary('demo', '# a\n\nGrafana\n'), {
    name: 'demo',
    lines: 1,
    tokens: 3,
    overBudget: false,
  });
});

test('picker labels show the size and warn when a glossary will be trimmed', () => {
  assert.equal(
    glossaryOptionLabel({ name: 'devops', lines: 2, tokens: 40, overBudget: false }),
    'devops  (~40 tokens)',
  );
  assert.equal(
    glossaryOptionLabel({ name: 'big', lines: 25, tokens: 708, overBudget: true }),
    'big  (~708 tokens ⚠ trimmed)',
  );
});

test('a summary can be read straight from the glossaries folder', async () => {
  const { base, dir, deps } = setup();
  await runGlossaryCommand(base, [], true, deps);
  fs.writeFileSync(path.join(dir, 'devops.txt'), 'Kubernetes\n');
  assert.deepEqual(readGlossarySummary(base, 'devops.txt'), {
    name: 'devops',
    lines: 1,
    tokens: 4,
    overBudget: false,
  });
  assert.equal(readGlossarySummary(base, 'missing.txt').lines, 0);
});
