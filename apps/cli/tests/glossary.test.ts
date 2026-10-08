import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Key, runCli, startCli } from './support/cli.js';
import { Sandbox } from './support/sandbox.js';
import { seedNotes } from './support/archive.js';
import { corpus } from './support/corpus.js';

const GENERAL_HEADER = '# Glossary: general\n';

function sandboxFor(
  t: { after: (fn: () => void) => void },
  options: ConstructorParameters<typeof Sandbox>[0] = {},
) {
  const sandbox = new Sandbox(options);
  t.after(() => sandbox.remove());
  return sandbox;
}

function glossaryFile(sandbox: Sandbox, name: string): string {
  return sandbox.dataFile('glossaries', `${name}.txt`);
}

function editor(sandbox: Sandbox, appended = 'Pulumi', exitCode = 0): string {
  return sandbox.stub(
    'fake-editor',
    `printf '%s\\n' "$@" > '${sandbox.logDir}/fake-editor.args'\nprintf '%s\\n' '${appended}' >> "\${@: -1}"\nexit ${exitCode}`,
  );
}

function suggestedTerms(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trim().split(/ {2,}/)[0]!);
}

test('listing creates the general glossary and shows lines and tokens of each, over budget flagged', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(
    glossaryFile(sandbox, 'work'),
    '# topic\nPulumi\nGrafana, k8s\nkuberneti => Kubernetes\n',
  );
  sandbox.write(
    glossaryFile(sandbox, 'huge'),
    `${Array.from({ length: 200 }, (_, i) => `Term${i}`).join('\n')}\n`,
  );
  sandbox.write(sandbox.dataFile('glossaries', 'notes.md'), 'not a glossary');

  const result = await runCli(sandbox, ['glossary']);

  assert.equal(result.code, 0);
  assert.equal(
    result.stdout,
    'transcribe-cli glossary\n' +
      '  general    0 lines  ~0 tokens\n' +
      '  huge     200 lines  ~497 tokens  ⚠ over budget: only the last ~220 tokens are sent\n' +
      '  work       2 lines  ~7 tokens\n',
  );
  assert.ok(sandbox.read(glossaryFile(sandbox, 'general')).startsWith(GENERAL_HEADER));
});

test('the general glossary is created once and never overwritten', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(glossaryFile(sandbox, 'general'), 'Mine\n');

  await runCli(sandbox, ['glossary']);

  assert.equal(sandbox.read(glossaryFile(sandbox, 'general')), 'Mine\n');
});

test('new writes the header, opens the editor on it and refuses to overwrite', async (t) => {
  const sandbox = sandboxFor(t);
  const env = { EDITOR: editor(sandbox) };

  const created = await runCli(sandbox, ['glossary', 'new', 'work'], { env });

  assert.equal(created.code, 0, created.stderr);
  assert.equal(sandbox.callArgs('fake-editor'), glossaryFile(sandbox, 'work'));
  const content = sandbox.read(glossaryFile(sandbox, 'work'));
  assert.match(content, /^# Glossary: work\n# One term, name or short phrase per line/);
  assert.match(content, /the TOP lines are dropped first/);
  assert.ok(content.endsWith('\nPulumi\n'));
  assert.equal(created.stdout, 'transcribe-cli glossary\n  work    1 lines  ~2 tokens\n');

  const again = await runCli(sandbox, ['glossary', 'new', 'work'], { env });
  assert.equal(again.code, 1);
  assert.equal(
    again.stderr,
    'work.txt already exists. Edit it with: transcribe-cli glossary edit work\n',
  );

  const nameless = await runCli(sandbox, ['glossary', 'new'], { env });
  assert.equal(nameless.stderr, 'Usage: transcribe-cli glossary new <name>\n');
});

test('edit opens the general glossary by default and refuses unknown or unsafe names', async (t) => {
  const sandbox = sandboxFor(t);
  const env = { EDITOR: editor(sandbox) };

  const general = await runCli(sandbox, ['glossary', 'edit'], { env });
  assert.equal(general.code, 0);
  assert.equal(sandbox.callArgs('fake-editor'), glossaryFile(sandbox, 'general'));

  const unknown = await runCli(sandbox, ['glossary', 'edit', 'nope'], { env });
  assert.equal(unknown.code, 1);
  assert.equal(
    unknown.stderr,
    'No glossary called nope. Create it with: transcribe-cli glossary new nope\n',
  );

  for (const name of ['../config', 'a b', 'x/y']) {
    const unsafe = await runCli(sandbox, ['glossary', 'edit', name], { env });
    assert.equal(
      unsafe.stderr,
      `"${name}" is not a valid glossary name: use letters, numbers, - and _.\n`,
    );
  }
});

test('VISUAL wins over EDITOR, keeps its arguments, and the editor exit code comes back', async (t) => {
  const sandbox = sandboxFor(t);
  const visual = editor(sandbox, 'From visual', 3);

  const result = await runCli(sandbox, ['glossary', 'edit'], {
    env: { VISUAL: `${visual} --wait   -n`, EDITOR: '/nowhere/editor' },
  });

  assert.equal(result.code, 3);
  assert.equal(
    sandbox.callArgs('fake-editor'),
    ['--wait', '-n', glossaryFile(sandbox, 'general')].join('\n'),
  );
});

test('without variables the editor falls back to nano, then vi; a blank variable counts as unset', async (t) => {
  const sandbox = sandboxFor(t);
  const vi = sandbox.stub('vi', `printf 'vi\\n' > '${sandbox.logDir}/which.args'`);
  await runCli(sandbox, ['glossary', 'edit'], { env: { EDITOR: '   ' } });
  assert.equal(sandbox.callArgs('which'), 'vi');

  sandbox.stub('nano', `printf 'nano\\n' > '${sandbox.logDir}/which.args'`);
  await runCli(sandbox, ['glossary', 'edit']);
  assert.equal(sandbox.callArgs('which'), 'nano');
  assert.ok(vi);
});

test('with no editor at all it says how to set one, instead of installing anything', async (t) => {
  const sandbox = sandboxFor(t);

  const result = await runCli(sandbox, ['glossary', 'edit']);

  assert.equal(result.code, 1);
  assert.equal(
    result.stderr,
    `No editor found. Set one, for example: export EDITOR=nano\nOr open the file yourself: ${glossaryFile(sandbox, 'general')}\n`,
  );
});

test('show prints exactly what would be sent, general first and the topic last', async (t) => {
  const sandbox = sandboxFor(t);
  sandbox.write(
    glossaryFile(sandbox, 'general'),
    `${GENERAL_HEADER}Kubernetes\nkuberneti => Kubernetes\n`,
  );
  sandbox.write(glossaryFile(sandbox, 'work'), 'Pulumi\n');
  sandbox.write(
    glossaryFile(sandbox, 'huge'),
    `${Array.from({ length: 200 }, (_, i) => `Term${i}`).join('\n')}\n`,
  );

  const both = await runCli(sandbox, ['glossary', 'show', 'work']);
  assert.equal(
    both.stdout,
    'This is what the engine receives (~6 tokens, sent whole):\n\nKubernetes\nPulumi\n',
  );

  const general = await runCli(sandbox, ['glossary', 'show']);
  assert.equal(
    general.stdout,
    'This is what the engine receives (~4 tokens, sent whole):\n\nKubernetes\n',
  );

  const topicOnly = await runCli(sandbox, ['glossary', 'show', 'work', '--no-general-glossary']);
  assert.equal(
    topicOnly.stdout,
    'This is what the engine receives (~2 tokens, sent whole):\n\nPulumi\n',
  );

  const trimmed = await runCli(sandbox, ['glossary', 'show', 'huge']);
  assert.match(
    trimmed.stdout,
    /^This is what the engine receives \(~\d+ tokens, trimmed: \d+ line\(s\) from the top are left out\):\n\n/,
  );
  assert.match(trimmed.stdout, /\nTerm199\n$/);
  assert.doesNotMatch(trimmed.stdout, /Kubernetes/, 'the general glossary is trimmed away first');

  const unknown = await runCli(sandbox, ['glossary', 'show', 'nope']);
  assert.equal(unknown.stderr, 'No glossary called nope.\n');
});

test('show says when nothing would be sent', async (t) => {
  const sandbox = sandboxFor(t);
  const result = await runCli(sandbox, ['glossary', 'show']);
  assert.equal(result.stdout, 'Nothing would be sent: the selected glossaries are empty.\n');
});

test('an unknown subcommand lists the ones that exist', async (t) => {
  const sandbox = sandboxFor(t);
  const result = await runCli(sandbox, ['glossary', 'list']);
  assert.equal(result.code, 1);
  assert.equal(
    result.stderr,
    "Unknown glossary command 'list'. Available: edit, new, show, suggest, review.\n",
  );
});

test('suggest proposes the names and technical terms of the notes, and nothing that only looks like one', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, corpus());

  const result = await runCli(sandbox, ['glossary', 'suggest']);

  assert.equal(result.code, 0);
  const terms = suggestedTerms(result.stdout);
  assert.deepEqual(
    terms.toSorted((a, b) => a.localeCompare(b)),
    ['Ansible', 'Billing', 'Billing Service', 'Grafana', 'k8s', 'Pulumi', 'Service', 'Terraform'],
  );
  assert.equal(terms[0], 'Billing Service', 'a repeated pair of rare words comes out as one term');
  assert.equal(terms.at(-1), 'Terraform', 'what was only said long ago ranks last');
  assert.match(result.stdout, /^8 suggested terms for general:\n/);
  assert.match(result.stdout, / {2}Pulumi {13}4× in {2}4 notes {2}capitalized\n/);
  assert.match(result.stdout, / {2}k8s {16}3× in {2}3 notes {2}shape\n/);
  assert.match(result.stdout, /\nReview them with: transcribe-cli glossary review\n$/);
  for (const absent of [
    'Mañana',
    'zanahoria',
    'Ana',
    'Speaker',
    'Amara.org',
    'reunión',
    'equipo',
  ]) {
    assert.ok(!terms.includes(absent), `${absent} is not a term`);
  }
  const store = JSON.parse(
    sandbox.read(sandbox.dataFile('glossaries', '.candidates', 'general.json')),
  ) as {
    pending: { term: string }[];
  };
  assert.equal(store.pending.length, 8);
});

test('suggest leaves out terms already in the glossaries, in lists and on either side of a rule', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, corpus());
  sandbox.write(
    glossaryFile(sandbox, 'general'),
    'Grafana, K8S\nansibel => Ansible\npulumi => Pulumi\n',
  );

  const terms = suggestedTerms((await runCli(sandbox, ['glossary', 'suggest'])).stdout);

  for (const known of ['Grafana', 'k8s', 'Ansible', 'Pulumi'])
    assert.ok(!terms.includes(known), known);
  assert.ok(terms.includes('Billing Service'));
});

test('a rejected term is never suggested again, and a broken store reads as empty', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, corpus());
  const store = sandbox.dataFile('glossaries', '.candidates', 'general.json');
  sandbox.write(store, JSON.stringify({ rejected: ['pulumi'], added: ['Grafana'] }));

  const terms = suggestedTerms((await runCli(sandbox, ['glossary', 'suggest'])).stdout);
  assert.ok(!terms.includes('Pulumi') && !terms.includes('Grafana'));

  sandbox.write(store, '{ not json');
  const again = suggestedTerms((await runCli(sandbox, ['glossary', 'suggest'])).stdout);
  assert.ok(again.includes('Pulumi'));
});

test('for a topic, the terms of its notes win and terms said only elsewhere are left out', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, corpus());
  sandbox.write(glossaryFile(sandbox, 'work'), '');

  const result = await runCli(sandbox, ['glossary', 'suggest', 'work']);

  const terms = suggestedTerms(result.stdout);
  assert.deepEqual(terms.slice(0, 3), ['Pulumi', 'Grafana', 'k8s']);
  assert.match(result.stdout, / {2}Pulumi {13}4× in {2}4 notes {2}distinctive, capitalized\n/);
  assert.ok(!terms.includes('Ansible') && !terms.includes('Terraform'));
  assert.match(result.stdout, /Review them with: transcribe-cli glossary review work\n$/);

  const unknown = await runCli(sandbox, ['glossary', 'suggest', 'nope']);
  assert.equal(unknown.stderr, 'No glossary called nope.\n');
});

test('without notes there is nothing to suggest', async (t) => {
  const sandbox = sandboxFor(t);
  const result = await runCli(sandbox, ['glossary', 'review']);
  assert.equal(result.stdout, 'No new terms to suggest for general.\n');
});

test('review without a terminal prints the suggestions instead of hanging', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, corpus());

  const result = await runCli(sandbox, ['glossary', 'review']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^8 suggested terms for general:/);
  assert.match(result.stdout, /Reviewing needs an interactive terminal\.\n$/);
});

test('review adds, sends to general, rejects for good and fixes spellings, all from the keyboard', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, corpus());
  sandbox.write(glossaryFile(sandbox, 'work'), '# topic\nOpenAI\n');
  sandbox.write(
    glossaryFile(sandbox, 'general'),
    `${GENERAL_HEADER}Mine\n\n# ─ automatic: added from your transcriptions; delete a line to reject it for good ─\nAuto\n`,
  );

  const session = startCli(sandbox, ['glossary', 'review', 'work']);
  t.after(() => session.kill());
  await session.waitFor('Suggested terms for work (6)');
  await session.press('a');
  await session.waitFor('[+]');
  await session.press('g');
  await session.waitFor('[G]');
  await session.press('e');
  await session.waitFor('Correct spelling for k8s:');
  await session.press(Key.BACKSPACE, Key.BACKSPACE, Key.BACKSPACE);
  await session.type('K8s');
  await session.press(Key.ENTER);
  await session.waitFor('[+] k8s → K8s');
  await session.press(Key.DOWN, 'x');
  await session.waitFor('[x] Billing Service');
  const mark = session.mark();
  await session.press(Key.ENTER);
  await session.waitFor('Saved:', { from: mark });
  assert.equal(await session.exited, 0);

  assert.match(session.text, /Saved: 2 to work, 1 to general, 1 rejected\./);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(
    sandbox.read(glossaryFile(sandbox, 'work')),
    `# topic\nOpenAI\n\n# added by review ${today}\nPulumi\nK8s\nk8s => K8s\n`,
  );
  assert.equal(
    sandbox.read(glossaryFile(sandbox, 'general')),
    `${GENERAL_HEADER}Mine\n\n# added by review ${today}\nGrafana\n\n# ─ automatic: added from your transcriptions; delete a line to reject it for good ─\nAuto\n`,
  );

  const after = suggestedTerms((await runCli(sandbox, ['glossary', 'suggest', 'work'])).stdout);
  assert.ok(!after.includes('Billing Service'), 'a rejected term never comes back');
  assert.ok(!after.includes('Pulumi') && !after.includes('Grafana'));
});

test('quitting the review saves nothing', async (t) => {
  const sandbox = sandboxFor(t);
  seedNotes(sandbox, corpus());
  const before = fs.existsSync(glossaryFile(sandbox, 'general'))
    ? sandbox.read(glossaryFile(sandbox, 'general'))
    : '';

  const session = startCli(sandbox, ['glossary', 'review']);
  t.after(() => session.kill());
  await session.waitFor('Suggested terms for general (8)');
  await session.press('a', 'a');
  await session.press('q');
  await session.waitFor('Nothing saved.');
  await session.exited;

  const after = sandbox.read(glossaryFile(sandbox, 'general'));
  assert.equal(after, before || after);
  assert.doesNotMatch(after, /added by review/);
});
