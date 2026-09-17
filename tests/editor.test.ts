import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorError, openInEditor, resolveEditor } from '../src/system/editor.js';

const nothingInstalled = () => null;

test('VISUAL wins over EDITOR, and arguments are kept', () => {
  assert.deepEqual(resolveEditor({ VISUAL: 'code --wait', EDITOR: 'vim' }, nothingInstalled), [
    'code',
    '--wait',
  ]);
  assert.deepEqual(resolveEditor({ EDITOR: 'vim' }, nothingInstalled), ['vim']);
});

test('a blank variable is ignored', () => {
  assert.deepEqual(resolveEditor({ VISUAL: '  ', EDITOR: 'vim' }, nothingInstalled), ['vim']);
});

test('without variables it falls back to nano, then vi', () => {
  assert.deepEqual(
    resolveEditor({}, (bin) => (bin === 'nano' ? '/usr/bin/nano' : '/usr/bin/vi')),
    ['/usr/bin/nano'],
  );
  assert.deepEqual(
    resolveEditor({}, (bin) => (bin === 'vi' ? '/usr/bin/vi' : null)),
    ['/usr/bin/vi'],
  );
});

test('with no editor at all it explains how to set one instead of installing anything', async () => {
  assert.equal(resolveEditor({}, nothingInstalled), null);
  await assert.rejects(
    () => openInEditor('/tmp/demo.txt', {}, nothingInstalled),
    (error: unknown) =>
      error instanceof EditorError &&
      /export EDITOR=nano/.test(error.message) &&
      /\/tmp\/demo\.txt/.test(error.message),
  );
});

test('the editor receives the file and its exit code comes back', async () => {
  const editor = `${process.execPath} -e process.exit(process.argv.at(-1).endsWith('demo.txt')?3:1)`;
  const code = await openInEditor('/tmp/demo.txt', { EDITOR: editor }, nothingInstalled);
  assert.equal(code, 3);
});
